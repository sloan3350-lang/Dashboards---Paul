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
function nextLoad(sets, target, ex, priorMisses, levelId) {
  const working = sets.filter(s => s.reps > 0);
  if (!working.length) return { load: target.load, misses: priorMisses, note: 'no sets logged' };

  const L = levelById(levelId);
  const step = loadStep(ex, levelId);
  // Training age does not change the size of the jump much, it changes how hard
  // the jump is to earn. A novice can move almost every session, so the bar is
  // the top of the range minus a rep or two. An advanced lifter has to clear the
  // whole range at target effort, which is why their load moves monthly.
  const bar = Math.max(target.repLow, target.repHigh - L.earnTop);
  const earned = working.every(s => s.reps >= bar && s.rir <= target.rir);
  const badMiss = working.some(s => s.reps < target.repLow - 1);

  if (earned) {
    return { load: target.load + step, misses: 0,
             note: 'hit the target at target effort, load up ' + step + ' lb' };
  }
  if (badMiss) {
    const misses = priorMisses + 1;
    if (misses >= 2) {
      return { load: Math.max(step, roundTo(target.load * 0.9, step)), misses: 0,
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
   Added after day one. Sources for the numbers, so they can be argued with:

   Weekly sets per muscle. Schoenfeld 2017 meta-analysis found 10+ sets a week
   beats fewer. The 2022 systematic review in the Journal of Human Kinetics put
   the practical band at 12 to 20 for trained men. Stronger By Science's reading
   of the Pelland meta-regression is that growth keeps climbing past 20 with
   sharply diminishing returns, and that ~10 is a good floor if you do not want
   to live in the gym. Beginners sit at the bottom of the band.

   Load increments. NSCA guidance as summarised in public training material:
   smaller or less trained lifters add 2.5 to 5 lb upper body and 5 to 10 lb
   lower body; larger or more experienced lifters add 5 to 10 upper and 10 to 15
   lower.

   Progression frequency. Novices can add load or reps almost every session.
   Intermediates progress every one to three weeks. Advanced lifters every three
   to eight weeks. So the engine does not change the size of the jump much by
   level, it changes how hard the jump is to earn.

   Reps and load. 8 to 12 reps at 60 to 80% of 1RM is the band that shows up
   repeatedly for hypertrophy. Isolation work tolerates 10 to 20.
   ============================================================ */

const LEVELS = [
  { id:'new',   name:'New to lifting',  sub:'Under 6 months, or coming back after years off',
    weekLow:8,  weekHigh:12, incScale:0.5, earnTop:2, deloadEvery:5, startRir:4 },
  { id:'novice',name:'Novice',          sub:'6 months to a year of consistent training',
    weekLow:10, weekHigh:15, incScale:0.75, earnTop:1, deloadEvery:5, startRir:3 },
  { id:'inter', name:'Intermediate',    sub:'One to four years, lifts move month to month',
    weekLow:12, weekHigh:18, incScale:1, earnTop:0, deloadEvery:5, startRir:3 },
  { id:'adv',   name:'Advanced',        sub:'Four years or more, progress is slow and earned',
    weekLow:16, weekHigh:22, incScale:1, earnTop:0, deloadEvery:4, startRir:2 }
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

/* How much work fits in the time you actually have. A compound working set
   costs about 3.5 minutes with its rest, an isolation set about 2.2. Warm-up is
   a fixed charge. This is what makes the minutes field change sets and reps
   rather than only the number of exercises. */
const MIN_PER_SET = slot => (ISO_SLOTS.concat(['biceps','triceps']).includes(slot) ? 2.2 : 3.5);

function sessionShape({ minutes, level, goal }) {
  const L = levelById(level);
  const budget = Math.max(10, (minutes || 50) - WARMUP_MIN);
  const setBudget = Math.floor(budget / 3.0);          // mixed compound/isolation average
  // Short sessions keep volume by stacking sets on fewer lifts; long sessions
  // spend it on more lifts. Both land inside the weekly band once multiplied by
  // training days.
  let slotCount, setsPrimary, setsOther;
  if (setBudget <= 8)       { slotCount = 4; setsPrimary = 2; setsOther = 1; }
  else if (setBudget <= 12) { slotCount = 5; setsPrimary = 2; setsOther = 2; }
  else if (setBudget <= 17) { slotCount = 7; setsPrimary = 3; setsOther = 2; }
  else if (setBudget <= 22) { slotCount = 9; setsPrimary = 3; setsOther = 2; }
  else                      { slotCount = 9; setsPrimary = 4; setsOther = 3; }
  if (L.id === 'new') { setsPrimary = Math.min(setsPrimary, 2); setsOther = Math.min(setsOther, 2); }
  // Cutting is not the time to chase peak volume; maintain it and keep the load.
  if (goal === 'cut') setsPrimary = Math.max(2, setsPrimary - 1);
  return { slotCount, setsPrimary, setsOther, setBudget,
           repLow: 8, repHigh: 12, isoLow: 10, isoHigh: 15,
           rir: L.startRir, weekLow: L.weekLow, weekHigh: L.weekHigh };
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

function equipFilter(mode) {
  if (mode === 'machine') return e => e.equip === 'machine' || e.equip === 'cable';
  if (mode === 'free')    return e => e.equip === 'db' || e.equip === 'bar' || e.equip === 'rack' || e.equip === 'bw';
  return () => true;
}

/* Build a concrete plan: the programme's split laid out over the chosen days,
   trimmed to the time available, with sets that follow the time budget. */
function buildProgram({ programId, days, minutes, level, goal }, EX, SUBS) {
  const pr = programById(programId);
  const shape = sessionShape({ minutes, level, goal });
  const ok = equipFilter(pr.equip);
  const layout = SPLITS[pr.split](days);
  const used = new Set();
  return layout.map(day => {
    const wanted = day.slots.concat(pr.emphasis).slice(0, shape.slotCount);
    const slots = [];
    wanted.forEach((slot, i) => {
      const pool = (SUBS[slot] || []).map(id => EX.find(e => e.id === id))
        .filter(e => e && ok(e));
      const ex = pool.find(e => !used.has(e.id)) || pool[0];
      if (!ex) return;
      used.add(ex.id);
      const iso = MIN_PER_SET(slot) < 3;
      const primary = i < 3 && !iso;
      slots.push({ slot, exId: ex.id,
                   sets: primary ? shape.setsPrimary : shape.setsOther,
                   repLow:  iso ? shape.isoLow  : shape.repLow,
                   repHigh: iso ? shape.isoHigh : shape.repHigh,
                   load: null, misses: 0, primary });
    });
    const mins = Math.round(WARMUP_MIN +
      slots.reduce((t, s) => t + s.sets * MIN_PER_SET(s.slot), 0));
    return { name: day.name, slots, minutes: mins };
  });
}

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
      body:'Mild once is noise. Twice in a row on the same joint is a pattern, and it gets worse from here if nothing changes. Swapping to a lift that loads this joint less is the cheap fix now.' };
    return { action:'note',
      title:'Logged, carry on',
      body:'Mild once is not a reason to change anything. If it shows up again next session on the same joint, the app will offer a swap.' };
  }
  if (sev === 2) return { action:'swap', force:false,
    title:'Swap this lift',
    body:'Moderate joint pain during a working set is the point where continuing costs more than it buys. Same muscle, less load on the joint.' };
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
  module.exports = { muscleVolume, MUSCLE_NAME, MAJOR_MUSCLES, LEVELS, levelById, loadStep, sessionShape, PROGRAMS, programsFor,
                     programById, buildProgram, jointAction, mildRun, JOINT_LEVELS,
                     toUnit, fromUnit, unitStep, suggestSet, SPLITS,
                     nextLoad, volumeDecision, substitute, deloadCheck, navyBodyFat,
                     proteinTarget, waterTargetOz, weightTrend, lossFlag, roundTo,
                     generatePlan, weeklyVolume, TEMPLATES, ISO_SLOTS,
                     RIR_BY_WEEK, DELOAD_WEEK, SETS_CAP_PER_SLOT };
}
