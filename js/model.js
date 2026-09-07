/* ==========================================================================
   model.js — load raw files, normalize, match Servify <-> GSX, compute TAT
   ========================================================================== */

const REPAIR_TYPE_MAP = [
  { match: 'No Trouble Found', norm: 'NTF' },
  { match: 'Carry-In/Non-Replinished', norm: 'Carry-In' },
  { match: 'Repair Or Replace/Whole Unit Mail-In', norm: 'Mail-In' },
];

function normalizeRepairType(desc) {
  if (!desc) return 'Other / Unknown';
  const d = String(desc).trim();
  for (const m of REPAIR_TYPE_MAP) if (d === m.match) return m.norm;
  if (!d || d === '0') return 'Other / Unknown';
  return 'Other / Unknown';
}

function cleanPersonName(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '0' || s.toLowerCase() === 'null') return null;
  return s;
}

// Product Model -> Device Group. iPhone is a simple prefix match; the
// Accessory keyword list is a judgment call (confirmed with the business
// owner) that includes Beats-branded audio (Apple-owned) and non-cable
// accessories (Apple Pencil, Magic Keyboard/Mouse, Case, AirTag, MagSafe)
// alongside the literal cables/adapters/earphones — not just those three.
// Anything not matched (Mac, iPad, Watch, Apple TV, HomePod, iMac, etc.)
// is 'Other Device'.
const ACCESSORY_KEYWORDS = ['cable', 'adapter', 'charg', 'airpods', 'earpods', 'earphone', 'earbud',
  'headphone', 'beats', 'powerbeats', 'pencil', 'magic keyboard', 'magic mouse',
  'case', 'airtag', 'magsafe', 'lightening', 'lightning'];

function classifyDeviceGroup(productModel) {
  if (!productModel) return 'Other Device';
  const m = String(productModel).toLowerCase();
  if (m.startsWith('iphone')) return 'iPhone';
  if (ACCESSORY_KEYWORDS.some(k => m.includes(k))) return 'Apple Accessory';
  return 'Other Device';
}

// SDR Eligibility (optional data/sdr_eligibility.json, confirmed by the
// business owner per product model). Some product types structurally can't
// be same-day repaired regardless of centre performance (e.g. AirPods
// needing pairing/board diagnostics, Mac/iPad/Watch repairs needing parts
// ordered) — including them in the SDR% denominator understates what's
// actually achievable. This is used ONLY as an optional filter; it never
// changes the underlying SDR/SVR formulas or any other metric on its own.
function applySdrEligibility(rec, eligibilityMap) {
  if (!eligibilityMap) { rec.sdrEligible = 'Not Classified'; return rec; }
  const entry = eligibilityMap[rec.productModel];
  if (!entry) { rec.sdrEligible = 'Not Classified'; return rec; }
  rec.sdrEligible = entry.sdrEligible ? 'Eligible' : 'Not Eligible';
  return rec;
}

// When there is no named engineer, the "0" placeholder means one of three
// different operational things depending on the request's own status —
// not a single generic "unassigned" bucket:
//   - Closed  -> the CCE resolved/closed it directly (typically an NTF
//                diagnosis with no workshop repair step required)
//   - Cancelled -> the request was cancelled before an engineer was needed
//   - Open    -> genuinely not yet assigned to an engineer
function deriveEngineerStatus(requestType) {
  if (requestType === 'Closed') return 'Closed by CCE';
  if (requestType === 'Cancelled') return 'Cancelled';
  if (requestType === 'Open') return 'Not Yet Assigned';
  return 'Unassigned';
}

// Applies the optional location_mapping.json reference data: canonicalizes
// centre names that are really the same physical location recorded under
// two different strings, and attaches the ARM (Area Manager territory) as
// a reliable "Area" grouping — the source data's own Region field is only
// ~20% filled, so Area/ARM is the more useful geography dimension.
function applyLocationMapping(rec, locationMap) {
  if (!locationMap) { rec.area = 'Unknown'; rec.centreType = 'Unknown'; return rec; }
  const entry = locationMap[rec.centre];
  if (!entry) { rec.area = 'Unknown'; rec.centreType = 'Unknown'; return rec; }
  if (entry.canonicalName && entry.canonicalName !== rec.centre) rec.centre = entry.canonicalName;
  rec.area = entry.arm || 'Unknown';
  rec.centreType = entry.locationType || 'Unknown';
  return rec;
}

const Model = (() => {

  async function fetchText(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    return await res.text();
  }

  function parseCsvText(text) {
    // Use SheetJS to parse CSV text — handles quoted fields/embedded newlines.
    // IMPORTANT: sheet_to_json must use raw:true here. With raw:false, SheetJS
    // returns its own locale-formatted display string for any cell it infers
    // as a date/number — which for CSV-parsed date-like text silently drops
    // the time-of-day and can flip DD/MM into MM/DD. raw:true instead returns
    // the underlying value (an Excel serial date number for recognized dates,
    // a JS number for numerics, plain text otherwise), and Utils.parseAny()
    // is built to handle all of those forms correctly.
    const wb = XLSX.read(text, { type: 'string' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  }

  async function loadFile(path, onProgress) {
    if (/\.xlsx$/i.test(path)) {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      // If the workbook has the named Servify sheet, prefer it; else first sheet.
      const sheetName = wb.SheetNames.includes('Servify rawdata file') ? 'Servify rawdata file' : wb.SheetNames[0];
      // raw:true here too, so real date cells come through as JS Date objects
      // (via cellDates) rather than a formatted display string.
      return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, raw: true });
    }
    const text = await fetchText(path);
    return parseCsvText(text);
  }

  function normalizeServifyRow(row) {
    const engineerRaw = cleanPersonName(row['Engineer Name']);
    const cceRaw = cleanPersonName(row['Request Created By']);
    const repairTypeDesc = row['Repair Type Description'];
    return {
      servifyRef: row['Servify Reference ID'] ? String(row['Servify Reference ID']).trim() : null,
      gsxRefIdCol: row['GSX Reference ID'] ? String(row['GSX Reference ID']).trim() : null,
      centre: row['Origin Service Location'] || 'Unknown Centre',
      centreCode: row['Origin Service Location Code'] || null,
      city: row['Origin Service Location City'] || 'Unknown',
      state: row['Origin Service Location State'] || 'Unknown',
      region: row['Origin Service Location Region'] || 'Unknown',
      brand: row['Brand'] || 'Unknown',
      productModel: row['Product Model'] || 'Unknown',
      serviceType: row['Service Type'] || null,
      source: row['Source'] || null,
      isUnderWarranty: row['Is Under Warranty'] || null,
      isCID: row['Is CID'] || null,
      engineer: engineerRaw, // null => unassigned / NTF, not a person
      requestCreationDate: Utils.parseAny(row['Request Creation Date']),
      requestType: row['Request Type'] || 'Unknown',
      latestStatus: row['Latest Request Status'] || null,
      latestStatusDate: Utils.parseAny(row['Latest Request Status Date']),
      repairFinishTime: Utils.parseAny(row['Repair Finish Time']),
      deliveryTime: Utils.parseAny(row['Delivery time']),
      inwardDate: Utils.parseAny(row['Inward Date']),
      outwardDate: Utils.parseAny(row['Outward Date']),
      rating: row['Rating'] !== null && row['Rating'] !== undefined && row['Rating'] !== '' ? parseFloat(row['Rating']) : null,
      defectivePartName: row['Defective Part Name'] || null,
      replacementPartName: row['Replacement Part Name'] || null,
      jobAge: row['Job Age'] !== null && row['Job Age'] !== undefined ? parseFloat(row['Job Age']) : null,
      cce: cceRaw, // null => not attributable to a CCE
      repairTypeDescRaw: repairTypeDesc,
      repairTypeNorm: normalizeRepairType(repairTypeDesc),
      deviceGroup: classifyDeviceGroup(row['Product Model']),
      quantity: row['Quantity'] || null,
    };
  }

  function normalizeGsxRow(row) {
    const tech = [row['Technician First Name'], row['Technician Last Name']].filter(Boolean).join(' ').trim();
    return {
      repairId: row['Repair'] ? String(row['Repair']).trim() : null,
      reference: row['Reference'] ? String(row['Reference']).trim() : null,
      repairType: row['Repair Type'] || null,
      repairStatus: row['Repair Status'] || null,
      productName: row['Product Name'] || null,
      serialNumber: row['Serial Number'] || null,
      createdDate: Utils.parseAny(row['Created Date']),
      markCompleteDate: Utils.parseAny(row['Mark Complete Date']),
      unitReceivedDate: Utils.parseAny(row['Unit Received Date']),
      technician: cleanPersonName(tech) ,
      customerReportedIssue: row['Customer Reported Component Issue'] || null,
      technicianVerifiedIssue: row['Technician Verified Component Issue'] || null,
      repairClassification: row['Repair Classification'] || null,
      partNumber: row['Part Number'] || null,
    };
  }

  // Build the full in-memory model from raw parsed rows.
  // locationMap (optional) is the `.locations` object from data/location_mapping.json.
  function build(servifyRows, gsxRows, locationMap, eligibilityMap) {
    const dq = {
      totalServifyRows: servifyRows.length,
      totalGsxRows: gsxRows.length,
      missingServifyRef: 0,
      missingRequestCreationDate: 0,
      missingInwardDate: 0,
      missingEngineerName: 0,
      missingEngineerClosedByCce: 0,
      missingEngineerCancelled: 0,
      missingEngineerNotYetAssigned: 0,
      anomalyClosedNoTag: 0,
      missingRequestCreatedBy: 0,
      missingRepairTypeDescription: 0,
      missingGsxCreatedDate: 0,
      duplicateServifyRef: 0,
      duplicateGsxRef: 0,
      negativeCreationTat: 0,
      negativeE2eTat: 0,
      futureTimestamps: 0,
      locationMappingLoaded: !!locationMap,
      recordsWithUnknownArea: 0,
      sdrEligibilityLoaded: !!eligibilityMap,
      recordsNotClassifiedForSdr: 0,
    };

    // ---- Normalize Servify, dedup on servifyRef (keep most complete/latest) ----
    const servifyByRef = new Map();
    const now = new Date();
    for (const raw of servifyRows) {
      const rec = normalizeServifyRow(raw);
      applyLocationMapping(rec, locationMap);
      applySdrEligibility(rec, eligibilityMap);
      if (rec.area === 'Unknown') dq.recordsWithUnknownArea++;
      if (rec.sdrEligible === 'Not Classified') dq.recordsNotClassifiedForSdr++;
      if (!rec.servifyRef) { dq.missingServifyRef++; continue; }
      if (!rec.requestCreationDate) dq.missingRequestCreationDate++;
      if (!rec.inwardDate) dq.missingInwardDate++;
      if (!rec.engineer) {
        dq.missingEngineerName++;
        const status = deriveEngineerStatus(rec.requestType);
        if (status === 'Closed by CCE') dq.missingEngineerClosedByCce++;
        else if (status === 'Cancelled') dq.missingEngineerCancelled++;
        else if (status === 'Not Yet Assigned') dq.missingEngineerNotYetAssigned++;
        // Anomaly: closed the same way as a normal NTF self-closure, but
        // without the NTF tag recorded — i.e. it left the normal process.
        if (status === 'Closed by CCE' && rec.repairTypeNorm !== 'NTF') dq.anomalyClosedNoTag++;
      }
      if (!rec.cce) dq.missingRequestCreatedBy++;
      if (!rec.repairTypeDescRaw || rec.repairTypeDescRaw === '0') dq.missingRepairTypeDescription++;
      if (rec.requestCreationDate && rec.requestCreationDate.getTime() > now.getTime()) dq.futureTimestamps++;

      if (servifyByRef.has(rec.servifyRef)) {
        dq.duplicateServifyRef++;
        const existing = servifyByRef.get(rec.servifyRef);
        // Keep whichever has the later Latest Request Status Date (most complete/current)
        const existingDate = existing.latestStatusDate ? existing.latestStatusDate.getTime() : -Infinity;
        const newDate = rec.latestStatusDate ? rec.latestStatusDate.getTime() : -Infinity;
        if (newDate >= existingDate) servifyByRef.set(rec.servifyRef, rec);
      } else {
        servifyByRef.set(rec.servifyRef, rec);
      }
    }

    // ---- Normalize GSX, group by reference ----
    const gsxByRef = new Map();
    const gsxMissingRef = [];
    for (const raw of gsxRows) {
      const rec = normalizeGsxRow(raw);
      if (!rec.createdDate) dq.missingGsxCreatedDate++;
      if (!rec.reference) { gsxMissingRef.push(rec); continue; }
      if (!gsxByRef.has(rec.reference)) gsxByRef.set(rec.reference, []);
      gsxByRef.get(rec.reference).push(rec);
    }
    let dupGsxRefGroups = 0;
    for (const [, list] of gsxByRef) {
      if (list.length > 1) dupGsxRefGroups++;
      list.sort((a, b) => {
        const at = a.createdDate ? a.createdDate.getTime() : Infinity;
        const bt = b.createdDate ? b.createdDate.getTime() : Infinity;
        return at - bt;
      });
    }
    dq.duplicateGsxRef = dupGsxRefGroups;

    // ---- Build matched repair records ----
    const matched = [];
    const unmatchedServify = [];
    for (const [ref, s] of servifyByRef) {
      const gsxGroup = gsxByRef.get(ref);
      if (!gsxGroup || !gsxGroup.length) { unmatchedServify.push(s); continue; }
      const firstGsx = gsxGroup[0];   // earliest creation => repair-creation gap
      const lastGsx = gsxGroup[gsxGroup.length - 1]; // latest => current state/technician

      let repairCreationTatHours = Utils.hoursBetween(firstGsx.createdDate, s.requestCreationDate);
      let creationException = false;
      if (repairCreationTatHours !== null) {
        if (repairCreationTatHours < 0) { dq.negativeCreationTat++; creationException = true; }
      }

      let e2eTatHours = null;
      let e2eException = false;
      if (s.requestType === 'Closed' && s.requestCreationDate && s.latestStatusDate) {
        e2eTatHours = Utils.hoursBetween(s.latestStatusDate, s.requestCreationDate);
        if (e2eTatHours !== null && e2eTatHours < 0) { dq.negativeE2eTat++; e2eException = true; }
      }

      matched.push({
        servifyRef: ref,
        gsxRepairId: lastGsx.repairId,
        gsxDupCount: gsxGroup.length,
        centre: s.centre, city: s.city, state: s.state, region: s.region, area: s.area, centreType: s.centreType,
        repairType: s.repairTypeNorm,
        deviceGroup: s.deviceGroup,
        sdrEligible: s.sdrEligible,
        productModel: s.productModel,
        engineer: s.engineer,
        engineerStatus: s.engineer ? null : deriveEngineerStatus(s.requestType),
        isAnomaly: !s.engineer && s.requestType === 'Closed' && s.repairTypeNorm !== 'NTF',
        cce: s.cce,
        requestType: s.requestType,
        technician: lastGsx.technician,
        gsxRepairStatus: lastGsx.repairStatus,
        servifyCreation: s.requestCreationDate,
        gsxCreation: firstGsx.createdDate,
        repairCreationTatHours: creationException ? null : repairCreationTatHours,
        creationException,
        e2eTatHours: e2eException ? null : e2eTatHours,
        e2eException,
        servifyClosure: s.latestStatusDate,
        rating: s.rating,
        servify: s,
      });
    }
    for (const s of unmatchedServify) {
      matched.push({
        servifyRef: s.servifyRef,
        gsxRepairId: null,
        gsxDupCount: 0,
        centre: s.centre, city: s.city, state: s.state, region: s.region, area: s.area, centreType: s.centreType,
        repairType: s.repairTypeNorm,
        deviceGroup: s.deviceGroup,
        sdrEligible: s.sdrEligible,
        productModel: s.productModel,
        engineer: s.engineer,
        engineerStatus: s.engineer ? null : deriveEngineerStatus(s.requestType),
        isAnomaly: !s.engineer && s.requestType === 'Closed' && s.repairTypeNorm !== 'NTF',
        cce: s.cce,
        requestType: s.requestType,
        technician: null,
        gsxRepairStatus: null,
        servifyCreation: s.requestCreationDate,
        gsxCreation: null,
        repairCreationTatHours: null,
        creationException: false,
        e2eTatHours: (s.requestType === 'Closed' && s.requestCreationDate && s.latestStatusDate)
          ? Utils.hoursBetween(s.latestStatusDate, s.requestCreationDate) : null,
        e2eException: false,
        servifyClosure: s.latestStatusDate,
        rating: s.rating,
        servify: s,
        unmatched: true,
      });
    }

    dq.matchedCount = matched.length - unmatchedServify.length;
    dq.unmatchedCount = unmatchedServify.length;
    dq.uniqueServifyRefs = servifyByRef.size;
    dq.uniqueGsxRefs = gsxByRef.size;
    dq.missingGsxReferenceRows = gsxMissingRef.length;

    return { records: matched, dataQuality: dq };
  }

  return { loadFile, build };
})();
