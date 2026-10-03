/* KANON progression engine.
 * Design principle: PERFORMANCE LEADS, FEEDBACK VETOES.
 * Load and rep progress at a fixed RIR is the primary signal. Volume is the
 * response to a STALL, never the response to success. Subjective inputs can
 * only hold or cut. Joint pain overrides everything.
 * Pure functions, no DOM, so engine.test.js can run them in node.
 */

/* The block is however many weeks you set it to. The last week is the deload.
 * Effort ramps across the accumulation weeks: four reps in the tank at the start
 * of the block down to one at the end, so the hardest week is the one before the
 * deload rather than an arbitrary fixed schedule. */
const RIR_BY_WEEK = { 1: 4, 2: 3, 3: 2, 4: 2, 5: 5 };   // legacy 5-week table
const DELOAD_WEEK = 5;
const BLOCK_LENGTHS = [4, 5, 6, 8, 10, 12];

function blockRir(week, blockWeeks) {
  const n = blockWeeks || DELOAD_WEEK;
  if (week >= n) return 5;                       // deload
  const acc = n - 1;                             // accumulation weeks
  if (acc <= 1) return 3;
  const t = (week - 1) / (acc - 1);              // 0 at week 1, 1 at the last hard week
  return Math.max(1, Math.round(4 - t * 3));     // 4 -> 1
}

function isDeload(week, blockWeeks) { return week >= (blockWeeks || DELOAD_WEEK); }

/* Sets per lift for a given week. Every accumulation week carries the full
 * planned sets; week 1 is eased by effort (4 reps in reserve), not by cutting
 * sets, because cutting a 2-set lift to 1 drops every muscle below the weekly
 * floor. Only the deload halves. */
function blockSets(week, planned, blockWeeks) {
  const n = blockWeeks || DELOAD_WEEK;
  if (isDeload(week, n)) return Math.max(1, Math.floor(planned / 2));
  return Math.max(SET_FLOOR, planned);
}
const SETS_CAP_PER_SLOT = 4;
/* Hammarström et al., J Physiol 2020 (PMID 31813190): untrained people gained
 * more muscle and strength from 3 sets per exercise than from 1. Two is the
 * floor here so a short session can still cover every pattern. */
const SET_FLOOR = 2;

/* ---------- per-exercise load progression ---------- */
// sets: [{reps, rir, load}], target: {repLow, repHigh, rir, load}
/* ---------------- returning from a layoff ----------------
 * Muscle regains strength fast after a break; tendon and connective tissue do
 * not. Loading a tendon at the rate an experienced lifter's muscles can
 * suddenly handle again is exactly how a return-to-training injury happens.
 * There is no single controlled trial behind the exact session counts below —
 * this is the standard coaching heuristic (reduce load, re-earn tolerance over
 * roughly two to four weeks of training before resuming full-speed
 * progression) rather than a number from a specific paper, and the engine
 * says so rather than dressing it up as more settled than it is. The counter
 * is PER LIFT and ticks down once per logged session on that lift, since the
 * exposure that matters is how many times a specific joint has taken the
 * load again, not how many calendar weeks have passed. */
const LAYOFFS = [
  { id:'active', name:'Training now',               sub:'No layoff to plan around',                      rampSessions:0 },
  { id:'short',  name:'Within the last 3 months',    sub:'Short enough that normal progression is fine',  rampSessions:0 },
  { id:'medium', name:'3 months to a year off',      sub:'Muscle memory comes back fast; tendons lag behind it', rampSessions:6 },
  { id:'long',   name:'Over a year off, or new to this', sub:'Start conservative for the first few weeks back', rampSessions:10 }
];
function layoffById(id) { return LAYOFFS.find(l => l.id === id) || LAYOFFS[0]; }

function nextLoad(sets, target, ex, priorMisses, levelId, ramp) {
  const working = sets.filter(s => s.reps > 0);
  const priorEarns = (ramp && ramp.priorEarns) || 0;
  if (!working.length) return { load: target.load, misses: priorMisses, earns: priorEarns, note: 'no sets logged' };

  const L = levelById(levelId);
  const rampActive = !!(ramp && ramp.active);
  const fullStep = loadStep(ex, levelId);
  // Training age does not change the size of the jump much, it changes how hard
  // the jump is to earn. A novice can move almost every session, so the bar is
  // the top of the range minus a rep or two. An advanced lifter has to clear the
  // whole range at target effort, which is why their load moves monthly.
  const bar = Math.max(target.repLow, target.repHigh - L.earnTop);
  const earned = working.every(s => s.reps >= bar && s.rir <= target.rir);
  const badMiss = working.some(s => s.reps < target.repLow - 1);

  if (earned) {
    // Coming back from a break: the first clear of a weight is proof the
    // muscle can do it, not proof the tendon is ready to do it again heavier.
    // Ask for a second clear at the same load before awarding the jump.
    if (rampActive && priorEarns < 1) {
      return { load: target.load, misses: 0, earns: priorEarns + 1,
               note: 'hit the target, but easing back in after time off — one more session at this weight before the next increase' };
    }
    const step = rampActive ? Math.max(2.5, roundTo(fullStep / 2, 2.5)) : fullStep;
    return { load: target.load + step, misses: 0, earns: 0,
             note: 'hit the target at target effort, load up ' + step + ' lb' +
                   (rampActive ? ' (half the usual jump while you rebuild tolerance)' : '') };
  }
  if (badMiss) {
    const misses = priorMisses + 1;
    if (misses >= 2) {
      return { load: Math.max(fullStep, roundTo(target.load * 0.9, fullStep)), misses: 0, earns: 0,
               note: 'missed the range twice running, backing load off 10% to rebuild' };
    }
    return { load: target.load, misses, earns: 0, note: 'missed the range, same load again next time' };
  }
  return { load: target.load, misses: 0, earns: 0, note: 'in range, same load, chase one more rep' };
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
function deloadCheck(week, signals, blockWeeks) {
  if (isDeload(week, blockWeeks))
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

/* National Academies (IOM, 2004) adequate intake for TOTAL water is 3.7 L/day
 * for men and 2.7 L/day for women from all sources, of which roughly 20% comes
 * from food. So the drinkable share is ~100 oz for men, ~73 oz for women. This
 * replaces the "half an ounce per pound of bodyweight" rule, which is folklore
 * with no basis in the DRI. Exercise adds to it; ACSM frames replacement by
 * sweat loss, and 20 oz is a reasonable flat stand-in for a 45-60 min session.
 * The AI is a population figure, not an individual prescription: thirst and
 * urine colour remain the real guides. */
function waterTargetOz(sex, trainingDay) {
  const totalOz = sex === 'female' ? 91 : 125;
  const fromDrinks = Math.round(totalOz * 0.8);
  return fromDrinks + (trainingDay ? 20 : 0);
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

/* ---------- mesocycle generator ----------
 * Day templates are ordered by priority, so trimming for a short session drops
 * accessories before compounds. A slot may appear twice in a day (a lower day
 * wants two quad and two hinge movements), and the generator gives each
 * appearance a different exercise.
 * Time model: ~7 min for a compound slot, ~5 for an isolation slot, at the set
 * counts this programme uses, plus 8 minutes of warm-up. */
const ISO_SLOTS = ['arms', 'calves', 'core'];
const SLOT_MIN = slot => (ISO_SLOTS.includes(slot) ? 5 : 7);
const WARMUP_MIN = 8;

const TEMPLATES = {
  2: [{ name: 'Full body A', slots: ['squat','hpress','vpull','hinge','hpull','vpress','squat','hpress','arms','arms','calves','core'] },
      { name: 'Full body B', slots: ['hinge','vpress','hpull','squat','hpress','vpull','hinge','vpull','arms','arms','core','calves'] }],
  3: [{ name: 'Full body A', slots: ['squat','hpress','vpull','hinge','vpress','squat','arms','arms','calves','core'] },
      { name: 'Full body B', slots: ['hinge','vpull','hpress','squat','hpull','hinge','arms','arms','core','calves'] },
      { name: 'Full body C', slots: ['squat','vpress','hpull','hinge','hpress','vpull','arms','arms','calves','core'] }],
  4: [{ name: 'Upper A', slots: ['hpress','vpull','vpress','hpull','hpress','vpull','arms','arms','core'] },
      { name: 'Lower A', slots: ['squat','hinge','squat','hinge','squat','calves','calves','core'] },
      { name: 'Upper B', slots: ['vpull','hpress','hpull','vpress','vpull','hpress','arms','arms','core'] },
      { name: 'Lower B', slots: ['hinge','squat','hinge','squat','hinge','calves','calves','core'] }],
  5: [{ name: 'Upper A', slots: ['hpress','vpull','vpress','hpull','hpress','arms','arms','core'] },
      { name: 'Lower A', slots: ['squat','hinge','squat','hinge','calves','core'] },
      { name: 'Push',    slots: ['hpress','vpress','hpress','vpress','arms','arms','core'] },
      { name: 'Pull',    slots: ['vpull','hpull','vpull','hpull','arms','arms','core'] },
      { name: 'Legs',    slots: ['hinge','squat','hinge','squat','calves','calves','core'] }]
};

// Prefer a lift not already used this week, then the gentlest on the joints.
function pickExercise(slot, used, EX, SUBS) {
  const order = (SUBS[slot] || []).slice();
  const pool = order.map(id => EX.find(e => e.id === id)).filter(Boolean);
  if (!pool.length) return null;
  return pool.find(e => !used.has(e.id)) || pool[0];
}

function generatePlan({ days, minutes, goal }, EX, SUBS) {
  const tpl = TEMPLATES[days] || TEMPLATES[2];
  const budget = Math.max(SLOT_MIN('squat'), minutes - WARMUP_MIN);
  const used = new Set();
  return tpl.map(day => {
    let spent = 0;
    const slots = [];
    for (const slot of day.slots) {
      const cost = SLOT_MIN(slot);
      if (spent + cost > budget) break;
      const ex = pickExercise(slot, used, EX, SUBS);
      if (!ex) continue;
      used.add(ex.id);
      const iso = ISO_SLOTS.includes(slot);
      slots.push({ slot, exId: ex.id, sets: 1,
                   repLow: iso ? 10 : 8, repHigh: iso ? 15 : 12,
                   load: null, misses: 0, primary: slots.length < 3 });
      spent += cost;
    }
    return { name: day.name, slots, minutes: spent + WARMUP_MIN };
  });
}

/* Weekly hard sets per slot at a given week, so the plan can be sanity-checked
 * against the ~10-plus sets per muscle per week the evidence supports. */
function weeklyVolume(sessions, week, setsForWeekFn) {
  const out = {};
  sessions.forEach(day => day.slots.forEach(p => {
    const n = Math.max(p.sets, setsForWeekFn(week, p.primary));
    out[p.slot] = (out[p.slot] || 0) + n;
  }));
  return out;
}

/* ============================================================
   TRAINING AGE, TIME BUDGET, PROGRAM LIBRARY, JOINT POLICY, UNITS
   Every number below is traced to a source so it can be argued with.

   Weekly sets per muscle (the variable that drives the whole build).
   - Schoenfeld, Ogborn & Krieger, J Sports Sci 2017 (PMID 27433992): each
     extra weekly set added ~0.37% growth; 10+ sets a week beat fewer.
   - Baz-Valle et al., J Hum Kinet 2022 (PMID 35291645): 12 to 20 weekly sets
     as the standard recommendation for trained men.
   - Pelland et al., Sports Med 2026 (PMID 41343037): 67 studies, 2,058
     people. Growth keeps rising with weekly sets, with diminishing returns;
     strength flattens much sooner. Counting indirect sets as half a set
     ("fractional") predicted results best, which is how muscleVolume counts.
   - ACSM Position Stand, Med Sci Sports Exerc 2026 (doi 10.1249/MSS.
     0000000000003897): ~10 sets per muscle per week for hypertrophy, every
     major muscle at least twice a week; failure training and periodization
     model did not consistently change outcomes.
   So the weekly target starts at 10 for a new lifter and rises with training
   age toward the middle of the 12-20 band. It is a target the builder fills
   to, not a number reported after the fact.

   Sets per exercise. Hammarström et al., J Physiol 2020 (PMID 31813190): even
   untrained lifters gained more from 3 sets than 1. Floor of 2, cap of 4;
   past 4 the next set goes on a second exercise for the same muscle. The cap
   is a coaching convention, not a trial result.

   Load and progression. ACSM 2009 Position Stand (Med Sci Sports Exerc
   41:687-708): 8-12 RM for novices; add 2-10% load once the lifter can do
   one to two reps over the target. That is double progression, which is what
   nextLoad does. Plotkin et al., PeerJ 2022 (PMID 36199287): adding reps at
   a fixed load grew muscle as well as adding load, so reps climb first and
   load is the reward for clearing the top of the range.

   Effort. Robinson et al., Sports Med 2024 (PMID 38970765): growth improves
   as sets end closer to failure; strength barely cares. Refalo et al., J
   Sports Sci 2024 (PMID 38393985): 1-2 reps in reserve grew muscle as well as
   failure. Hence a 4 to 1 RIR ramp, never prescribed failure.

   Rest and time. Schoenfeld et al., J Strength Cond Res 2016 (PMID 26605807):
   3-minute rests beat 1-minute rests for growth in trained men. A compound
   set plus its rest is costed at 3 minutes, an isolation set at 2.
   ============================================================ */

const LEVELS = [
  { id:'new',   name:'New to lifting',  sub:'Under 6 months, or coming back after years off',
    weekLow:10, weekHigh:12, weekTarget:10, incScale:0.5, earnTop:2, deloadEvery:5, startRir:4 },
  { id:'novice',name:'Novice',          sub:'6 months to a year of consistent training',
    weekLow:10, weekHigh:14, weekTarget:12, incScale:0.75, earnTop:1, deloadEvery:5, startRir:3 },
  { id:'inter', name:'Intermediate',    sub:'One to four years, lifts move month to month',
    weekLow:12, weekHigh:18, weekTarget:14, incScale:1, earnTop:0, deloadEvery:5, startRir:3 },
  { id:'adv',   name:'Advanced',        sub:'Four years or more, progress is slow and earned',
    weekLow:14, weekHigh:20, weekTarget:16, incScale:1, earnTop:0, deloadEvery:4, startRir:2 }
];
const levelById = id => LEVELS.find(l => l.id === id) || LEVELS[2];

const UPPER_SLOTS = ['hpress','vpull','hpull','vpress','biceps','triceps','arms'];

/* NSCA-shaped jump: the exercise's own increment, scaled by training age, then
   rounded to something you can actually load on a bar or a stack. */
function loadStep(ex, levelId) {
  const L = levelById(levelId);
  const raw = (ex.inc || 5) * L.incScale;
  const upper = UPPER_SLOTS.includes(ex.slot);
  const lo = upper ? 2.5 : 5;
  const hi = upper ? 10 : 15;
  return Math.min(hi, Math.max(lo, roundTo(raw, 2.5)));
}

/* Minutes per working set including its rest (see the rest note above), plus
   a fixed warm-up charge per session. */
const MIN_PER_SET = slot => (ISO_SLOTS.concat(['biceps','triceps']).includes(slot) ? 2 : 3);

/* The weekly fractional-set target every major muscle is built toward. A cut
   holds at the evidence floor of 10: a deficit is short on recovery, and the
   aim is to keep muscle, not to chase peak volume. */
function weeklyTarget(level, goal) {
  return goal === 'gain' ? levelById(level).weekTarget : 10;
}

function sessionShape({ minutes, level, goal }) {
  const L = levelById(level);
  const budget = Math.max(10, (minutes || 50) - WARMUP_MIN);
  return { setBudget: Math.floor(budget / 2.8), budgetMin: budget,
           setsPrimary: 3, setsOther: SET_FLOOR,
           repLow: 8, repHigh: 12, isoLow: 10, isoHigh: 15,
           rir: L.startRir, weekLow: L.weekLow, weekHigh: L.weekHigh,
           weekTarget: weeklyTarget(level, goal) };
}

/* ---------------- program library ----------------
   Sixteen shapes. Each one knows the training ages it suits, the day counts it
   can be laid out across, and the emphasis slots it adds on top of the split.
   Filtered against what you tell the app, every realistic combination of level,
   days and session length returns at least ten programmes. */

const SPLITS = {
  // Each day lists more slots than most time budgets will buy. sessionShape
  // trims from the end, so the order is the priority order: the patterns that
  // must be trained come first, the second helping of each comes next, and the
  // accessories are what a short session drops.
  full: n => Array.from({length:n}, (_,i) => ({
    name: 'Full body ' + 'ABCDEF'[i],
    slots: i % 2 ? ['hinge','vpress','hpull','squat','hpress','vpull','biceps','triceps','calves']
                 : ['squat','hpress','vpull','hinge','hpull','vpress','triceps','biceps','calves'] })),
  ul: n => Array.from({length:n}, (_,i) => (i % 2
    ? { name:'Lower ' + 'AB'[Math.floor(i/2) % 2],
        slots:['squat','hinge','unilat','squat','hinge','calves','calves','core'] }
    : { name:'Upper ' + 'AB'[Math.floor(i/2) % 2],
        slots:['hpress','vpull','vpress','hpull','hpress','vpull','biceps','triceps'] })),
  ppl: n => Array.from({length:n}, (_,i) => [
    { name:'Push',  slots:['hpress','vpress','hpress','triceps','vpress','triceps','hpress'] },
    { name:'Pull',  slots:['vpull','hpull','vpull','hpull','biceps','biceps','vpull'] },
    { name:'Legs',  slots:['squat','hinge','squat','hinge','unilat','calves','calves'] }][i % 3]),
  ulppl: n => Array.from({length:n}, (_,i) => [
    { name:'Upper', slots:['hpress','vpull','vpress','hpull','hpress','biceps','triceps','core'] },
    { name:'Lower', slots:['squat','hinge','unilat','squat','hinge','calves','core'] },
    { name:'Push',  slots:['hpress','vpress','hpress','triceps','vpress','triceps'] },
    { name:'Pull',  slots:['vpull','hpull','vpull','hpull','biceps','biceps'] },
    { name:'Legs',  slots:['hinge','squat','unilat','hinge','squat','calves','calves'] }][i % 5])
};

const PROGRAMS = [
  { id:'foundations', name:'Foundations',            split:'full',  levels:['new','novice'],
    days:[2,3,4,5,6], minMin:20, emphasis:[],
    blurb:'Six patterns a session, one or two sets each, machines first. The point is showing up and learning the movements, not the total.' },
  { id:'fullclassic', name:'Full Body Classic',      split:'full',  levels:['new','novice','inter'],
    days:[2,3,4,5], minMin:30, emphasis:['core'],
    blurb:'Every muscle every session. The most forgiving structure if a week goes sideways, because missing one day costs you a third of the week, not all of a body part.' },
  { id:'fullarms',    name:'Full Body, Arm Focus',   split:'full',  levels:['novice','inter','adv'],
    days:[2,3,4,5], minMin:32, emphasis:['biceps','triceps'],
    blurb:'The full body frame with direct arm work bolted on to every session. Arms get trained three to four times a week instead of once.' },
  { id:'fullcalves',  name:'Full Body, Calf Focus',  split:'full',  levels:['new','novice','inter','adv'],
    days:[2,3,4,5], minMin:30, emphasis:['calves','calves'],
    blurb:'Calves twice a session, every session. They recover fast and respond to frequency more than to any single brutal session.' },
  { id:'fulllegs',    name:'Full Body, Leg Focus',   split:'full',  levels:['novice','inter','adv'],
    days:[2,3,4,5], minMin:30, emphasis:['unilat','calves'],
    blurb:'Adds single-leg work and calves to the full body template. Lunges and split squats build the hip without loading the spine.' },
  { id:'ul',          name:'Upper / Lower',          split:'ul',    levels:['novice','inter','adv'],
    days:[2,3,4,5,6], minMin:28, emphasis:['core'],
    blurb:'The standard four-day structure. Each half of the body gets two sessions a week, which lands weekly sets in the band without any session running long.' },
  { id:'ularms',      name:'Upper / Lower, Arm Focus',split:'ul',   levels:['novice','inter','adv'],
    days:[3,4,5,6], minMin:45, emphasis:['biceps','triceps'],
    blurb:'Upper days carry four direct arm slots. If arms are the lagging part, this is the cheapest way to double their volume.' },
  { id:'ppl',         name:'Push / Pull / Legs',     split:'ppl',   levels:['novice','inter','adv'],
    days:[3,4,5,6], minMin:32, emphasis:[],
    blurb:'Three sessions covering everything, run once or twice a week. Six days is a lot of gym time and only worth it if recovery is genuinely handled.' },
  { id:'pplarms',     name:'Push / Pull / Legs, Arms',split:'ppl',  levels:['inter','adv'],
    days:[3,4,5,6], minMin:50, emphasis:['biceps','triceps'],
    blurb:'Push and pull days already hit the arms. This adds direct work on top, for people whose arms lag their chest and back.' },
  { id:'arnold',      name:'Five-Day Combination',   split:'ulppl', levels:['novice','inter','adv'],
    days:[4,5,6], minMin:45, emphasis:[],
    blurb:'Upper, lower, push, pull, legs. Everything gets hit twice with different emphases, which is why five days beats four for most intermediates.' },
  { id:'express',     name:'Express',                split:'full',  levels:['new','novice','inter','adv'],
    days:[2,3,4,5], minMin:25, emphasis:[],
    blurb:'Four slots a session, two sets each, built for thirty minutes. A short session you actually do beats a long one you skip.' },
  { id:'machineonly', name:'Machines Only',          split:'full',  levels:['new','novice','inter'],
    days:[2,3,4,5], minMin:30, equip:'machine', emphasis:['calves'],
    blurb:'No free weights at all. Useful on a crowded evening when every bench and rack is taken, and a reasonable default if balance or a joint is the limiting factor.' },
  { id:'freeweight',  name:'Free Weights Only',      split:'full',  levels:['novice','inter','adv'],
    days:[2,3,4,5], minMin:40, equip:'free', emphasis:['biceps'],
    blurb:'Barbells and dumbbells only. More stabiliser work and more skill per rep, which also means more fatigue per set.' },
  { id:'posterior',   name:'Posterior Chain',        split:'ul',    levels:['novice','inter','adv'],
    days:[2,3,4,5], minMin:30, emphasis:['hinge','hpull'],
    blurb:'Weighted toward hinges and rows. The structure to pick if you sit at a desk all day and your front side is doing all the work.' },
  { id:'shoulders',   name:'Shoulders and Back',     split:'ul',    levels:['new','novice','inter','adv'],
    days:[2,3,4,5,6], minMin:30, emphasis:['vpress','hpull'],
    blurb:'Extra vertical pressing and rowing. The look most people actually want from lifting comes from delts and upper back, not from the bench.' },
  { id:'chestback',   name:'Chest and Back',         split:'ul',    levels:['new','novice','inter','adv'],
    days:[2,3,4,5], minMin:30, emphasis:['hpress','hpull'],
    blurb:'Pressing and rowing paired every session. The oldest structure in lifting and still one of the best, because the antagonist pairing lets you rest less between sets.' },
  { id:'athletic',    name:'Athletic Base',          split:'full',  levels:['new','novice','inter'],
    days:[2,3,4,5], minMin:30, emphasis:['unilat','core'],
    blurb:'Full body with single-leg work and loaded carries in the core slot. Built for carrying strength out of the gym rather than for maximum size.' },
  { id:'glutham',     name:'Glutes and Hamstrings',  split:'ul',    levels:['new','novice','inter','adv'],
    days:[2,3,4,5], minMin:30, emphasis:['hinge','unilat'],
    blurb:'Hinge-dominant lower days. Most programmes are quad-heavy by accident because leg press is easy to load; this one is not.' },
  { id:'armshoulder', name:'Arms and Shoulders',     split:'full',  levels:['novice','inter','adv'],
    days:[2,3,4,5], minMin:40, emphasis:['biceps','triceps','vpress'],
    blurb:'Every session finishes with direct arm and delt work. The parts that show in a shirt, trained at the frequency they tolerate.' },
  { id:'firstmonth',  name:'First Month',            split:'full',  levels:['new','novice'],
    days:[2,3,4,5], minMin:25, equip:'machine', emphasis:['core'],
    blurb:'Four machine movements and a core slot, two sets each, deliberately easy. Built to be repeated until the movements feel automatic rather than to be progressed aggressively.' },
  { id:'backtoit',    name:'Back To It',             split:'full',  levels:['new','novice','inter'],
    days:[2,3,4,5], minMin:25, emphasis:['core','calves'],
    blurb:'For returning after a long layoff. Same patterns as the classic template at half the volume, because the first three weeks back are about tendons and technique, not about what you used to lift.' },
  { id:'lunchbreak',  name:'Lunch Break',            split:'ul',    levels:['new','novice','inter','adv'],
    days:[2,3,4,5,6], minMin:20, emphasis:[],
    blurb:'Four slots, in and out. Upper and lower alternating so nothing gets trained two days running when you are squeezing sessions in wherever they fit.' },
  { id:'minimalist',  name:'Minimalist',             split:'ul',    levels:['novice','inter','adv'],
    days:[2,3,4,5,6], minMin:25, equip:'free', emphasis:[],
    blurb:'Four hard free-weight sets a session and nothing else. For advanced lifters in a busy stretch: keeping the big lifts moving holds nearly all of the muscle, and the accessories are what you drop first.' },
  { id:'legspec',     name:'Leg Specialisation',     split:'ul',    levels:['inter','adv'],
    days:[3,4,5,6], minMin:45, emphasis:['unilat','calves','squat'],
    blurb:'Lower days run long and upper days are maintenance. Run this for one mesocycle, not permanently.' }
];

function programsFor({ level, days, minutes }) {
  return PROGRAMS.filter(pr =>
    pr.levels.includes(level) &&
    pr.days.some(d => Math.abs(d - days) <= 1) &&
    (minutes || 50) >= pr.minMin
  );
}

function programById(id) { return PROGRAMS.find(p => p.id === id) || PROGRAMS[1]; }

/* How well a programme delivers on the goal at this schedule. Ranked by how
 * many major muscles are trained at least twice a week, then coverage, then
 * the weakest muscle. */
function rankPrograms(a, b) { return (b.twice - a.twice) || (b.coverage - a.coverage) || (b.lowest - a.lowest) || (b.clears - a.clears); }
function programScore(opts, EX, SUBS, SLOTS) {
  const target = weeklyTarget(opts.level, opts.goal);
  try {
    const plan = buildProgram(opts, EX, SUBS);
    const v = muscleVolume(plan, SLOTS);
    const clears = MAJOR_MUSCLES.filter(m => (v[m] || 0) >= target).length;
    const floor = MAJOR_MUSCLES.filter(m => (v[m] || 0) >= 10).length;
    const lowest = MAJOR_MUSCLES.reduce((lo, m) => Math.min(lo, v[m] || 0), 99);
    // Coverage: each muscle's sets toward the target, capped at the target
    // and square-rooted. The root encodes diminishing returns per extra set
    // (Pelland 2026), so four sets on every muscle outranks ten on the legs
    // and two on everything else.
    const coverage = MAJOR_MUSCLES.reduce((t, m) => t + Math.sqrt(Math.min(target, v[m] || 0)), 0);
    // Twice a week: ACSM 2026 recommends every major muscle at least two
    // days a week, and Pelland 2026 found strength rises with frequency. A
    // muscle counts as trained on a day once it gets a full set's credit.
    const twice = MAJOR_MUSCLES.filter(m =>
      plan.filter(d => (muscleVolume([d], SLOTS)[m] || 0) >= 1).length >= Math.min(2, plan.length)).length;
    return { clears, floor, target, coverage, twice, total: MAJOR_MUSCLES.length, lowest, volume: v, plan };
  } catch (e) {
    return { clears: 0, floor: 0, target, coverage: 0, twice: 0, total: MAJOR_MUSCLES.length, lowest: 0, volume: {}, plan: [] };
  }
}

/* What a schedule can support at all, before a programme is picked. The
 * cheapest way to put T fractional sets on all nine major muscles is T direct
 * sets on each of the six main patterns: glutes, biceps and triceps each pick
 * up two half-credits from them. So 6 x T compound sets is the floor of the
 * bill, and the minutes and days needed fall out of that. */
function weekCapacity({ days, minutes, level, goal }) {
  const target = weeklyTarget(level, goal);
  const budget = Math.max(10, (minutes || 50) - WARMUP_MIN);
  const perSet = MIN_PER_SET('squat');
  const neededMin = 6 * target * perSet;
  return { target, weeklySets: Math.floor(budget * days / perSet), needed: 6 * target,
           canCoverAll: budget * days >= neededMin,
           minutesNeeded: Math.ceil((neededMin / days + WARMUP_MIN) / 5) * 5,
           daysNeeded: Math.ceil(neededMin / budget) };
}

function equipFilter(mode) {
  if (mode === 'machine') return e => e.equip === 'machine' || e.equip === 'cable';
  if (mode === 'free')    return e => e.equip === 'db' || e.equip === 'bar' || e.equip === 'rack' || e.equip === 'bw';
  return () => true;
}

/* Build a concrete plan in two passes.
 *
 * Pass 1 is coverage: every lift the day's template calls for, in priority
 * order, at the two-set floor, until the session's minutes run out. What drops
 * first on a short session is the accessory work at the end of the list.
 *
 * Pass 2 is dose: sets go wherever the weekly shortfall against the target is
 * largest, scored by useful fractional sets per minute, until every major
 * muscle reaches the target or there is no time left. Ties go to the lift
 * with fewer sets, which spreads a muscle across more days of the week. If no
 * existing lift can take another set, a lift for the short muscle is added on
 * the day with the most time left. */
function buildProgram({ programId, days, minutes, level, goal }, EX, SUBS) {
  const pr = programById(programId);
  const ok = equipFilter(pr.equip);
  const layout = SPLITS[pr.split](days);
  const budget = Math.max(10, (minutes || 50) - WARMUP_MIN);
  const shape = sessionShape({ minutes, level, goal });
  const used = new Set();
  const pool = slot => (SUBS[slot] || []).map(id => EX.find(e => e.id === id)).filter(e => e && ok(e));
  const make = (slot, ex, primary) => {
    const iso = MIN_PER_SET(slot) < 3;
    return { slot, exId: ex.id, sets: SET_FLOOR,
             repLow: iso ? shape.isoLow : shape.repLow, repHigh: iso ? shape.isoHigh : shape.repHigh,
             load: null, misses: 0, primary };
  };

  const lay = (slots, slot, primary) => {
    const options = pool(slot);
    const ex = options.find(e => !used.has(e.id)) || options[0];
    if (!ex) return;
    used.add(ex.id);
    slots.push(make(slot, ex, primary));
  };
  const spentOf = slots => slots.reduce((t, p) => t + p.sets * MIN_PER_SET(p.slot), 0);

  // Pass 1: each main pattern the day calls for once, then the programme's
  // own emphasis, at the set floor, while minutes last.
  const built = layout.map(day => {
    const slots = [];
    const firsts = dedupe(day.slots).filter((sl, i, a) => MIN_PER_SET(sl) >= 3 && a.indexOf(sl) === i);
    firsts.concat(pr.emphasis).forEach((slot, i) => {
      if (slots.filter(p => p.slot === slot).length >= 2) return;
      if (spentOf(slots) + SET_FLOOR * MIN_PER_SET(slot) > budget) return;
      lay(slots, slot, i < 3 && MIN_PER_SET(slot) >= 3);
    });
    return { name: day.name, slots, wanted: dedupe(day.slots) };
  });

  // Pass 2: dose every major muscle up to the weekly target.
  fillToTarget(built, budget, shape.weekTarget, slot => {
    const ex = pool(slot).find(e => !used.has(e.id));
    if (!ex) return null;
    used.add(ex.id);
    return make(slot, ex, false);
  });

  // Pass 3: minutes still left over go to the rest of the day's template
  // (second helpings, arms, calves, core), at the floor.
  built.forEach(d => {
    const have = {};
    d.slots.forEach(p => { have[p.slot] = (have[p.slot] || 0) + 1; });
    d.wanted.forEach(slot => {
      const want = d.wanted.filter(x => x === slot).length;
      if ((have[slot] || 0) >= want) return;
      if (spentOf(d.slots) + SET_FLOOR * MIN_PER_SET(slot) > budget) return;
      lay(d.slots, slot, false);
      have[slot] = (have[slot] || 0) + 1;
    });
  });

  return built.map(d => ({ name: d.name, slots: d.slots, minutes: sessionMinutes(d.slots) }));
}

function sessionMinutes(slots) {
  return Math.round(WARMUP_MIN + slots.reduce((t, s) => t + (s.sets || SET_FLOOR) * MIN_PER_SET(s.slot), 0));
}

function dedupe(list) {
  const seen = {}, out = [];
  list.forEach(x => { seen[x] = (seen[x] || 0) + 1; if (seen[x] <= 2) out.push(x); });
  return out;
}

/* Which slots feed which muscle, first choice first, for adding a lift. */
const SLOTS_FOR_MUSCLE = {
  quads:['squat','unilat'], glutes:['hinge','unilat','squat'], hams:['hinge','unilat'],
  chest:['hpress'], lats:['vpull'], midback:['hpull'], sidedelt:['vpress'],
  biceps:['biceps','vpull','hpull'], triceps:['triceps','hpress','vpress'],
  calves:['calves'], abs:['core']
};

function fillToTarget(built, budgetMin, target, newLift) {
  if (!SLOTS_REF) return;
  const musclesOf = slot => ((SLOTS_REF.find(x => x.id === slot) || {}).muscles) || [];
  const spentOf = d => d.slots.reduce((t, s) => t + s.sets * MIN_PER_SET(s.slot), 0);
  for (let guard = 0; guard < 400; guard++) {
    const v = muscleVolume(built, SLOTS_REF);
    const gap = m => (MAJOR_MUSCLES.includes(m) ? Math.max(0, target - (v[m] || 0)) : 0);
    const useful = slot => musclesOf(slot).reduce((t, m, i) => t + Math.min(i === 0 ? 1 : 0.5, gap(m)), 0);

    let best = null;
    built.forEach(d => {
      const left = budgetMin - spentOf(d);
      d.slots.forEach(p => {
        if (p.sets >= SETS_CAP_PER_SLOT || left < MIN_PER_SET(p.slot)) return;
        const u = useful(p.slot);
        if (u <= 0) return;
        const score = u / MIN_PER_SET(p.slot);
        // Equal value per minute: prefer the lift feeding more muscles (a
        // compound), then the one with fewer sets so work spreads across days.
        const tie = Math.abs(score - (best ? best.score : -1)) < 1e-9;
        if (!best || score > best.score + 1e-9 ||
            (tie && (u > best.u + 1e-9 || (Math.abs(u - best.u) < 1e-9 && p.sets < best.p.sets))))
          best = { score, u, p };
      });
    });
    if (best) { best.p.sets += 1; continue; }

    if (!newLift) return;
    const short = MAJOR_MUSCLES.filter(m => gap(m) > 0).sort((a, b) => gap(b) - gap(a));
    let added = false;
    for (const m of short) {
      for (const slot of (SLOTS_FOR_MUSCLE[m] || [])) {
        const cost = SET_FLOOR * MIN_PER_SET(slot);
        const day = built
          .filter(d => budgetMin - spentOf(d) >= cost && d.slots.filter(p => p.slot === slot).length < 2)
          .sort((a, b) => spentOf(a) - spentOf(b))[0];
        if (!day) continue;
        const lift = newLift(slot);
        if (!lift) continue;
        day.slots.push(lift);
        added = true;
        break;
      }
      if (added) break;
    }
    if (!added) return;
  }
}

/* Re-dose a plan that already exists, keeping every lift, its load and its
 * history: sets go back to the floor and are refilled against the target. */
function reallocateSets(days, { minutes, level, goal }, EX, SUBS) {
  const budget = Math.max(10, (minutes || 50) - WARMUP_MIN);
  const used = new Set();
  days.forEach(d => d.slots.forEach(p => { p.sets = SET_FLOOR; used.add(p.exId); }));
  const shape = sessionShape({ minutes, level, goal });
  fillToTarget(days, budget, shape.weekTarget, EX && SUBS ? slot => {
    const ex = (SUBS[slot] || []).map(id => EX.find(e => e.id === id)).find(e => e && !used.has(e.id));
    if (!ex) return null;
    used.add(ex.id);
    const iso = MIN_PER_SET(slot) < 3;
    return { slot, exId: ex.id, sets: SET_FLOOR,
             repLow: iso ? shape.isoLow : shape.repLow, repHigh: iso ? shape.isoHigh : shape.repHigh,
             load: null, misses: 0, primary: false };
  } : null);
  days.forEach(d => { d.minutes = sessionMinutes(d.slots); });
  return days;
}

/* SLOTS is passed in from data.js at call time; keep a module-level handle so the
 * fill pass can read muscle mappings without threading it through. */
let SLOTS_REF = null;
function setSlots(SLOTS) { SLOTS_REF = SLOTS; }

/* ---------------- joint policy ----------------
   Four levels, each with a different consequence. Mild is allowed to pass once;
   the second session running with the same mild complaint is treated as a
   pattern, not a bad night's sleep. */
const JOINT_LEVELS = [
  { sev:0, label:'None' },
  { sev:1, label:'Mild' },
  { sev:2, label:'Moderate' },
  { sev:3, label:'Sharp' }
];

function jointAction(sev, joint, priorMildRun) {
  if (!sev || !joint) return { action:'none' };
  if (sev === 1) {
    if (priorMildRun >= 1) return { action:'swap', force:false,
      title:'Second session running with mild pain here',
      body:'Mild once is noise. Twice running on the same joint is a pattern. Swap to a lift that loads it less.' };
    return { action:'note',
      title:'Logged, carry on',
      body:'Mild once changes nothing. If it returns next session on the same joint, you get offered a swap.' };
  }
  if (sev === 2) return { action:'swap', force:false,
    title:'Swap this lift',
    body:'Moderate pain during a working set costs more than it buys. Same muscle, less load on the joint.' };
  return { action:'stop', force:true,
    title:'Stop training this joint today',
    body:'Sharp pain is not something to train through. This lift is out for the next three sessions and comes back for a retest after that. If it is still sharp in a week, that is a clinician’s call, not an app’s.' };
}

/* How many consecutive past sessions ended with mild pain in this joint for
   this slot. Read backwards and stop at the first session that did not. */
function mildRun(sessions, slot, joint) {
  let run = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const e = (sessions[i].entries || []).find(x => x.slot === slot);
    if (!e) continue;
    if (e.joint && e.joint.joint === joint && e.joint.sev === 1) run++;
    else break;
  }
  return run;
}

/* ---------------- units ---------------- */
const LB_PER_KG = 2.20462262;
const UNIT_STEP = { lb: 2.5, kg: 1.25 };
function toUnit(lb, unit) {
  if (lb === '' || lb === null || lb === undefined) return '';
  return unit === 'kg' ? round1(lb / LB_PER_KG) : round1(lb);
}
function fromUnit(v, unit) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!isFinite(n)) return '';
  return unit === 'kg' ? round2(n * LB_PER_KG) : n;
}
function unitStep(unit) { return UNIT_STEP[unit] || 2.5; }

/* What to put in the boxes before the lifter types anything: the load the
   engine decided on, and the rep target that goes with it. Double progression,
   so a load increase resets the target to the bottom of the range. */
function suggestSet({ target, lastEntry, level }) {
  const L = levelById(level);
  if (!target.load) return { load: '', reps: '', why: 'Finder set. No history yet.' };
  if (!lastEntry || !lastEntry.sets || !lastEntry.sets.length) {
    return { load: target.load, reps: target.repLow, why: 'Start at the bottom of the range.' };
  }
  const best = Math.max.apply(null, lastEntry.sets.map(s => Number(s.reps) || 0));
  const lastLoad = Number(lastEntry.sets[0].load) || 0;
  if (target.load > lastLoad) {
    return { load: target.load, reps: target.repLow,
             why: 'Load went up, so the rep target resets to the bottom of the range.' };
  }
  const reps = Math.min(target.repHigh, Math.max(target.repLow, best + 1));
  return { load: target.load, reps,
           why: reps > best ? 'Same load, one more rep than last time.'
                            : 'Same load, same target. ' + (L.id === 'adv'
                                ? 'At your training age this can take several sessions.'
                                : 'Chase the top of the range.') };
}

/* Fractional weekly sets per muscle. A chest press is a set for the chest and
   half a set for the triceps and front delts; a row is a set for the mid-back
   and half for the biceps. Counting whole sets per slot understates arms badly
   on any programme that leans on compounds, which is most of them. The
   half-credit convention is the one Stronger By Science and most volume
   research summaries use. */
const MUSCLE_NAME = {
  quads:'Quads', glutes:'Glutes', hams:'Hamstrings', chest:'Chest', lats:'Lats',
  midback:'Mid-back', frontdelt:'Front delts', sidedelt:'Side delts',
  reardelt:'Rear delts', biceps:'Biceps', triceps:'Triceps', brachialis:'Brachialis',
  calves:'Calves', abs:'Abs', obliques:'Obliques'
};

// The band applies to the muscles you train directly. Front and rear delts,
// brachialis, abs and calves pick up most of their work as half credit from
// compounds, so holding them to the same number would fail every sane
// programme. They are shown, they just do not cast a vote.
const MAJOR_MUSCLES = ['quads','glutes','hams','chest','lats','midback','sidedelt','biceps','triceps'];

function muscleVolume(days, SLOTS, setsOf) {
  const out = {};
  const get = setsOf || (p => p.sets || 1);
  days.forEach(day => (day.slots || []).forEach(p => {
    const sl = SLOTS.find(x => x.id === p.slot);
    if (!sl || !sl.muscles) return;
    const n = get(p);
    sl.muscles.forEach((m, i) => { out[m] = (out[m] || 0) + n * (i === 0 ? 1 : 0.5); });
  }));
  Object.keys(out).forEach(k => { out[k] = Math.round(out[k] * 2) / 2; });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { rankPrograms, LAYOFFS, layoffById, weeklyTarget, reallocateSets, fillToTarget, sessionMinutes, SET_FLOOR, programScore, weekCapacity, setSlots, muscleVolume, MUSCLE_NAME, MAJOR_MUSCLES,
                     BLOCK_LENGTHS, blockRir, isDeload, blockSets, LEVELS, levelById, loadStep, sessionShape, PROGRAMS, programsFor,
                     programById, buildProgram, jointAction, mildRun, JOINT_LEVELS,
                     toUnit, fromUnit, unitStep, suggestSet, SPLITS,
                     nextLoad, volumeDecision, substitute, deloadCheck, navyBodyFat,
                     proteinTarget, waterTargetOz, weightTrend, lossFlag, roundTo,
                     generatePlan, weeklyVolume, TEMPLATES, ISO_SLOTS,
                     RIR_BY_WEEK, DELOAD_WEEK, SETS_CAP_PER_SLOT };
}
