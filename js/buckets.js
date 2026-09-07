/* ==========================================================================
   buckets.js — TAT bucket definitions
   ========================================================================== */

const Buckets = (() => {

  // Repair Creation TAT (Servify request creation -> GSX repair creation)
  function creationBucket(hours) {
    if (hours === null || hours === undefined) return 'Missing / Unmatched';
    if (hours <= 2) return '0-2 Hrs';
    if (hours <= 4) return '2-4 Hrs';
    if (hours <= 8) return '4-8 Hrs';
    return '>8 Hrs';
  }
  const CREATION_BUCKET_ORDER = ['0-2 Hrs', '2-4 Hrs', '4-8 Hrs', '>8 Hrs', 'Missing / Unmatched'];
  function isSdr(hours) { return hours !== null && hours !== undefined && hours <= 8; }

  // End-to-end TAT (Servify request creation -> final closure), closed only
  function e2eBucket(hours) {
    if (hours === null || hours === undefined) return null;
    if (hours <= 2) return '0-2 Hrs';
    if (hours <= 4) return '2-4 Hrs';
    if (hours <= 8) return '4-8 Hrs';
    if (hours <= 24) return '8-24 Hrs';
    if (hours <= 48) return '24-48 Hrs';
    return '>48 Hrs';
  }
  const E2E_BUCKET_ORDER = ['0-2 Hrs', '2-4 Hrs', '4-8 Hrs', '8-24 Hrs', '24-48 Hrs', '>48 Hrs'];

  // Open repair ageing (from request creation to the reporting "now")
  function agingBucket(hours) {
    if (hours === null || hours === undefined) return null;
    if (hours < 4) return '<4 Hrs';
    if (hours <= 8) return '4-8 Hrs';
    if (hours <= 24) return '8-24 Hrs';
    if (hours <= 48) return '24-48 Hrs';
    if (hours <= 72) return '48-72 Hrs';
    return '72+ Hrs';
  }
  const AGING_BUCKET_ORDER = ['<4 Hrs', '4-8 Hrs', '8-24 Hrs', '24-48 Hrs', '48-72 Hrs', '72+ Hrs'];

  // SDR% thresholds for performance colour-coding — configurable at runtime
  const thresholds = { green: 90, amber: 80 };
  function sdrTier(sdrPct) {
    if (sdrPct === null || sdrPct === undefined) return 'na';
    if (sdrPct >= thresholds.green) return 'green';
    if (sdrPct >= thresholds.amber) return 'amber';
    return 'red';
  }

  return { creationBucket, CREATION_BUCKET_ORDER, isSdr, e2eBucket, E2E_BUCKET_ORDER, agingBucket, AGING_BUCKET_ORDER, thresholds, sdrTier };
})();
