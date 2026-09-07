/* ==========================================================================
   aggregate.js — group-by aggregation producing metric sets for tables/charts
   ========================================================================== */

const Aggregate = (() => {

  function emptyGroup(key) {
    return {
      key,
      volume: 0,
      ntf: 0, carryIn: 0, mailIn: 0, other: 0,
      matched: 0, unmatched: 0,
      creationTats: [], // valid (non-exception) hours, matched only
      over8: 0, sdr: 0, svr: 0,
      bucketCounts: { '0-2 Hrs': 0, '2-4 Hrs': 0, '4-8 Hrs': 0, '>8 Hrs': 0, 'Missing / Unmatched': 0 },
      open: 0, closed: 0, cancelled: 0,
      e2eTats: [],
      e2eWithin8: 0, e2eWithin24: 0, e2eOver48: 0, e2eValid: 0,
      engineers: new Set(), cces: new Set(),
      ratingSum: 0, ratingCount: 0,
      agingBuckets: { '<4 Hrs': 0, '4-8 Hrs': 0, '8-24 Hrs': 0, '24-48 Hrs': 0, '48-72 Hrs': 0, '72+ Hrs': 0 },
    };
  }

  function groupBy(records, keyFn, opts = {}) {
    const groups = new Map();
    const now = opts.reportingNow || new Date();
    for (const r of records) {
      const key = keyFn(r);
      if (key === null || key === undefined) continue;
      if (!groups.has(key)) groups.set(key, emptyGroup(key));
      const g = groups.get(key);
      g.volume++;
      if (r.repairType === 'NTF') g.ntf++;
      else if (r.repairType === 'Carry-In') g.carryIn++;
      else if (r.repairType === 'Mail-In') g.mailIn++;
      else g.other++;

      if (r.unmatched) g.unmatched++;
      else {
        g.matched++;
        const bucket = Buckets.creationBucket(r.repairCreationTatHours);
        g.bucketCounts[bucket] = (g.bucketCounts[bucket] || 0) + 1;
        if (r.repairCreationTatHours !== null && r.repairCreationTatHours !== undefined) {
          g.creationTats.push(r.repairCreationTatHours);
          if (Buckets.isSdr(r.repairCreationTatHours)) g.sdr++; else g.over8++;
          if (Buckets.isSvr(r.repairCreationTatHours)) g.svr++; // SVR is counted from the SAME population as SDR — a strict subset, never a separate denominator
        }
      }

      if (r.requestType === 'Open') g.open++;
      else if (r.requestType === 'Closed') g.closed++;
      else if (r.requestType === 'Cancelled') g.cancelled++;

      if (r.e2eTatHours !== null && r.e2eTatHours !== undefined) {
        g.e2eTats.push(r.e2eTatHours);
        g.e2eValid++;
        if (r.e2eTatHours <= 8) g.e2eWithin8++;
        if (r.e2eTatHours <= 24) g.e2eWithin24++;
        if (r.e2eTatHours > 48) g.e2eOver48++;
      }

      if (r.requestType === 'Open' && r.servifyCreation) {
        const ageHrs = Utils.hoursBetween(now, r.servifyCreation);
        if (ageHrs !== null && ageHrs >= 0) {
          const b = Buckets.agingBucket(ageHrs);
          if (b) g.agingBuckets[b]++;
        }
      }

      if (r.engineer) g.engineers.add(r.engineer);
      if (r.cce) g.cces.add(r.cce);
      if (r.rating !== null && r.rating !== undefined && !isNaN(r.rating)) { g.ratingSum += r.rating; g.ratingCount++; }
    }
    return groups;
  }

  // Turns a raw group object into the derived-metric shape used by the UI
  function finalize(g) {
    const validTatCount = g.creationTats.length;
    const sdrPct = validTatCount ? Utils.pct(g.sdr, validTatCount) : null;
    const svrPct = validTatCount ? Utils.pct(g.svr, validTatCount) : null;
    const over8Pct = validTatCount ? Utils.pct(g.over8, validTatCount) : null;
    const engineerCount = g.engineers.size;
    const cceCount = g.cces.size;
    return {
      key: g.key,
      volume: g.volume,
      ntf: g.ntf, carryIn: g.carryIn, mailIn: g.mailIn, other: g.other,
      ntfPct: Utils.pct(g.ntf, g.volume), carryInPct: Utils.pct(g.carryIn, g.volume), mailInPct: Utils.pct(g.mailIn, g.volume),
      matched: g.matched, unmatched: g.unmatched,
      validTatCount,
      avgTat: Utils.mean(g.creationTats), medianTat: Utils.median(g.creationTats), p90Tat: Utils.percentile(g.creationTats, 90),
      sdr: g.sdr, sdrPct, svr: g.svr, svrPct, over8: g.over8, over8Pct,
      bucketCounts: g.bucketCounts,
      open: g.open, closed: g.closed, cancelled: g.cancelled,
      e2eValid: g.e2eValid, avgE2e: Utils.mean(g.e2eTats), medianE2e: Utils.median(g.e2eTats),
      e2eWithin8Pct: Utils.pct(g.e2eWithin8, g.e2eValid), e2eWithin24Pct: Utils.pct(g.e2eWithin24, g.e2eValid), e2eOver48Pct: Utils.pct(g.e2eOver48, g.e2eValid),
      engineerCount, cceCount,
      repairsPerEngineer: engineerCount ? g.volume / engineerCount : null,
      requestsPerCce: cceCount ? g.volume / cceCount : null,
      avgRating: g.ratingCount ? g.ratingSum / g.ratingCount : null,
      agingBuckets: g.agingBuckets,
      openBacklogTotal: Object.values(g.agingBuckets).reduce((a, b) => a + b, 0),
    };
  }

  function summarize(records, keyFn, opts) {
    const groups = groupBy(records, keyFn, opts);
    return Array.from(groups.values()).map(finalize);
  }

  // Network-wide benchmark stats across a set of finalized groups
  function benchmarks(finalizedGroups, field) {
    const values = finalizedGroups.map(g => g[field]).filter(v => v !== null && v !== undefined && !isNaN(v));
    return {
      avg: Utils.mean(values), median: Utils.median(values),
      p25: Utils.percentile(values, 25), p75: Utils.percentile(values, 75),
    };
  }

  return { groupBy, finalize, summarize, benchmarks };
})();
