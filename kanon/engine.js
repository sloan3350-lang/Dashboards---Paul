/* KANON progression engine.
 * Design principle: PERFORMANCE LEADS, FEEDBACK VETOES.
 * Load and rep progress at a fixed RIR is the primary signal. Volume is the
 * response to a STALL, never the response to success. Subjective inputs can
 * only hold or cut. Joint pain overrides everything.
 * Pure functions, no DOM, so engine.test.js can run them in node.
 */

const RIR_BY_WEEK = { 1: 4, 2: 3, 3: 2, 4: 2, 5: 5 };   // week 5 = deload
const DELOAD_WEEK = 5;
const SETS_CAP_PER_SLOT = 4;

/* ---------- per-exercise load progression ---------- */
// sets: [{reps, rir, load}], target: {repLow, repHigh, rir, load}
function nextLoad(sets, target, ex, priorMisses) {
  const working = sets.filter(s => s.reps > 0);
  if (!working.length) return { load: target.load, misses: priorMisses, note: 'no sets logged' };

  const allTop = working.every(s => s.reps >= target.repHigh && s.rir <= target.rir);
  const badMiss = working.some(s => s.reps < target.repLow - 1);

  if (allTop) {
    return { load: target.load + ex.inc, misses: 0,
             note: 'hit the top of the range at target effort, load up ' + ex.inc + ' lb' };
  }
  if (badMiss) {
    const misses = priorMisses + 1;
    if (misses >= 2) {
      return { load: Math.max(ex.inc, roundTo(target.load * 0.9, ex.inc)), misses: 0,
               note: 'missed the range twice running, backing load off 10% to rebuild' };
    }
    return { load: target.load, misses, note: 'missed the range, same load again next time' };
  }
  return { load: target.load, misses: 0, note: 'in range, same load, chase one more rep' };
}

function roundTo(v, step) { return Math.max(step, Math.round(v / step) * step); }

/* ---------- volume: only ever a response to a stall ---------- */
// history: recent sessions for this slot, newest first: [{loadProgressed:bool, sets:int}]
// recovery: {readiness 1-4, jointMax 0-2}, mode: 'cut' | 'maintain' | 'gain'
function volumeDecision(history, recovery, mode, currentSets) {
  if (recovery.jointMax >= 2)
    return { delta: 0, note: 'joint flag on this slot, volume frozen while we swap the movement' };
  if (recovery.readiness >= 4)
    return { delta: -1, note: 'you arrived too sore to train this properly, cutting a set' };
  if (mode === 'cut')
    return { delta: 0, note: 'fat-loss mode: holding volume. Recovery is the limiter, not stimulus' };
  if (currentSets >= SETS_CAP_PER_SLOT)
    return { delta: 0, note: 'at the set cap for this slot, progress load instead' };

  const last2 = history.slice(0, 2);
  const stalled = last2.length === 2 && last2.every(h => !h.loadProgressed);
  if (stalled && recovery.readiness <= 2)
    return { delta: 1, note: 'load stalled twice and you are recovering well, adding one set' };
  if (stalled)
    return { delta: 0, note: 'load stalled but recovery is marginal, holding rather than digging' };
  return { delta: 0, note: 'load is still progressing, no reason to add volume' };
}

/* ---------- joint triage ---------- */
// Returns a substitute that keeps the slot and lowers load on the flagged joint.
function substitute(exId, joint, quarantined, EX, SUBS) {
  const cur = EX.find(e => e.id === exId);
  if (!cur) return null;
  const curCost = (cur.joints && cur.joints[joint]) || 0;
  const order = SUBS[cur.slot] || [];
  for (const cid of order) {
    if (cid === exId || quarantined.includes(cid)) continue;
    const cand = EX.find(e => e.id === cid);
    if (!cand) continue;
    const cost = (cand.joints && cand.joints[joint]) || 0;
    if (cost < curCost) return cand;
  }
  for (const cid of order) {                       // nothing strictly lower: take any clean option
    if (cid === exId || quarantined.includes(cid)) continue;
    const cand = EX.find(e => e.id === cid);
    if (cand && ((cand.joints && cand.joints[joint]) || 0) <= curCost) return cand;
  }
  return null;
}

/* ---------- deload ---------- */
function deloadCheck(week, signals) {
  if (week % DELOAD_WEEK === 0)
    return { deload: true, reason: 'scheduled deload week' };
  const hits = [];
  if (signals.perfDownLifts >= 3)      hits.push('performance down on three or more lifts');
  if (signals.shortSleepNights >= 3)   hits.push('under six hours of sleep for three nights');
  if (signals.jointFlags >= 2)         hits.push('two or more joint flags');
  if (signals.soreSlots >= 3)          hits.push('arrived sore on three or more slots');
  if (signals.selfReportWrecked)       hits.push('you called it: wrecked');
  if (hits.length >= 2)
    return { deload: true, reason: 'early deload triggered by ' + hits.join(' and ') };
  return { deload: false, reason: '' };
}

/* ---------- body composition ---------- */
// US Navy circumference method, imperial inches. Accurate to roughly 3-4 points
// against DEXA with a small negative bias in men. Good for trend, not for truth.
function navyBodyFat({ sex, heightIn, neckIn, waistIn, hipIn }) {
  if (!heightIn || !neckIn || !waistIn) return null;
  let bf;
  if (sex === 'female') {
    if (!hipIn) return null;
    bf = 163.205 * Math.log10(waistIn + hipIn - neckIn) - 97.684 * Math.log10(heightIn) - 78.387;
  } else {
    if (waistIn - neckIn <= 0) return null;
    bf = 86.010 * Math.log10(waistIn - neckIn) - 70.041 * Math.log10(heightIn) + 36.76;
  }
  if (!isFinite(bf) || bf <= 0) return null;
  return { point: round1(bf), low: round1(bf - 3.5), high: round1(bf + 3.5) };
}

/* ---------- protein ----------
 * Anchored on the Morton 2018 BJSM plateau at ~1.62 g/kg for energy-adequate
 * training, pushed toward the upper half in a deficit and past age 40 where the
 * anabolic response is blunted. The floor exists because a GLP-1 suppresses
 * appetite and a target you never hit is not a target. */
function proteinTarget({ weightLb, age, sex, goal, appetiteSuppressed }) {
  const kg = weightLb / 2.2046;
  let low = 1.6, high = goal === 'cut' ? 2.2 : 2.0;
  if (age >= 40) low = Math.max(low, 1.7);
  const target = Math.round(kg * low);
  const stretch = Math.round(kg * high);
  const floor = appetiteSuppressed ? Math.max(120, Math.round(kg * 1.2)) : target;
  const meals = 4;
  return { floor, target, stretch, meals, perMeal: Math.round(target / meals),
           kg: round1(kg) };
}

function waterTargetOz(weightLb, trainingDay) {
  return Math.round(weightLb * 0.5) + (trainingDay ? 16 : 0);
}

/* ---------- weight trend ---------- */
// entries: [{date:'YYYY-MM-DD', lb}] any order. Returns smoothed series + rate.
function weightTrend(entries, window = 7) {
  const s = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const out = s.map((e, i) => {
    const slice = s.slice(Math.max(0, i - window + 1), i + 1);
    const avg = slice.reduce((t, x) => t + x.lb, 0) / slice.length;
    return { date: e.date, lb: e.lb, avg: round1(avg) };
  });
  // A rate needs enough points over enough days to mean anything. Below that we
  // show the chart and say nothing, rather than raise a false alarm on noise.
  let rate = null, pctPerWk = null, enough = false;
  if (out.length >= 2) {
    const a = out[0], b = out[out.length - 1];
    const days = (new Date(b.date) - new Date(a.date)) / 86400000;
    if (days >= 5) {
      rate = round2((b.avg - a.avg) / (days / 7));
      pctPerWk = round2(Math.abs(rate) / b.avg * 100);
      enough = out.length >= 5 && days >= 10;
    }
  }
  return { series: out, lbPerWeek: rate, pctPerWeek: pctPerWk, reliable: enough };
}

// Losing faster than ~1%/wk is where lean mass starts going with the fat.
function lossFlag(pctPerWeek, lbPerWeek) {
  if (pctPerWeek == null || lbPerWeek == null || lbPerWeek >= 0) return null;
  if (pctPerWeek > 1.0)
    return { level: 'fast', msg: 'Losing faster than 1% of bodyweight a week. That rate costs muscle as well as fat. Protein and hard sets are what keep the muscle.' };
  if (pctPerWeek < 0.25)
    return { level: 'slow', msg: 'Loss has nearly flattened. Fine if you are holding strength, worth a look if not.' };
  return { level: 'good', msg: 'Rate is in the range that preserves lean mass while fat comes off.' };
}

const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextLoad, volumeDecision, substitute, deloadCheck, navyBodyFat,
                     proteinTarget, waterTargetOz, weightTrend, lossFlag, roundTo,
                     RIR_BY_WEEK, DELOAD_WEEK, SETS_CAP_PER_SLOT };
}
