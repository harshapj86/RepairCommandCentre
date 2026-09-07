/* ==========================================================================
   render/engineers.js — 07 Technician Efficiency (Engineer Name)
   ========================================================================== */

function renderEngineers(ctx) {
  const { records } = ctx;
  const withEng = records.filter(r => r.engineer);
  const engStats = Aggregate.summarize(withEng, r => r.engineer);

  const centreByEng = new Map();
  withEng.forEach(r => {
    if (!centreByEng.has(r.engineer)) centreByEng.set(r.engineer, new Map());
    const m = centreByEng.get(r.engineer);
    m.set(r.centre, (m.get(r.centre) || 0) + 1);
  });
  function primaryCentre(eng) {
    const m = centreByEng.get(eng);
    if (!m) return '—';
    let best = null, bestN = -1;
    for (const [c, n] of m) if (n > bestN) { best = c; bestN = n; }
    return m.size > 1 ? `${best} (+${m.size - 1} more)` : best;
  }

  const rows = engStats.map((e, i) => ({ ...e, centre: primaryCentre(e.key) }))
    .sort((a, b) => b.volume - a.volume)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  renderTable(document.getElementById('engineer-table'), {
    columns: [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'key', label: 'Engineer' },
      { key: 'centre', label: 'Centre' },
      { key: 'volume', label: 'Repairs', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'ntf', label: 'NTF', align: 'right', fmt: r => Utils.fmtNum(r.ntf) },
      { key: 'carryIn', label: 'Carry-In', align: 'right', fmt: r => Utils.fmtNum(r.carryIn) },
      { key: 'mailIn', label: 'Mail-In', align: 'right', fmt: r => Utils.fmtNum(r.mailIn) },
      { key: 'avgTat', label: 'Avg Repair TAT', align: 'right', fmt: r => Utils.fmtHrs(r.avgTat) },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.sdrPct)}">${Utils.fmtPct(r.sdrPct)}</span>` },
      { key: 'over8Pct', label: '>8 Hrs %', align: 'right', fmt: r => Utils.fmtPct(r.over8Pct) },
    ],
    rows, defaultSort: { key: 'volume', dir: 'desc' }, csvName: 'engineer_efficiency',
  });

  // Performance matrix: volume vs SDR% — separates "busy" from "efficient"
  const volumes = engStats.map(e => e.volume);
  const xMid = Utils.median(volumes) || 0;
  const yMid = Buckets.thresholds.green;
  const points = engStats.filter(e => e.sdrPct !== null).map(e => ({
    x: e.volume, y: e.sdrPct, r: Math.max(4, Math.min(20, Math.sqrt(e.volume) * 1.6)), label: e.key,
  }));
  Charts.quadrant('engineer-quadrant-chart', points, { xMid, yMid, xLabel: 'Repairs Handled', yLabel: 'SDR %' });

  const hv_hs = points.filter(p => p.x >= xMid && p.y >= yMid).length;
  const hv_ls = points.filter(p => p.x >= xMid && p.y < yMid).length;
  const lv_hs = points.filter(p => p.x < xMid && p.y >= yMid).length;
  const lv_ls = points.filter(p => p.x < xMid && p.y < yMid).length;
  document.getElementById('engineer-quadrant-legend').innerHTML = `
    <div class="quad-legend-item"><span class="dot" style="background:#3F8F5F"></span>High Volume / High SDR (${hv_hs})</div>
    <div class="quad-legend-item"><span class="dot" style="background:#B4423A"></span>High Volume / Low SDR (${hv_ls})</div>
    <div class="quad-legend-item"><span class="dot" style="background:#2A5CA6"></span>Low Volume / High SDR (${lv_hs})</div>
    <div class="quad-legend-item"><span class="dot" style="background:#C9922B"></span>Low Volume / Low SDR (${lv_ls})</div>
  `;
  const noEngineer = records.filter(r => !r.engineer);
  const closedByCce = noEngineer.filter(r => r.engineerStatus === 'Closed by CCE').length;
  const cancelled = noEngineer.filter(r => r.engineerStatus === 'Cancelled').length;
  const notYetAssigned = noEngineer.filter(r => r.engineerStatus === 'Not Yet Assigned').length;
  document.getElementById('engineer-note').textContent =
    `${Utils.fmtNum(noEngineer.length)} records in the current filter have no engineer attributed and are excluded from this table: ${Utils.fmtNum(closedByCce)} were closed directly by the CCE (typically NTF — no workshop step needed), ${Utils.fmtNum(cancelled)} were cancelled before an engineer was needed, and ${Utils.fmtNum(notYetAssigned)} are still awaiting assignment.`;
}
