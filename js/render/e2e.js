/* ==========================================================================
   render/e2e.js — 04 End-to-End TAT (Servify request creation -> closure)
   ========================================================================== */

function renderE2e(ctx) {
  const { records, centreStats } = ctx;

  const closedRecords = records.filter(r => r.requestType === 'Closed');
  const allE2e = closedRecords.map(r => r.e2eTatHours).filter(h => h !== null && h !== undefined);

  const summaryKpis = [
    { label: 'Closed Requests', value: Utils.fmtNum(closedRecords.length) },
    { label: 'Average E2E TAT', value: Utils.fmtHrs(Utils.mean(allE2e)) },
    { label: 'Median E2E TAT', value: Utils.fmtHrs(Utils.median(allE2e)) },
    { label: '% Closed ≤ 8 Hrs', value: Utils.fmtPct(Utils.pct(allE2e.filter(h => h <= 8).length, allE2e.length)) },
    { label: '% Closed ≤ 24 Hrs', value: Utils.fmtPct(Utils.pct(allE2e.filter(h => h <= 24).length, allE2e.length)) },
    { label: '% Taking > 48 Hrs', value: Utils.fmtPct(Utils.pct(allE2e.filter(h => h > 48).length, allE2e.length)), tone: 'watch' },
  ];
  document.getElementById('e2e-kpis').innerHTML = summaryKpis.map(k => `
    <div class="kpi-card ${k.tone ? 'tone-' + k.tone : ''}"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div>
  `).join('');

  // Bucket distribution chart
  const bucketCounts = {};
  Buckets.E2E_BUCKET_ORDER.forEach(b => bucketCounts[b] = 0);
  allE2e.forEach(h => { const b = Buckets.e2eBucket(h); if (b) bucketCounts[b]++; });
  Charts.bar('e2e-bucket-chart', Buckets.E2E_BUCKET_ORDER, [{ label: 'Closed Requests', data: Buckets.E2E_BUCKET_ORDER.map(b => bucketCounts[b]) }]);

  // Centre table
  const rows = [...centreStats].sort((a, b) => (a.medianE2e ?? Infinity) - (b.medianE2e ?? Infinity));
  renderTable(document.getElementById('e2e-centre-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'closed', label: 'Closed Repairs', align: 'right', fmt: r => Utils.fmtNum(r.closed) },
      { key: 'avgE2e', label: 'Avg E2E TAT', align: 'right', fmt: r => Utils.fmtHrs(r.avgE2e) },
      { key: 'medianE2e', label: 'Median E2E TAT', align: 'right', fmt: r => Utils.fmtHrs(r.medianE2e) },
      { key: 'e2eWithin8Pct', label: '≤8 Hrs', align: 'right', fmt: r => Utils.fmtPct(r.e2eWithin8Pct) },
      { key: 'e2eWithin24Pct', label: '≤24 Hrs', align: 'right', fmt: r => Utils.fmtPct(r.e2eWithin24Pct) },
      { key: 'e2eOver48Pct', label: '>48 Hrs', align: 'right', fmt: r => `<span class="tone-text ${r.e2eOver48Pct > 15 ? 'tone-red' : ''}">${Utils.fmtPct(r.e2eOver48Pct)}</span>` },
    ],
    rows, defaultSort: { key: 'medianE2e', dir: 'asc' }, csvName: 'end_to_end_tat_by_centre',
    onRowClick: (key) => setCentreFilter(key),
  });

  document.getElementById('e2e-explainer').innerHTML = `
    <p><strong>Repair Creation TAT</strong> measures how quickly a centre moves a device from Servify request creation into GSX repair creation — see the Repair TAT tab.</p>
    <p><strong>End-to-End TAT</strong> measures the full customer service case, from Servify request creation through to final closure. A centre can be fast to open a GSX repair yet still slow to close the customer's case — these two views should always be read together.</p>
  `;
}
