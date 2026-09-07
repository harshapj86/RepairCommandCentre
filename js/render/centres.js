/* ==========================================================================
   render/centres.js — 05 Centre Performance
   ========================================================================== */

const CENTRE_RANK_FIELDS = {
  volume: { label: 'Volume (Highest Workload)', dir: 'desc', fmt: (r) => Utils.fmtNum(r.volume) },
  sdrPct: { label: 'SDR % (Best TAT Performance)', dir: 'desc', fmt: (r) => Utils.fmtPct(r.sdrPct) },
  avgTat: { label: 'Average TAT (Fastest)', dir: 'asc', fmt: (r) => Utils.fmtHrs(r.avgTat) },
  medianTat: { label: 'Median TAT (Typical)', dir: 'asc', fmt: (r) => Utils.fmtHrs(r.medianTat) },
  over8Pct: { label: '>8 Hour % (Worst Delay Rate)', dir: 'desc', fmt: (r) => Utils.fmtPct(r.over8Pct) },
  openBacklogTotal: { label: 'Open Backlog (Largest Outstanding)', dir: 'desc', fmt: (r) => Utils.fmtNum(r.openBacklogTotal) },
  medianE2e: { label: 'E2E TAT (Best Customer Journey)', dir: 'asc', fmt: (r) => Utils.fmtHrs(r.medianE2e) },
};

function performanceTier(c, network) {
  const conf = c.validTatCount >= 30 ? 'High' : c.validTatCount >= 10 ? 'Medium' : 'Low';
  let tier;
  if (c.sdrPct === null) tier = 'WATCH';
  else if (c.sdrPct >= 90 && c.volume >= (network.volume.median || 0)) tier = 'STAR';
  else if (c.sdrPct >= 85) tier = 'STRONG';
  else if (c.sdrPct >= 70) tier = 'WATCH';
  else tier = 'CRITICAL';
  return { tier, confidence: conf };
}

function renderCentres(ctx) {
  const { centreStats, network } = ctx;

  // --- Scorecard ---
  const scoreRows = centreStats.map(c => ({ ...c, ...performanceTier(c, network) }));
  renderTable(document.getElementById('centre-scorecard-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'volume', label: 'Volume', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => `<span class="tone-text tone-${Buckets.sdrTier(r.sdrPct)}">${Utils.fmtPct(r.sdrPct)}</span>` },
      { key: 'avgTat', label: 'Avg TAT', align: 'right', fmt: r => Utils.fmtHrs(r.avgTat) },
      { key: 'over8Pct', label: '>8 Hrs %', align: 'right', fmt: r => Utils.fmtPct(r.over8Pct) },
      { key: 'medianE2e', label: 'E2E TAT', align: 'right', fmt: r => Utils.fmtHrs(r.medianE2e) },
      { key: 'openBacklogTotal', label: 'Open Repairs', align: 'right', fmt: r => Utils.fmtNum(r.openBacklogTotal) },
      { key: 'tier', label: 'Performance', fmt: r => `<span class="badge badge-tier-${r.tier.toLowerCase()}">${r.tier}</span>` },
      { key: 'confidence', label: 'Confidence', fmt: r => `<span class="conf conf-${r.confidence.toLowerCase()}">${r.confidence}</span>` },
    ],
    rows: scoreRows, defaultSort: { key: 'volume', dir: 'desc' }, csvName: 'centre_scorecard',
    onRowClick: (key) => setCentreFilter(key),
  });

  // --- Ranking selector ---
  const rankSelect = document.getElementById('centre-rank-field');
  if (!rankSelect.dataset.bound) {
    rankSelect.innerHTML = Object.entries(CENTRE_RANK_FIELDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    rankSelect.addEventListener('change', () => renderCentreRanking(ctx));
    rankSelect.dataset.bound = '1';
  }
  renderCentreRanking(ctx);

  // --- Low volume / potential capacity opportunity ---
  const sortedByVol = [...centreStats].sort((a, b) => a.volume - b.volume);
  const lowVolCount = Math.max(1, Math.round(centreStats.length * 0.25));
  const lowVol = sortedByVol.slice(0, lowVolCount);
  renderTable(document.getElementById('centre-lowvol-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'volume', label: 'Devices', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'engineerCount', label: 'Engineers', align: 'right', fmt: r => Utils.fmtNum(r.engineerCount) },
      { key: 'repairsPerEngineer', label: 'Repairs / Engineer', align: 'right', fmt: r => Utils.fmtNum(r.repairsPerEngineer, 1) },
      { key: 'cceCount', label: 'CCEs', align: 'right', fmt: r => Utils.fmtNum(r.cceCount) },
      { key: 'requestsPerCce', label: 'Requests / CCE', align: 'right', fmt: r => Utils.fmtNum(r.requestsPerCce, 1) },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => Utils.fmtPct(r.sdrPct) },
      { key: 'note', label: '', fmt: () => `<span class="badge badge-note">Potential Capacity Opportunity</span>` },
    ],
    rows: lowVol, searchable: false, csvName: 'low_workload_centres', pageSize: 10,
    onRowClick: (key) => setCentreFilter(key),
  });

  // --- High volume + poor performance (attention) ---
  const medianVol = network.volume.median || 0;
  const medianSdr = network.sdr.median;
  const attention = centreStats.filter(c => c.volume >= medianVol && c.sdrPct !== null && medianSdr !== null && c.sdrPct < medianSdr)
    .sort((a, b) => a.sdrPct - b.sdrPct);
  renderTable(document.getElementById('centre-attention-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'volume', label: 'Volume', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => Utils.fmtPct(r.sdrPct) },
      { key: 'avgTat', label: 'Avg TAT', align: 'right', fmt: r => Utils.fmtHrs(r.avgTat) },
      { key: 'over8', label: '>8 Hrs', align: 'right', fmt: r => Utils.fmtNum(r.over8) },
      { key: 'openBacklogTotal', label: 'Open Repairs', align: 'right', fmt: r => Utils.fmtNum(r.openBacklogTotal) },
      { key: 'primaryType', label: 'Primary Repair Type', fmt: r => primaryRepairType(r) },
    ],
    rows: attention, searchable: false, csvName: 'centres_requiring_attention', pageSize: 10,
    onRowClick: (key) => setCentreFilter(key),
  });

  // --- Best practice centres ---
  const bestPractice = centreStats.filter(c => c.volume >= medianVol && c.sdrPct !== null && medianSdr !== null && c.sdrPct >= medianSdr && (c.e2eOver48Pct ?? 100) < 15)
    .sort((a, b) => b.sdrPct - a.sdrPct);
  renderTable(document.getElementById('centre-best-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'volume', label: 'Volume', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => Utils.fmtPct(r.sdrPct) },
      { key: 'medianE2e', label: 'Median E2E TAT', align: 'right', fmt: r => Utils.fmtHrs(r.medianE2e) },
      { key: 'openBacklogTotal', label: 'Open Backlog', align: 'right', fmt: r => Utils.fmtNum(r.openBacklogTotal) },
    ],
    rows: bestPractice, searchable: false, csvName: 'best_practice_centres', pageSize: 10,
    onRowClick: (key) => setCentreFilter(key),
  });

  // --- Utilisation table ---
  renderTable(document.getElementById('centre-utilisation-table'), {
    columns: [
      { key: 'key', label: 'Centre' },
      { key: 'volume', label: 'Devices', align: 'right', fmt: r => Utils.fmtNum(r.volume) },
      { key: 'sdrPct', label: 'SDR %', align: 'right', fmt: r => Utils.fmtPct(r.sdrPct) },
      { key: 'avgTat', label: 'Avg TAT', align: 'right', fmt: r => Utils.fmtHrs(r.avgTat) },
      { key: 'engineerCount', label: 'Engineers', align: 'right', fmt: r => Utils.fmtNum(r.engineerCount) },
      { key: 'repairsPerEngineer', label: 'Repairs / Engineer', align: 'right', fmt: r => Utils.fmtNum(r.repairsPerEngineer, 1) },
      { key: 'cceCount', label: 'CCEs', align: 'right', fmt: r => Utils.fmtNum(r.cceCount) },
      { key: 'requestsPerCce', label: 'Requests / CCE', align: 'right', fmt: r => Utils.fmtNum(r.requestsPerCce, 1) },
    ],
    rows: centreStats, defaultSort: { key: 'volume', dir: 'desc' }, csvName: 'centre_utilisation',
    onRowClick: (key) => setCentreFilter(key),
  });
}

function primaryRepairType(r) {
  const arr = [['NTF', r.ntf], ['Carry-In', r.carryIn], ['Mail-In', r.mailIn]];
  arr.sort((a, b) => b[1] - a[1]);
  return arr[0][0];
}

function renderCentreRanking(ctx) {
  const { centreStats } = ctx;
  const field = document.getElementById('centre-rank-field').value || 'volume';
  const conf = CENTRE_RANK_FIELDS[field];
  const rows = [...centreStats].filter(c => c[field] !== null && c[field] !== undefined)
    .sort((a, b) => conf.dir === 'desc' ? b[field] - a[field] : a[field] - b[field])
    .slice(0, 12);
  document.getElementById('centre-rank-list').innerHTML = rows.map((r, i) => `
    <li><span class="rank-num">${i + 1}</span><span class="rank-name">${Utils.escapeHtml(r.key)}</span><b>${conf.fmt(r)}</b></li>
  `).join('');
}
