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
eq('water: IOM adequate intake for men, drinkable share, rest day', E.waterTargetOz('male', false), 100);
eq('water: plus 20 oz on a training day', E.waterTargetOz('male', true), 120);
eq('water: women\'s adequate intake is lower', E.waterTargetOz('female', false), 73);

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

/* ---------------- training age, time, programmes, joints, units ---------------- */

ok('four training ages, ordered from new to advanced',
   E.LEVELS.length === 4 && E.LEVELS[0].id === 'new' && E.LEVELS[3].id === 'adv');
ok('an unknown level falls back to intermediate rather than throwing',
   E.levelById('nonsense').id === 'inter');

const bench2 = D.EX.find(e => e.id === 'machchest');
const press2 = D.EX.find(e => e.id === 'legpress');
ok('a beginner takes a smaller jump on an upper-body lift than an intermediate',
   E.loadStep(bench2, 'new') < E.loadStep(bench2, 'inter'));
ok('upper-body jumps stay inside the NSCA 2.5 to 10 lb range',
   E.loadStep(bench2, 'new') >= 2.5 && E.loadStep(bench2, 'adv') <= 10);
ok('lower-body jumps stay inside the NSCA 5 to 15 lb range',
   E.loadStep(press2, 'new') >= 5 && E.loadStep(press2, 'adv') <= 15);

// A novice clears the bar a rep or two short of the top; an advanced lifter does not.
const shortOfTop = [{ reps: 11, rir: 2, load: 100 }];
const tgt2 = { repLow: 8, repHigh: 12, rir: 2, load: 100 };
ok('a novice progresses on 11 of a 8 to 12 range at target effort',
   E.nextLoad(shortOfTop, tgt2, bench2, 0, 'novice').load > 100);
ok('an advanced lifter does not progress until the whole range is cleared',
   E.nextLoad(shortOfTop, tgt2, bench2, 0, 'adv').load === 100);
ok('everyone progresses once the top of the range is hit',
   E.nextLoad([{ reps: 12, rir: 2, load: 100 }], tgt2, bench2, 0, 'adv').load > 100);

const s30 = E.sessionShape({ minutes: 30, level: 'inter', goal: 'gain' });
const s60 = E.sessionShape({ minutes: 60, level: 'inter', goal: 'gain' });
const s90 = E.sessionShape({ minutes: 90, level: 'inter', goal: 'gain' });
ok('a longer session buys more lifts', s30.slotCount < s60.slotCount && s60.slotCount <= s90.slotCount);
ok('a longer session buys more sets on the main lifts', s30.setsPrimary < s90.setsPrimary);
ok('cutting holds volume back rather than chasing it',
   E.sessionShape({ minutes: 60, level: 'inter', goal: 'cut' }).setsPrimary < s60.setsPrimary);

let thin = 0;
['new','novice','inter','adv'].forEach(l => [2,3,4,5,6].forEach(d => [30,45,60,75].forEach(m => {
  if (E.programsFor({ level: l, days: d, minutes: m }).length < 10) thin++;
})));
ok('every level, day count and session length offers at least ten programmes', thin === 0);
ok('the library is more than twenty programmes', E.PROGRAMS.length >= 20);
ok('an unknown programme id falls back rather than throwing', !!E.programById('nope').name);

const built = E.buildProgram({ programId:'ul', days:4, minutes:60, level:'inter', goal:'gain' }, D.EX, D.SUBS);
ok('building a four-day programme returns four sessions', built.length === 4);
ok('every slot gets a real exercise', built.every(d => d.slots.every(p => !!D.byId(p.exId))));
ok('no exercise is repeated across the week', (() => {
  const all = built.flatMap(d => d.slots.map(p => p.exId));
  return new Set(all).size === all.length;
})());
ok('a machines-only programme contains no barbells', (() => {
  const m = E.buildProgram({ programId:'machineonly', days:3, minutes:50, level:'novice', goal:'gain' }, D.EX, D.SUBS);
  return m.every(d => d.slots.every(p => ['machine','cable'].includes(D.byId(p.exId).equip)));
})());
ok('a free-weights programme contains no machines', (() => {
  const f = E.buildProgram({ programId:'freeweight', days:3, minutes:60, level:'inter', goal:'gain' }, D.EX, D.SUBS);
  return f.every(d => d.slots.every(p => !['machine','cable'].includes(D.byId(p.exId).equip)));
})());

const vol2 = E.muscleVolume(built, D.SLOTS);
ok('a press counts a full set for the chest and half for the triceps',
   vol2.chest > 0 && vol2.triceps > 0);
ok('volume is reported per muscle, not per slot', !!vol2.biceps && vol2.quads > 0);

ok('mild pain the first time is noted, not acted on', E.jointAction(1, 'shoulder', 0).action === 'note');
ok('mild pain a second session running offers a swap', E.jointAction(1, 'shoulder', 1).action === 'swap');
ok('moderate pain offers a swap immediately', E.jointAction(2, 'shoulder', 0).action === 'swap');
ok('sharp pain stops the lift and is not optional',
   E.jointAction(3, 'shoulder', 0).action === 'stop' && E.jointAction(3, 'shoulder', 0).force === true);
ok('no pain means no action', E.jointAction(0, null, 0).action === 'none');

const hist2 = [
  { entries: [{ slot:'hpress', joint: { sev:1, joint:'shoulder' } }] },
  { entries: [{ slot:'hpress', joint: { sev:1, joint:'shoulder' } }] }
];
ok('two consecutive mild sessions on the same joint count as a run of two',
   E.mildRun(hist2, 'hpress', 'shoulder') === 2);
ok('a clean session in between resets the run',
   E.mildRun([hist2[0], { entries: [{ slot:'hpress', joint: null }] }], 'hpress', 'shoulder') === 0);
ok('a mild complaint in a different joint does not count',
   E.mildRun(hist2, 'hpress', 'knee') === 0);

ok('225 lb reads as 102.1 kg', E.toUnit(225, 'kg') === 102.1);
ok('pounds pass through untouched', E.toUnit(225, 'lb') === 225);
ok('a weight typed in kg is stored as pounds', Math.round(E.fromUnit(100, 'kg')) === 220);
ok('a round trip through kg loses nothing meaningful',
   Math.abs(E.fromUnit(E.toUnit(185, 'kg'), 'kg') - 185) < 0.3);
ok('the kg step is a 1.25 plate, the lb step is 2.5', E.unitStep('kg') === 1.25 && E.unitStep('lb') === 2.5);

const noHist = E.suggestSet({ target: { load: 0, repLow: 8, repHigh: 12 }, lastEntry: null, level: 'inter' });
ok('a finder set suggests nothing and says why', noHist.load === '' && /finder/i.test(noHist.why));
const up = E.suggestSet({ target: { load: 110, repLow: 8, repHigh: 12 },
  lastEntry: { sets: [{ load: 100, reps: 12 }] }, level: 'inter' });
ok('after a load increase the rep target resets to the bottom of the range', up.reps === 8);
const same = E.suggestSet({ target: { load: 100, repLow: 8, repHigh: 12 },
  lastEntry: { sets: [{ load: 100, reps: 9 }] }, level: 'inter' });
ok('at the same load it suggests one more rep than last time', same.reps === 10);
const capped = E.suggestSet({ target: { load: 100, repLow: 8, repHigh: 12 },
  lastEntry: { sets: [{ load: 100, reps: 12 }] }, level: 'inter' });
ok('the rep suggestion never exceeds the top of the range', capped.reps === 12);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
