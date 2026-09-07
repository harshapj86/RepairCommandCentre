/* ==========================================================================
   render/dataquality.js — 10 Data Quality & Reconciliation
   The reconciliation table reflects the FULL loaded dataset (not the current
   filter selection), since match/dup/missing counts are a property of the
   raw data load. The Anomaly Cases section below it DOES respond to the
   global filter bar, since it's meant to be explored/drilled into like any
   other tab.
   ========================================================================== */

function renderDataQuality(dq, ctx) {
  const rows = [
    ['Total Servify records loaded', dq.totalServifyRows],
    ['Total GSX records loaded', dq.totalGsxRows],
    ['Unique Servify references', dq.uniqueServifyRefs],
    ['Unique GSX references', dq.uniqueGsxRefs],
    ['Servify → GSX matched', dq.matchedCount],
    ['Servify → GSX unmatched', dq.unmatchedCount],
    ['Match rate', Utils.fmtPct(Utils.pct(dq.matchedCount, dq.uniqueServifyRefs))],
    ['Duplicate Servify references (rows merged)', dq.duplicateServifyRef],
    ['GSX references with multiple repair records', dq.duplicateGsxRef],
    ['GSX rows missing a Reference value', dq.missingGsxReferenceRows],
    ['Missing Servify Reference ID', dq.missingServifyRef],
    ['Missing Request Creation Date', dq.missingRequestCreationDate],
    ['Missing Inward Date', dq.missingInwardDate],
    ['Missing Engineer Name — total', dq.missingEngineerName],
    ['  · Closed by CCE (NTF / resolved without a workshop step)', dq.missingEngineerClosedByCce],
    ['  ·  ↳ of which not NTF-tagged — see Anomaly Cases below', dq.anomalyClosedNoTag],
    ['  · Cancelled before an engineer was needed', dq.missingEngineerCancelled],
    ['  · Not yet assigned to an engineer', dq.missingEngineerNotYetAssigned],
    ['Missing Request Created By', dq.missingRequestCreatedBy],
    ['Missing Repair Type Description', dq.missingRepairTypeDescription],
    ['Missing GSX Created Date', dq.missingGsxCreatedDate],
    ['Negative Repair Creation TAT (exception)', dq.negativeCreationTat],
    ['Negative End-to-End TAT (exception)', dq.negativeE2eTat],
    ['Request Creation timestamps in the future', dq.futureTimestamps],
  ];

  document.getElementById('dq-table').innerHTML = `
    <table class="data-table dq-table">
      <tbody>
        ${rows.map(([label, val]) => `<tr><td>${Utils.escapeHtml(label)}</td><td class="ta-r">${typeof val === 'number' ? Utils.fmtNum(val) : val}</td></tr>`).join('')}
      </tbody>
    </table>`;

  const locNote = dq.locationMappingLoaded
    ? `<p><strong>Location mapping loaded</strong> from <code>data/location_mapping.json</code>. Three same-centre name-variant pairs (Guntur, Vizianagaram, Siddipet) are merged into one row each across every table. Centre/City/State plus the new <strong>Area (ARM)</strong> filter are cross-checked against this file; ${Utils.fmtNum(dq.recordsWithUnknownArea)} records belong to a centre not found in the mapping file and show as Area = "Unknown" — see the file's own <code>unmapped</code> entries for which centres those are.</p>`
    : `<p><code>data/location_mapping.json</code> was not found, so centre names are shown exactly as they appear in the raw Servify export (no merging), and the Area (ARM) filter will show "Unknown" for every record.</p>`;

  const eligNote = dq.sdrEligibilityLoaded
    ? `<p><strong>SDR eligibility loaded</strong> from <code>data/sdr_eligibility.json</code>, confirmed per product model by the business owner. ${dq.recordsNotClassifiedForSdr > 0 ? `<strong>${Utils.fmtNum(dq.recordsNotClassifiedForSdr)}</strong> records have a Product Model not covered by that file (likely a new model since it was built) and show as "Not Classified" in the SDR Eligibility filter until it's added.` : 'Every product model in the current data is covered by that file.'}</p>`
    : `<p><code>data/sdr_eligibility.json</code> was not found, so the SDR Eligibility filter will show "Not Classified" for every record.</p>`;

  const exceptionTotal = dq.negativeCreationTat + dq.negativeE2eTat;
  document.getElementById('dq-note').innerHTML = `
    ${locNote}
    ${eligNote}
    <p>A record with no named engineer is not one uniform category. <strong>${Utils.fmtNum(dq.missingEngineerClosedByCce)}</strong> were closed directly by the CCE — this is the normal outcome for an NTF diagnosis (no repair needed) and the dominant reason for a missing engineer. <strong>${Utils.fmtNum(dq.missingEngineerCancelled)}</strong> were cancelled before an engineer was ever needed. <strong>${Utils.fmtNum(dq.missingEngineerNotYetAssigned)}</strong> are still open and genuinely awaiting assignment. The Technician Efficiency tab excludes all of these from engineer rankings, since none of them represent workshop repair work.</p>
    ${exceptionTotal > 0
      ? `<p><strong>${Utils.fmtNum(exceptionTotal)} timestamp exceptions</strong> were found (a later stage timestamp earlier than an earlier stage). These are excluded from TAT averages/medians and SDR% everywhere in the dashboard, and are not auto-corrected — treat them as data entry issues to investigate at source.</p>`
      : `<p>No negative-timestamp exceptions were found in the currently loaded data.</p>`}
  `;

  renderAnomalyCases(ctx);
}

function renderAnomalyCases(ctx) {
  const container = document.getElementById('dq-anomaly-table');
  const noteEl = document.getElementById('dq-anomaly-note');
  if (!container) return;

  const anomalies = ctx.records.filter(r => r.isAnomaly);

  const centreCounts = new Map();
  const cceCounts = new Map();
  anomalies.forEach(r => {
    centreCounts.set(r.centre, (centreCounts.get(r.centre) || 0) + 1);
    if (r.cce) cceCounts.set(r.cce, (cceCounts.get(r.cce) || 0) + 1);
  });
  const topCentres = Array.from(centreCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topCces = Array.from(cceCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const over24h = anomalies.filter(r => r.servify.jobAge !== null && r.servify.jobAge * 24 > 24).length;

  noteEl.innerHTML = anomalies.length
    ? `<p><strong>${Utils.fmtNum(anomalies.length)}</strong> requests in the current filter were closed with no engineer and no NTF (or other) repair-type tag recorded — the same signature as a CCE self-closure, but stepping outside the normal tagging process. All ${anomalies.length ? 'of these' : ''} also show no GSX reference ever created. ${topCentres.length ? `Most concentrated at ${topCentres.map(([c, n]) => `${Utils.escapeHtml(c)} (${n})`).join(', ')}` : ''}${topCces.length ? `, and among CCEs at ${topCces.map(([c, n]) => `${Utils.escapeHtml(c)} (${n})`).join(', ')}` : ''}. ${over24h ? `<strong>${Utils.fmtNum(over24h)}</strong> of these sat open for more than 24 hours before closing — sort the table below by "Time to Close" to find the longest-open cases first.` : ''}</p>`
    : `<p>No anomaly cases fall within the current filters.</p>`;

  const rows = anomalies.map(r => ({
    key: r.centre,
    servifyRef: r.servifyRef,
    centre: r.centre,
    cce: r.cce || '—',
    productModel: r.productModel,
    warranty: r.servify.isUnderWarranty || '—',
    created: r.servifyCreation,
    closed: r.servifyClosure,
    timeToCloseHrs: Utils.hoursBetween(r.servifyClosure, r.servifyCreation),
    latestStatus: r.servify.latestStatus,
  }));

  renderTable(container, {
    columns: [
      { key: 'servifyRef', label: 'Servify Ref' },
      { key: 'centre', label: 'Centre' },
      { key: 'cce', label: 'CCE' },
      { key: 'productModel', label: 'Product Model' },
      { key: 'warranty', label: 'Under Warranty' },
      { key: 'created', label: 'Request Created', fmt: r => Utils.fmtDateTime(r.created), sortValue: r => r.created?.getTime() ?? 0 },
      { key: 'closed', label: 'Closed', fmt: r => Utils.fmtDateTime(r.closed), sortValue: r => r.closed?.getTime() ?? 0 },
      { key: 'timeToCloseHrs', label: 'Time to Close', align: 'right', fmt: r => Utils.fmtHrs(r.timeToCloseHrs), sortValue: r => r.timeToCloseHrs ?? -1 },
      { key: 'latestStatus', label: 'Status' },
    ],
    rows, defaultSort: { key: 'timeToCloseHrs', dir: 'desc' }, csvName: 'anomaly_cases_closed_no_tag',
    onRowClick: (key) => setCentreFilter(key),
  });
}
