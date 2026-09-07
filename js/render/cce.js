/* ==========================================================================
   render/cce.js — 06 CCE Efficiency (Request Created By)
   ========================================================================== */

function renderCce(ctx) {
  const { records } = ctx;
  const withCce = records.filter(r => r.cce);
  const cceStats = Aggregate.summarize(withCce, r => r.cce);

  // Derive each CCE's primary centre (most common centre in their requests) —
  // shown as context; a CCE tied to multiple centres is not force-assigned to one.
  const centreByCce = new Map();
  withCce.forEach(r => {
    if (!centreByCce.has(r.cce)) centreByCce.set(r.cce, new Map());
    const m = centreByCce.get(r.cce);
    m.set(r.centre, (m.get(r.centre) || 0) + 1);
  });
  function primaryCentre(cce) {
    const m = centreByCce.get(cce);
    if (!m) return '—';
    let best = null, bestN = -1, multi = m.size > 1;
    for (const [c, n] of m) if (n > bestN) { best = c; bestN = n; }
    return multi ? `${best} (+${m.size - 1} more)` : best;
  }

  const rows = cceStats.map(c => ({ ...c, centre: primaryCentre(c.key) }));
  renderTable(document.getElementById('cce-table'), {
    columns: [
      { key: 'key', label: 'CCE' },
      { key: 'centre', label: 'Centre' },
      { key: 'volume', label: 'Requests Created', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'ntf', label: 'NTF', align: 'right', fmt: r => Utils.fmtNum(r.ntf) },
      { key: 'carryIn', label: 'Carry-In', align: 'right', fmt: r => Utils.fmtNum(r.carryIn) },
      { key: 'mailIn', label: 'Mail-In', align: 'right', fmt: r => Utils.fmtNum(r.mailIn) },
      { key: 'pctOfCentre', label: '% of Centre Requests', align: 'right', fmt: r => pctOfCentreRequests(r, records) },
    ],
    rows, defaultSort: { key: 'volume', dir: 'desc' }, csvName: 'cce_efficiency',
  });

  const top12 = [...cceStats].sort((a, b) => b.volume - a.volume).slice(0, 12);
  Charts.bar('cce-ranking-chart', top12.map(c => c.key), [{ label: 'Requests Created', data: top12.map(c => c.volume) }], { rotateLabels: true });

  // Workload distribution — is work concentrated among a few CCEs?
  const sorted = [...cceStats].sort((a, b) => b.volume - a.volume);
  const total = sorted.reduce((a, b) => a + b.volume, 0);
  const top5Share = Utils.pct(sorted.slice(0, 5).reduce((a, b) => a + b.volume, 0), total);
  const top10Share = Utils.pct(sorted.slice(0, 10).reduce((a, b) => a + b.volume, 0), total);
  document.getElementById('cce-distribution-note').innerHTML = `
    <p>The top 5 CCEs account for <strong>${Utils.fmtPct(top5Share)}</strong> of all requests created this period; the top 10 account for <strong>${Utils.fmtPct(top10Share)}</strong>, out of ${cceStats.length} CCEs with attributable requests.</p>
  `;
}

function pctOfCentreRequests(cceRow, allRecords) {
  // Approximate: share of requests this CCE created within their most-common centre
  const centreName = cceRow.centre.split(' (+')[0];
  const centreTotal = allRecords.filter(r => r.centre === centreName).length;
  return Utils.fmtPct(Utils.pct(cceRow.volume, centreTotal));
}
