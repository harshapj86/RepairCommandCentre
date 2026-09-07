/* ==========================================================================
   render/tat.js — 03 Repair TAT (Repair Creation TAT: Servify -> GSX creation)
   ========================================================================== */

function renderTat(ctx) {
  const { records, centreStats } = ctx;

  // --- Centre-wise Repair TAT table ---
  const rows = [...centreStats].sort((a, b) => (b.sdrPct ?? -1) - (a.sdrPct ?? -1));
  renderTable(document.getElementById('tat-centre-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'validTatCount', label: 'Total Repairs', align: 'right', fmt: r => Utils.fmtNum(r.validTatCount) },
      { key: 'b02', label: '0-2 Hrs (SVR)', align: 'right', fmt: r => Utils.fmtNum(r.bucketCounts['0-2 Hrs']), sortValue: r => r.bucketCounts['0-2 Hrs'] },
      { key: 'b24', label: '2-4 Hrs', align: 'right', fmt: r => Utils.fmtNum(r.bucketCounts['2-4 Hrs']), sortValue: r => r.bucketCounts['2-4 Hrs'] },
      { key: 'b48', label: '4-8 Hrs', align: 'right', fmt: r => Utils.fmtNum(r.bucketCounts['4-8 Hrs']), sortValue: r => r.bucketCounts['4-8 Hrs'] },
      { key: 'svrPct', label: 'SVR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.svrPct)}">${Utils.fmtPct(r.svrPct)}</span>` },
      { key: 'sdr', label: 'SDR', align: 'right', fmt: r => Utils.fmtNum(r.sdr) },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.sdrPct)}">${Utils.fmtPct(r.sdrPct)}</span>` },
      { key: 'over8', label: '>8 Hrs', align: 'right', fmt: r => Utils.fmtNum(r.over8) },
      { key: 'over8Pct', label: '>8 %', align: 'right', fmt: r => Utils.fmtPct(r.over8Pct) },
      { key: 'avgTat', label: 'Avg TAT', align: 'right', fmt: r => Utils.fmtHrs(r.avgTat) },
      { key: 'medianTat', label: 'Median TAT', align: 'right', fmt: r => Utils.fmtHrs(r.medianTat) },
    ],
    rows, defaultSort: { key: 'sdrPct', dir: 'desc' }, csvName: 'repair_tat_by_centre',
    onRowClick: (key) => setCentreFilter(key),
  });

  document.getElementById('tat-thresholds').textContent =
    `Colour thresholds — Green ≥ ${Buckets.thresholds.green}% SDR · Amber ${Buckets.thresholds.amber}–${Buckets.thresholds.green - 0.1}% · Red < ${Buckets.thresholds.amber}%`;

  // --- SDR by Device Group — All Devices row is unfiltered by the Device
  // Group filter itself (so you can always see the full picture alongside
  // the iPhone/Accessory/Other split, even if you've filtered elsewhere) ---
  const allDevicesStats = Aggregate.summarize(records, () => 'All Devices')[0];
  const deviceGroupStats = Aggregate.summarize(records, r => r.deviceGroup);
  const groupOrder = ['iPhone', 'Apple Accessory', 'Other Device'];
  const groupRows = [allDevicesStats, ...groupOrder.map(g => deviceGroupStats.find(s => s.key === g))].filter(Boolean);
  renderTable(document.getElementById('tat-devicegroup-table'), {
    columns: [
      { key: 'key', label: 'Device Group' },
      { key: 'validTatCount', label: 'Repairs', align: 'right', fmt: r => Utils.fmtNum(r.validTatCount) },
      { key: 'svrPct', label: 'SVR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.svrPct)}">${Utils.fmtPct(r.svrPct)}</span>` },
      { key: 'sdr', label: 'SDR', align: 'right', fmt: r => Utils.fmtNum(r.sdr) },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.sdrPct)}">${Utils.fmtPct(r.sdrPct)}</span>` },
      { key: 'over8Pct', label: '>8 %', align: 'right', fmt: r => Utils.fmtPct(r.over8Pct) },
      { key: 'avgTat', label: 'Avg TAT', align: 'right', fmt: r => Utils.fmtHrs(r.avgTat) },
      { key: 'medianTat', label: 'Median TAT', align: 'right', fmt: r => Utils.fmtHrs(r.medianTat) },
    ],
    rows: groupRows, searchable: false, csvName: 'svr_sdr_by_device_group', pageSize: 5,
  });

  // --- "True SDR": all repairs vs SDR-eligible-only, side by side ---
  const eligibleOnly = records.filter(r => r.sdrEligible === 'Eligible');
  const notEligible = records.filter(r => r.sdrEligible === 'Not Eligible');
  const notClassified = records.filter(r => r.sdrEligible === 'Not Classified');
  const eligStats = [
    { key: 'All Repairs', ...Aggregate.summarize(records, () => 'x')[0] },
    { key: 'SDR-Eligible Only', ...Aggregate.summarize(eligibleOnly, () => 'x')[0] },
    { key: 'Not SDR-Eligible', ...Aggregate.summarize(notEligible, () => 'x')[0] },
  ];
  if (notClassified.length) eligStats.push({ key: 'Not Classified', ...Aggregate.summarize(notClassified, () => 'x')[0] });
  renderTable(document.getElementById('tat-eligibility-table'), {
    columns: [
      { key: 'key', label: '' },
      { key: 'validTatCount', label: 'Repairs', align: 'right', fmt: r => Utils.fmtNum(r.validTatCount) },
      { key: 'svrPct', label: 'SVR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.svrPct)}">${Utils.fmtPct(r.svrPct)}</span>` },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.sdrPct)}">${Utils.fmtPct(r.sdrPct)}</span>` },
      { key: 'avgTat', label: 'Avg TAT', align: 'right', fmt: r => Utils.fmtHrs(r.avgTat) },
      { key: 'medianTat', label: 'Median TAT', align: 'right', fmt: r => Utils.fmtHrs(r.medianTat) },
    ],
    rows: eligStats, searchable: false, csvName: 'true_sdr_eligibility', pageSize: 5,
  });

  // --- TAT by Repair Type ---
  const typeStats = Aggregate.summarize(records, r => r.repairType);
  const typeOrder = ['NTF', 'Carry-In', 'Mail-In', 'Other / Unknown'];
  const typeRows = typeOrder.map(t => typeStats.find(s => s.key === t)).filter(Boolean);
  renderTable(document.getElementById('tat-type-table'), {
    columns: [
      { key: 'key', label: 'Repair Type' },
      { key: 'validTatCount', label: 'Repairs', align: 'right', fmt: r => Utils.fmtNum(r.validTatCount) },
      { key: 'b02', label: '0-2', align: 'right', fmt: r => Utils.fmtNum(r.bucketCounts['0-2 Hrs']), sortValue: r => r.bucketCounts['0-2 Hrs'] },
      { key: 'b24', label: '2-4', align: 'right', fmt: r => Utils.fmtNum(r.bucketCounts['2-4 Hrs']), sortValue: r => r.bucketCounts['2-4 Hrs'] },
      { key: 'b48', label: '4-8', align: 'right', fmt: r => Utils.fmtNum(r.bucketCounts['4-8 Hrs']), sortValue: r => r.bucketCounts['4-8 Hrs'] },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.sdrPct)}">${Utils.fmtPct(r.sdrPct)}</span>` },
      { key: 'over8Pct', label: '>8 %', align: 'right', fmt: r => Utils.fmtPct(r.over8Pct) },
      { key: 'avgTat', label: 'Avg TAT', align: 'right', fmt: r => Utils.fmtHrs(r.avgTat) },
      { key: 'medianTat', label: 'Median TAT', align: 'right', fmt: r => Utils.fmtHrs(r.medianTat) },
    ],
    rows: typeRows, searchable: false, csvName: 'tat_by_repair_type', pageSize: 10,
  });

  // --- Centre + Repair Type matrix ---
  const centreNames = centreStats.map(c => c.key);
  const matrixRows = centreNames.map(centre => {
    const centreRecords = records.filter(r => r.centre === centre);
    const byType = {};
    ['NTF', 'Carry-In', 'Mail-In'].forEach(t => {
      const sub = Aggregate.summarize(centreRecords.filter(r => r.repairType === t), () => t);
      byType[t] = sub[0] || { volume: 0, sdrPct: null };
    });
    const overall = centreStats.find(c => c.key === centre);
    return { key: centre, byType, overallSdr: overall?.sdrPct ?? null };
  });
  renderTable(document.getElementById('tat-matrix-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'ntfVol', label: 'NTF Vol', align: 'right', fmt: r => Utils.fmtNum(r.byType['NTF'].volume), sortValue: r => r.byType['NTF'].volume },
      { key: 'ntfSdr', label: 'NTF SDR %', align: 'right', fmt: r => Utils.fmtPct(r.byType['NTF'].sdrPct), sortValue: r => r.byType['NTF'].sdrPct ?? -1 },
      { key: 'ciVol', label: 'Carry-In Vol', align: 'right', fmt: r => Utils.fmtNum(r.byType['Carry-In'].volume), sortValue: r => r.byType['Carry-In'].volume },
      { key: 'ciSdr', label: 'Carry-In SDR %', align: 'right', fmt: r => Utils.fmtPct(r.byType['Carry-In'].sdrPct), sortValue: r => r.byType['Carry-In'].sdrPct ?? -1 },
      { key: 'miVol', label: 'Mail-In Vol', align: 'right', fmt: r => Utils.fmtNum(r.byType['Mail-In'].volume), sortValue: r => r.byType['Mail-In'].volume },
      { key: 'miSdr', label: 'Mail-In SDR %', align: 'right', fmt: r => Utils.fmtPct(r.byType['Mail-In'].sdrPct), sortValue: r => r.byType['Mail-In'].sdrPct ?? -1 },
      { key: 'overallSdr', label: 'Overall SDR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.overallSdr)}">${Utils.fmtPct(r.overallSdr)}</span>` },
    ],
    rows: matrixRows, defaultSort: { key: 'overallSdr', dir: 'asc' }, csvName: 'centre_repair_type_matrix',
    onRowClick: (key) => setCentreFilter(key),
  });

  // --- Volume vs Performance quadrant ---
  const volumes = centreStats.map(c => c.volume);
  const xMid = Utils.median(volumes) || 0;
  const yMid = Buckets.thresholds.green;
  const points = centreStats.filter(c => c.sdrPct !== null).map(c => ({
    x: c.volume, y: c.sdrPct, r: Math.max(5, Math.min(28, Math.sqrt(c.volume) * 2)), label: c.key,
  }));
  Charts.quadrant('tat-quadrant-chart', points, { xMid, yMid, xLabel: 'Device Volume', yLabel: 'Same Day Repair %' });

  const starCount = points.filter(p => p.x >= xMid && p.y >= yMid).length;
  const stressedCount = points.filter(p => p.x >= xMid && p.y < yMid).length;
  const efficientCount = points.filter(p => p.x < xMid && p.y >= yMid).length;
  const needsAttentionCount = points.filter(p => p.x < xMid && p.y < yMid).length;
  document.getElementById('tat-quadrant-legend').innerHTML = `
    <div class="quad-legend-item"><span class="dot" style="background:#3F8F5F"></span>Star Centres (${starCount}) — high volume, strong SDR</div>
    <div class="quad-legend-item"><span class="dot" style="background:#B4423A"></span>Stressed Centres (${stressedCount}) — high volume, weak SDR</div>
    <div class="quad-legend-item"><span class="dot" style="background:#2A5CA6"></span>Efficient / Under-utilised (${efficientCount}) — low volume, strong SDR</div>
    <div class="quad-legend-item"><span class="dot" style="background:#C9922B"></span>Low Volume / Needs Attention (${needsAttentionCount}) — low volume, weak SDR</div>
  `;
}
