/* KANON app shell. State in localStorage, exported as JSON from Settings. */
'use strict';
const K = 'kanon.v1';
const KBAK = 'kanon.v1.bak';       // last known-good copy, one save behind
const KBAD = 'kanon.v1.corrupt';   // whatever could not be parsed, kept, never overwritten blindly
let recovered = '';                // set by load() when it had to fall back
const today = () => new Date().toISOString().slice(0, 10);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

/* ---------------- seed: Paul's locked Tue/Sat program ---------------- */
function seed() {
  // `primary` marks the compound slots that carry the extra week-2 set. It is a
  // property of the slot, not of its position, so reordering cannot move volume.
  const mk = (slot, exId, primary) => ({ slot, exId, sets: 1, repLow: 8, repHigh: 12,
                                         load: null, misses: 0, primary: !!primary });
  return {
    profile: { sex:'male', age:44, heightIn:70, goal:'cut', appetiteSuppressed:true, theme:'dark', figure:'male',
               startWeight:219, targetWeight:207, trainDays:'Tue / Sat',
               level:'inter', unit:'lb', programId:'fullclassic', onboarded:false },
    week: 1,
    cur: 0,
    days: [
      { name: 'Full body A', slots: [mk('squat','legpress',1), mk('hpress','machchest',1),
          mk('vpull','latpulln',1), mk('hinge','rdl'), mk('hpull','csrow'), mk('vpress','machshld')] },
      { name: 'Full body B', slots: [mk('squat','hacksquat',1), mk('hpress','inclinemach',1),
          mk('vpull','assistpull',1), mk('hinge','legcurl'), mk('hpull','cablerow'), mk('vpress','latraise')] }
    ],
    setup: { days: 2, minutes: 50, weeks: 8 },
    sessions: [], quarantine: {},
    daily: {
      '2026-08-30': { water:0, sleep:'', protein:'', weight:219.0 },
      '2026-08-31': { water:0, sleep:7,  protein:'', weight:215.5 },
      '2026-09-07': { water:0, sleep:'', protein:'', weight:214.6 }
    },
    measure: [], lastSummary: null, preview: null,
    draft: null
  };
}
let S = load();
function load() {
  const raw = safeGet(K);
  if (raw) {
    try { return parseState(raw); }
    catch (e) {
      console.warn('main state unreadable', e);
      try { localStorage.setItem(KBAD, raw); } catch (e2) {}
      const bak = safeGet(KBAK);
      if (bak) {
        try {
          const st = parseState(bak);
          recovered = 'The main save was unreadable, so the last good copy was restored. You may have lost the most recent session.';
          return st;
        } catch (e3) { console.warn('backup unreadable too', e3); }
      }
      recovered = 'The saved data could not be read and there was no usable backup, so the app started fresh. The unreadable copy was kept in case it can be salvaged.';
      return seed();
    }
  }
  const bak = safeGet(KBAK);
  if (bak) {
    try {
      const st = parseState(bak);
      recovered = 'The main save had gone missing, which usually means the browser cleared it. The last good copy was restored.';
      return st;
    } catch (e) {}
  }
  return seed();
}
function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
/* Every write keeps the previous good copy. A session logged on the gym floor is
 * not something to lose to a bad parse or a half-finished write, so load() falls
 * back to the backup rather than quietly handing back an empty app. */
function save() {
  try {
    const cur = localStorage.getItem(K);
    const next = JSON.stringify(S);
    if (cur && cur !== next) { try { localStorage.setItem(KBAK, cur); } catch (e) {} }
    localStorage.setItem(K, next);
  } catch (e) {
    alert('Could not save on this device. Export your data from Settings before you close the app.');
  }
}

function parseState(raw) {
  const st = Object.assign(seed(), JSON.parse(raw));
  // plans saved before `primary` existed: the first three slots carried it
  // plans saved as a fixed A/B pair become a list of days
  if (st.plan && !Array.isArray(st.days)) {
    st.days = [{ name: 'Full body A', slots: st.plan.A || [] },
               { name: 'Full body B', slots: st.plan.B || [] }];
    st.cur = st.next === 'B' ? 1 : 0;
  }
  delete st.plan; delete st.next;
  (st.days || []).forEach(d => (d.slots || []).forEach((p, i) => {
    if (p.primary === undefined) p.primary = i < 3;
  }));
  if (typeof st.cur !== 'number' || !st.days[st.cur]) st.cur = 0;
  if (!st.profile.level) st.profile.level = 'inter';
  if (!st.profile.unit) st.profile.unit = 'lb';
  if (!st.setup.weeks) st.setup.weeks = 5;
  if (st.profile.onboarded === undefined) st.profile.onboarded = st.sessions && st.sessions.length > 0;
  // Browsing ahead is a look, not a place. A reload always lands back on
  // the live session, so nobody reopens the app into a read-only screen.
  st.preview = null;
  return st;
}

/* ---------------- units ----------------
 * Everything is stored in pounds. The unit setting only changes what is shown
 * and what a typed number means, so switching back and forth never rounds your
 * history away. */
const U = () => S.profile.unit || 'lb';
const disp = lb => toUnit(lb, U());                    // stored -> shown
const stored = v => fromUnit(v, U());                  // typed  -> stored
const uLabel = () => U();
const showLoad = lb => (lb === '' || lb == null) ? '' : disp(lb) + ' ' + uLabel();

/* ---------------- profile bounds ----------------
 * These numbers feed the Navy body-fat formula, the protein target and the
 * rate-of-loss flag. A blank or a typo does not fail loudly there, it produces a
 * confident wrong number, which is worse. So clamp at the input. */
const BOUNDS = { age:[13,100], feet:[3,8], inches:[0,11.75], weightLb:[50,700] };
function clamp(v, [lo, hi]) {
  const n = Number(v);
  if (v === '' || v === null || !isFinite(n)) return '';
  return Math.min(hi, Math.max(lo, n));
}
function profileComplete(pf) {
  return clamp(pf.age, BOUNDS.age) !== '' &&
         clamp(pf.heightIn, [BOUNDS.feet[0] * 12, BOUNDS.feet[1] * 12 + 11.75]) !== '' &&
         clamp(pf.startWeight, BOUNDS.weightLb) !== '';
}

/* ---------------- week rules (the ramp already locked in your program) ---------------- */
const blockWeeks = () => (S.setup && S.setup.weeks) || 5;
/* The plan carries the working set count for each slot; the week scales it.
 * Week 1 eases in, the last week halves, the middle carries the full load. This
 * has to REPLACE the planned number, not be maxed against it, or the deload
 * never actually deloads. */
const setsThisWeek = (week, p) => blockSets(week, p.sets || 1, blockWeeks());
function setsForWeek(week, isPrimary) {      // kept for the volume preview
  return blockSets(week, isPrimary ? 2 : 1, blockWeeks());
}
const rirForWeek = w => blockRir(w, blockWeeks());
const deloadWeekNow = w => isDeload(w, blockWeeks());

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

/* ---------------- theme ---------------- */
const THEMES = ['dark', 'light'];
const ICON = {
  dark:  '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.3 8.3 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></svg>'
};
function applyTheme() {
  const t = THEMES.includes(S.profile.theme) ? S.profile.theme : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  const b = $('#themeBtn');
  if (b) {
    b.innerHTML = ICON[t];
    b.title = t === 'dark' ? 'Dark. Tap for light.' : 'Light. Tap for dark.';
    b.setAttribute('aria-label', b.title);
  }
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
  const wb = $('#weekBadge');
  wb.textContent = S.preview
    ? 'Wk ' + S.preview.week + ' \u00b7 ' + dayName(S.preview.day) + ' \u00b7 preview'
    : 'Wk ' + S.week + ' \u00b7 ' + dayName(S.cur) + (deloadWeekNow(S.week) ? ' \u00b7 deload' : '');
  wb.classList.toggle('previewing', !!S.preview);
  document.querySelectorAll('.tab').forEach(t =>
    t.setAttribute('aria-selected', String(t.dataset.view === current)));
}
document.querySelectorAll('.tab').forEach(t =>
  t.addEventListener('click', () => { current = t.dataset.view; window.scrollTo(0,0); render(); }));

/* =================== TRAIN =================== */
views.train = root => {
  // If load() had to fall back to the backup, say so once rather than letting a
  // missing session look like the app quietly ate it.
  if (recovered) {
    const rec = el('div','alert warn');
    rec.innerHTML = '<b>Your data was restored from backup</b>' + esc(recovered) +
      ' Export a copy from Settings now so there is one outside this browser.';
    root.append(rec);
    recovered = '';
  }
  const pv = S.preview;
  const dayIdx = pv ? pv.day : S.cur;
  const week = pv ? pv.week : S.week;
  const day = S.days[dayIdx] || S.days[0];
  const plan = day.slots;
  const dl = deloadCheckLocal();

  // Preview never touches the draft: browsing ahead must not create log state.
  if (!pv && (!S.draft || S.draft.day !== dayIdx)) {
    S.draft = { day: dayIdx, date: today(), week: S.week, entries: {} };
  }

  if (pv) {
    const banner = el('div','card preview');
    banner.append(el('div','eyebrow','Previewing'));
    banner.append(Object.assign(el('h2'), { textContent: day.name + ' \u00b7 Week ' + week }));
    banner.append(Object.assign(el('p','hint'), { textContent: weekBlurb(week) }));
    banner.append(Object.assign(el('p','tiny'), { textContent:
      'Looking ahead only. Nothing here is logged, and your current session is still ' +
      dayName(S.cur) + ', week ' + S.week + '.' }));
    const back = el('button','btn primary block','Back to ' + dayName(S.cur) + ', week ' + S.week);
    back.style.marginTop = '12px';
    back.onclick = () => { S.preview = null; save(); render(); };
    banner.append(back);
    root.append(banner);

    const list = el('div','card liftlist');
    list.append(Object.assign(el('p','tiny listnote'), { textContent:
      'Read only. Go back to your current session to log sets.' }));
    plan.forEach((p, idx) => list.append(liftRow(p, idx, week, true)));
    root.append(list);
    return;
  }

  // The artwork sits in its own band with nothing but the session title over it,
  // so the figure is not buried under a paragraph of scrim. Everything else
  // reads on the card surface below. If the file is missing, onerror strips the
  // band and the title falls back into the body — no broken icon, nothing to set.
  const head = el('div','card hero');
  const title = () => Object.assign(el('h2'), { textContent:
    day.name + ' \u00b7 ' + (deloadWeekNow(S.week) ? 'Deload' : 'Week ' + S.week) });
  const body = el('div','hero-body');
  const fig = S.profile.figure || 'male';

  if (fig === 'none') {
    head.classList.add('noimg');
    body.append(title());
  } else {
    const art = el('div','hero-art');
    const himg = el('img');
    himg.src = 'img/hero-' + fig + '.jpg';
    himg.alt = ''; himg.loading = 'eager';
    himg.onerror = () => {
      head.classList.add('noimg');
      art.remove();
      body.prepend(title());
    };
    art.append(himg);
    const ov = el('div','hero-ov');
    ov.append(title());
    art.append(ov);
    head.append(art);
  }

  body.append(Object.assign(el('p','hint'), { textContent: weekBlurb(week) }));
  if (dl.deload && !deloadWeekNow(S.week)) {
    const a = el('div','alert warn');
    a.innerHTML = '<b>Early deload recommended</b>' + esc(dl.reason) + '. Cut the sets in half and back off the effort this session.';
    body.append(a);
  }
  const doneN = plan.filter(p => S.draft.entries[p.slot] && S.draft.entries[p.slot].done).length;
  body.append(Object.assign(el('p','tiny'), { textContent:
    doneN ? doneN + ' of ' + plan.length + ' done. Take them in whatever order the machines are free.'
          : 'Take them in whatever order the machines are free. Tap a lift to log it.' }));
  head.append(body);
  root.append(head);

  if (S.lastSummary && S.lastSummary.lines && S.lastSummary.lines.length) {
    const sum = el('div','card summary');
    const sh = el('div','row');
    sh.append(Object.assign(el('h2'), { textContent: 'What the last session changed' }));
    sh.append(el('div','spacer'));
    const dis = el('button','btn sm ghost','Dismiss');
    dis.onclick = () => { S.lastSummary = null; save(); render(); };
    sh.append(dis);
    sum.append(sh);
    sum.append(Object.assign(el('p','hint'), { textContent:
      S.lastSummary.name + ', week ' + S.lastSummary.week + ', ' + S.lastSummary.date +
      '. These carried straight into the targets below.' }));
    const ul = el('div','changes');
    S.lastSummary.lines.forEach(l => {
      const li = el('div','change');
      li.append(el('span','change-b', '\u2192'));
      li.append(el('span', null, l));
      ul.append(li);
    });
    sum.append(ul);
    root.append(sum);
  }

  const list = el('div','card liftlist');
  plan.forEach((p, idx) => list.append(liftRow(p, idx, week, false)));
  root.append(list);
  makeReorderable(list, plan);

  // Add a body group to this session. Calves, arms and single-leg work are the
  // usual reasons; the picker covers every slot in the library.
  const add = el('button','btn sm block ghost','+ Add a lift to this session');
  add.style.marginTop = '2px';
  add.onclick = () => openAddSlot(dayIdx, add);
  root.append(add);

  const fin = el('button','btn primary block','Finish session');
  fin.style.marginTop = '12px';
  fin.onclick = finishSession;
  root.append(fin);

  const note = el('p','tiny');
  note.style.cssText = 'text-align:center;margin-top:10px';
  note.textContent = 'Nothing is sent anywhere. Everything stays on this device until you export it.';
  root.append(note);
};

function weekBlurb(week) {
  const rir = rirForWeek(week);
  const n = blockWeeks();
  if (deloadWeekNow(week)) return 'Deload, the last week of the block. Half the sets, five reps left in the tank, clean technique.';
  if (week === 1) return 'Week 1 of ' + n + '. One set eased off each slot, ' + rir + ' reps left in the tank. Nothing near failure.';
  if (week === n - 1) return 'The hardest week of the block. ' + rir + ' rep' + (rir === 1 ? '' : 's') + ' left in the tank. Deload next.';
  return 'Week ' + week + ' of ' + n + '. ' + rir + ' reps left in the tank. The engine adds a set only if a lift stalls.';
}

function deloadCheckLocal() { return deloadCheck(S.week, deloadSignals(), blockWeeks()); }

const dayName = i => (S.days[i] && S.days[i].name) || 'Session';

function draftFor(p) {
  return S.draft.entries[p.slot] ||
    (S.draft.entries[p.slot] = { exId: p.exId, slot: p.slot, sets: [], setsPlanned: null,
                                 pump: 0, readiness: 0, joint: null, done: false });
}

function liftRow(p, idx, week, preview) {
  const ex = byId(p.exId);
  const d = preview ? null : draftFor(p);
  const planned = setsThisWeek(week, p);
  const nSets = d && d.setsPlanned != null ? d.setsPlanned : planned;
  const logged = d ? d.sets.filter(x => x.reps).length : 0;

  const row = el('div','lift' + (d && d.done ? ' done' : '') + (preview ? ' preview' : ''));
  if (!preview) {
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.onclick = () => openLift(p, idx, row);
    row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLift(p, idx, row); } };
  }

  if (!preview) {
    const grip = el('button','grip');
    grip.type = 'button';
    grip.title = 'Drag to reorder, or use the arrow keys';
    grip.setAttribute('aria-label', 'Reorder ' + ex.name + '. Drag, or press the up and down arrow keys.');
    grip.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="3" r="1.3"/><circle cx="10" cy="3" r="1.3"/><circle cx="6" cy="8" r="1.3"/><circle cx="10" cy="8" r="1.3"/><circle cx="6" cy="13" r="1.3"/><circle cx="10" cy="13" r="1.3"/></svg>';
    grip.onclick = e => e.stopPropagation();
    row.append(grip);
  }
  row.append(el('span','lift-i', String(idx + 1)));
  const body = el('span','lift-b');
  body.append(el('span','ex-slot', SLOTS.find(s => s.id === p.slot).name));
  body.append(el('span','lift-n', ex.name));
  body.append(el('span','lift-t', (p.load ? showLoad(p.load) : 'Finder set') +
    ' \u00b7 ' + p.repLow + '\u2013' + p.repHigh + ' reps \u00b7 ' + nSets + ' set' + (nSets > 1 ? 's' : '')));

  // What you actually logged stays on the row. The three feedback answers
  // collapse to one short line here rather than sitting open taking a screen.
  if (d && logged) {
    const done = d.sets.filter(x => x.reps);
    body.append(el('span','setline',
      done.map(x => disp(x.load) + '\u00d7' + x.reps).join('  \u00b7  ') +
      (done.length && done[done.length - 1].rir !== '' ? '   ' + done[done.length - 1].rir + ' in tank' : '')));
    const bits = [];
    if (d.pump) bits.push('Intensity ' + ['', 'barely', 'moderate', 'strong', 'too much'][d.pump]);
    if (d.readiness) bits.push(['', 'fresh', 'slightly sore', 'still sore', 'too sore'][d.readiness]);
    bits.push(d.joint && d.joint.sev
      ? (JOINT_LEVELS[d.joint.sev] || {}).label.toLowerCase() + ' ' + jointName(d.joint.joint || '')
      : 'no pain');
    body.append(el('span','fbline', bits.join(' \u00b7 ') + ' \u00b7 tap to edit'));
  }
  row.append(body);
  row.append(el('span','spacer'));
  if (!preview) {
    const sw = el('button','rowswap');
    sw.type = 'button';
    sw.title = 'Swap ' + ex.name + ' for another lift that trains the same muscles';
    sw.setAttribute('aria-label', sw.title);
    sw.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11l-3-3M17 13H6l3 3"/></svg>';
    sw.onclick = e => { e.stopPropagation(); openSwap(p, () => render(), row); };
    row.append(sw);
  }
  // Only show a status glyph when there is one. The grip and swap control
  // already read as interactive, so a permanent arrow just stole width from
  // the lift name and forced it onto two lines.
  if (!preview && d && (d.done || logged)) {
    const st = el('span','lift-s' + (d.done ? ' ok' : ' part'));
    st.textContent = d.done ? '\u2713' : logged + '/' + nSets;
    row.append(st);
  }
  return row;
}

/* Drag by the grip, or move with the arrow keys when focused on it. */
function makeReorderable(list, plan) {
  const rows = Array.from(list.querySelectorAll('.lift'));
  rows.forEach((row, from) => {
    const grip = row.querySelector('.grip');
    if (!grip) return;

    grip.onkeydown = e => {
      const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      const to = from + dir;
      if (to < 0 || to >= plan.length) return;
      plan.splice(to, 0, plan.splice(from, 1)[0]);
      save(); render();
      const next = document.querySelectorAll('.liftlist .grip')[to];
      if (next) next.focus();
    };

    grip.addEventListener('pointerdown', e => {
      if (e.button) return;
      e.preventDefault();
      const rects = rows.map(r => r.getBoundingClientRect());
      const startY = e.clientY;
      let to = from;
      grip.setPointerCapture(e.pointerId);
      row.classList.add('dragging');

      const move = ev => {
        const dy = ev.clientY - startY;
        row.style.transform = 'translateY(' + dy + 'px)';
        const mid = rects[from].top + rects[from].height / 2 + dy;
        let idx = 0;
        rects.forEach((r, i) => { if (mid > r.top + r.height / 2) idx = i; });
        if (idx !== to) {
          to = idx;
          rows.forEach((r, i) => r.classList.toggle('dropmark', i === to && i !== from));
        }
      };
      const up = ev => {
        try { grip.releasePointerCapture(ev.pointerId); } catch (_) {}
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        row.style.transform = '';
        row.classList.remove('dragging');
        rows.forEach(r => r.classList.remove('dropmark'));
        if (to !== from) { plan.splice(to, 0, plan.splice(from, 1)[0]); save(); }
        render();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  });
}

/* ---- one lift at a time: log the sets, then the questions in sequence ---- */
function openLift(p, idx, anchorEl) {
  closeSheet();
  const d = draftFor(p);
  let step = 0;                       // 0 sets · 1 engagement · 2 recovery · 3 joint

  sheetEl = el('div','sheet');
  sheetEl.setAttribute('role','dialog');
  sheetEl.setAttribute('aria-modal','true');
  sheetEl.setAttribute('aria-label','Log lift');
  sheetEl.onclick = e => { if (e.target === sheetEl) { closeSheet(); render(); } };
  const inner = el('div','sheet-inner');
  sheetEl.append(inner);
  mountSheet(anchorEl);
  drawStep();

  function drawStep() {
    const ex = byId(p.exId);
    const nSets = setsThisWeek(S.week, p);
    const rir = rirForWeek(S.week);
    inner.innerHTML = '';

    const head = el('div','sheet-h');
    const ttl = el('div');
    ttl.append(el('div','ex-slot', SLOTS.find(s => s.id === p.slot).name));
    ttl.append(Object.assign(el('h2'), { textContent: ex.name }));
    head.append(ttl);
    head.append(el('div','spacer'));
    const x = el('button','btn sm ghost','Close');
    x.onclick = () => { closeSheet(); render(); };
    head.append(x);
    inner.append(head);

    const dots = el('div','steps');
    ['Sets','Intensity','Recovery','Joints'].forEach((label, i) => {
      const dd = el('span','step' + (i === step ? ' on' : i < step ? ' past' : ''), label);
      dots.append(dd);
    });
    inner.append(dots);

    if (step === 0) drawSets(ex, nSets, rir);
    if (step === 1) drawQ('Intensity',
      'How hard the target muscle actually worked. Barely means the joints took over. Too much means it cramped or gave out before the reps did.',
      [[1,'Barely'],[2,'Moderate'],[3,'Strong'],[4,'Too much']],
      d.pump, v => { d.pump = v; save(); step = 2; drawStep(); });
    if (step === 2) drawQ('How recovered were you coming in?',
      'Leftover soreness from last time, not how this set felt. Too sore means this should not have been trained today.',
      [[1,'Fresh'],[2,'Slight'],[3,'Still sore'],[4,'Too sore']],
      d.readiness, v => { d.readiness = v; save(); step = 3; drawStep(); });
    if (step === 3) drawJoint(ex);
  }

  function drawSets(ex, nSets, rir) {
    const t = el('div','target');
    t.innerHTML = p.load
      ? `Target <b>${showLoad(p.load)}</b> &middot; ${p.repLow}\u2013${p.repHigh} reps &middot; leave <b>${rir}</b> in the tank`
      : `<b>Finder set.</b> Pick a weight you could get about ${p.repHigh + 3} reps with and stop at ${p.repHigh}. The engine takes over from the next session.`;
    inner.append(t);
    const L = lastFor(p.slot, p.exId);
    if (L) {
      const hist = el('div','lastline');
      const setTxt = L.sets.map(x => x.load + '\u00d7' + x.reps).join(', ');
      hist.innerHTML = '<b>Last time</b> ' + esc(L.date) + ' \u00b7 ' + esc(setTxt) +
        ' \u00b7 ' + esc(String(L.sets[L.sets.length - 1].rir)) + ' in the tank' +
        (L.note ? '<br><span class="why">' + esc(L.note) + '</span>' : '');
      inner.append(hist);
    }
    inner.append(el('div','cue', ex.cue));

    const tools = el('div','row');
    const vid = el('a','btn sm ghost','How to \u2197');
    vid.href = ex.video; vid.target = '_blank'; vid.rel = 'noopener';
    vid.title = 'Technique videos for ' + ex.name + ' (opens YouTube in a new tab)';
    vid.setAttribute('aria-label', vid.title);
    tools.append(vid);
    const sw = el('button','btn sm ghost','Swap lift');
    sw.title = 'Replace this with another lift that trains the same muscles';
    sw.onclick = () => openSwap(p, () => openLift(p, idx, anchorEl), anchorEl);
    tools.append(sw);
    inner.append(tools);

    const hdr = el('div','setrow');
    hdr.append(el('div','n',''), el('div','lbl','Weight'), el('div','lbl','Reps'), el('div','lbl','Left in tank'), el('div',null,''));
    inner.append(hdr);
    // Planned rows come from the programme; anything past that is one you added
    // by hand this session and can drop again.
    // What the engine would put in the boxes if you did nothing: the load it
    // decided on last time, and the rep target that goes with it. Typed over
    // freely — these are a starting point, not a lock.
    const sug = suggestSet({ target: p, lastEntry: L, level: S.profile.level });
    // How many rows this session wants. Starts at what the programme planned and
    // moves as you add or drop rows, so dropping a planned set actually removes
    // it instead of the row reappearing on the next redraw.
    if (d.setsPlanned == null) d.setsPlanned = nSets;
    const shown = Math.max(d.setsPlanned, d.sets.length);
    for (let i = 0; i < shown; i++) {
      if (!d.sets[i]) d.sets[i] = { load: lastLoggedLoad(d, p) || sug.load, reps: '', rir: '' };
      const r = el('div','setrow');
      r.append(el('div','n', String(i + 1)));
      ['load','reps','rir'].forEach(f => {
        const inp = el('input'); inp.type = 'number'; inp.inputMode = 'decimal';
        inp.min = '0'; inp.step = f === 'load' ? String(unitStep(U())) : '1';
        inp.value = f === 'load' ? disp(d.sets[i][f]) : d.sets[i][f];
        inp.id = 'set-' + p.slot + '-' + i + '-' + f;
        inp.placeholder = f === 'load' ? uLabel()
                        : f === 'reps' ? (sug.reps || '#')
                        : String(rir);
        inp.setAttribute('aria-label', 'Set ' + (i + 1) + ' ' + (f === 'load' ? 'weight' : f === 'reps' ? 'reps' : 'reps left in the tank'));
        inp.oninput = () => {
          d.sets[i][f] = inp.value === '' ? '' : (f === 'load' ? stored(inp.value) : Number(inp.value));
          save(); next.disabled = !anyReps();
        };
        r.append(inp);
      });
      // Any set can go, planned or added. A set you did not do should not sit
      // there as an empty row skewing what the engine reads.
      const rm = el('button','setdrop', '\u00d7');
      rm.type = 'button';
      rm.title = 'Remove set ' + (i + 1);
      rm.setAttribute('aria-label', rm.title);
      rm.onclick = () => {
        d.sets.splice(i, 1);
        d.setsPlanned = Math.max(0, Math.min(d.setsPlanned, shown) - 1);
        save(); drawStep();
      };
      r.append(rm);
      inner.append(r);
    }
    if (!shown) inner.append(Object.assign(el('p','tiny'), { textContent:
      'No sets left on this lift. Add one back, or leave it and the lift is skipped this session.' }));
    if (sug.why) inner.append(Object.assign(el('p','tiny sugwhy'), { textContent: sug.why }));

    const addBtn = el('button','btn sm block ghost','+ Add set');
    addBtn.style.marginTop = '2px';
    addBtn.onclick = () => {
      d.sets.push({ load: lastLoggedLoad(d, p) || sug.load, reps: '', rir: '' });
      d.setsPlanned = Math.max(d.setsPlanned, d.sets.length);
      save(); drawStep();
    };
    inner.append(addBtn);
    inner.append(Object.assign(el('p','tiny'), { textContent:
      shown > nSets
        ? 'Extra sets count toward this session and the engine reads them, but they do not change the planned volume. That still moves only when a lift stalls.'
        : 'The programme calls for ' + nSets + (nSets === 1 ? ' set' : ' sets') + ' here. Add or drop rows as the session actually goes.' }));

    const next = el('button','btn primary block','Next');
    next.style.marginTop = '14px';
    next.disabled = !anyReps();
    next.onclick = () => { step = 1; drawStep(); };
    inner.append(next);
    inner.append(Object.assign(el('p','tiny'), { textContent:
      'Log at least one set to carry on. Three short questions follow, one at a time.' }));
  }

  // A new row starts at the weight you last actually used, not a blank box.
  function lastLoggedLoad(draft, plan) {
    for (let i = draft.sets.length - 1; i >= 0; i--) {
      const v = Number(draft.sets[i].load);
      if (v > 0) return v;
    }
    return plan.load || '';
  }

  function anyReps() { return d.sets.some(x => x.reps !== '' && Number(x.reps) > 0); }

  function drawQ(q, sub, opts, val, pick) {
    inner.append(el('div','q', q));
    inner.append(Object.assign(el('div','qs'), { textContent: sub }));
    const g = optGroup(opts, val, pick);
    g.classList.add('triple');
    inner.append(g);
    const back = el('button','btn sm ghost','Back');
    back.onclick = () => { step--; drawStep(); };
    inner.append(back);
  }

  function drawJoint(ex) {
    inner.append(el('div','q','Any joint pain?'));
    inner.append(Object.assign(el('div','qs'), { textContent:
      'Muscle burn is fine, joints are not. Mild is noted. Mild twice running offers a swap. Moderate offers one now. Sharp stops the lift.' }));
    const sev = optGroup(JOINT_LEVELS.map(j => [j.sev, j.label]),
      d.joint ? d.joint.sev : 0, v => {
        d.joint = v === 0 ? null : { sev: v, joint: (d.joint && d.joint.joint) || null };
        save(); drawStep();
      }, true);
    sev.classList.add('triple');
    inner.append(sev);

    if (d.joint) {
      inner.append(Object.assign(el('div','qs'), { textContent: 'Which joint?' }));
      // Put the joints this lift actually loads first, and grey the rest. A leg
      // press cannot give you wrist pain, and offering all six in a fixed order
      // invites a mis-tap that quarantines the wrong movement.
      const cost = j => (ex.joints && ex.joints[j]) || 0;
      const ordered = JOINTS.slice().sort((a, b) => cost(b) - cost(a));
      const grid = el('div','jointgrid');
      ordered.forEach(j => {
        const o = el('button','opt' + (cost(j) ? '' : ' faint')); o.type = 'button';
        o.textContent = jointName(j);
        o.title = cost(j) ? jointName(j) + ' takes load on this lift'
                          : ex.name + ' does not normally load the ' + jointName(j);
        o.setAttribute('aria-pressed', String(d.joint.joint === j));
        o.onclick = () => { d.joint.joint = j; save(); drawStep(); };
        grid.append(o);
      });
      inner.append(grid);

      if (d.joint.joint) {
        const run = mildRun(S.sessions, p.slot, d.joint.joint);
        const act = jointAction(d.joint.sev, d.joint.joint, run);
        const sub = act.action === 'none' || act.action === 'note' ? null
          : substitute(p.exId, d.joint.joint, Object.keys(S.quarantine), EX, SUBS);
        const cls = act.action === 'stop' ? 'alert bad'
                  : act.action === 'swap' ? 'alert warn' : 'alert good';
        const a = el(act.action === 'note' ? 'div' : 'div', cls);
        let html = '<b>' + esc(act.title) + '</b>' + esc(act.body);
        if (act.action === 'swap' || act.action === 'stop') {
          html += sub
            ? '<br><br>Same slot, less ' + esc(jointName(d.joint.joint)) + ': <b>' + esc(sub.name) + '</b>'
            : '<br><br>Nothing left in this slot loads that joint less. Drop the slot for now.';
        }
        a.innerHTML = html;
        inner.append(a);

        // Moderate offers the swap and lets you decline it. Sharp takes it.
        if (act.action === 'swap' && sub) {
          const take = el('button','btn sm block','Swap to ' + sub.name);
          take.onclick = () => { d.joint.accept = true; save(); drawStep(); };
          const keep = el('button','btn sm block ghost','Keep ' + ex.name + ' for now');
          keep.onclick = () => { d.joint.accept = false; save(); drawStep(); };
          take.style.marginBottom = '6px';
          if (d.joint.accept === undefined) { inner.append(take); inner.append(keep); }
          else {
            inner.append(Object.assign(el('p','tiny'), { textContent: d.joint.accept
              ? 'Swapping to ' + sub.name + ' when you finish the session.'
              : 'Keeping ' + ex.name + '. The app will ask again if it happens next session.' }));
          }
        }
      }
    }

    const ready = !d.joint || !!d.joint.joint;
    const done = el('button','btn primary block','Done with this lift');
    done.style.marginTop = '8px';
    done.disabled = !ready;
    done.onclick = () => { d.done = true; save(); closeSheet(); render(); };
    inner.append(done);
    if (!ready) inner.append(Object.assign(el('p','tiny'), { textContent: 'Pick which joint first.' }));
    const back = el('button','btn sm ghost','Back');
    back.style.marginTop = '8px';
    back.onclick = () => { step = 2; drawStep(); };
    inner.append(back);
  }
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

const jointName = j => j === 'lowback' ? 'low back' : j;
function jointSummary(ex) {
  const cost = j => (ex.joints && ex.joints[j]) || 0;
  const hi = JOINTS.filter(j => cost(j) === 2);
  const mod = JOINTS.filter(j => cost(j) === 1);
  if (hi.length) return 'Demanding on the ' + hi.map(jointName).join(' and ');
  if (mod.length) return 'Moderate on the ' + mod.map(jointName).join(', ');
  return 'Low joint stress';
}

function applySwap(p, exId, onDone) {
  // Sets logged against the old lift cannot follow it: reps of a leg press are
  // not reps of a belt squat, and the progression engine would read them as if
  // they were. So they go — but not silently, because they are work you did.
  const d = S.draft && S.draft.entries[p.slot];
  const loggedSets = d ? d.sets.filter(x => x.reps !== '' && Number(x.reps) > 0).length : 0;
  if (loggedSets) {
    const old = byId(p.exId), nu = byId(exId);
    if (!confirm('You have ' + loggedSets + ' set' + (loggedSets > 1 ? 's' : '') +
                 ' logged against ' + old.name + '.\n\nSwapping to ' + nu.name +
                 ' discards them, because those reps are not reps of the new lift.\n\nSwap anyway?')) return;
  }
  p.exId = exId; p.load = null; p.misses = 0;
  if (d) delete S.draft.entries[p.slot];
  save(); closeSheet();
  if (onDone) onDone(); else render();
}

let sheetEl = null;
function closeSheet() {
  if (sheetEl) { sheetEl.remove(); sheetEl = null; }
  document.removeEventListener('keydown', onSheetKey);
}

/* Put a sheet into the document at the vertical position of whatever opened it.
 * The element that opened it was on screen when it was tapped, so the panel
 * lands in view without the app needing to know where the viewport is — which
 * it cannot know inside a frame that is sized to its own content. Nothing is
 * scroll-locked; the page keeps working underneath. */
let lastTapY = null;
document.addEventListener('pointerdown', e => {
  const r = e.target && e.target.getBoundingClientRect && e.target.getBoundingClientRect();
  if (r) lastTapY = r.top + docScroll();
}, true);

function docScroll() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function mountSheet(anchorEl) {
  document.body.append(sheetEl);
  let top;
  if (anchorEl && anchorEl.getBoundingClientRect) {
    top = anchorEl.getBoundingClientRect().top + docScroll();
  } else if (lastTapY != null) {
    top = lastTapY;
  } else {
    top = docScroll();
  }
  sheetEl.style.top = Math.max(8, Math.round(top) - 6) + 'px';
  document.addEventListener('keydown', onSheetKey);
  // Bring it into view in whichever container is actually doing the scrolling.
  requestAnimationFrame(() => {
    try { sheetEl.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {}
  });
}
function onSheetKey(e) { if (e.key === 'Escape') closeSheet(); }

function openSwap(p, onDone, anchorEl) {
  closeSheet();
  const slot = SLOTS.find(s => s.id === p.slot);
  const order = (SUBS[p.slot] || []).slice();
  // any custom lifts the user added to this slot, even if not in the preference list
  EX.filter(e => e.slot === p.slot && !order.includes(e.id)).forEach(e => order.push(e.id));

  sheetEl = el('div','sheet');
  sheetEl.setAttribute('role','dialog');
  sheetEl.setAttribute('aria-modal','true');
  sheetEl.setAttribute('aria-label','Swap exercise');
  sheetEl.onclick = e => { if (e.target === sheetEl) { closeSheet(); if (onDone) onDone(); else render(); } };

  const inner = el('div','sheet-inner');
  const head = el('div','sheet-h');
  const ttl = el('div');
  ttl.append(el('div','ex-slot', slot.name + ' \u00b7 ' + slot.muscles.join(', ')));
  ttl.append(Object.assign(el('h2'), { textContent: 'Swap this lift' }));
  head.append(ttl);
  head.append(el('div','spacer'));
  const x = el('button','btn sm ghost','Back');
  x.onclick = () => { closeSheet(); if (onDone) onDone(); else render(); };
  head.append(x);
  inner.append(head);
  inner.append(Object.assign(el('p','hint'), { textContent:
    'Everything here trains the same muscles. Listed gentlest on the joints first, so if something hurts, work down from the top.' }));

  order.forEach(id => {
    const cand = byId(id);
    if (!cand) return;
    const isCur = id === p.exId;
    const rest = S.quarantine[id];
    const row = el('button','sheetrow' + (isCur ? ' cur' : ''));
    row.type = 'button';
    // The lift you are already on has nothing to do. It used to render as an
    // ordinary enabled button that silently ignored taps, which reads as the app
    // freezing rather than as "you are already here".
    row.disabled = !!rest || isCur;
    const left = el('div');
    left.append(el('div','sheetrow-n', cand.name));
    left.append(el('div','sheetrow-m',
      rest ? 'Resting ' + rest + ' more session' + (rest > 1 ? 's' : '') + ' after a joint flag'
           : jointSummary(cand)));
    row.append(left);
    row.append(el('div','spacer'));
    if (isCur) row.append(el('span','badge','Current'));
    else if (!rest) row.append(el('span','chev','\u2192'));
    if (!isCur && !rest) row.onclick = () => applySwap(p, id, onDone);
    inner.append(row);
  });

  // --- custom lift ---
  const cwrap = el('div','custom');
  cwrap.append(el('div','q','Not on the list?'));
  cwrap.append(Object.assign(el('div','qs'), { textContent:
    'Type whatever the machine is actually called at Crunch. It joins this slot permanently and progresses like any other lift.' }));
  const crow = el('div','row');
  const ci = el('input'); ci.type = 'text'; ci.placeholder = 'e.g. Hammer Strength iso row';
  ci.style.textAlign = 'left'; ci.id = 'customLift';
  ci.setAttribute('aria-label','Name of your own exercise');
  crow.append(ci);
  const cb = el('button','btn primary sm','Add');
  cb.onclick = () => {
    const name = ci.value.trim();
    if (!name) { ci.focus(); return; }
    applySwap(p, addCustomEx(name, p.slot).id, onDone);
  };
  ci.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); cb.click(); } };
  crow.append(cb);
  cwrap.append(crow);
  cwrap.append(Object.assign(el('p','tiny'), { textContent:
    'A custom lift starts with no joint profile, so it will not be offered automatically as a substitute until you tell it what hurts.' }));
  inner.append(cwrap);

  sheetEl.append(inner);
  mountSheet(anchorEl);
  x.focus();
}

// One place that mints a custom lift, used by both the swap sheet and the
// add-a-lift picker.
function addCustomEx(name, slot) {
  const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,28) + '_' + Date.now().toString(36).slice(-4);
  const custom = { id, slot, name, inc: 5, custom: true, equip: 'custom',
                   joints: { shoulder:1, elbow:1, wrist:1, lowback:1, hip:1, knee:1 },
                   cue: 'Your lift. Same rules: control the weight, stop the set at the target reps left in the tank.',
                   video: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' proper form') };
  S.custom = S.custom || [];
  S.custom.push(custom);
  registerCustom();
  return custom;
}

// Custom lifts live in state and are merged back into the library on every boot.
function registerCustom() {
  (S.custom || []).forEach(c => {
    if (!EX.find(e => e.id === c.id)) EX.push(c);
    if (SUBS[c.slot] && !SUBS[c.slot].includes(c.id)) SUBS[c.slot].push(c.id);
  });
}

function finishSession() {
  const dayIdx = S.draft.day;
  const day = S.days[dayIdx];
  const plan = day.slots;
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

    // Joint first, because it overrides everything the load engine would say.
    // Sharp is not negotiable. Moderate, and mild for the second session running,
    // are offered and can be declined; declining is recorded, not ignored.
    const jAct = d.joint && d.joint.joint
      ? jointAction(d.joint.sev, d.joint.joint, mildRun(S.sessions, p.slot, d.joint.joint))
      : { action: 'none' };
    const pulling = jAct.action === 'stop' || (jAct.action === 'swap' && d.joint.accept === true);

    if (pulling) {
      const sub = substitute(p.exId, d.joint.joint, Object.keys(S.quarantine), EX, SUBS);
      S.quarantine[p.exId] = 3;
      if (sub) {
        changes.push(`${ex.name} is out for 3 sessions. ${sub.name} takes the ${SLOTS.find(s=>s.id===p.slot).name.toLowerCase()} slot.`);
        p.exId = sub.id; p.load = null; p.misses = 0;
      } else {
        changes.push(`${ex.name} pulled. No substitute left in that slot, so it is dropped for now.`);
      }
      entries.push({ exId: ex.id, slot: p.slot, sets, pump: d.pump, readiness: d.readiness,
                     joint: d.joint, loadProgressed: false, perfDown: false });
      return;
    }
    if (jAct.action === 'swap') {
      changes.push(`${ex.name}: ${jAct.title.toLowerCase()}, swap declined. Asked again next session.`);
    }
    if (sets.length) {
      const r = nextLoad(sets, target, ex, p.misses || 0, S.profile.level);
      const progressed = r.load > (p.load || 0);
      p.load = r.load; p.misses = r.misses;
      const vd = volumeDecision(
        slotHistory(p.slot), { readiness: d.readiness || 1, jointMax: d.joint ? d.joint.sev : 0 },
        S.profile.goal, p.sets);
      if (vd.delta) { p.sets = Math.max(1, p.sets + vd.delta); changes.push(`${ex.name}: ${vd.note}.`); }
      changes.push(`${ex.name}: ${r.note}.`);
      entries.push({ exId: ex.id, slot: p.slot, sets, pump: d.pump, readiness: d.readiness,
                     joint: d.joint, loadProgressed: progressed, note: r.note,
                     nextLoad: p.load, perfDown: sets.some(s => s.reps < p.repLow - 1) });
      return;
    }
    entries.push({ exId: ex.id, slot: p.slot, sets, pump: d.pump, readiness: d.readiness,
                   joint: d.joint, loadProgressed: false, perfDown: false });
  });

  if (!entries.length) { alert('Nothing logged yet.'); return; }

  S.sessions.push({ date: today(), day: dayIdx, name: day.name, week: S.week, entries });
  Object.keys(S.quarantine).forEach(id => { if (--S.quarantine[id] <= 0) delete S.quarantine[id]; });
  const wasLast = dayIdx === S.days.length - 1;
  S.cur = wasLast ? 0 : dayIdx + 1;
  if (wasLast) S.week = S.week >= blockWeeks() ? 1 : S.week + 1;
  S.draft = null;
  save();

  S.lastSummary = { date: today(), name: day.name, week: S.week, lines: changes };
  save();
  current = 'train'; window.scrollTo(0, 0); render();
}

function lastFor(slot, exId) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const e = S.sessions[i].entries.find(x => x.slot === slot && x.exId === exId);
    if (e && e.sets && e.sets.length) return Object.assign({ date: S.sessions[i].date }, e);
  }
  return null;
}

function slotHistory(slot) {
  return S.sessions.slice().reverse()
    .map(s => s.entries.find(e => e.slot === slot))
    .filter(Boolean)
    .map(e => ({ loadProgressed: !!e.loadProgressed }));
}

/* ---- new mesocycle wizard ---- */
const SLOT_MUSCLE = { squat:'Quads', hpress:'Chest', vpull:'Lats', hinge:'Hams & glutes',
                      hpull:'Mid-back', vpress:'Delts', arms:'Arms', calves:'Calves', core:'Core',
                      biceps:'Biceps', triceps:'Triceps', unilat:'Single leg' };

function openMesoWizard(opts, anchorEl) {
  closeSheet();
  const onboarding = !!(opts && opts.onboarding);
  let step = onboarding ? 0 : 1;
  let days = (S.setup && S.setup.days) || 3;
  let minutes = (S.setup && S.setup.minutes) || 50;
  let weeks = (S.setup && S.setup.weeks) || 8;
  let level = S.profile.level || 'inter';
  let goal = S.profile.goal || 'gain';
  let programId = S.profile.programId || 'fullclassic';
  let draft = null;

  sheetEl = el('div','sheet');
  sheetEl.setAttribute('role','dialog');
  sheetEl.setAttribute('aria-modal','true');
  sheetEl.setAttribute('aria-label', onboarding ? 'Set up Kanon' : 'Build a new mesocycle');
  if (!onboarding) sheetEl.onclick = e => { if (e.target === sheetEl) { closeSheet(); render(); } };
  const inner = el('div','sheet-inner');
  sheetEl.append(inner);
  mountSheet(anchorEl);
  if (onboarding) document.removeEventListener('keydown', onSheetKey);
  draw();

  function matches() {
    const m = programsFor({ level, days, minutes });
    const list = m.length ? m : PROGRAMS.filter(p => p.levels.includes(level));
    // You said build muscle. The ones that actually get the most muscles to ten
    // hard sets a week, at the days and minutes you have, go to the top.
    return list.map(pr => {
      const sc = programScore({ programId: pr.id, days, minutes, level, goal, weeks }, EX, SUBS, SLOTS);
      return { pr, clears: sc.clears, total: sc.total, lowest: sc.lowest };
    }).sort((a, b) => goal === 'gain'
      ? (b.clears - a.clears) || (b.lowest - a.lowest)
      : 0);
  }

  function header(kicker, title) {
    const head = el('div','sheet-h');
    const t = el('div');
    t.append(el('div','ex-slot', kicker));
    t.append(Object.assign(el('h2'), { textContent: title }));
    head.append(t); head.append(el('div','spacer'));
    if (!onboarding) {
      const x = el('button','btn sm ghost','Close');
      x.onclick = () => { closeSheet(); render(); };
      head.append(x);
    }
    inner.append(head);
    const rail = el('div','steps');
    (onboarding ? ['You','Schedule','Programme','Review'] : ['Schedule','Programme','Review'])
      .forEach((label, i) => {
        const idx = onboarding ? i : i + 1;
        rail.append(el('span','step' + (idx === step ? ' on' : idx < step ? ' past' : ''), label));
      });
    inner.append(rail);
  }

  function nav(backTo, nextTo, nextLabel, guard) {
    const row = el('div','row');
    row.style.marginTop = '16px';
    if (backTo !== null) {
      const b = el('button','btn ghost','Back');
      b.onclick = () => { step = backTo; draw(); };
      row.append(b);
    }
    const n = el('button','btn primary','' + nextLabel);
    n.style.flex = '1';
    if (guard && !guard()) n.disabled = true;
    n.onclick = () => { step = nextTo; draw(); };
    row.append(n);
    inner.append(row);
  }

  function numField(label, value, onChange, suffix, bounds) {
    const wrap = el('div');
    wrap.style.flex = '1 1 90px';
    wrap.append(el('div','lbl', label));
    const i = el('input'); i.type = 'number'; i.inputMode = 'decimal';
    if (bounds) { i.min = String(bounds[0]); i.max = String(bounds[1]); }
    i.value = value == null ? '' : value;
    i.oninput = () => onChange(i.value);
    // Clamp when they leave the field rather than while typing, so entering
    // "5" on the way to "50" does not get yanked to the minimum mid-keystroke.
    i.onblur = () => {
      if (!bounds) return;
      const c = clamp(i.value, bounds);
      if (String(c) !== i.value) { i.value = c; onChange(c); }
      draw();
    };
    wrap.append(i);
    if (suffix) wrap.append(el('div','lbl', suffix));
    return wrap;
  }

  function draw() {
    draft = buildProgram({ programId, days, minutes, level, goal, weeks }, EX, SUBS);
    inner.innerHTML = '';
    if (step === 0) drawYou();
    if (step === 1) drawSchedule();
    if (step === 2) drawPrograms();
    if (step === 3) drawReview();
    inner.scrollTop = 0;
  }

  /* ---- step 0: who is lifting ---- */
  function drawYou() {
    header('First run', 'About you');
    inner.append(Object.assign(el('p','hint'), { textContent:
      'Six answers. They set the starting loads, the protein target, the body-fat estimate and which programmes are offered. Edit any of it later in Settings. None of it leaves this device.' }));

    inner.append(el('div','eyebrow','Header figure'));
    const figs = el('div','opts triple');
    [['male','Male'],['female','Female'],['none','None']].forEach(([v, lab]) => {
      const b = el('button','opt', lab); b.type = 'button';
      b.setAttribute('aria-pressed', String((S.profile.figure || 'male') === v));
      b.onclick = () => { S.profile.figure = v; save(); draw(); };
      figs.append(b);
    });
    inner.append(figs);

    inner.append(el('div','eyebrow','Sex, for the body-fat and protein maths'));
    const sx = el('div','opts triple');
    [['male','Male'],['female','Female']].forEach(([v, lab]) => {
      const b = el('button','opt', lab); b.type = 'button';
      b.setAttribute('aria-pressed', String(S.profile.sex === v));
      b.onclick = () => { S.profile.sex = v; save(); draw(); };
      sx.append(b);
    });
    inner.append(sx);

    inner.append(el('div','eyebrow','Age, height and weight'));
    const row = el('div','row wrap');
    row.append(numField('Age', S.profile.age,
      v => { S.profile.age = v === '' ? '' : Number(v); save(); }, null, BOUNDS.age));
    const ft = Math.floor((Number(S.profile.heightIn) || 0) / 12) || '';
    const inch = S.profile.heightIn ? round1(Number(S.profile.heightIn) - (ft || 0) * 12) : '';
    let f = ft, n2 = inch;
    const setH = () => {
      const t2 = round1((Number(f) || 0) * 12 + (Number(n2) || 0));
      S.profile.heightIn = t2 || '';
      save();
    };
    row.append(numField('Feet', ft, v => { f = v; setH(); }, null, BOUNDS.feet));
    row.append(numField('Inches', inch, v => { n2 = v; setH(); }, null, BOUNDS.inches));
    const wB = [round1(disp(BOUNDS.weightLb[0])), round1(disp(BOUNDS.weightLb[1]))];
    row.append(numField('Weight', S.profile.startWeight ? disp(S.profile.startWeight) : '',
      v => { S.profile.startWeight = v === '' ? '' : stored(v); save(); }, uLabel(), wB));
    inner.append(row);

    if (!profileComplete(S.profile)) {
      inner.append(Object.assign(el('div','alert warn'), { innerHTML:
        '<b>Age, height and weight are needed before the rest works</b>' +
        'They drive the protein target, the body-fat estimate and the rate-of-loss check.' }));
    }

    inner.append(el('div','eyebrow','Units'));
    const un = el('div','opts triple');
    [['lb','Pounds'],['kg','Kilograms']].forEach(([v, lab]) => {
      const b = el('button','opt', lab); b.type = 'button';
      b.setAttribute('aria-pressed', String(U() === v));
      b.onclick = () => { S.profile.unit = v; save(); draw(); };
      un.append(b);
    });
    inner.append(un);

    inner.append(el('div','eyebrow','Lifting experience'));
    inner.append(Object.assign(el('div','qs'), { textContent:
      'The answer that changes the programme most. It sets your starting volume and how hard a load increase is to earn.' }));
    LEVELS.forEach(L => {
      const b = el('button','sheetrow' + (level === L.id ? ' cur' : ''));
      b.type = 'button';
      const t = el('div');
      t.append(el('div','sheetrow-n', L.name));
      t.append(el('div','sheetrow-m', L.sub + ' · starts at ' + L.weekLow + ' to ' + L.weekHigh + ' sets per muscle per week'));
      b.append(t);
      b.onclick = () => { level = L.id; S.profile.level = L.id; save(); draw(); };
      inner.append(b);
    });

    nav(null, 1, 'Next', () => profileComplete(S.profile));
  }

  /* ---- step 1: schedule ---- */
  function drawSchedule() {
    header(onboarding ? 'First run' : 'A block, then a deload', 'Your schedule');

    inner.append(el('div','eyebrow','Goal'));
    const gr = el('div','opts triple');
    [['gain','Build muscle'],['cut','Lose fat'],['maintain','Maintain']].forEach(([v, lab]) => {
      const b = el('button','opt', lab); b.type = 'button';
      b.setAttribute('aria-pressed', String(goal === v));
      b.onclick = () => { goal = v; S.profile.goal = v; save(); draw(); };
      gr.append(b);
    });
    inner.append(gr);

    inner.append(el('div','eyebrow','Days per week'));
    const dr = el('div','opts triple');
    [2,3,4,5,6].forEach(nn => {
      const b = el('button','opt', String(nn)); b.type = 'button';
      b.setAttribute('aria-pressed', String(days === nn));
      b.onclick = () => { days = nn; draw(); };
      dr.append(b);
    });
    inner.append(dr);

    inner.append(el('div','eyebrow','Time per session'));
    const mr = el('div','opts triple');
    [30,45,60,75,90].forEach(nn => {
      const b = el('button','opt', nn + ' min'); b.type = 'button';
      b.setAttribute('aria-pressed', String(minutes === nn));
      b.onclick = () => { minutes = nn; draw(); };
      mr.append(b);
    });
    inner.append(mr);

    inner.append(el('div','eyebrow','Length of the block'));
    const wr = el('div','opts triple');
    BLOCK_LENGTHS.forEach(nn => {
      const b = el('button','opt', nn + ' wk'); b.type = 'button';
      b.setAttribute('aria-pressed', String(weeks === nn));
      b.onclick = () => { weeks = nn; draw(); };
      wr.append(b);
    });
    inner.append(wr);
    inner.append(Object.assign(el('p','tiny'), { textContent:
      weeks + ' weeks, the last one a deload. Effort ramps from ' + blockRir(1, weeks) +
      ' reps left in the tank down to ' + blockRir(weeks - 1, weeks) + ' in week ' + (weeks - 1) + '.' }));

    // Not an estimate: build every programme that fits this schedule and report
    // the best result any of them actually achieves.
    const cap = weekCapacity({ days, minutes, level, goal });
    const best = matches().reduce((hi, m) => Math.max(hi, m.clears), 0);
    const total = MAJOR_MUSCLES.length;
    const box = el('div','alert ' + (goal !== 'gain' ? 'good' : best >= total ? 'good' : best >= total / 2 ? 'warn' : 'bad'));
    let txt = '<b>' + days + ' days at ' + minutes + ' minutes is ' + cap.weeklySets + ' working sets a week</b>';
    if (goal !== 'gain') {
      txt += 'Enough to hold what you have and push the priorities.';
    } else if (best >= total) {
      txt += 'Enough to get all ' + total + ' major muscles to ten hard sets a week. Any of the top programmes will build across the board.';
    } else {
      txt += 'The best programme available at this schedule gets ' + best + ' of ' + total +
             ' major muscles to ten hard sets a week. The rest hold at maintenance. ' +
             'Add a day, or fifteen minutes, to close the gap.';
    }
    box.innerHTML = txt;
    inner.append(box);

    nav(onboarding ? 0 : null, 2, 'See programmes');
  }

  /* ---- step 2: the library ---- */
  function drawPrograms() {
    const list = matches();
    header(list.length + ' programmes fit', 'Pick a programme');
    inner.append(Object.assign(el('p','hint'), { textContent: goal === 'gain'
      ? 'Ranked by how many of the nine major muscles reach ten hard sets a week at ' + days +
        ' days and ' + minutes + ' minutes. The lifts inside any of them are swappable afterwards.'
      : 'Filtered to ' + levelById(level).name.toLowerCase() + ', ' + days + ' days a week, ' + minutes +
        ' minute sessions. The lifts inside any of them are swappable afterwards.' }));
    if (!list.find(x => x.pr.id === programId)) programId = list[0].pr.id;

    list.forEach(({ pr, clears, total }) => {
      const b = el('button','sheetrow' + (programId === pr.id ? ' cur' : ''));
      b.type = 'button';
      const t = el('div');
      const n = el('div','sheetrow-n');
      n.append(document.createTextNode(pr.name));
      if (goal === 'gain') {
        const tag = el('span','scoretag' + (clears >= total ? ' full' : clears >= total / 2 ? ' ok' : ''));
        tag.textContent = clears + '/' + total;
        n.append(tag);
      }
      t.append(n);
      t.append(el('div','sheetrow-m', pr.blurb));
      b.append(t);
      b.onclick = () => { programId = pr.id; draw(); };
      inner.append(b);
    });
    if (goal === 'gain') inner.append(Object.assign(el('p','tiny'), { textContent:
      'Ten hard sets a week is the floor the research supports for growth. Below it a muscle holds rather than grows.' }));

    nav(1, 3, 'Build it');
  }

  /* ---- step 3: review and start ---- */
  function drawReview() {
    const pr = programById(programId);
    header(pr.name, onboarding ? 'Your first block' : 'New mesocycle');
    inner.append(Object.assign(el('p','hint'), { textContent: pr.blurb }));

    const vol = muscleVolume(draft, SLOTS);
    const L = levelById(level);
    inner.append(el('div','eyebrow','Hard sets per muscle, per week'));
    inner.append(Object.assign(el('div','qs'), { textContent:
      'Counted fractionally: a press is a full set for the chest, half for the triceps and front delts. Your band at ' +
      L.name.toLowerCase() + ' is ' + L.weekLow + ' to ' + L.weekHigh +
      '. Ten a week is the floor the research supports for growth; below that maintains rather than builds.' }));
    const vg = el('div','volgrid');
    const rank = m => (MAJOR_MUSCLES.indexOf(m) < 0 ? 1 : 0);
    Object.entries(vol)
      .sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1])
      .forEach(([m, n]) => {
        const major = MAJOR_MUSCLES.indexOf(m) >= 0;
        const cell = el('div','volcell' + (!major ? ' minor' : n >= 10 ? ' good' : n >= 6 ? ' ok' : ' low'));
        cell.append(Object.assign(el('span','volnum'), { textContent: String(n) }));
        cell.append(Object.assign(el('span','vollbl'), { textContent: MUSCLE_NAME[m] || m }));
        vg.append(cell);
      });
    inner.append(vg);
    // Ten a week is the evidence floor and the pass mark. The level band is
    // shown as context, because holding a two-day programme to an advanced
    // lifter's twenty would flag everything and teach you to ignore the flag.
    const under = Object.entries(vol)
      .filter(([m, n]) => MAJOR_MUSCLES.indexOf(m) >= 0 && n < 10).length;
    const verdict = el('div','alert ' + (under === 0 ? 'good' : under <= 3 ? 'warn' : 'bad'));
    verdict.innerHTML = under === 0
      ? '<b>Every major muscle clears ten sets a week</b>This builds across the board. Your band at ' +
        L.name.toLowerCase() + ' runs to ' + L.weekHigh + ', so there is room to add if a lift stalls.'
      : '<b>' + (MAJOR_MUSCLES.length - under) + ' of ' + MAJOR_MUSCLES.length +
        ' major muscles clear ten sets a week</b>The rest hold at maintenance. ' +
        (days <= 2
          ? 'Two days a week buys the sets for that and no more.'
          : minutes <= 35
          ? 'Thirty minute sessions buy about seven working sets each. There is no arrangement of seven that reaches ten everywhere.'
          : 'A day or fifteen minutes more closes most of the gap.');
    inner.append(verdict);

    inner.append(el('div','eyebrow','The sessions'));
    draft.forEach(d => {
      const card = el('div','daycard');
      const h = el('div','row');
      h.append(Object.assign(el('span','lift-n'), { textContent: d.name }));
      h.append(el('span','spacer'));
      h.append(Object.assign(el('span','lift-t'), { textContent: '~' + d.minutes + ' min · ' + d.slots.length + ' lifts' }));
      card.append(h);
      d.slots.forEach(p2 => {
        const r = el('div','planrow');
        const b2 = el('span','lift-b');
        b2.append(el('span','ex-slot', (SLOTS.find(x => x.id === p2.slot) || {}).name || p2.slot));
        b2.append(el('span','lift-n', byId(p2.exId).name));
        r.append(b2);
        r.append(el('span','spacer'));
        r.append(Object.assign(el('span','lift-t'), { textContent: p2.sets + '×' + p2.repLow + '–' + p2.repHigh }));
        card.append(r);
      });
      inner.append(card);
    });

    const go = el('button','btn primary block', onboarding ? 'Start lifting' : 'Start this mesocycle');
    go.style.marginTop = '14px';
    go.onclick = () => {
      if (!onboarding && !confirm('Replace your current programme and restart at week 1?\n\nLogged sessions and bodyweight history are kept.')) return;
      S.days = draft.map(d => ({ name: d.name, slots: d.slots }));
      S.setup = { days, minutes, weeks };
      S.profile.level = level; S.profile.goal = goal; S.profile.programId = programId;
      S.profile.onboarded = true;
      S.week = 1; S.cur = 0; S.draft = null; S.preview = null; S.lastSummary = null;
      save(); closeSheet(); current = 'train'; render();
    };
    const back = el('button','btn block ghost','Back');
    back.style.marginTop = '8px';
    back.onclick = () => { step = 2; draw(); };
    inner.append(go); inner.append(back);
    inner.append(Object.assign(el('p','tiny'), { textContent:
      'Once the block is running you can swap any lift, add a body group to any day, and drag the order around. Logged history and weigh-ins are never touched.' }));
  }
}

/* ---- add a body group, then a lift for it, to one session ---- */
function openAddSlot(dayIdx, anchorEl) {
  closeSheet();
  let slot = null;
  sheetEl = el('div','sheet');
  sheetEl.setAttribute('role','dialog');
  sheetEl.setAttribute('aria-modal','true');
  sheetEl.setAttribute('aria-label','Add a lift');
  sheetEl.onclick = e => { if (e.target === sheetEl) { closeSheet(); render(); } };
  const inner = el('div','sheet-inner');
  sheetEl.append(inner);
  mountSheet(anchorEl);
  draw();

  function draw() {
    inner.innerHTML = '';
    const head = el('div','sheet-h');
    const t = el('div');
    t.append(el('div','ex-slot', S.days[dayIdx].name));
    t.append(Object.assign(el('h2'), { textContent: slot ? 'Pick a lift' : 'Add a body group' }));
    head.append(t); head.append(el('div','spacer'));
    const x = el('button','btn sm ghost','Close');
    x.onclick = () => { closeSheet(); render(); };
    head.append(x);
    inner.append(head);

    if (!slot) {
      inner.append(Object.assign(el('p','hint'), { textContent:
        'One slot, this session only. It counts toward your weekly sets. It does not change the planned volume of the lifts already there.' }));
      const already = new Set(S.days[dayIdx].slots.map(p => p.slot));
      SLOTS.forEach(sl => {
        const n = (SUBS[sl.id] || []).length;
        if (!n) return;
        const b = el('button','sheetrow'); b.type = 'button';
        const d2 = el('div');
        d2.append(el('div','sheetrow-n', sl.name));
        d2.append(el('div','sheetrow-m', n + ' lifts' +
          (already.has(sl.id) ? ' · already in this session' : '')));
        b.append(d2);
        b.append(el('span','spacer'));
        b.append(el('span','chev','›'));
        b.onclick = () => { slot = sl.id; draw(); };
        inner.append(b);
      });
      return;
    }

    const sl = SLOTS.find(x2 => x2.id === slot);
    inner.append(Object.assign(el('p','hint'), { textContent:
      'Ordered by how much they ask of the joints, gentlest first.' }));
    (SUBS[slot] || []).forEach(id => {
      const ex = byId(id);
      if (!ex) return;
      const b = el('button','sheetrow'); b.type = 'button';
      const d2 = el('div');
      d2.append(el('div','sheetrow-n', ex.name));
      d2.append(el('div','sheetrow-m', (ex.equip || '') + ' · ' + ex.cue));
      b.append(d2);
      b.onclick = () => { commit(ex); };
      inner.append(b);
    });

    const custom = el('div','custom');
    custom.append(el('div','eyebrow','Not in the list'));
    const ci = el('input'); ci.type = 'text'; ci.id = 'addCustom';
    ci.placeholder = 'Name of the machine or lift';
    ci.style.textAlign = 'left';
    custom.append(ci);
    const cb = el('button','btn sm block','Add it');
    cb.style.marginTop = '8px';
    cb.onclick = () => {
      const name = ci.value.trim();
      if (!name) { ci.focus(); return; }
      commit(addCustomEx(name, slot));
    };
    custom.append(cb);
    inner.append(custom);

    const back = el('button','btn block ghost','Back to body groups');
    back.style.marginTop = '12px';
    back.onclick = () => { slot = null; draw(); };
    inner.append(back);
  }

  function commit(ex) {
    const sh = sessionShape({ minutes: (S.setup && S.setup.minutes) || 50,
                              level: S.profile.level, goal: S.profile.goal });
    const iso = ['biceps','triceps','calves','core','arms'].includes(ex.slot);
    S.days[dayIdx].slots.push({
      slot: ex.slot, exId: ex.id, sets: sh.setsOther,
      repLow: iso ? sh.isoLow : sh.repLow, repHigh: iso ? sh.isoHigh : sh.repHigh,
      load: null, misses: 0, primary: false
    });
    save(); closeSheet(); render();
  }
}

/* ---- week / session picker ---- */
function openPlanPicker(anchorEl) {
  closeSheet();
  let week = S.preview ? S.preview.week : S.week;
  let dayIdx = S.preview ? S.preview.day : S.cur;

  sheetEl = el('div','sheet');
  sheetEl.setAttribute('role','dialog');
  sheetEl.setAttribute('aria-modal','true');
  sheetEl.setAttribute('aria-label','Choose week and session');
  sheetEl.onclick = e => { if (e.target === sheetEl) { closeSheet(); render(); } };
  const inner = el('div','sheet-inner');
  sheetEl.append(inner);
  mountSheet(anchorEl);
  draw();

  function draw() {
    inner.innerHTML = '';
    const head = el('div','sheet-h');
    const t = el('div');
    t.append(el('div','ex-slot','The mesocycle'));
    t.append(Object.assign(el('h2'), { textContent: 'Week and session' }));
    head.append(t);
    head.append(el('div','spacer'));
    const x = el('button','btn sm ghost','Close');
    x.onclick = () => { closeSheet(); render(); };
    head.append(x);
    inner.append(head);

    inner.append(el('div','eyebrow','Week'));
    const wr = el('div','opts triple');
    Array.from({ length: blockWeeks() }, (_, i) => i + 1).forEach(n => {
      const b = el('button','opt', deloadWeekNow(n) ? n + ' \u00b7 deload' : String(n));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(week === n));
      b.onclick = () => { week = n; draw(); };
      wr.append(b);
    });
    inner.append(wr);

    inner.append(el('div','eyebrow','Session'));
    const sr = el('div','opts triple');
    S.days.forEach((d, i) => {
      const b = el('button','opt', d.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(dayIdx === i));
      b.onclick = () => { dayIdx = i; draw(); };
      sr.append(b);
    });
    inner.append(sr);

    inner.append(Object.assign(el('p','qs'), { textContent: weekBlurb(week) }));
    const list = el('div','planlist');
    S.days[dayIdx].slots.forEach((p, i) => {
      const r = el('div','planrow');
      r.append(el('span','lift-i', String(i + 1)));
      const b2 = el('span','lift-b');
      b2.append(el('span','ex-slot', SLOTS.find(s2 => s2.id === p.slot).name));
      b2.append(el('span','lift-n', byId(p.exId).name));
      r.append(b2);
      r.append(el('span','spacer'));
      const n = setsThisWeek(week, p);
      r.append(Object.assign(el('span','lift-t'), {
        textContent: n + ' \u00d7 ' + p.repLow + '\u2013' + p.repHigh + ' @ ' + rirForWeek(week) + ' RIR' }));
      list.append(r);
    });
    inner.append(list);

    const isCurrent = week === S.week && dayIdx === S.cur;
    const go = el('button','btn primary block',
      isCurrent ? 'This is your current session' : 'Preview this');
    go.disabled = isCurrent;
    go.style.marginTop = '14px';
    go.onclick = () => { S.preview = { week, day: dayIdx }; save(); closeSheet(); current = 'train'; render(); };
    inner.append(go);

    if (!isCurrent) {
      const set = el('button','btn block ghost','Make this my current session');
      set.style.marginTop = '8px';
      set.onclick = () => {
        S.week = week; S.cur = dayIdx; S.preview = null; S.draft = null;
        save(); closeSheet(); current = 'train'; render();
      };
      inner.append(set);
    }
    inner.append(Object.assign(el('p','tiny'), { textContent:
      'Preview looks without logging. Only "make this my current session" changes what you are actually training, and it clears any part-logged session.' }));
  }
}

/* =================== DAILY =================== */
views.daily = root => {
  const t = today();
  const d = S.daily[t] || (S.daily[t] = { water: 0, sleep: '', protein: '', weight: '' });
  const wt = latestWeight();
  const trainingDay = S.sessions.some(s => s.date === t);

  // WATER
  const targetOz = waterTargetOz(S.profile.sex, trainingDay);
  const nSeg = Math.ceil(targetOz / 8);
  const oz = d.water * 8;
  const c1 = el('div','card');
  c1.append(el('div','eyebrow','Hydration'));
  c1.append(el('h2','','Water'));

  const num = el('div','wnum');
  num.append(el('span','big', String(oz)));
  num.append(el('span','of', 'of ' + targetOz + ' oz'));
  c1.append(num);
  c1.append(Object.assign(el('div','wsub'), { textContent:
    oz >= targetOz ? 'Target met. Drink to thirst from here.'
      : (nSeg - d.water) + ' more to go' + (trainingDay ? ', training day included.' : '.') }));

  const segs = el('div','segs');
  for (let i = 0; i < nSeg; i++) {
    const on = i < d.water;
    const b = el('button','seg' + (on ? ' full' : ''));
    b.type = 'button';
    b.setAttribute('aria-label', (i + 1) * 8 + ' oz');
    b.setAttribute('aria-pressed', String(on));
    // tapping a filled block empties back to it, so a mistap is one tap to undo
    b.onclick = () => { d.water = on ? i : i + 1; save(); render(); };
    segs.append(b);
  }
  c1.append(segs);
  c1.append(Object.assign(el('p','tiny'), { textContent:
    'One block per 8 oz. The National Academies put adequate total water intake at 125 oz a day for men and 91 for women across everything you eat and drink; about a fifth comes from food, so this target is the drinkable share plus 20 oz on a training day. Thirst and pale urine are still the better guides.' }));
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

  // WEIGH-IN
  const c4 = el('div','card');
  c4.append(el('h2','','Weight'));
  c4.append(el('p','hint','Weigh after the bathroom, before food. Same conditions every time or the trend lies.'));

  const wrow = el('div','row wrap');
  const dIn = el('input'); dIn.type = 'date'; dIn.id = 'weighDate';
  dIn.max = today(); dIn.value = weighDate;
  dIn.style.cssText = 'flex:1 1 150px;text-align:left';
  dIn.setAttribute('aria-label', 'Date of weigh-in');

  const wIn = el('input'); wIn.type = 'number'; wIn.step = '0.1'; wIn.inputMode = 'decimal';
  wIn.id = 'weighLb'; wIn.placeholder = uLabel(); wIn.style.flex = '1 1 90px';
  wIn.setAttribute('aria-label', 'Weight in pounds');
  const onDate = () => {
    weighDate = dIn.value || today();
    const ex = S.daily[weighDate] && S.daily[weighDate].weight;
    wIn.value = ex || '';
  };
  onDate();
  dIn.onchange = onDate;

  const sv = el('button','btn primary','Record');
  sv.onclick = () => {
    const lb = stored(wIn.value);
    if (!lb || lb <= 0) { wIn.focus(); return; }
    const day = S.daily[weighDate] || (S.daily[weighDate] = { water:0, sleep:'', protein:'', weight:'' });
    const prev = previousWeight(weighDate);
    day.weight = lb;
    weighFlash = { lb, date: weighDate, delta: prev == null ? null : Math.round((lb - prev) * 10) / 10 };
    save(); render();
  };
  wIn.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); sv.click(); } };
  wrow.append(dIn, wIn, sv);
  c4.append(wrow);

  if (weighFlash) {
    const a = el('div','alert good');
    const dl = weighFlash.delta;
    a.innerHTML = '<b>Recorded ' + disp(weighFlash.lb).toFixed(1) + ' ' + uLabel() + ' for ' + esc(prettyDate(weighFlash.date)) + '</b>' +
      (dl == null ? 'First weigh-in on record.'
       : dl === 0 ? 'No change since the last one.'
       : Math.abs(disp(dl)).toFixed(1) + ' ' + uLabel() + ' ' + (dl < 0 ? 'down from' : 'up on') + ' your last weigh-in.');
    c4.append(a);
  }

  const ents = weightEntries().sort((a, b) => b.date.localeCompare(a.date));
  if (ents.length) {
    c4.append(Object.assign(el('div','eyebrow'), { textContent: 'On record' }));
    const log = el('div','weighlog');
    ents.slice(0, 6).forEach((e, i) => {
      const prev = ents[i + 1];
      const r = el('div','weighrow');
      r.append(el('span','weigh-d', prettyDate(e.date)));
      r.append(el('span','spacer'));
      r.append(el('span','weigh-v', disp(e.lb).toFixed(1)));
      const dl = prev ? Math.round((e.lb - prev.lb) * 10) / 10 : null;
      const chip = el('span','weigh-c' + (dl == null ? '' : dl < 0 ? ' down' : dl > 0 ? ' up' : ''));
      chip.textContent = dl == null ? '—' : (dl > 0 ? '+' : dl < 0 ? '\u2212' : '') + Math.abs(dl).toFixed(1);
      r.append(chip);
      log.append(r);
    });
    c4.append(log);
    c4.append(Object.assign(el('p','tiny'), { textContent:
      ents.length + (ents.length === 1 ? ' weigh-in on record. ' : ' weigh-ins on record. ') +
      'The Body tab charts all of them with the trend line.' }));
  }
  root.append(c4);
};

let weighDate = today();
let weighFlash = null;

function prettyDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  if (iso === today()) return 'today';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function previousWeight(beforeIso) {
  const prior = weightEntries().filter(e => e.date < beforeIso).sort((a, b) => a.date.localeCompare(b.date));
  return prior.length ? prior[prior.length - 1].lb : null;
}

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
      if (wt) s2.append(stat(disp(wt * (1 - bf.point / 100)).toFixed(0), 'Lean ' + uLabel(), ''));
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
  st.append(stat(Math.round(disp(vol)).toLocaleString(), 'Last tonnage ' + uLabel(), ''));
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
    ['age','Age','number'],
    ['startWeight','Start weight (' + uLabel() + ')','number'], ['targetWeight','Target weight (' + uLabel() + ')','number']
  ];
  const field = (k, label, type) => {
    const w = el('div'); w.style.margin = '0 0 12px';
    w.append(el('div','lbl', label));
    const isW = k === 'startWeight' || k === 'targetWeight';
    const bounds = isW ? [round1(disp(BOUNDS.weightLb[0])), round1(disp(BOUNDS.weightLb[1]))] : BOUNDS.age;
    const i = el('input'); i.type = type;
    i.min = String(bounds[0]); i.max = String(bounds[1]);
    i.value = isW ? disp(S.profile[k]) : S.profile[k];
    i.id = 'pf-' + k;
    i.setAttribute('aria-label', label);
    i.oninput = () => {
      S.profile[k] = i.value === '' ? '' : (isW ? stored(i.value) : Number(i.value));
      save();
    };
    // Clamp on the way out, not on every keystroke, so typing 5 toward 50 is not
    // snapped to the minimum halfway through.
    i.onblur = () => {
      const c = clamp(i.value, bounds);
      if (String(c) !== i.value) {
        i.value = c;
        S.profile[k] = c === '' ? '' : (isW ? stored(c) : Number(c));
        save();
      }
    };
    w.append(i); return w;
  };
  c.append(field('age', 'Age', 'number'));

  // Height in feet and inches; heightIn stays the single stored value the
  // Navy body-fat formula reads, so the split is presentation only.
  const hw = el('div'); hw.style.margin = '0 0 12px';
  hw.append(el('div','lbl','Height'));
  const hr = el('div','row');
  const total = Number(S.profile.heightIn) || 0;
  const ft = el('input'); ft.type = 'number'; ft.min = '3'; ft.max = '8'; ft.inputMode = 'numeric';
  ft.id = 'pf-ft'; ft.value = Math.floor(total / 12) || '';
  ft.setAttribute('aria-label', 'Height, feet');
  const inch = el('input'); inch.type = 'number'; inch.min = '0'; inch.max = '11'; inch.step = '0.5';
  inch.inputMode = 'decimal'; inch.id = 'pf-in'; inch.value = round1(total % 12);
  inch.setAttribute('aria-label', 'Height, inches');
  const commit = () => {
    let f = Number(ft.value) || 0, n = Number(inch.value) || 0;
    if (n >= 12) { f += Math.floor(n / 12); n = round1(n % 12); ft.value = f; inch.value = n; }
    S.profile.heightIn = round1(f * 12 + n);
    save();
    hnote.textContent = S.profile.heightIn ? S.profile.heightIn + ' in total' : '';
  };
  ft.oninput = commit; inch.oninput = commit;
  const unit = t => Object.assign(el('span','lbl'), { textContent: t, style: 'letter-spacing:.1em' });
  hr.append(ft, unit('ft'), inch, unit('in'));
  hw.append(hr);
  const hnote = el('p','tiny');
  hnote.textContent = total ? round1(total) + ' in total' : '';
  hw.append(hnote);
  c.append(hw);

  fields.slice(1).forEach(([k, label, type]) => c.append(field(k, label, type)));
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

  const fw = el('div'); fw.style.margin = '0 0 14px';
  fw.append(el('div','lbl','Header figure'));
  const fr = el('div','opts triple');
  [['male','Male'],['female','Female'],['none','None']].forEach(([v, label]) => {
    const b = el('button','opt', label); b.type = 'button';
    b.setAttribute('aria-pressed', String((S.profile.figure || 'male') === v));
    b.onclick = () => { S.profile.figure = v; save(); render(); };
    fr.append(b);
  });
  fw.append(fr);
  c.append(fw);

  const uw = el('div'); uw.style.margin = '0 0 12px';
  uw.append(el('div','lbl','Units'));
  const ur = el('div','opts triple');
  [['lb','Pounds'],['kg','Kilograms']].forEach(([v, label]) => {
    const b = el('button','opt', label); b.type = 'button';
    b.setAttribute('aria-pressed', String(U() === v));
    b.onclick = () => { S.profile.unit = v; save(); render(); };
    ur.append(b);
  });
  uw.append(ur);
  uw.append(Object.assign(el('p','tiny'), { textContent:
    'Stored in pounds, converted on the way in and out. Switching back and forth never rounds your history away.' }));
  c.append(uw);

  const lw = el('div'); lw.style.margin = '0 0 12px';
  lw.append(el('div','lbl','Lifting experience'));
  lw.append(Object.assign(el('p','tiny'), { textContent:
    'Sets your weekly volume band and how hard a load increase is to earn. Novices add weight most sessions. Advanced lifters earn it over weeks.' }));
  LEVELS.forEach(L => {
    const b = el('button','sheetrow' + (S.profile.level === L.id ? ' cur' : ''));
    b.type = 'button';
    const t = el('div');
    t.append(el('div','sheetrow-n', L.name));
    t.append(el('div','sheetrow-m', L.sub + ' \u00b7 ' + L.weekLow + '\u2013' + L.weekHigh + ' sets per muscle per week'));
    b.append(t);
    b.onclick = () => { S.profile.level = L.id; save(); render(); };
    lw.append(b);
  });
  c.append(lw);

  if (!profileComplete(S.profile)) {
    const warn = el('div','alert warn');
    warn.innerHTML = '<b>Age, height and weight are incomplete</b>' +
      'The protein target, the body-fat estimate and the rate-of-loss check all read these. Until they are filled in, those screens have nothing honest to show.';
    c.append(warn);
  }

  const ap = el('button','opt');
  ap.setAttribute('aria-pressed', String(!!S.profile.appetiteSuppressed));
  ap.append(el('span','dot'));
  ap.append(el('span', null, 'Appetite suppressed (sets a reachable protein floor)'));
  ap.onclick = () => { S.profile.appetiteSuppressed = !S.profile.appetiteSuppressed; save(); render(); };
  c.append(ap);
  root.append(c);

  const w = el('div','card');
  w.append(el('h2','','Mesocycle'));
  w.append(el('p','hint','Week ' + S.week + ' of ' + blockWeeks() + '. The last week is a deload, then it resets.'));
  const r = el('div','row wrap');
  Array.from({length: blockWeeks()}, (_, i) => i + 1).forEach(n => { const b = el('button','btn sm', 'Week ' + n);
    b.setAttribute('aria-pressed', String(S.week === n));
    b.onclick = () => { S.week = n; save(); render(); }; r.append(b); });
  w.append(r);
  w.append(Object.assign(el('p','tiny'), { textContent:
    'Which session is next is set from the week badge at the top of the screen.' }));
  const nm = el('button','btn primary block','Build a new mesocycle');
  nm.style.marginTop = '12px';
  nm.onclick = () => openMesoWizard(null, nm);
  w.append(nm);
  w.append(Object.assign(el('p','tiny'), { textContent:
    'Twenty-four programmes, ranked by how many muscles they get to ten hard sets a week at your schedule. Currently running ' +
    programById(S.profile.programId).name + ', ' +
    ((S.setup && S.setup.days) || S.days.length) + ' days a week at about ' +
    ((S.setup && S.setup.minutes) || 50) + ' minutes, in a ' + blockWeeks() + ' week block.' }));
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
setSlots(SLOTS);          // the engine needs the muscle map for its volume pass
registerCustom();
save();            // persist the seed so first-run state is durable
applyTheme();
$('#weekBadge').onclick = () => openPlanPicker($('#weekBadge'));
$('#themeBtn').onclick = () => {
  S.profile.theme = S.profile.theme === 'light' ? 'dark' : 'light';
  save(); applyTheme();
};
render();
// A first run asks who is lifting before showing a programme built for someone
// else. Anyone with history already skips this.
if (!S.profile.onboarded && !(S.sessions && S.sessions.length)) openMesoWizard({ onboarding: true });
// Only the installable build ships a service worker. The embedded build has no
// manifest and no sw.js, and asking for one there just logs a 404.
if ('serviceWorker' in navigator && document.querySelector('link[rel="manifest"]')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
