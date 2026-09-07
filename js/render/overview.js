/* ==========================================================================
   render/overview.js — 01 Executive Overview
   ========================================================================== */

function renderOverview(ctx) {
  const { records, centreStats, engineerStats, cceStats, network, dailyTrend } = ctx;

  const volume = records.length;
  const ntf = records.filter(r => r.repairType === 'NTF').length;
  const carryIn = records.filter(r => r.repairType === 'Carry-In').length;
  const mailIn = records.filter(r => r.repairType === 'Mail-In').length;
  const inwards = records.filter(r => r.servify.inwardDate).length;
  const validTats = records.filter(r => r.repairCreationTatHours !== null && r.repairCreationTatHours !== undefined).map(r => r.repairCreationTatHours);
  const sdrCount = validTats.filter(h => h <= 8).length;
  const over8Count = validTats.filter(h => h > 8).length;
  const open = records.filter(r => r.requestType === 'Open').length;
  const closed = records.filter(r => r.requestType === 'Closed').length;

  const kpis = [
    { label: 'Devices Handled', value: Utils.fmtNum(volume), sub: 'Unique Servify references' },
    { label: 'Total Inwards', value: Utils.fmtNum(inwards), sub: 'Records with an Inward Date' },
    { label: 'NTF', value: Utils.fmtNum(ntf), sub: Utils.fmtPct(Utils.pct(ntf, volume)) },
    { label: 'Carry-In', value: Utils.fmtNum(carryIn), sub: Utils.fmtPct(Utils.pct(carryIn, volume)) },
    { label: 'Mail-In', value: Utils.fmtNum(mailIn), sub: Utils.fmtPct(Utils.pct(mailIn, volume)) },
    { label: 'Same Day Repair %', value: Utils.fmtPct(Utils.pct(sdrCount, validTats.length)), sub: `${Utils.fmtNum(sdrCount)} of ${Utils.fmtNum(validTats.length)} matched`, tone: Buckets.sdrTier(Utils.pct(sdrCount, validTats.length)) },
    { label: 'Average Repair TAT', value: Utils.fmtHrs(Utils.mean(validTats)), sub: 'Servify creation → GSX creation' },
    { label: 'Median Repair TAT', value: Utils.fmtHrs(Utils.median(validTats)), sub: 'Less skewed by outliers' },
    { label: '>8 Hour %', value: Utils.fmtPct(Utils.pct(over8Count, validTats.length)), sub: `${Utils.fmtNum(over8Count)} repairs delayed` },
    { label: 'Open Repairs', value: Utils.fmtNum(open), sub: 'Not yet closed' },
    { label: 'Closed Repairs', value: Utils.fmtNum(closed), sub: 'Reached final status' },
  ];

  const kpiHtml = kpis.map(k => `
    <div class="kpi-card ${k.tone ? 'tone-' + k.tone : ''}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  document.getElementById('overview-kpis').innerHTML = kpiHtml;

  // Repair mix donut
  Charts.donut('overview-mix-chart', ['NTF', 'Carry-In', 'Mail-In', 'Other'], [ntf, carryIn, mailIn, volume - ntf - carryIn - mailIn]);

  // Daily trend: volume (bar) + SDR% (line) over the filtered window
  Charts.bar('overview-trend-chart', dailyTrend.map(d => d.label), [
    { label: 'Devices', data: dailyTrend.map(d => d.volume), yAxisID: 'y' },
  ], {});

  // Insights
  const insightsList = Insights.build(ctx);
  document.getElementById('overview-insights').innerHTML = insightsList.map(s => `<li>${Utils.escapeHtml(s)}</li>`).join('');

  // Top / bottom centre quick lists
  const topCentres = [...centreStats].sort((a, b) => b.volume - a.volume).slice(0, 5);
  const worstSdr = [...centreStats].filter(c => c.sdrPct !== null).sort((a, b) => a.sdrPct - b.sdrPct).slice(0, 5);
  document.getElementById('overview-top-centres').innerHTML = topCentres.map(c => `<li><span>${Utils.escapeHtml(c.key)}</span><b>${Utils.fmtNum(c.volume)}</b></li>`).join('');
  document.getElementById('overview-watch-centres').innerHTML = worstSdr.map(c => `<li><span>${Utils.escapeHtml(c.key)}</span><b class="tone-${Buckets.sdrTier(c.sdrPct)}">${Utils.fmtPct(c.sdrPct)}</b></li>`).join('');
}
