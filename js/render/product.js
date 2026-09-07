/* ==========================================================================
   render/product.js — 09 Product / NTF Analysis
   ========================================================================== */

function renderProduct(ctx) {
  const { records, centreStats, network } = ctx;

  const ntfRecords = records.filter(r => r.repairType === 'NTF');
  const networkNtfPct = Utils.pct(ntfRecords.length, records.length);
  document.getElementById('ntf-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">NTF Volume</div><div class="kpi-value">${Utils.fmtNum(ntfRecords.length)}</div></div>
    <div class="kpi-card"><div class="kpi-label">NTF % of Network</div><div class="kpi-value">${Utils.fmtPct(networkNtfPct)}</div></div>
    <div class="kpi-card"><div class="kpi-label">NTF SDR %</div><div class="kpi-value">${Utils.fmtPct(Utils.pct(ntfRecords.filter(r => r.repairCreationTatHours !== null && r.repairCreationTatHours <= 8).length, ntfRecords.filter(r => r.repairCreationTatHours !== null).length))}</div></div>
    <div class="kpi-card"><div class="kpi-label">NTF Avg TAT</div><div class="kpi-value">${Utils.fmtHrs(Utils.mean(ntfRecords.map(r => r.repairCreationTatHours).filter(h => h !== null)))}</div></div>
  `;

  // NTF by centre — flag centres unusually above network average
  const ntfByCentre = centreStats.map(c => ({ key: c.key, volume: c.volume, ntf: c.ntf, ntfPct: c.ntfPct }))
    .filter(c => c.volume >= 5)
    .sort((a, b) => b.ntfPct - a.ntfPct);
  renderTable(document.getElementById('ntf-centre-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'volume', label: 'Devices', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'ntf', label: 'NTF', align: 'right', fmt: r => Utils.fmtNum(r.ntf) },
      { key: 'ntfPct', label: 'NTF %', align: 'right', fmt: r => `<span class="tone-text ${r.ntfPct > networkNtfPct + 10 ? 'tone-red' : ''}">${Utils.fmtPct(r.ntfPct)}</span>` },
      { key: 'vsNetwork', label: 'vs Network Avg', align: 'right', fmt: r => (r.ntfPct - networkNtfPct >= 0 ? '+' : '') + Utils.fmtPct(r.ntfPct - networkNtfPct) },
    ],
    rows: ntfByCentre, defaultSort: { key: 'ntfPct', dir: 'desc' }, csvName: 'ntf_by_centre',
    onRowClick: (key) => setCentreFilter(key),
  });

  // NTF by engineer / CCE (top 10 each)
  const ntfByEng = Aggregate.summarize(ntfRecords.filter(r => r.engineer), r => r.engineer).sort((a, b) => b.volume - a.volume).slice(0, 10);
  const ntfByCce = Aggregate.summarize(ntfRecords.filter(r => r.cce), r => r.cce).sort((a, b) => b.volume - a.volume).slice(0, 10);
  document.getElementById('ntf-by-engineer').innerHTML = ntfByEng.map(e => `<li><span>${Utils.escapeHtml(e.key)}</span><b>${Utils.fmtNum(e.volume)}</b></li>`).join('') || '<li>No data</li>';
  document.getElementById('ntf-by-cce').innerHTML = ntfByCce.map(e => `<li><span>${Utils.escapeHtml(e.key)}</span><b>${Utils.fmtNum(e.volume)}</b></li>`).join('') || '<li>No data</li>';

  // Product analysis
  const productStats = Aggregate.summarize(records, r => r.productModel).filter(p => p.volume >= 5);
  const byVolume = [...productStats].sort((a, b) => b.volume - a.volume).slice(0, 12);
  const byNtf = [...productStats].map(p => ({ ...p })).sort((a, b) => b.ntfPct - a.ntfPct).slice(0, 12);
  const byPoorTat = [...productStats].filter(p => p.medianTat !== null).sort((a, b) => b.medianTat - a.medianTat).slice(0, 12);
  const byOver8 = [...productStats].filter(p => p.over8Pct !== null).sort((a, b) => b.over8Pct - a.over8Pct).slice(0, 12);

  renderTable(document.getElementById('product-volume-table'), {
    columns: [
      { key: 'key', label: 'Product Model' }, { key: 'volume', label: 'Devices', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'ntfPct', label: 'NTF %', align: 'right', fmt: r => Utils.fmtPct(r.ntfPct) },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => Utils.fmtPct(r.sdrPct) },
    ], rows: byVolume, searchable: false, csvName: 'top_products_by_volume', pageSize: 12,
  });
  renderTable(document.getElementById('product-ntf-table'), {
    columns: [
      { key: 'key', label: 'Product Model' }, { key: 'volume', label: 'Devices', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'ntfPct', label: 'NTF %', align: 'right', fmt: r => Utils.fmtPct(r.ntfPct) },
    ], rows: byNtf, searchable: false, csvName: 'products_by_ntf', pageSize: 12,
  });
  renderTable(document.getElementById('product-tat-table'), {
    columns: [
      { key: 'key', label: 'Product Model' }, { key: 'volume', label: 'Devices', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'medianTat', label: 'Median TAT', align: 'right', fmt: r => Utils.fmtHrs(r.medianTat) },
    ], rows: byPoorTat, searchable: false, csvName: 'products_poor_tat', pageSize: 12,
  });
  renderTable(document.getElementById('product-over8-table'), {
    columns: [
      { key: 'key', label: 'Product Model' }, { key: 'volume', label: 'Devices', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'over8Pct', label: '>8 Hr %', align: 'right', fmt: r => Utils.fmtPct(r.over8Pct) },
    ], rows: byOver8, searchable: false, csvName: 'products_high_over8', pageSize: 12,
  });

  // Network mix donut
  const carryIn = records.filter(r => r.repairType === 'Carry-In').length;
  const mailIn = records.filter(r => r.repairType === 'Mail-In').length;
  Charts.donut('product-mix-chart', ['NTF', 'Carry-In', 'Mail-In', 'Other'], [ntfRecords.length, carryIn, mailIn, records.length - ntfRecords.length - carryIn - mailIn]);
}
