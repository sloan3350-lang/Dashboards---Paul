/* KANON app shell. State in localStorage, exported as JSON from Settings. */
'use strict';
const K = 'kanon.v1';
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
    profile: { sex:'male', age:44, heightIn:70, goal:'cut', appetiteSuppressed:true, theme:'dark',
               startWeight:219, targetWeight:207, trainDays:'Tue / Sat' },
    week: 1,
    next: 'A',
    plan: {
      A: [mk('squat','legpress',1), mk('hpress','machchest',1), mk('vpull','latpulln',1),
          mk('hinge','rdl'),        mk('hpull','csrow'),        mk('vpress','machshld')],
      B: [mk('squat','hacksquat',1),mk('hpress','inclinemach',1),mk('vpull','assistpull',1),
          mk('hinge','legcurl'),    mk('hpull','cablerow'),     mk('vpress','latraise')]
    },
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
  try {
    const r = localStorage.getItem(K);
    if (r) {
      const st = Object.assign(seed(), JSON.parse(r));
      // plans saved before `primary` existed: the first three slots carried it
      ['A','B'].forEach(L => (st.plan[L] || []).forEach((p, i) => {
        if (p.primary === undefined) p.primary = i < 3;
      }));
      return st;
    }
  }
  catch (e) { console.warn('state unreadable, starting fresh', e); }
  return seed();
}
function save() { try { localStorage.setItem(K, JSON.stringify(S)); } catch (e) { alert('Could not save locally. Export your data from Settings.'); } }

/* ---------------- week rules (the ramp already locked in your program) ---------------- */
function setsForWeek(week, isPrimary) {
  if (week <= 1) return 1;
  if (week === 2) return isPrimary ? 2 : 1;
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
    ? 'Wk ' + S.preview.week + ' \u00b7 ' + S.preview.letter + ' \u00b7 preview'
    : 'Wk ' + S.week + ' \u00b7 ' + S.next + (S.week === 5 ? ' \u00b7 deload' : '');
  wb.classList.toggle('previewing', !!S.preview);
  document.querySelectorAll('.tab').forEach(t =>
    t.setAttribute('aria-selected', String(t.dataset.view === current)));
}
document.querySelectorAll('.tab').forEach(t =>
  t.addEventListener('click', () => { current = t.dataset.view; window.scrollTo(0,0); render(); }));

/* =================== TRAIN =================== */
views.train = root => {
  const pv = S.preview;
  const letter = pv ? pv.letter : S.next;
  const week = pv ? pv.week : S.week;
  const plan = S.plan[letter];
  const dl = deloadCheckLocal();

  // Preview never touches the draft: browsing ahead must not create log state.
  if (!pv && (!S.draft || S.draft.letter !== letter)) {
    S.draft = { letter, date: today(), week: S.week, entries: {} };
  }

  if (pv) {
    const banner = el('div','card preview');
    banner.append(el('div','eyebrow','Previewing'));
    banner.append(Object.assign(el('h2'), { textContent: 'Session ' + letter + ' \u00b7 Week ' + week }));
    banner.append(Object.assign(el('p','hint'), { textContent: weekBlurb(week) }));
    banner.append(Object.assign(el('p','tiny'), { textContent:
      'Looking ahead only. Nothing here is logged, and your current session is still Session ' +
      S.next + ', week ' + S.week + '.' }));
    const back = el('button','btn primary block','Back to Session ' + S.next + ', week ' + S.week);
    back.style.marginTop = '12px';
    back.onclick = () => { S.preview = null; save(); render(); };
    banner.append(back);
    root.append(banner);

    const list = el('div','card liftlist');
    plan.forEach((p, idx) => list.append(liftRow(p, idx, week, true)));
    root.append(list);
    return;
  }

  const head = el('div','card hero');
  // The artwork is an optional asset: if img/hero.jpg is not published, onerror
  // strips the image and the card falls back to plain type with no broken icon.
  const himg = el('img');
  himg.src = 'img/hero.jpg'; himg.alt = ''; himg.loading = 'eager';
  himg.onerror = () => { head.classList.add('noimg'); himg.remove(); };
  head.append(himg);
  const ov = el('div','hero-ov');
  ov.append(Object.assign(el('h2'), { textContent: 'Session ' + letter + ' \u00b7 ' + (S.week === 5 ? 'Deload' : 'Week ' + S.week) }));
  ov.append(Object.assign(el('p','hint'), { textContent: weekBlurb(week) }));
  head.append(ov);
  if (dl.deload && S.week !== 5) {
    const a = el('div','alert warn');
    a.innerHTML = '<b>Early deload recommended</b>' + esc(dl.reason) + '. Cut the sets in half and back off the effort this session.';
    ov.append(a);
  }
  const doneN = plan.filter(p => S.draft.entries[p.slot] && S.draft.entries[p.slot].done).length;
  ov.append(Object.assign(el('p','tiny'), { textContent:
    doneN ? doneN + ' of ' + plan.length + ' done. Take them in whatever order the machines are free.'
          : 'Take them in whatever order the machines are free. Tap a lift to log it.' }));
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
      'Session ' + S.lastSummary.letter + ', week ' + S.lastSummary.week + ', ' + S.lastSummary.date +
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

  const fin = el('button','btn primary block','Finish session');
  fin.onclick = finishSession;
  root.append(fin);

  const note = el('p','tiny');
  note.style.cssText = 'text-align:center;margin-top:10px';
  note.textContent = 'Nothing is sent anywhere. Everything stays on this device until you export it.';
  root.append(note);
};

function weekBlurb(week) {
  const rir = rirForWeek(week);
  if (week === 5) return 'Deload. One set a slot, five reps left in the tank, clean technique. You are not chasing anything this week.';
  if (week === 1) return 'Six slots, one working set each, eight to twelve reps, ' + rir + ' left in the tank. Nothing near failure.';
  if (week === 2) return 'Two sets on the three compound slots, one on the rest. ' + rir + ' reps left in the tank.';
  return 'Two sets a slot, ' + rir + ' reps left in the tank. The engine adds a third only if a lift stalls.';
}

function deloadCheckLocal() { return deloadCheck(S.week, deloadSignals()); }

function draftFor(p) {
  return S.draft.entries[p.slot] ||
    (S.draft.entries[p.slot] = { exId: p.exId, slot: p.slot, sets: [], pump: 0, readiness: 0, joint: null, done: false });
}

function liftRow(p, idx, week, preview) {
  const ex = byId(p.exId);
  const d = preview ? null : draftFor(p);
  const nSets = Math.max(p.sets, setsForWeek(week, p.primary));
  const logged = d ? d.sets.filter(x => x.reps).length : 0;

  const row = el('div','lift' + (d && d.done ? ' done' : '') + (preview ? ' preview' : ''));
  if (!preview) {
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.onclick = () => openLift(p, idx);
    row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLift(p, idx); } };
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
  body.append(el('span','lift-t', (p.load ? p.load + ' lb' : 'Finder set') +
    ' \u00b7 ' + p.repLow + '\u2013' + p.repHigh + ' reps \u00b7 ' + nSets + ' set' + (nSets > 1 ? 's' : '')));
  row.append(body);
  row.append(el('span','spacer'));
  const st = el('span','lift-s');
  if (preview) st.textContent = '';
  else if (d.done) { st.classList.add('ok'); st.textContent = '\u2713'; }
  else if (logged) { st.classList.add('part'); st.textContent = logged + '/' + nSets; }
  else st.textContent = '\u2192';
  row.append(st);
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
function openLift(p, idx) {
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
  document.body.append(sheetEl);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onSheetKey);
  drawStep();

  function drawStep() {
    const ex = byId(p.exId);
    const nSets = Math.max(p.sets, setsForWeek(S.week, p.primary));
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
    ['Sets','Muscle','Recovery','Joints'].forEach((label, i) => {
      const dd = el('span','step' + (i === step ? ' on' : i < step ? ' past' : ''), label);
      dots.append(dd);
    });
    inner.append(dots);

    if (step === 0) drawSets(ex, nSets, rir);
    if (step === 1) drawQ('How much did the muscle do?',
      'Barely means the joints took over. Too much means it cramped or gave out before the reps did.',
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
      ? `Target <b>${p.load} lb</b> &middot; ${p.repLow}\u2013${p.repHigh} reps &middot; leave <b>${rir}</b> in the tank`
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
    sw.onclick = () => openSwap(p, () => openLift(p, idx));
    tools.append(sw);
    inner.append(tools);

    const hdr = el('div','setrow');
    hdr.append(el('div','n',''), el('div','lbl','Weight'), el('div','lbl','Reps'), el('div','lbl','Left in tank'), el('div',null,''));
    inner.append(hdr);
    // Planned rows come from the programme; anything past that is one you added
    // by hand this session and can drop again.
    const shown = Math.max(nSets, d.sets.length);
    for (let i = 0; i < shown; i++) {
      if (!d.sets[i]) d.sets[i] = { load: lastLoggedLoad(d, p), reps: '', rir: '' };
      const r = el('div','setrow');
      r.append(el('div','n', String(i + 1)));
      ['load','reps','rir'].forEach(f => {
        const inp = el('input'); inp.type = 'number'; inp.inputMode = 'decimal';
        inp.min = '0'; inp.value = d.sets[i][f];
        inp.id = 'set-' + p.slot + '-' + i + '-' + f;
        inp.placeholder = f === 'load' ? 'lb' : f === 'reps' ? '#' : 'RIR';
        inp.setAttribute('aria-label', 'Set ' + (i + 1) + ' ' + (f === 'load' ? 'weight' : f === 'reps' ? 'reps' : 'reps left in the tank'));
        inp.oninput = () => { d.sets[i][f] = inp.value === '' ? '' : Number(inp.value); save(); next.disabled = !anyReps(); };
        r.append(inp);
      });
      if (i >= nSets) {
        const rm = el('button','setdrop', '\u00d7');
        rm.type = 'button';
        rm.title = 'Remove set ' + (i + 1);
        rm.setAttribute('aria-label', rm.title);
        rm.onclick = () => { d.sets.splice(i, 1); save(); drawStep(); };
        r.append(rm);
      } else {
        r.append(el('div',null,''));
      }
      inner.append(r);
    }

    const addBtn = el('button','btn sm block ghost','+ Add set');
    addBtn.style.marginTop = '2px';
    addBtn.onclick = () => {
      d.sets.push({ load: lastLoggedLoad(d, p), reps: '', rir: '' });
      save(); drawStep();
    };
    inner.append(addBtn);
    inner.append(Object.assign(el('p','tiny'), { textContent:
      shown > nSets
        ? 'Extra sets count toward this session and the engine reads them, but they do not change the planned volume. That still moves only when a lift stalls.'
        : 'The programme calls for ' + nSets + (nSets === 1 ? ' set' : ' sets') + ' here. Add more if you want them.' }));

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
      'Muscle burn is fine. Joints are not. Two means we swap it now, not later.' }));
    const sev = optGroup([[0,'None'],[1,'Mild'],[2,'Sharp']],
      d.joint ? d.joint.sev : 0, v => {
        d.joint = v === 0 ? null : { sev: v, joint: (d.joint && d.joint.joint) || null };
        save(); drawStep();
      }, true);
    sev.classList.add('triple');
    inner.append(sev);

    if (d.joint) {
      inner.append(Object.assign(el('div','qs'), { textContent: 'Which joint?' }));
      const grid = el('div','jointgrid');
      JOINTS.forEach(j => {
        const o = el('button','opt'); o.type = 'button';
        o.textContent = jointName(j);
        o.setAttribute('aria-pressed', String(d.joint.joint === j));
        o.onclick = () => { d.joint.joint = j; save(); drawStep(); };
        grid.append(o);
      });
      inner.append(grid);
      if (d.joint.sev >= 2 && d.joint.joint) {
        const sub = substitute(p.exId, d.joint.joint, Object.keys(S.quarantine), EX, SUBS);
        const a = el('div','alert bad');
        a.innerHTML = sub
          ? `<b>Swapping this lift</b>${esc(ex.name)} is out for the next 3 sessions. Same slot, less ${esc(jointName(d.joint.joint))}: <b>${esc(sub.name)}</b>. It comes back for a retest after that.`
          : `<b>Nothing left to swap to in this slot</b>Drop this slot for now. If it still hurts in a week, get it looked at.`;
        inner.append(a);
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
  p.exId = exId; p.load = null; p.misses = 0;
  if (S.draft && S.draft.entries[p.slot]) delete S.draft.entries[p.slot];
  save(); closeSheet();
  if (onDone) onDone(); else render();
}

let sheetEl = null;
function closeSheet() {
  if (sheetEl) { sheetEl.remove(); sheetEl = null; document.body.style.overflow = ''; }
  document.removeEventListener('keydown', onSheetKey);
}
function onSheetKey(e) { if (e.key === 'Escape') closeSheet(); }

function openSwap(p, onDone) {
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
    row.disabled = !!rest;
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
    const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,28) + '_' + Date.now().toString(36).slice(-4);
    const custom = { id, slot: p.slot, name, inc: 5, custom: true,
                     joints: { shoulder:1, elbow:1, wrist:1, lowback:1, hip:1, knee:1 },
                     cue: 'Your lift. Same rules: control the weight, stop the set at the target reps left in the tank.',
                     video: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' proper form') };
    S.custom = S.custom || [];
    S.custom.push(custom);
    registerCustom();
    applySwap(p, id, onDone);
  };
  ci.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); cb.click(); } };
  crow.append(cb);
  cwrap.append(crow);
  cwrap.append(Object.assign(el('p','tiny'), { textContent:
    'A custom lift starts with no joint profile, so it will not be offered automatically as a substitute until you tell it what hurts.' }));
  inner.append(cwrap);

  sheetEl.append(inner);
  document.body.append(sheetEl);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onSheetKey);
  x.focus();
}

// Custom lifts live in state and are merged back into the library on every boot.
function registerCustom() {
  (S.custom || []).forEach(c => {
    if (!EX.find(e => e.id === c.id)) EX.push(c);
    if (SUBS[c.slot] && !SUBS[c.slot].includes(c.id)) SUBS[c.slot].push(c.id);
  });
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
                     joint: d.joint, loadProgressed: progressed, note: r.note,
                     nextLoad: p.load, perfDown: sets.some(s => s.reps < p.repLow - 1) });
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

  S.lastSummary = { date: today(), letter, week: S.week, lines: changes };
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

/* ---- week / session picker ---- */
function openPlanPicker() {
  closeSheet();
  let week = S.preview ? S.preview.week : S.week;
  let letter = S.preview ? S.preview.letter : S.next;

  sheetEl = el('div','sheet');
  sheetEl.setAttribute('role','dialog');
  sheetEl.setAttribute('aria-modal','true');
  sheetEl.setAttribute('aria-label','Choose week and session');
  sheetEl.onclick = e => { if (e.target === sheetEl) { closeSheet(); render(); } };
  const inner = el('div','sheet-inner');
  sheetEl.append(inner);
  document.body.append(sheetEl);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onSheetKey);
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
    [1,2,3,4,5].forEach(n => {
      const b = el('button','opt', n === 5 ? '5 \u00b7 deload' : String(n));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(week === n));
      b.onclick = () => { week = n; draw(); };
      wr.append(b);
    });
    inner.append(wr);

    inner.append(el('div','eyebrow','Session'));
    const sr = el('div','opts triple');
    ['A','B'].forEach(L => {
      const b = el('button','opt', 'Session ' + L);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(letter === L));
      b.onclick = () => { letter = L; draw(); };
      sr.append(b);
    });
    inner.append(sr);

    inner.append(Object.assign(el('p','qs'), { textContent: weekBlurb(week) }));
    const list = el('div','planlist');
    S.plan[letter].forEach((p, i) => {
      const r = el('div','planrow');
      r.append(el('span','lift-i', String(i + 1)));
      const b2 = el('span','lift-b');
      b2.append(el('span','ex-slot', SLOTS.find(s2 => s2.id === p.slot).name));
      b2.append(el('span','lift-n', byId(p.exId).name));
      r.append(b2);
      r.append(el('span','spacer'));
      const n = Math.max(p.sets, setsForWeek(week, p.primary));
      r.append(Object.assign(el('span','lift-t'), {
        textContent: n + ' \u00d7 ' + p.repLow + '\u2013' + p.repHigh + ' @ ' + rirForWeek(week) + ' RIR' }));
      list.append(r);
    });
    inner.append(list);

    const isCurrent = week === S.week && letter === S.next;
    const go = el('button','btn primary block',
      isCurrent ? 'This is your current session' : 'Preview this');
    go.disabled = isCurrent;
    go.style.marginTop = '14px';
    go.onclick = () => { S.preview = { week, letter }; save(); closeSheet(); current = 'train'; render(); };
    inner.append(go);

    if (!isCurrent) {
      const set = el('button','btn block ghost','Make this my current session');
      set.style.marginTop = '8px';
      set.onclick = () => {
        S.week = week; S.next = letter; S.preview = null; S.draft = null;
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
  wIn.id = 'weighLb'; wIn.placeholder = 'lb'; wIn.style.flex = '1 1 90px';
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
    const lb = Number(wIn.value);
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
    a.innerHTML = '<b>Recorded ' + weighFlash.lb.toFixed(1) + ' lb for ' + esc(prettyDate(weighFlash.date)) + '</b>' +
      (dl == null ? 'First weigh-in on record.'
       : dl === 0 ? 'No change since the last one.'
       : Math.abs(dl).toFixed(1) + ' lb ' + (dl < 0 ? 'down from' : 'up on') + ' your last weigh-in.');
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
      r.append(el('span','weigh-v', e.lb.toFixed(1)));
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
    ['age','Age','number'],
    ['startWeight','Start weight (lb)','number'], ['targetWeight','Target weight (lb)','number']
  ];
  const field = (k, label, type) => {
    const w = el('div'); w.style.margin = '0 0 12px';
    w.append(el('div','lbl', label));
    const i = el('input'); i.type = type; i.value = S.profile[k];
    i.id = 'pf-' + k;
    i.setAttribute('aria-label', label);
    i.oninput = () => { S.profile[k] = Number(i.value); save(); };
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
registerCustom();
save();            // persist the seed so first-run state is durable
applyTheme();
$('#weekBadge').onclick = openPlanPicker;
$('#themeBtn').onclick = () => {
  S.profile.theme = S.profile.theme === 'light' ? 'dark' : 'light';
  save(); applyTheme();
};
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
