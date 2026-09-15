/* Run: node engine.test.js   — no framework, exits non-zero on failure. */
const E = require('./engine.js');
const D = require('./data.js');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (ok ? '' : `\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`));
};
const ok = (label, cond) => { cond ? pass++ : fail++; console.log((cond ? '  ok   ' : '  FAIL ') + label); };

console.log('\nLOAD PROGRESSION');
const machchest = D.byId('machchest');           // inc 10
const tgt = { repLow: 8, repHigh: 12, rir: 3, load: 100 };
eq('all sets at top of range at target RIR -> load up one increment',
   E.nextLoad([{reps:12,rir:3},{reps:12,rir:2}], tgt, machchest, 0).load, 110);
eq('mid-range -> hold load, chase a rep',
   E.nextLoad([{reps:10,rir:3},{reps:9,rir:3}], tgt, machchest, 0).load, 100);
eq('top reps but left 4 in the tank -> not a real top set, hold',
   E.nextLoad([{reps:12,rir:4},{reps:12,rir:4}], tgt, machchest, 0).load, 100);
eq('bad miss once -> hold and count it',
   E.nextLoad([{reps:6,rir:0}], tgt, machchest, 0).misses, 1);
eq('bad miss twice -> back off 10% rounded to the increment',
   E.nextLoad([{reps:6,rir:0}], tgt, machchest, 1).load, 90);
eq('no sets logged -> nothing changes',
   E.nextLoad([], tgt, machchest, 0).load, 100);

console.log('\nVOLUME (must never reward success with more sets)');
const prog = [{loadProgressed:true},{loadProgressed:true}];
const stall = [{loadProgressed:false},{loadProgressed:false}];
eq('load still progressing -> no added volume',
   E.volumeDecision(prog, {readiness:1,jointMax:0}, 'gain', 2).delta, 0);
eq('stalled twice + well recovered -> add one set',
   E.volumeDecision(stall, {readiness:2,jointMax:0}, 'gain', 2).delta, 1);
eq('stalled twice but marginal recovery -> hold',
   E.volumeDecision(stall, {readiness:3,jointMax:0}, 'gain', 2).delta, 0);
eq('cut mode never adds volume even when stalled and fresh',
   E.volumeDecision(stall, {readiness:1,jointMax:0}, 'cut', 2).delta, 0);
eq('arrived too sore to train -> cut a set regardless of mode',
   E.volumeDecision(prog, {readiness:4,jointMax:0}, 'gain', 2).delta, -1);
eq('joint flag freezes volume',
   E.volumeDecision(stall, {readiness:1,jointMax:2}, 'gain', 2).delta, 0);
eq('at the cap -> hold',
   E.volumeDecision(stall, {readiness:1,jointMax:0}, 'gain', 4).delta, 0);

console.log('\nJOINT SUBSTITUTION');
const s1 = E.substitute('dbbench', 'shoulder', [], D.EX, D.SUBS);
ok('shoulder pain on DB bench -> a lower-shoulder-cost press in the same slot',
   s1 && s1.slot === 'hpress' && s1.joints.shoulder < D.byId('dbbench').joints.shoulder);
const s2 = E.substitute('rdl', 'lowback', [], D.EX, D.SUBS);
ok('low back pain on RDL -> a hinge-slot option that unloads the spine',
   s2 && s2.slot === 'hinge' && s2.joints.lowback < D.byId('rdl').joints.lowback);
const s3 = E.substitute('dbbench', 'shoulder', ['machchest','dbbenchneut','inclinemach'], D.EX, D.SUBS);
ok('quarantined options are skipped, not re-offered',
   s3 && !['machchest','dbbenchneut','inclinemach'].includes(s3.id));
const s4 = E.substitute('sbsquat', 'lowback', [], D.EX, D.SUBS);
ok('low back pain on safety-bar squat -> belt squat or leg press, zero/low spinal load',
   s4 && ['beltsq','legpress'].includes(s4.id));

console.log('\nDELOAD');
eq('week 5 is a scheduled deload', E.deloadCheck(5, {}).deload, true);
eq('week 3 with one signal is not a deload',
   E.deloadCheck(3, {perfDownLifts:3, shortSleepNights:0, jointFlags:0, soreSlots:0}).deload, false);
eq('week 3 with two signals triggers an early deload',
   E.deloadCheck(3, {perfDownLifts:3, shortSleepNights:3, jointFlags:0, soreSlots:0}).deload, true);

console.log('\nBODY COMP / NUTRITION');
const bf = E.navyBodyFat({sex:'male', heightIn:70, neckIn:16, waistIn:40});
ok('Navy method returns a plausible range for 5\'10" 40" waist 16" neck',
   bf && bf.point > 20 && bf.point < 32 && bf.low < bf.point && bf.high > bf.point);
eq('impossible measurements return null rather than a fake number',
   E.navyBodyFat({sex:'male', heightIn:70, neckIn:41, waistIn:40}), null);
const p = E.proteinTarget({weightLb:214.6, age:44, sex:'male', goal:'cut', appetiteSuppressed:true});
ok('protein target lands near the evidence plateau, not a made-up 1g/lb',
   p.target >= 160 && p.target <= 180);
ok('suppressed appetite gives a reachable floor below the target',
   p.floor >= 120 && p.floor < p.target);
eq('water target for 214.6 lb on a training day', E.waterTargetOz(214.6, true), 123);

console.log('\nWEIGHT TREND');
const wt = E.weightTrend([
  {date:'2026-08-30', lb:219.0},{date:'2026-08-31', lb:215.5},
  {date:'2026-09-03', lb:216.2},{date:'2026-09-07', lb:214.6},
  {date:'2026-09-11', lb:213.4},{date:'2026-09-14', lb:212.9}]);
ok('trend smooths daily noise into a moving average', wt.series.length === 6 && wt.series[5].avg !== wt.series[5].lb);
ok('reports a weekly rate of change', wt.lbPerWeek !== null && wt.lbPerWeek < 0);
ok('six weigh-ins over two weeks is enough to trust the rate', wt.reliable === true);
const sparse = E.weightTrend([{date:'2026-08-30',lb:219},{date:'2026-08-31',lb:215.5},{date:'2026-09-07',lb:214.6}]);
ok('three weigh-ins over eight days is NOT enough, no rate flag shown', sparse.reliable === false);
ok('a 2%/wk drop is flagged as costing lean mass', E.lossFlag(2.0, -4).level === 'fast');
ok('a 0.6%/wk drop reads as healthy', E.lossFlag(0.6, -1.3).level === 'good');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
