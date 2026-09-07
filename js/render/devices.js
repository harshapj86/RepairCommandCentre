/* ==========================================================================
   render/devices.js — 02 Device Management
   ========================================================================== */

function renderDevices(ctx) {
  const { centreStats, records } = ctx;
  const totalVolume = records.length;
  const volumes = centreStats.map(c => c.volume);

  const rows = [...centreStats].sort((a, b) => b.volume - a.volume).map((c, i) => ({
    ...c,
    rank: i + 1,
    tier: Utils.volumeTier(c.volume, volumes),
    pctOfNetwork: Utils.pct(c.volume, totalVolume),
  }));

  renderTable(document.getElementById('devices-table'), {
    columns: [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'key', label: 'Centre', fmt: r => `<span class="tier-dot tier-${r.tier}"></span>${Utils.escapeHtml(r.key)}` },
      { key: 'volume', label: 'Devices', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'ntf', label: 'NTF', align: 'right', fmt: r => `${Utils.fmtNum(r.ntf)} (${Utils.fmtPct(r.ntfPct)})` },
      { key: 'carryIn', label: 'Carry-In', align: 'right', fmt: r => `${Utils.fmtNum(r.carryIn)} (${Utils.fmtPct(r.carryInPct)})` },
      { key: 'mailIn', label: 'Mail-In', align: 'right', fmt: r => `${Utils.fmtNum(r.mailIn)} (${Utils.fmtPct(r.mailInPct)})` },
      { key: 'pctOfNetwork', label: '% of Network', align: 'right', fmt: r => Utils.fmtPct(r.pctOfNetwork), csvValue: r => r.pctOfNetwork?.toFixed(1) },
      { key: 'tier', label: 'Workload', fmt: r => `<span class="badge badge-${r.tier}">${r.tier === 'high' ? 'High Volume' : r.tier === 'medium' ? 'Medium Volume' : 'Low Volume'}</span>` },
    ],
    rows, defaultSort: { key: 'volume', dir: 'desc' }, csvName: 'device_volume_by_centre',
    onRowClick: (key) => setCentreFilter(key),
  });

  const top15 = rows.slice(0, 15);
  Charts.bar('devices-volume-chart', top15.map(r => r.key), [
    { label: 'Devices', data: top15.map(r => r.volume) },
  ], { rotateLabels: true });

  const high = rows.filter(r => r.tier === 'high').length;
  const med = rows.filter(r => r.tier === 'medium').length;
  const low = rows.filter(r => r.tier === 'low').length;
  document.getElementById('devices-tier-summary').innerHTML = `
    <div class="tier-chip tier-high">High Volume — ${high} centres</div>
    <div class="tier-chip tier-medium">Medium Volume — ${med} centres</div>
    <div class="tier-chip tier-low">Low Volume — ${low} centres</div>
  `;
}
