/* ==========================================================================
   insights.js — dynamic Management Insights generator
   Every sentence here is derived at render time from the current filtered
   data; nothing is hard-coded to a specific centre, engineer, or number.
   ========================================================================== */

const Insights = (() => {

  function build(ctx) {
    const { centreStats, engineerStats, cceStats, network, records } = ctx;
    const out = [];
    if (!centreStats.length) return ['No data falls within the current filters — widen the date range or clear a filter to see insights.'];

    const byVolumeDesc = [...centreStats].sort((a, b) => b.volume - a.volume);
    const topVolume = byVolumeDesc[0];
    if (topVolume) {
      out.push(`${topVolume.key} handled the highest device volume this period at ${Utils.fmtNum(topVolume.volume)} devices, with a Same Day Repair rate of ${Utils.fmtPct(topVolume.sdrPct)}.`);
    }

    const medianSdr = network.sdr.median;
    const medianVolume = network.volume.median;
    if (medianSdr !== null) {
      const stressed = centreStats.filter(c => c.volume >= medianVolume && c.sdrPct !== null && c.sdrPct < medianSdr).sort((a, b) => a.sdrPct - b.sdrPct)[0];
      if (stressed) {
        out.push(`${stressed.key} is a high-volume centre (${Utils.fmtNum(stressed.volume)} devices) but its SDR of ${Utils.fmtPct(stressed.sdrPct)} sits below the network median of ${Utils.fmtPct(medianSdr)}, indicating potential operational pressure.`);
      }
      const starCentre = centreStats.filter(c => c.volume >= medianVolume && c.sdrPct !== null && c.sdrPct >= medianSdr).sort((a, b) => b.sdrPct - a.sdrPct)[0];
      if (starCentre && starCentre.key !== (stressed && stressed.key)) {
        out.push(`${starCentre.key} combines above-median volume with an SDR of ${Utils.fmtPct(starCentre.sdrPct)} — a useful internal benchmark for other high-volume centres.`);
      }
    }

    const byVolumeAsc = [...centreStats].sort((a, b) => a.volume - b.volume);
    const lowest = byVolumeAsc[0];
    if (lowest && centreStats.length > 1) {
      out.push(`${lowest.key} has one of the lowest device volumes in the network at ${Utils.fmtNum(lowest.volume)} and may have available capacity.`);
    }

    const networkNtfPct = Utils.pct(records.filter(r => r.repairType === 'NTF').length, records.length);
    const highNtf = centreStats.filter(c => c.volume >= 10).sort((a, b) => b.ntfPct - a.ntfPct)[0];
    if (highNtf && networkNtfPct !== null && highNtf.ntfPct > networkNtfPct + 10) {
      out.push(`NTF accounts for ${Utils.fmtPct(highNtf.ntfPct)} of ${highNtf.key}'s workload, well above the network average of ${Utils.fmtPct(networkNtfPct)}.`);
    }

    if (engineerStats.length) {
      const topEng = [...engineerStats].sort((a, b) => b.volume - a.volume)[0];
      if (topEng) {
        const centreAvgSdr = network.sdr.avg;
        let note = `${topEng.key} handled the highest repair volume this period at ${Utils.fmtNum(topEng.volume)} repairs`;
        if (topEng.sdrPct !== null && centreAvgSdr !== null && topEng.sdrPct < centreAvgSdr) {
          note += `, with an SDR of ${Utils.fmtPct(topEng.sdrPct)} — below the network average of ${Utils.fmtPct(centreAvgSdr)}.`;
        } else {
          note += '.';
        }
        out.push(note);
      }
    }

    if (cceStats.length) {
      const topCce = [...cceStats].sort((a, b) => b.volume - a.volume)[0];
      if (topCce) out.push(`${topCce.key} created the highest number of service requests this period, at ${Utils.fmtNum(topCce.volume)}.`);
    }

    const backlogCentre = [...centreStats].sort((a, b) => {
      const aOld = (a.agingBuckets['48-72 Hrs'] || 0) + (a.agingBuckets['72+ Hrs'] || 0);
      const bOld = (b.agingBuckets['48-72 Hrs'] || 0) + (b.agingBuckets['72+ Hrs'] || 0);
      return bOld - aOld;
    })[0];
    if (backlogCentre) {
      const old = (backlogCentre.agingBuckets['48-72 Hrs'] || 0) + (backlogCentre.agingBuckets['72+ Hrs'] || 0);
      if (old > 0) out.push(`${backlogCentre.key} has ${Utils.fmtNum(old)} open repair${old === 1 ? '' : 's'} older than 48 hours, representing a meaningful ageing backlog.`);
    }

    const mix = ['NTF', 'Carry-In', 'Mail-In'];
    const byTypeVolume = mix.map(t => ({ t, n: records.filter(r => r.repairType === t).length }));
    byTypeVolume.sort((a, b) => b.n - a.n);
    if (byTypeVolume[0] && records.length) {
      out.push(`${byTypeVolume[0].t} is the largest share of network workload this period at ${Utils.fmtPct(Utils.pct(byTypeVolume[0].n, records.length))} of all devices handled.`);
    }

    return out;
  }

  return { build };
})();
