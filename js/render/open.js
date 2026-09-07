/* ==========================================================================
   render/open.js — 08 Open Repairs (Backlog & Ageing)
   ========================================================================== */

function renderOpen(ctx) {
  const { records, centreStats, reportingNow } = ctx;
  const openRecords = records.filter(r => r.requestType === 'Open');

  const totalOpen = openRecords.length;
  const totals = { '<4 Hrs': 0, '4-8 Hrs': 0, '8-24 Hrs': 0, '24-48 Hrs': 0, '48-72 Hrs': 0, '72+ Hrs': 0 };
  centreStats.forEach(c => Buckets.AGING_BUCKET_ORDER.forEach(b => totals[b] += (c.agingBuckets[b] || 0)));

  document.getElementById('open-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Open Repairs</div><div class="kpi-value">${Utils.fmtNum(totalOpen)}</div></div>
    <div class="kpi-card tone-red"><div class="kpi-label">Backlog > 48 Hrs</div><div class="kpi-value">${Utils.fmtNum(totals['48-72 Hrs'] + totals['72+ Hrs'])}</div></div>
    <div class="kpi-card"><div class="kpi-label">Backlog ≤ 8 Hrs</div><div class="kpi-value">${Utils.fmtNum(totals['<4 Hrs'] + totals['4-8 Hrs'])}</div></div>
  `;

  Charts.bar('open-aging-chart', Buckets.AGING_BUCKET_ORDER, [{ label: 'Open Repairs', data: Buckets.AGING_BUCKET_ORDER.map(b => totals[b]),
    color: (ctx2) => {
      const idx = ctx2.dataIndex;
      return ['#3F8F5F', '#3F8F5F', '#C9922B', '#C9922B', '#B4423A', '#B4423A'][idx];
    } }]);

  const rows = centreStats.filter(c => c.openBacklogTotal > 0 || openRecords.some(r => r.centre === c.key));
  renderTable(document.getElementById('open-centre-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'openBacklogTotal', label: 'Open Repairs', align: 'right', fmt: r => Utils.fmtNum(r.openBacklogTotal) },
      { key: 'lt8', label: '<8 Hrs', align: 'right', fmt: r => Utils.fmtNum((r.agingBuckets['<4 Hrs'] || 0) + (r.agingBuckets['4-8 Hrs'] || 0)), sortValue: r => (r.agingBuckets['<4 Hrs'] || 0) + (r.agingBuckets['4-8 Hrs'] || 0) },
      { key: 'h824', label: '8-24 Hrs', align: 'right', fmt: r => Utils.fmtNum(r.agingBuckets['8-24 Hrs'] || 0), sortValue: r => r.agingBuckets['8-24 Hrs'] || 0 },
      { key: 'h2448', label: '24-48 Hrs', align: 'right', fmt: r => Utils.fmtNum(r.agingBuckets['24-48 Hrs'] || 0), sortValue: r => r.agingBuckets['24-48 Hrs'] || 0 },
      { key: 'h4872', label: '48-72 Hrs', align: 'right', fmt: r => `<span class="tone-text tone-amber">${Utils.fmtNum(r.agingBuckets['48-72 Hrs'] || 0)}</span>`, sortValue: r => r.agingBuckets['48-72 Hrs'] || 0 },
      { key: 'h72p', label: '72+ Hrs', align: 'right', fmt: r => `<span class="tone-text tone-red">${Utils.fmtNum(r.agingBuckets['72+ Hrs'] || 0)}</span>`, sortValue: r => r.agingBuckets['72+ Hrs'] || 0 },
    ],
    rows, defaultSort: { key: 'openBacklogTotal', dir: 'desc' }, csvName: 'open_repair_ageing',
    onRowClick: (key) => setCentreFilter(key),
  });

  document.getElementById('open-asof').textContent = `Ageing calculated as of ${Utils.fmtDateTime(reportingNow)} (the selected reporting date/time).`;
}
