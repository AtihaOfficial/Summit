window.PEAKS_VERSION = 4;

(function () {
  'use strict';

  var STORE = 'peaks.v3', OLD = 'peaks.v2', SESS = 'peaks.sess', THEME = 'peaks.theme';
  var BASE_TITLE = 'Summit · One step at a time';
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };

  /* =====================================================
     1. Buttons that must always work: theme + new habit
     ===================================================== */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME, t); } catch (e) {}
    if (window.setFavicon) window.setFavicon(t);          // favicon follows the theme
    var b = $('themeBtn');
    if (b) b.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' theme');
  }
  applyTheme(document.documentElement.dataset.theme || 'dark');

  var dlg = $('dlg'), form = $('form'), editId = null;
  
  /* ---------- About Summit menu ---------- */
  var moreBtn = $('moreBtn');
  var aboutMenu = $('aboutMenu');
  var aboutBtn = $('aboutBtn');
  var aboutDlg = $('aboutDlg');
  var aboutClose = $('aboutClose');

  function closeAboutMenu() {
    if (!moreBtn || !aboutMenu) return;
    aboutMenu.hidden = true;
    moreBtn.setAttribute('aria-expanded', 'false');
  }

  if (moreBtn && aboutMenu && aboutBtn && aboutDlg && aboutClose) {
    moreBtn.addEventListener('click', function (e) {
      e.stopPropagation();

      var opening = aboutMenu.hidden;
      aboutMenu.hidden = !opening;
      moreBtn.setAttribute('aria-expanded', String(opening));
    });

    aboutBtn.addEventListener('click', function () {
      closeAboutMenu();

      if (typeof aboutDlg.showModal === 'function') {
        aboutDlg.showModal();
      } else {
        aboutDlg.setAttribute('open', '');
      }

      aboutClose.focus();
    });

    aboutClose.addEventListener('click', function () {
      if (typeof aboutDlg.close === 'function') {
        aboutDlg.close();
      } else {
        aboutDlg.removeAttribute('open');
      }

      moreBtn.focus();
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.about-menu-wrap')) {
        closeAboutMenu();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAboutMenu();
      }
    });

    aboutDlg.addEventListener('click', function (e) {
      if (e.target === aboutDlg) {
        if (typeof aboutDlg.close === 'function') {
          aboutDlg.close();
        } else {
          aboutDlg.removeAttribute('open');
        }
      }
    });
  }


  $('swatches').innerHTML = [0, 1, 2, 3].map(function (i) {
    return '<label class="sw c' + i + '"><input type="radio" name="color" value="' + i + '" aria-label="Style ' + (i + 1) + '"><span></span></label>';
  }).join('');

  document.addEventListener('click', function (e) {
    if (e.target.closest('#themeBtn')) {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
      return;
    }
    if (e.target.closest('.js-add')) openDlg(null);
  });

  /* ---------- Helpers ---------- */
  function key(d) {
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function diffDays(a, b) { return Math.round((b - a) / 86400000); }
  function todayKey() { return key(new Date()); }
  function fmtShort(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function weekRange() {
    var t = new Date(), mon = addDays(t, -((t.getDay() + 6) % 7));   // week starts Monday
    return [key(mon), key(addDays(mon, 6))];
  }
  function monthRange() {
    var t = new Date(), m = t.getMonth() + 1;
    var p = t.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-';
    return [p + '01', p + '31'];
  }
  function sumTime(h, a, b) {
    var s = 0;
    for (var k in h.time) { if (k >= a && k <= b) s += h.time[k]; }
    return s;
  }
  function fmtDur(sec) {
    var m = Math.round(sec / 60);
    if (m === 0) return sec > 0 ? '<1m' : '0m';
    if (m < 60) return m + 'm';
    var hh = Math.floor(m / 60), mm = m % 60;
    return hh + 'h' + (mm ? ' ' + mm + 'm' : '');
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' : '') + p(m) + ':' + p(s);
  }

  /* ---------- Toast ---------- */
  var lastToast = { msg: '', at: 0 };
  function toast(msg) {
    var now = Date.now();
    if (lastToast.msg === msg && now - lastToast.at < 1500) return;
    lastToast = { msg: msg, at: now };
    var box = $('toast'), t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }

  /* ---------- State ---------- */
  function norm(s) {
    s.habits.forEach(function (h) {
      h.log = h.log || {};
      h.time = h.time || {};
      var g = h.goal || {};
      h.goal = { day: +g.day || 0, week: +g.week || 0, month: +g.month || 0 };
      h.required = !!h.required && h.goal.day > 0;
      h.note = h.note || '';
      h.color = (+h.color || 0) % 4;
    });
    s.sessions = s.sessions || [];
    s.target = s.target || 80;
    return s;
  }
  function load() {
    var ks = [STORE, OLD];
    for (var i = 0; i < ks.length; i++) {
      try {
        var s = JSON.parse(localStorage.getItem(ks[i]));
        if (s && Array.isArray(s.habits)) return norm(s);
      } catch (e) {}
    }
    return null;
  }
  var storageOk = true;
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); storageOk = true; }
    catch (e) {
      if (storageOk) {
        storageOk = false;
        toast('Saving is blocked in this browser. Your changes will be lost on refresh.');
      }
    }
  }

  function seed() {
    var t = new Date(), L = function (n) { return key(addDays(t, n)); };
    var a = {}, b = {}, c = {}, ta = {}, tb = {};
    a[L(-3)] = 100; a[L(-2)] = 100; a[L(-1)] = 100; a[L(0)] = 40;
    b[L(-1)] = 100; b[L(0)] = 15;
    ta[L(-3)] = 1800; ta[L(-2)] = 1500; ta[L(-1)] = 1900; ta[L(0)] = 600;
    tb[L(-1)] = 1800;
    return norm({ habits: [
      { id: uid() + 'a', title: 'Read 20 pages',       note: 'Any book counts', start: L(-4), color: 0, log: a, time: ta,
        goal: { day: 30, week: 150, month: 600 }, required: false },
      { id: uid() + 'b', title: 'Move for 30 minutes', note: 'Walk, stretch or lift', start: L(-2), color: 1, log: b, time: tb,
        goal: { day: 0, week: 120, month: 0 }, required: false },
      { id: uid() + 'c', title: 'Plan tomorrow',       note: 'Three priorities, written down', start: L(0), color: 2, log: c, time: {},
        goal: { day: 0, week: 0, month: 0 }, required: false }
    ], target: 80, sessions: [] });
  }
   // Warn on load if storage is unavailable, and ask the browser to keep data
  try { localStorage.setItem('peaks.test', '1'); localStorage.removeItem('peaks.test'); }
  catch (e) { setTimeout(function () { toast('This browser is blocking storage, so nothing will be saved. Try Live Server or a normal window.'); }, 600); }
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist(); }
  var state = load() || seed();
  var celebrated = false, chartMode = 'done';
  var list = $('list');

  /* ---------- Habit math ---------- */
  function P(h, k) { return h.log[k] || 0; }
  function secOn(h, k) { return h.time[k] || 0; }
  function find(id) { return state.habits.filter(function (h) { return h.id === id; })[0]; }
  function setLog(h, k, v) {
    if (v <= 0) delete h.log[k]; else h.log[k] = v;
    save();
  }
  // Seconds of focus still needed before a "required" habit can be completed on day k
  function remain(h, k) {
    if (!h.required || !h.goal.day) return 0;
    return Math.max(0, h.goal.day * 60 - secOn(h, k));
  }
  function streak(h) {
    var d = new Date(), n = 0;
    if (P(h, key(d)) < 100) d = addDays(d, -1);
    while (true) {
      var k = key(d);
      if (k < h.start || P(h, k) < 100) break;
      n++; d = addDays(d, -1);
    }
    return n;
  }
  function bestStreak(h) {
    var d = parse(h.start), end = parse(todayKey()), run = 0, best = 0;
    while (d <= end) {
      if (P(h, key(d)) >= 100) { run++; if (run > best) best = run; } else run = 0;
      d = addDays(d, 1);
    }
    return best;
  }

  /* ---------- Render: habit cards ---------- */
  function focusHTML(h, tk) {
    var wk = weekRange(), mo = monthRange(), out = '';
    var rows = [
      ['Today', secOn(h, tk), h.goal.day],
      ['This week', sumTime(h, wk[0], wk[1]), h.goal.week],
      ['This month', sumTime(h, mo[0], mo[1]), h.goal.month]
    ];
    rows.forEach(function (r) {
      if (!r[2]) return;
      var pct = Math.min(100, Math.round(r[1] / (r[2] * 60) * 100));
      out += '<div><div class="flex justify-between text-xs font-bold mb-1"><span>' + r[0] + '</span><span>' +
        fmtDur(r[1]) + ' / ' + fmtDur(r[2] * 60) + (pct >= 100 ? ' ✓' : '') + '</span></div>' +
        '<div class="fbar"><i style="width:' + pct + '%"></i></div></div>';
    });
    if (!out && secOn(h, tk) > 0) out = '<p class="text-xs font-bold">Focus today: ' + fmtDur(secOn(h, tk)) + '</p>';
    return out ? '<div class="grid gap-2 mt-4">' + out + '</div>' : '';
  }

  function cardHTML(h, tk) {
    var p = Math.min(P(h, tk), 100), done = p >= 100, st = streak(h), lock = remain(h, tk) > 0;
    var dayN = diffDays(parse(h.start), parse(tk)) + 1;
    var dots = '';
    for (var i = 6; i >= 0; i--) {
      var d = addDays(parse(tk), -i), k = key(d), v = Math.min(P(h, k), 100), dis = k < h.start;
      var cls = 'dot' + (v >= 100 ? ' full' : v > 0 ? ' part' : '') + (i === 0 ? ' today' : '');
      var label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + (v >= 100 ? ': done' : ': not done');
      dots += '<button type="button" class="' + cls + '" data-act="day" data-k="' + k + '"' + (dis ? ' disabled' : '') +
        ' style="--p:' + v + '" aria-label="' + esc(label) + '">' +
        '<span class="c">' + (v >= 100 ? '✓' : '') + '</span>' +
        '<span class="l">' + d.toLocaleDateString('en-US', { weekday: 'narrow' }) + '</span></button>';
    }
    var req = h.required ? '<span class="pill">Needs ' + fmtDur(h.goal.day * 60) + ' focus to complete</span>' : '';
    return '' +
      '<li class="habit c' + h.color + (done ? ' done' : '') + (lock && !done ? ' locked' : '') + '" data-id="' + h.id + '">' +
        '<div class="fill" style="width:' + p + '%"></div>' +
        '<div class="relative p-5 sm:p-6">' +
          '<div class="flex items-start gap-4">' +
            '<button type="button" class="check" data-act="toggle" aria-pressed="' + done + '" aria-label="' +
              esc((done ? 'Mark incomplete: ' : 'Mark complete: ') + h.title) + '"><span class="mark">✓</span></button>' +
            '<div class="flex-1 min-w-0">' +
              '<h3 class="title serif text-2xl font-black leading-tight">' + esc(h.title) + '</h3>' +
              (h.note ? '<p class="text-sm mt-1 opacity-80">' + esc(h.note) + '</p>' : '') +
              '<div class="flex flex-wrap gap-2 mt-3">' +
                '<span class="pill">Since ' + fmtShort(parse(h.start)) + ', day ' + dayN + '</span>' +
                '<span class="pill">' + (st > 0 ? '🔥 ' + st + (st === 1 ? ' day' : ' days') + ' streak' : 'Start your streak') + '</span>' +
                req +
              '</div>' +
              focusHTML(h, tk) +
              '<div class="flex items-center gap-3 mt-4">' +
                '<input type="range" min="0" max="100" step="5" value="' + p + '" aria-label="Today’s progress for ' + esc(h.title) + '">' +
                '<span class="val serif font-black w-14 text-right text-lg">' + p + '%</span>' +
              '</div>' +
              '<div class="flex flex-wrap items-end justify-between gap-3 mt-4">' +
                '<div class="flex gap-1.5">' + dots + '</div>' +
                '<div class="flex gap-4">' +
                  '<button type="button" class="link" data-act="focus">▶ Focus</button>' +
                  '<button type="button" class="link" data-act="edit">Edit</button>' +
                  '<button type="button" class="link" data-act="del">Delete</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</li>';
  }

  function renderList() {
    var focusId = null, ae = document.activeElement;
    if (ae && ae.type === 'range' && ae.closest('.habit')) focusId = ae.closest('.habit').dataset.id;

    var tk = todayKey();
    if (!state.habits.length) {
      list.innerHTML = '';      // habitsfix.js shows the empty-state card
      return;
    }
    list.innerHTML = state.habits.map(function (h) { return cardHTML(h, tk); }).join('');
    if (focusId) {
      var r = list.querySelector('.habit[data-id="' + focusId + '"] input[type=range]');
      if (r) r.focus();
    }
  }

  /* ---------- Render: stats ---------- */
  function setRing(id, pct) { $(id).style.strokeDashoffset = 326.7 * (1 - Math.max(0, Math.min(100, pct)) / 100); }

  function renderStats() {
    var tk = todayKey(), hs = state.habits, n = hs.length, done = 0, sum = 0;
    var nextH = null, curBest = 0, fToday = 0, fGoal = 0, fWeek = 0, fMonth = 0;
    var wk = weekRange(), mo = monthRange();

    hs.forEach(function (h) {
      var p = Math.min(P(h, tk), 100);
      if (p >= 100) done++; else if (!nextH) nextH = h;
      sum += p;
      curBest = Math.max(curBest, streak(h));
      fToday += secOn(h, tk);
      fGoal += h.goal.day * 60;
      fWeek += sumTime(h, wk[0], wk[1]);
      fMonth += sumTime(h, mo[0], mo[1]);
    });
    var pct = n ? Math.round(done / n * 100) : 0;
    var avg = n ? Math.round(sum / n) : 0;
    var fRef = fGoal > 0 ? fGoal : 3600;   // ring fills against daily goals, or 1 hour if none are set

    // Hero circles
    $('c1v').textContent = pct + '%'; setRing('c1r', pct);
    $('c2v').textContent = avg + '%'; setRing('c2r', avg);
    $('c3v').textContent = fmtDur(fToday); setRing('c3r', fToday / fRef * 100);
    $('bestNow').textContent = curBest;
    $('miniCount').textContent = done + '/' + n;
    $('nextUp').textContent = !n ? 'Add a habit' : nextH ? nextH.title : 'All done. Rest well.';

    // Summary text
    if (!n) $('sumText').textContent = 'No habits yet. Add your first one and start climbing.';
    else if (done === n) $('sumText').textContent = 'Every habit is done today. You spent ' + fmtDur(fToday) + ' in focus. Enjoy the view from the top.';
    else $('sumText').textContent = (n - done) + (n - done === 1 ? ' habit is' : ' habits are') + ' left today. Next up: ' + nextH.title + '. Focus time so far: ' + fmtDur(fToday) + '.';

    // Benchmark
    $('avg').textContent = avg + '%';
    $('avgBar').style.width = avg + '%';
    $('target').style.left = state.target + '%';
    $('targetVal').textContent = state.target + '%';
    $('targetRange').value = state.target;
    var diff = avg - state.target, v = $('verdict');
    if (!n) v.textContent = 'Add a habit to start';
    else if (diff > 0) v.textContent = diff + ' points ahead of target';
    else if (diff === 0) v.textContent = 'Right on target';
    else v.textContent = Math.abs(diff) + ' points to reach target';

        // 7-day stats (layout.js draws the chart itself)
    var totals = [], perfect = 0;
    for (var i = 6; i >= 0; i--) {
      var k = key(addDays(parse(tk), -i));
      var active = hs.filter(function (h) { return h.start <= k; });
      if (active.length) {
        var s = 0, all = true;
        active.forEach(function (h) { var p = Math.min(P(h, k), 100); s += p; if (p < 100) all = false; });
        totals.push(Math.round(s / active.length));
        if (all) perfect++;
      }
    }
    $('chartDone').setAttribute('aria-pressed', chartMode === 'done');
    $('chartFocus').setAttribute('aria-pressed', chartMode === 'focus');

    $('perfect').textContent = perfect;
    $('wkAvg').textContent = totals.length ? Math.round(totals.reduce(function (a, b) { return a + b; }, 0) / totals.length) + '%' : '0%';
    var best = hs.reduce(function (m, h) { return Math.max(m, bestStreak(h)); }, 0);
    $('bestStreak').textContent = best + (best === 1 ? ' day' : ' days');
    $('fToday').textContent = fmtDur(fToday);
    $('fWeek').textContent = fmtDur(fWeek);
    $('fMonth').textContent = fmtDur(fMonth);

    // Success banner
    var allDone = n > 0 && done === n;
    $('banner').classList.toggle('show', allDone);
    if (allDone) {
      $('bannerMsg').textContent = 'All ' + n + (n === 1 ? ' habit' : ' habits') + ' done today, with ' + avg + '% average progress against your ' + state.target + '% target.';
      if (!celebrated) { celebrated = true; confetti(); }
        } else celebrated = false;

    window.dispatchEvent(new Event('peaks:stats'));      // layout.js redraws the 7-day chart
  }

  function renderAll() { renderList(); renderStats(); renderFocus(); }

  $('chartDone').addEventListener('click', function () { chartMode = 'done'; renderStats(); });
  $('chartFocus').addEventListener('click', function () { chartMode = 'focus'; renderStats(); });

  /* ---------- Habit card interactions ---------- */
  list.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var li = btn.closest('.habit'), h = find(li.dataset.id), act = btn.dataset.act, tk = todayKey();

    if (act === 'toggle' || act === 'day') {
      var k = act === 'toggle' ? tk : btn.dataset.k;
      var isDone = P(h, k) >= 100;
      if (!isDone) {
        var r = remain(h, k);
        if (r > 0) { toast('Needs ' + fmtDur(r) + ' more focus time first'); return; }
      }
      setLog(h, k, isDone ? 0 : 100);
      renderAll();
      if (act === 'toggle') {
        var el = list.querySelector('.habit[data-id="' + h.id + '"]');
        if (el) el.classList.add('pop');
      }
    } else if (act === 'focus') {
      if (active() && sess.hid !== h.id) { toast('Finish or discard your current session first'); return; }
      sess.hid = h.id; saveSess(); renderFocus();
      $('focus').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    } else if (act === 'edit') {
      openDlg(h);
    } else if (act === 'del') {
      if (confirm('Delete “' + h.title + '” and its history?')) {
        state.habits = state.habits.filter(function (x) { return x.id !== h.id; });
        save(); renderAll();
      }
    }
  });

  // Dragging a slider updates the card in place; releasing it refreshes streaks
  list.addEventListener('input', function (e) {
    var r = e.target;
    if (r.type !== 'range') return;
    var li = r.closest('.habit'), h = find(li.dataset.id), v = +r.value;
    if (v >= 100) {
      var rm = remain(h, todayKey());
      if (rm > 0) { v = 95; r.value = 95; toast('Needs ' + fmtDur(rm) + ' more focus time first'); }
    }
    setLog(h, todayKey(), v);
    li.querySelector('.fill').style.width = v + '%';
    li.querySelector('.val').textContent = v + '%';
    li.classList.toggle('done', v >= 100);
    renderStats();
  });
  list.addEventListener('change', function (e) { if (e.target.type === 'range') renderList(); });

  $('targetRange').addEventListener('input', function (e) {
    state.target = +e.target.value; save(); renderStats();
  });

  /* ---------- Quote card (after a focus session) ---------- */
  
  var qdlg = $('qdlg');
  function openQuote(h, sec) {
    $('qSub').textContent = fmtDur(sec) + ' of focus saved to “' + h.title + '”';
    if (window.SummitQuotes) SummitQuotes.showEnd();
    if (typeof qdlg.showModal === 'function') { if (!qdlg.open) qdlg.showModal(); }
    else qdlg.setAttribute('open', '');
    $('qClose').focus();
  }
  function closeQuote() {
    if (typeof qdlg.close === 'function') qdlg.close();
    else qdlg.removeAttribute('open');
  }
  $('qClose').addEventListener('click', closeQuote);
  qdlg.addEventListener('click', function (e) { if (e.target === qdlg) closeQuote(); });

  /* ---------- Focus sessions (timer / stopwatch) ---------- */
   function loadSess() {
    try {
      var s = JSON.parse(localStorage.getItem(SESS));
      if (s && typeof s === 'object') {
        return { hid: s.hid || null, mode: s.mode === 'stopwatch' ? 'stopwatch' : 'timer',
                 dur: +s.dur > 0 ? +s.dur : 1500, acc: +s.acc || 0, t0: s.t0 || null, begin: +s.begin || null };
      }
    } catch (e) {}
    return { hid: null, mode: 'timer', dur: 1500, acc: 0, t0: null, begin: null };
  }
  var sess = loadSess();
  function saveSess() { try { localStorage.setItem(SESS, JSON.stringify(sess)); } catch (e) {} }
  function elapsed() { return sess.acc + (sess.t0 ? (Date.now() - sess.t0) / 1000 : 0); }
  function active() { return sess.t0 !== null || sess.acc > 0; }
  function resetSess() { sess.acc = 0; sess.t0 = null; sess.begin = null; saveSess(); }

  var actx = null;
  function ensureAudio() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }
  function beep() {
    if (!actx) return;
    [0, 0.35, 0.7].forEach(function (t) {
      var o = actx.createOscillator(), g = actx.createGain(), now = actx.currentTime + t;
      o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      o.start(now); o.stop(now + 0.3);
    });
  }

  function addTime(h, sec,begin) {
    var tk = todayKey();
    h.time[tk] = (h.time[tk] || 0) + sec;
        state.sessions.unshift({ hid: h.id, title: h.title, at: Date.now(), sec: sec, begin: begin || 0 });
    state.sessions = state.sessions.slice(0, 30);
    save();
    if (h.required && h.goal.day && remain(h, tk) === 0 && P(h, tk) < 100) {
      setLog(h, tk, 100);
      toast('Daily focus goal met. “' + h.title + '” is complete.');
    }
    renderAll();
  }

  function finish(auto) {
    var h = find(sess.hid);
    var sec = Math.round(elapsed());
    if (sess.mode === 'timer' && (auto || sec > sess.dur)) sec = sess.dur;
    var begin = sess.begin || 0;
    resetSess();
    if (!h) { toast('That habit no longer exists'); renderFocus(); return; }
    if (sec < 10) { toast('Too short to save (under 10 seconds)'); renderFocus(); return; }
    if (auto) beep();
    addTime(h, sec, begin);
    openQuote(h, sec);          // show the quote after every saved session
  }

  function tickClock() {
    var e = elapsed(), txt;
    if (sess.mode === 'timer') {
      var rem = sess.dur - e;
      if (sess.t0 && rem <= 0) { finish(true); return; }
      txt = fmtClock(Math.ceil(Math.max(0, rem)));
    } else txt = fmtClock(e);
    $('fpClock').textContent = txt;
    document.title = sess.t0 ? txt + ' · Summit' : BASE_TITLE;
  }
  setInterval(tickClock, 250);

  function renderFocus() {
    if (sess.hid && !find(sess.hid)) { sess.hid = null; sess.acc = 0; sess.t0 = null; saveSess(); }
    var tk = todayKey(), act = active(), h = find(sess.hid);

    $('fpHabit').innerHTML = '<option value="">Choose a habit…</option>' + state.habits.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === sess.hid ? ' selected' : '') + '>' + esc(x.title) + '</option>';
    }).join('');
    $('fpHabit').disabled = act;
    $('fpTimer').setAttribute('aria-pressed', sess.mode === 'timer');
    $('fpWatch').setAttribute('aria-pressed', sess.mode === 'stopwatch');
    $('fpTimer').disabled = act; $('fpWatch').disabled = act;
    $('fpCfg').style.display = sess.mode === 'timer' ? '' : 'none';
    $('fpMins').value = Math.round(sess.dur / 60);
    $('fpMins').disabled = act;
    document.querySelectorAll('#fpPresets button').forEach(function (b) { b.disabled = act; });
    $('fpToggle').textContent = sess.t0 ? 'Pause' : (sess.acc > 0 ? 'Resume' : 'Start');
    $('fpSave').disabled = !act;
    $('fpReset').disabled = !act;

    $('fpStatus').textContent = h
      ? h.title + ': ' + fmtDur(secOn(h, tk)) + ' today' + (h.goal.day ? ' of ' + fmtDur(h.goal.day * 60) + ' goal' : '') + '.'
      : 'Pick a habit to start a session.';

    var rows = state.sessions.slice(0, 5).map(function (s) {
      var d = new Date(s.at), same = key(d) === tk;
      var when = (same ? 'Today' : fmtShort(d)) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return '<li class="srow"><span class="font-bold">' + esc(s.title) + '</span><span class="opacity-80">' + when + ' · <b>' + fmtDur(s.sec) + '</b></span></li>';
    }).join('');
    $('fpList').innerHTML = rows || '<li class="text-sm opacity-70">No sessions yet. Your saved focus time will show up here.</li>';
    tickClock();
  }

  $('fpHabit').addEventListener('change', function (e) { sess.hid = e.target.value || null; saveSess(); renderFocus(); });
  $('fpTimer').addEventListener('click', function () { sess.mode = 'timer'; saveSess(); renderFocus(); });
  $('fpWatch').addEventListener('click', function () { sess.mode = 'stopwatch'; saveSess(); renderFocus(); });
  $('fpMins').addEventListener('change', function (e) {
    var m = Math.max(1, Math.min(600, parseInt(e.target.value, 10) || 25));
    sess.dur = m * 60; saveSess(); renderFocus();
  });
  $('fpPresets').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    sess.dur = +b.dataset.m * 60; saveSess(); renderFocus();
  });
  $('fpToggle').addEventListener('click', function () {
    if (!sess.hid) { toast('Pick a habit first'); return; }
    ensureAudio();
    if (sess.t0) { sess.acc = elapsed(); sess.t0 = null; }
        else { if (!sess.acc) sess.begin = Date.now(); sess.t0 = Date.now(); }
    saveSess(); renderFocus();
  });
  $('fpSave').addEventListener('click', function () { if (active()) finish(false); });
  $('fpReset').addEventListener('click', function () {
    if (!active()) return;
    resetSess(); toast('Session discarded'); renderFocus();
  });

  /* ---------- Add / edit dialog ---------- */
  function openModal() {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  function closeModal() {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }
  function num(id) { var v = parseInt($(id).value, 10); return v > 0 ? v : 0; }
  function syncReq() {
    var has = num('dDay') > 0;
    $('dReq').disabled = !has;
    if (!has) $('dReq').checked = false;
  }
  $('dDay').addEventListener('input', syncReq);

  function openDlg(h) {
    editId = h ? h.id : null;
    $('dlgTitle').textContent = h ? 'Edit habit' : 'New habit';
    $('dTitle').value = h ? h.title : '';
    $('dNote').value = h ? h.note : '';
    $('dStart').max = todayKey();
    $('dStart').value = h ? h.start : todayKey();
    $('dDay').value = h && h.goal.day ? h.goal.day : '';
    $('dWeek').value = h && h.goal.week ? h.goal.week : '';
    $('dMonth').value = h && h.goal.month ? h.goal.month : '';
    $('dReq').checked = h ? h.required : false;
    syncReq();
    var idx = h ? h.color : state.habits.length % 4;
    form.querySelector('input[name=color][value="' + idx + '"]').checked = true;
    openModal();
    $('dTitle').focus();
  }

  $('cancel').addEventListener('click', closeModal);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeModal(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('dTitle').value.trim();
    if (!title) return;
    var start = $('dStart').value || todayKey();
    if (start > todayKey()) start = todayKey();
    var color = +form.querySelector('input[name=color]:checked').value;
    var goal = { day: num('dDay'), week: num('dWeek'), month: num('dMonth') };
    var required = $('dReq').checked && goal.day > 0;
    var note = $('dNote').value.trim();

    if (editId) {
      var h = find(editId);
      h.title = title; h.note = note; h.start = start; h.color = color; h.goal = goal; h.required = required;
    } else {
      state.habits.push({ id: uid(), title: title, note: note, start: start, color: color, log: {}, time: {}, goal: goal, required: required });
    }
    save();
    closeModal();
    renderAll();
  });

  /* ---------- Confetti (uses current theme colors) ---------- */
  var cv = $('fx'), cx = cv.getContext('2d'), parts = [], raf;
  function size() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
  addEventListener('resize', size); size();

  function confetti() {
    if (reduceMotion) return;
    var cs = getComputedStyle(document.documentElement);
    var cols = ['--sp1', '--sp2', '--sp3', '--sp4', '--accent'].map(function (v) { return cs.getPropertyValue(v).trim() || '#fff'; });
    var W = cv.width, H = cv.height;
    for (var i = 0; i < 170; i++) {
      var left = i % 2 === 0;
      parts.push({
        x: left ? 0 : W, y: H * 0.75,
        vx: (left ? 1 : -1) * (6 + Math.random() * 12) * devicePixelRatio,
        vy: -(14 + Math.random() * 16) * devicePixelRatio,
        w: (6 + Math.random() * 8) * devicePixelRatio, h: (4 + Math.random() * 6) * devicePixelRatio,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], life: 0
      });
    }
    cancelAnimationFrame(raf);
    tick();
  }
  function tick() {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach(function (p) {
      p.vy += 0.5 * devicePixelRatio; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c;
      cx.globalAlpha = Math.max(0, 1 - p.life / 140);
      cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cx.restore();
    });
    parts = parts.filter(function (p) { return p.life < 140 && p.y < cv.height + 50; });
    if (parts.length) raf = requestAnimationFrame(tick); else cx.clearRect(0, 0, cv.width, cv.height);
  }

  /* ---------- Start ---------- */
  $('today').textContent = 'Today is ' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  $('year').textContent = new Date().getFullYear();
  celebrated = state.habits.length > 0 && state.habits.every(function (h) { return P(h, todayKey()) >= 100; }); // no confetti on page load
  renderAll();
})();