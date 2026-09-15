/* KANON app shell. State in localStorage, exported as JSON from Settings. */
'use strict';
const K = 'kanon.v1';
const today = () => new Date().toISOString().slice(0, 10);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

/* ---------------- seed: Paul's locked Tue/Sat program ---------------- */
function seed() {
  const mk = (slot, exId) => ({ slot, exId, sets: 1, repLow: 8, repHigh: 12, load: null, misses: 0 });
  return {
    profile: { sex:'male', age:44, heightIn:70, goal:'cut', appetiteSuppressed:true,
               startWeight:219, targetWeight:207, trainDays:'Tue / Sat' },
    week: 1,
    next: 'A',
    plan: {
      A: [mk('squat','legpress'), mk('hpress','machchest'), mk('vpull','latpulln'),
          mk('hinge','rdl'),      mk('hpull','csrow'),      mk('vpress','machshld')],
      B: [mk('squat','hacksquat'),mk('hpress','inclinemach'),mk('vpull','assistpull'),
          mk('hinge','legcurl'),  mk('hpull','cablerow'),   mk('vpress','latraise')]
    },
    sessions: [], quarantine: {},
    daily: {
      '2026-08-30': { water:0, sleep:'', protein:'', weight:219.0 },
      '2026-08-31': { water:0, sleep:7,  protein:'', weight:215.5 },
      '2026-09-07': { water:0, sleep:'', protein:'', weight:214.6 }
    },
    measure: [],
    draft: null
  };
}
let S = load();
function load() {
  try { const r = localStorage.getItem(K); if (r) return Object.assign(seed(), JSON.parse(r)); }
  catch (e) { console.warn('state unreadable, starting fresh', e); }
  return seed();
}
function save() { try { localStorage.setItem(K, JSON.stringify(S)); } catch (e) { alert('Could not save locally. Export your data from Settings.'); } }

/* ---------------- week rules (the ramp already locked in your program) ---------------- */
function setsForWeek(week, idx) {
  if (week <= 1) return 1;
  if (week === 2) return idx < 3 ? 2 : 1;
  if (week === 5) return 1;                       // deload
  return 2;
}
const rirForWeek = w => E_RIR[w] || 2;
const E_RIR = { 1:4, 2:3, 3:2, 4:2, 5:5 };

function deloadSignals() {
  const recent = S.sessions.slice(-2);
  const shortSleep = Object.values(S.daily).slice(-3).filter(d => d.sleep && d.sleep < 6).length;
  let jointFlags = 0, soreSlots = 0, perfDown = 0;
  recent.forEach(s => s.entries.forEach(e => {
    if (e.joint && e.joint.sev >= 2) jointFlags++;
    if (e.readiness >= 3) soreSlots++;
    if (e.perfDown) perfDown++;
  }));
  return { perfDownLifts: perfDown, shortSleepNights: shortSleep, jointFlags, soreSlots,
           selfReportWrecked: false };
}

/* ---------------- views ---------------- */
const views = {};
let current = 'train';
function render() {
  ['train','daily','body','progress','settings'].forEach(v => {
    const node = $('#v-' + v);
    node.hidden = v !== current;
    node.innerHTML = '';
    if (v === current) views[v](node);
  });
  $('#weekBadge').textContent = 'Week ' + S.week + (S.week === 5 ? ' · deload' : '');
  document.querySelectorAll('.tab').forEach(t =>
    t.setAttribute('aria-selected', String(t.dataset.view === current)));
}
document.querySelectorAll('.tab').forEach(t =>
  t.addEventListener('click', () => { current = t.dataset.view; window.scrollTo(0,0); render(); }));

/* =================== TRAIN =================== */
views.train = root => {
  const letter = S.next;
  const plan = S.plan[letter];
  const dl = deloadCheckLocal();

  const head = el('div','card');
  head.append(Object.assign(el('h2'), { textContent: 'Session ' + letter + ' · ' + (S.week === 5 ? 'Deload' : 'Week ' + S.week) }));
  head.append(Object.assign(el('p','hint'), { textContent: weekBlurb() }));
  if (dl.deload && S.week !== 5) {
    const a = el('div','alert warn');
    a.innerHTML = '<b>Early deload recommended</b>' + esc(dl.reason) + '. Cut the sets in half and back off the effort this session.';
    head.append(a);
  }
  root.append(head);

  if (!S.draft || S.draft.letter !== letter) S.draft = { letter, date: today(), week: S.week, entries: {} };

  plan.forEach((p, idx) => root.append(exerciseCard(p, idx, letter)));

  const fin = el('button','btn primary block','Finish session');
  fin.style.marginTop = '4px';
  fin.onclick = finishSession;
  root.append(fin);

  const note = el('p','tiny');
  note.style.cssText = 'text-align:center;margin-top:10px';
  note.textContent = 'Nothing is sent anywhere. Everything stays on this device until you export it.';
  root.append(note);
};

function weekBlurb() {
  const rir = rirForWeek(S.week);
  if (S.week === 5) return 'Deload. One set a slot, five reps left in the tank, clean technique. You are not chasing anything this week.';
  if (S.week === 1) return 'Six slots, one working set each, eight to twelve reps, ' + rir + ' left in the tank. Nothing near failure.';
  if (S.week === 2) return 'Two sets on the first three slots, one on the rest. ' + rir + ' reps left in the tank.';
  return 'Two sets a slot, ' + rir + ' reps left in the tank. The engine adds a third only if a lift stalls.';
}

function deloadCheckLocal() {
  return deloadCheck(S.week, deloadSignals());
}

function exerciseCard(p, idx, letter) {
  const ex = byId(p.exId);
  const nSets = Math.max(p.sets, setsForWeek(S.week, idx));
  const rir = rirForWeek(S.week);
  const d = S.draft.entries[p.slot] || (S.draft.entries[p.slot] = { exId: p.exId, slot: p.slot, sets: [], pump: 0, readiness: 0, joint: null });

  const card = el('div','ex');
  const h = el('div','ex-h');
  const names = el('div');
  names.append(el('div','ex-slot', SLOTS.find(s => s.id === p.slot).name));
  names.append(el('div','ex-name', ex.name));
  h.append(names);
  h.append(el('div','spacer'));
  const vid = el('a','btn sm ghost','Form');
  vid.href = ex.video; vid.target = '_blank'; vid.rel = 'noopener';
  vid.style.textDecoration = 'none';
  h.append(vid);
  const swap = el('button','btn sm ghost','Swap');
  swap.onclick = () => openSwap(p, letter);
  h.append(swap);
  card.append(h);

  const b = el('div','ex-b');
  const t = el('div','target');
  t.innerHTML = p.load
    ? `Target <b>${p.load} lb</b> &middot; ${p.repLow}–${p.repHigh} reps &middot; leave <b>${rir}</b> in the tank &middot; ${nSets} set${nSets>1?'s':''}`
    : `<b>Finder set.</b> Pick a weight you could get about ${p.repHigh + 3} reps with, stop at ${p.repHigh}. Log what you used and the engine takes it from here.`;
  b.append(t);
  b.append(el('div','cue', ex.cue));

  const hdr = el('div','setrow');
  hdr.append(el('div','n',''), el('div','lbl','Weight'), el('div','lbl','Reps'), el('div','lbl','Left in tank'), el('div',null,''));
  b.append(hdr);

  for (let i = 0; i < nSets; i++) {
    if (!d.sets[i]) d.sets[i] = { load: p.load || '', reps: '', rir: '' };
    const r = el('div','setrow');
    r.append(el('div','n', String(i + 1)));
    ['load','reps','rir'].forEach(f => {
      const inp = el('input'); inp.type = 'number'; inp.inputMode = 'decimal';
      inp.value = d.sets[i][f]; inp.min = '0';
      inp.placeholder = f === 'load' ? 'lb' : f === 'reps' ? '#' : 'RIR';
      inp.oninput = () => { d.sets[i][f] = inp.value === '' ? '' : Number(inp.value); save(); };
      r.append(inp);
    });
    r.append(el('div',null,''));
    b.append(r);
  }

  /* --- feedback, worded the way you asked --- */
  const fb = el('div','fb');

  fb.append(el('div','q','How much did the muscle actually do?'));
  fb.append(optGroup([
    [1,'Barely felt it, the joints or something else took over'],
    [2,'Felt it working, had more in me'],
    [3,'Full and working hard by the last rep'],
    [4,'Cramped or gave out before the reps did']
  ], d.pump, v => { d.pump = v; save(); }));

  fb.append(el('div','q','How recovered were you coming in?'));
  fb.append(Object.assign(el('div','qs'), { textContent: 'About leftover soreness from last time, not how this set felt.' }));
  fb.append(optGroup([
    [1,'Fresh, nothing left over'],
    [2,'Slightly tender, did not limit anything'],
    [3,'Still sore, it limited this set'],
    [4,'Too sore, this should not have been trained today']
  ], d.readiness, v => { d.readiness = v; save(); }));

  fb.append(el('div','q','Any joint pain?'));
  fb.append(Object.assign(el('div','qs'), { textContent: 'Muscle burn is fine. Joints are not. Two means we swap it now, not later.' }));
  const jsev = optGroup([
    [0,'None'],
    [1,'Mild familiar ache, movement stayed clean'],
    [2,'Sharp, pinching or wrong. Swap it.']
  ], d.joint ? d.joint.sev : 0, v => {
    d.joint = v === 0 ? null : { sev: v, joint: (d.joint && d.joint.joint) || 'shoulder' };
    save(); render();
  }, true);
  fb.append(jsev);

  if (d.joint) {
    fb.append(Object.assign(el('div','qs'), { textContent: 'Which joint?' }));
    const grid = el('div','jointgrid');
    JOINTS.forEach(j => {
      const o = el('button','opt'); o.type = 'button';
      o.textContent = j === 'lowback' ? 'low back' : j;
      o.setAttribute('aria-pressed', String(d.joint.joint === j));
      o.onclick = () => { d.joint.joint = j; save(); render(); };
      grid.append(o);
    });
    fb.append(grid);
    if (d.joint.sev >= 2) {
      const sub = substitute(p.exId, d.joint.joint, Object.keys(S.quarantine), EX, SUBS);
      const a = el('div','alert bad');
      a.innerHTML = sub
        ? `<b>Swapping this lift</b>${esc(ex.name)} is out for the next 3 sessions. Same slot, less ${esc(d.joint.joint === 'lowback' ? 'low back' : d.joint.joint)}: <b>${esc(sub.name)}</b>. Finish the session and it will be waiting next time.`
        : `<b>Nothing left to swap to in this slot</b>Drop this slot for now. If it still hurts in a week, get it looked at.`;
      fb.append(a);
    }
  }

  b.append(fb);
  card.append(b);
  return card;
}

function optGroup(opts, val, onPick, danger) {
  const g = el('div','opts');
  opts.forEach(([v, label]) => {
    const o = el('button', 'opt' + (danger && v >= 2 ? ' danger' : ''));
    o.type = 'button';
    o.setAttribute('aria-pressed', String(val === v));
    o.append(el('span','dot'));
    o.append(el('span', null, label));
    o.onclick = () => { onPick(v); if (!danger) { g.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-pressed','false')); o.setAttribute('aria-pressed','true'); } };
    g.append(o);
  });
  return g;
}

function openSwap(p, letter) {
  const order = SUBS[p.slot] || [];
  const names = order.map((id, i) => `${i + 1}. ${byId(id).name}`).join('\n');
  const pick = prompt(`Swap ${byId(p.exId).name}\n\n${names}\n\nEnter a number:`);
  const i = Number(pick) - 1;
  if (order[i]) {
    p.exId = order[i]; p.load = null; p.misses = 0;
    if (S.draft && S.draft.entries[p.slot]) delete S.draft.entries[p.slot];
    save(); render();
  }
}

function finishSession() {
  const letter = S.draft.letter;
  const plan = S.plan[letter];
  const entries = [], changes = [];

  plan.forEach((p, idx) => {
    const d = S.draft.entries[p.slot];
    if (!d) return;
    const sets = d.sets.filter(s => s.reps !== '' && s.reps > 0)
                       .map(s => ({ reps: Number(s.reps), rir: Number(s.rir || 0), load: Number(s.load || 0) }));
    if (!sets.length && !d.joint) return;
    const ex = byId(p.exId);
    const usedLoad = sets.length ? sets[0].load : (p.load || 0);
    const target = { repLow: p.repLow, repHigh: p.repHigh, rir: rirForWeek(S.week), load: p.load || usedLoad };

    // joint first: it overrides everything
    if (d.joint && d.joint.sev >= 2) {
      const sub = substitute(p.exId, d.joint.joint, Object.keys(S.quarantine), EX, SUBS);
      S.quarantine[p.exId] = 3;
      if (sub) {
        changes.push(`${ex.name} is out for 3 sessions. ${sub.name} takes the ${SLOTS.find(s=>s.id===p.slot).name.toLowerCase()} slot.`);
        p.exId = sub.id; p.load = null; p.misses = 0;
      } else {
        changes.push(`${ex.name} pulled. No substitute left in that slot, so it is dropped for now.`);
      }
    } else if (sets.length) {
      const r = nextLoad(sets, target, ex, p.misses || 0);
      const progressed = r.load > (p.load || 0);
      p.load = r.load; p.misses = r.misses;
      const vd = volumeDecision(
        slotHistory(p.slot), { readiness: d.readiness || 1, jointMax: d.joint ? d.joint.sev : 0 },
        S.profile.goal, p.sets);
      if (vd.delta) { p.sets = Math.max(1, p.sets + vd.delta); changes.push(`${ex.name}: ${vd.note}.`); }
      changes.push(`${ex.name}: ${r.note}.`);
      entries.push({ exId: ex.id, slot: p.slot, sets, pump: d.pump, readiness: d.readiness,
                     joint: d.joint, loadProgressed: progressed,
                     perfDown: sets.some(s => s.reps < p.repLow - 1) });
      return;
    }
    entries.push({ exId: ex.id, slot: p.slot, sets, pump: d.pump, readiness: d.readiness,
                   joint: d.joint, loadProgressed: false, perfDown: false });
  });

  if (!entries.length) { alert('Nothing logged yet.'); return; }

  S.sessions.push({ date: today(), letter, week: S.week, entries });
  Object.keys(S.quarantine).forEach(id => { if (--S.quarantine[id] <= 0) delete S.quarantine[id]; });
  S.next = letter === 'A' ? 'B' : 'A';
  if (letter === 'B') S.week = S.week >= 5 ? 1 : S.week + 1;
  S.draft = null;
  save();

  alert('Session logged.\n\nNext time:\n' + (changes.length ? changes.map(c => '• ' + c).join('\n') : 'No changes.'));
  current = 'train'; render();
}

function slotHistory(slot) {
  return S.sessions.slice().reverse()
    .map(s => s.entries.find(e => e.slot === slot))
    .filter(Boolean)
    .map(e => ({ loadProgressed: !!e.loadProgressed }));
}

/* =================== DAILY =================== */
views.daily = root => {
  const t = today();
  const d = S.daily[t] || (S.daily[t] = { water: 0, sleep: '', protein: '', weight: '' });
  const wt = latestWeight();
  const trainingDay = S.sessions.some(s => s.date === t);

  // WATER
  const targetOz = waterTargetOz(wt || S.profile.startWeight, trainingDay);
  const targetBottles = Math.ceil(targetOz / 8);
  const c1 = el('div','card');
  c1.append(el('h2','','Water'));
  c1.append(el('p','hint', `${d.water} of ${targetBottles} bottles · ${d.water * 8} of ${targetOz} oz. One tap per 8 oz.`));
  const bottles = el('div','bottles');
  for (let i = 0; i < targetBottles; i++) {
    const b = el('button','bottle' + (i < d.water ? ' full' : ''));
    b.setAttribute('aria-label', `Bottle ${i + 1}`);
    b.onclick = () => { d.water = (i < d.water) ? i : i + 1; save(); render(); };
    bottles.append(b);
  }
  c1.append(bottles);
  c1.append(el('p','tiny','Half an ounce per pound of bodyweight, plus 16 oz on a training day. A starting heuristic, not a medical protocol.'));
  root.append(c1);

  // SLEEP
  const c2 = el('div','card');
  c2.append(el('h2','','Sleep'));
  c2.append(el('p','hint','Hours last night. Target is seven to eight.'));
  const sr = el('div','row');
  const si = el('input'); si.type = 'number'; si.step = '0.25'; si.min = '0'; si.max = '14';
  si.inputMode = 'decimal'; si.placeholder = 'hours'; si.value = d.sleep;
  si.oninput = () => { d.sleep = si.value === '' ? '' : Number(si.value); save(); };
  si.onblur = () => render();
  sr.append(si);
  [6,7,8].forEach(h => { const b = el('button','btn sm', h + 'h');
    b.onclick = () => { d.sleep = h; save(); render(); }; sr.append(b); });
  c2.append(sr);
  if (d.sleep !== '' && d.sleep) {
    const a = el('div','alert ' + (d.sleep >= 7 ? 'good' : d.sleep >= 6 ? 'warn' : 'bad'));
    a.style.marginTop = '12px';
    a.innerHTML = d.sleep >= 7 ? '<b>That is the number</b>Strength, appetite control and mood all ride on this one.'
      : d.sleep >= 6 ? '<b>Short</b>Train, but do not chase a personal best today.'
      : '<b>Under six</b>The engine will hold your loads and cut a set. No hero workouts on bad sleep.';
    c2.append(a);
  }
  root.append(c2);

  // PROTEIN
  const p = proteinTarget({ weightLb: wt || S.profile.startWeight, age: S.profile.age,
                            sex: S.profile.sex, goal: S.profile.goal,
                            appetiteSuppressed: S.profile.appetiteSuppressed });
  const c3 = el('div','card');
  c3.append(el('h2','','Protein'));
  c3.append(el('p','hint', `Floor ${p.floor} g · target ${p.target} g · about ${p.perMeal} g across ${p.meals} meals.`));
  const pr = el('div','row');
  const pi = el('input'); pi.type = 'number'; pi.inputMode = 'numeric'; pi.min = '0';
  pi.placeholder = 'grams today'; pi.value = d.protein;
  pi.oninput = () => { d.protein = pi.value === '' ? '' : Number(pi.value); save(); };
  pi.onblur = () => render();
  pr.append(pi);
  [25,30,40].forEach(g => { const b = el('button','btn sm','+' + g);
    b.onclick = () => { d.protein = (Number(d.protein) || 0) + g; save(); render(); }; pr.append(b); });
  c3.append(pr);
  if (d.protein) {
    const pct = Math.round(d.protein / p.target * 100);
    const a = el('div','alert ' + (d.protein >= p.target ? 'good' : d.protein >= p.floor ? 'warn' : 'bad'));
    a.style.marginTop = '12px';
    a.innerHTML = d.protein >= p.target
      ? `<b>${d.protein} g, ${pct}% of target</b>This is the single thing that decides whether the weight you lose comes off as fat or as muscle.`
      : d.protein >= p.floor
      ? `<b>${d.protein} g, above the floor</b>Good enough on a day when appetite is gone. The target is ${p.target} g when you can get there.`
      : `<b>${d.protein} g, under the ${p.floor} g floor</b>A shake counts. Getting to the floor beats an honest zero.`;
    c3.append(a);
  }
  c3.append(el('p','tiny','Target follows the ~1.6 g/kg plateau from Morton et al., BJSM 2018, biased up for being in a deficit and over 40. The floor exists because a target you never hit is not a target.'));
  root.append(c3);

  // QUICK WEIGH-IN
  const c4 = el('div','card');
  c4.append(el('h2','','This morning'));
  c4.append(el('p','hint','Weigh after the bathroom, before food. Same conditions every time or the trend lies.'));
  const wr = el('div','row');
  const wi = el('input'); wi.type = 'number'; wi.step = '0.1'; wi.inputMode = 'decimal';
  wi.placeholder = 'lb'; wi.value = d.weight;
  wi.oninput = () => { d.weight = wi.value === '' ? '' : Number(wi.value); save(); };
  wi.onblur = () => render();
  wr.append(wi);
  c4.append(wr);
  root.append(c4);
};

function latestWeight() {
  const ds = Object.keys(S.daily).sort().reverse();
  for (const k of ds) if (S.daily[k].weight) return Number(S.daily[k].weight);
  return null;
}
function weightEntries() {
  return Object.keys(S.daily).filter(k => S.daily[k].weight)
    .map(k => ({ date: k, lb: Number(S.daily[k].weight) }));
}

/* =================== BODY =================== */
const EQUIV = [[45,'an Olympic barbell plate'],[25,'a 25 lb plate'],[20,'a large bag of dog food'],
               [15,'a 15 lb dumbbell'],[10,'a bowling ball'],[8,'a full gallon of water'],
               [5,'a bag of flour'],[3,'a brick'],[2,'a full 32 oz bottle'],[1,'a pint of water']];
function equivalent(lb) {
  const n = Math.abs(lb);
  for (const [w, name] of EQUIV) if (n >= w) return `about ${name}` + (n >= w * 2 ? ` (roughly ${Math.floor(n / w)} of them)` : '');
  return null;
}

views.body = root => {
  const entries = weightEntries();
  const t = weightTrend(entries);
  const wt = latestWeight();

  const c = el('div','card');
  c.append(el('h2','','Weight'));
  if (!entries.length) {
    c.append(el('p','empty','No weigh-ins yet. Log one on the Daily tab and the trend starts here.'));
    root.append(c); return;
  }
  const lost = S.profile.startWeight - (t.series[t.series.length - 1].avg);
  const toGo = (t.series[t.series.length - 1].avg) - S.profile.targetWeight;
  const st = el('div','stats');
  st.append(stat(wt.toFixed(1), 'Last', ''));
  st.append(stat(t.series[t.series.length - 1].avg.toFixed(1), '7-day avg', ''));
  st.append(stat((lost >= 0 ? '−' : '+') + Math.abs(lost).toFixed(1), 'Off start', ''));
  st.append(stat(toGo > 0 ? toGo.toFixed(1) : '0', 'To target', ''));
  c.append(st);

  if (t.lbPerWeek != null) {
    c.append(el('p','hint', `Trending ${t.lbPerWeek < 0 ? 'down' : 'up'} ${Math.abs(t.lbPerWeek)} lb per week, ${t.pctPerWeek}% of bodyweight.`));
    const f = t.reliable ? lossFlag(t.pctPerWeek, t.lbPerWeek) : null;
    if (f) { const a = el('div','alert ' + (f.level === 'good' ? 'good' : 'warn'));
             a.innerHTML = `<b>${f.level === 'fast' ? 'Too fast' : f.level === 'slow' ? 'Nearly flat' : 'Good rate'}</b>${esc(f.msg)}`;
             c.append(a); }
    else c.append(el('p','tiny', 'Too few weigh-ins to call a rate yet. Five over at least ten days and this starts telling you whether the loss is costing you muscle.'));
  }
  c.append(lineChart(t.series, S.profile.targetWeight));
  root.append(c);

  if (lost >= 1) {
    const m = el('div','card');
    m.append(el('h2','','What that actually is'));
    const eq = equivalent(lost);
    m.append(el('p','hint', `You are carrying ${Math.abs(lost).toFixed(1)} lb less than you started with, ${eq}.`));
    m.append(el('p','tiny', `Walking multiplies bodyweight through the knee roughly fourfold, so that is on the order of ${Math.round(Math.abs(lost) * 4)} lb of force off each knee with every step you take. Stairs are worse than walking, which means the saving is bigger there.`));
    root.append(m);
  }

  // Navy body fat
  const b = el('div','card');
  b.append(el('h2','','Estimated body fat'));
  b.append(el('p','hint','Navy circumference method. Tape at the navel for the waist, just below the larynx for the neck, relaxed, no flexing, same time of day.'));
  const last = S.measure[S.measure.length - 1] || { neckIn:'', waistIn:'', hipIn:'' };
  const grid = el('div','row wrap');
  ['neckIn','waistIn'].concat(S.profile.sex === 'female' ? ['hipIn'] : []).forEach(f => {
    const w = el('div'); w.style.flex = '1 1 90px';
    w.append(el('div','lbl', f === 'neckIn' ? 'Neck in' : f === 'waistIn' ? 'Waist in' : 'Hip in'));
    const i = el('input'); i.type = 'number'; i.step = '0.25'; i.inputMode = 'decimal';
    i.value = last[f] || ''; i.dataset.f = f;
    w.append(i); grid.append(w);
  });
  b.append(grid);
  const sv = el('button','btn block','Save measurements');
  sv.style.marginTop = '10px';
  sv.onclick = () => {
    const rec = { date: today() };
    grid.querySelectorAll('input').forEach(i => rec[i.dataset.f] = Number(i.value) || 0);
    S.measure.push(rec); save(); render();
  };
  b.append(sv);

  if (last.waistIn && last.neckIn) {
    const bf = navyBodyFat({ sex: S.profile.sex, heightIn: S.profile.heightIn,
                             neckIn: Number(last.neckIn), waistIn: Number(last.waistIn),
                             hipIn: Number(last.hipIn) });
    if (bf) {
      const s2 = el('div','stats'); s2.style.marginTop = '14px';
      s2.append(stat(bf.point + '%', 'Estimate', ''));
      s2.append(stat(bf.low + '–' + bf.high + '%', 'Real range', ''));
      if (wt) s2.append(stat((wt * (1 - bf.point / 100)).toFixed(0), 'Lean lb', ''));
      b.append(s2);
      b.append(el('p','tiny','This method runs about three to four points off a DEXA scan, so the range is the honest answer and the single number is not. Measured the same way each time it tracks direction well, which is the only thing you need it for.'));
    }
  }
  root.append(b);
};

function stat(v, k, d) {
  const n = el('div','stat');
  n.append(el('div','v', v)); n.append(el('div','k', k));
  if (d) n.append(el('div','d', d));
  return n;
}

function lineChart(series, target) {
  const W = 640, H = 220, P = { l: 38, r: 12, t: 14, b: 26 };
  const vals = series.map(s => s.lb).concat(series.map(s => s.avg), target ? [target] : []);
  const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1);
  const x = i => P.l + (series.length < 2 ? 0 : i * (W - P.l - P.r) / (series.length - 1));
  const y = v => P.t + (max - v) * (H - P.t - P.b) / (max - min || 1);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class','chart');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label', `Bodyweight trend, ${series.length} weigh-ins from ${series[0].lb} to ${series[series.length-1].lb} pounds`);
  const add = (t, a) => { const n = document.createElementNS(ns, t);
    for (const k in a) n.setAttribute(k, a[k]); svg.append(n); return n; };

  [min, (min + max) / 2, max].forEach(v => {
    add('line', { x1:P.l, x2:W-P.r, y1:y(v), y2:y(v), stroke:'var(--line)', 'stroke-width':1 });
    const tx = add('text', { x:P.l-6, y:y(v)+4, 'text-anchor':'end', fill:'var(--muted)', 'font-size':11 });
    tx.textContent = Math.round(v);
  });
  if (target && target >= min && target <= max) {
    add('line', { x1:P.l, x2:W-P.r, y1:y(target), y2:y(target), stroke:'var(--good)',
                  'stroke-width':1.5, 'stroke-dasharray':'5 4' });
    const tl = add('text', { x:W-P.r, y:y(target)-6, 'text-anchor':'end', fill:'var(--good)', 'font-size':11 });
    tl.textContent = 'target ' + target;
  }
  add('polyline', { points: series.map((s,i) => `${x(i)},${y(s.avg)}`).join(' '),
                    fill:'none', stroke:'var(--bronze)', 'stroke-width':2.5,
                    'stroke-linejoin':'round', 'stroke-linecap':'round' });
  series.forEach((s,i) => add('circle', { cx:x(i), cy:y(s.lb), r:2.8, fill:'var(--muted)', opacity:.55 }));
  const lastPt = series[series.length-1];
  add('circle', { cx:x(series.length-1), cy:y(lastPt.avg), r:5, fill:'var(--bronze)' });
  return svg;
}

/* =================== PROGRESS =================== */
views.progress = root => {
  if (!S.sessions.length) {
    const c = el('div','card');
    c.append(el('h2','','Progress'));
    c.append(el('p','empty','Log a session and your lifts show up here.'));
    root.append(c); return;
  }
  const c = el('div','card');
  c.append(el('h2','','Sessions'));
  c.append(el('p','hint', S.sessions.length + ' logged · currently week ' + S.week));
  const st = el('div','stats');
  const vol = S.sessions.slice(-1)[0].entries.reduce((t,e) =>
    t + e.sets.reduce((a,s) => a + s.reps * s.load, 0), 0);
  st.append(stat(S.sessions.length, 'Sessions', ''));
  st.append(stat(Math.round(vol).toLocaleString(), 'Last tonnage lb', ''));
  const jf = S.sessions.flatMap(s => s.entries).filter(e => e.joint && e.joint.sev >= 2).length;
  st.append(stat(jf, 'Joint swaps', ''));
  c.append(st);
  root.append(c);

  SLOTS.forEach(slot => {
    const pts = S.sessions.map(s => {
      const e = s.entries.find(x => x.slot === slot.id);
      if (!e || !e.sets.length) return null;
      return { date: s.date, load: Math.max(...e.sets.map(x => x.load)), name: byId(e.exId).name };
    }).filter(Boolean);
    if (pts.length < 1) return;
    const card = el('div','card');
    card.append(el('h2','', slot.name));
    const cur = pts[pts.length-1];
    const first = pts[0];
    card.append(el('p','hint', `${cur.name} · ${cur.load} lb` +
      (pts.length > 1 ? ` · ${cur.load - first.load >= 0 ? '+' : ''}${cur.load - first.load} lb since you started` : '')));
    if (pts.length > 1) card.append(barChart(pts));
    root.append(card);
  });
};

function barChart(pts) {
  const W = 640, H = 130, P = { l: 34, r: 10, t: 10, b: 20 };
  const max = Math.max(...pts.map(p => p.load)) * 1.12;
  const bw = (W - P.l - P.r) / pts.length;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class','chart');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label', `Top set load across ${pts.length} sessions, ${pts[0].load} to ${pts[pts.length-1].load} pounds`);
  pts.forEach((p, i) => {
    const h = (p.load / max) * (H - P.t - P.b);
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', P.l + i * bw + bw * .18);
    r.setAttribute('y', H - P.b - h);
    r.setAttribute('width', bw * .64);
    r.setAttribute('height', Math.max(2, h));
    r.setAttribute('rx', 3);
    r.setAttribute('fill', i === pts.length - 1 ? 'var(--bronze)' : 'var(--line)');
    svg.append(r);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', P.l + i * bw + bw * .5); t.setAttribute('y', H - 6);
    t.setAttribute('text-anchor','middle'); t.setAttribute('fill','var(--muted)');
    t.setAttribute('font-size', 10);
    t.textContent = p.load;
    svg.append(t);
  });
  return svg;
}

/* =================== SETTINGS =================== */
views.settings = root => {
  const c = el('div','card');
  c.append(el('h2','','Profile'));
  const fields = [
    ['age','Age','number'], ['heightIn','Height (in)','number'],
    ['startWeight','Start weight (lb)','number'], ['targetWeight','Target weight (lb)','number']
  ];
  fields.forEach(([k, label, type]) => {
    const w = el('div'); w.style.margin = '0 0 10px';
    w.append(el('div','lbl', label));
    const i = el('input'); i.type = type; i.value = S.profile[k];
    i.oninput = () => { S.profile[k] = Number(i.value); save(); };
    w.append(i); c.append(w);
  });
  const gw = el('div'); gw.style.margin = '0 0 10px';
  gw.append(el('div','lbl','Goal'));
  const sel = el('select');
  [['cut','Fat loss — hold volume, protect muscle'],
   ['maintain','Maintain'],
   ['gain','Build — allow volume to climb']].forEach(([v, t]) => {
    const o = el('option', null, t); o.value = v;
    if (S.profile.goal === v) o.selected = true; sel.append(o);
  });
  sel.onchange = () => { S.profile.goal = sel.value; save(); render(); };
  gw.append(sel); c.append(gw);

  const ap = el('button','opt');
  ap.setAttribute('aria-pressed', String(!!S.profile.appetiteSuppressed));
  ap.append(el('span','dot'));
  ap.append(el('span', null, 'Appetite suppressed (sets a reachable protein floor)'));
  ap.onclick = () => { S.profile.appetiteSuppressed = !S.profile.appetiteSuppressed; save(); render(); };
  c.append(ap);
  root.append(c);

  const w = el('div','card');
  w.append(el('h2','','Mesocycle'));
  w.append(el('p','hint','Week ' + S.week + ' of 5. Week 5 is a deload, then it resets.'));
  const r = el('div','row wrap');
  [1,2,3,4,5].forEach(n => { const b = el('button','btn sm', 'Week ' + n);
    b.setAttribute('aria-pressed', String(S.week === n));
    b.onclick = () => { S.week = n; save(); render(); }; r.append(b); });
  w.append(r);
  const nr = el('div','row'); nr.style.marginTop = '10px';
  ['A','B'].forEach(L => { const b = el('button','btn sm','Next: ' + L);
    b.setAttribute('aria-pressed', String(S.next === L));
    b.onclick = () => { S.next = L; S.draft = null; save(); render(); }; nr.append(b); });
  w.append(nr);
  root.append(w);

  const d = el('div','card');
  d.append(el('h2','','Your data'));
  d.append(el('p','hint','Everything lives in this browser and nowhere else. Export regularly.'));
  const ex = el('button','btn block','Export everything as JSON');
  ex.onclick = () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kanon-' + today() + '.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  d.append(ex);
  const imp = el('button','btn block','Import a backup');
  imp.style.marginTop = '8px';
  imp.onclick = () => {
    const f = el('input'); f.type = 'file'; f.accept = 'application/json';
    f.onchange = () => { const r2 = new FileReader();
      r2.onload = () => { try { S = Object.assign(seed(), JSON.parse(r2.result)); save(); render(); alert('Imported.'); }
                          catch (e) { alert('That file did not parse.'); } };
      r2.readAsText(f.files[0]); };
    f.click();
  };
  d.append(imp);
  const rs = el('button','btn block ghost','Reset to a fresh program');
  rs.style.marginTop = '8px';
  rs.onclick = () => { if (confirm('Wipe all logged data and start over?')) { S = seed(); save(); render(); } };
  d.append(rs);
  root.append(d);

  const a = el('div','card');
  a.append(el('h2','','About'));
  a.append(el('p','tiny','Kanon v0.1. Load and rep progress at a fixed effort level drives the program. Volume only responds to a stall, never to success. Joint pain overrides everything and swaps the movement on the spot.'));
  a.append(el('p','tiny','This is not medical advice and the joint swap is not a diagnosis. Sharp pain that lasts more than a week or so is a clinician’s call, not an app’s. Body fat and hydration numbers are estimates for healthy adults.'));
  root.append(a);
};

/* ---------------- boot ---------------- */
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
