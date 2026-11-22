(function () {
  'use strict';

  var KEY = 'peaks.tfocus', SKEY = 'peaks.tsess', TKEY = 'peaks.tasks', HKEY = 'peaks.v3', HSESS = 'peaks.sess';
  var $ = function (id) { return document.getElementById(id); };

  /* null-safe writers: a missing element is skipped instead of crashing the file */
  function setText(id, txt) { var e = $(id); if (e && e.textContent !== txt) e.textContent = txt; }
  function setHTML(id, html) { var e = $(id); if (e) e.innerHTML = html; }
  function setProp(id, prop, val) { var e = $(id); if (e) e[prop] = val; }
  function setAttr(id, name, val) { var e = $(id); if (e) e.setAttribute(name, val); }
  function on(id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); }

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayKey() { return key(new Date()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDur(sec) {
    var m = Math.round(sec / 60);
    if (m === 0) return sec > 0 ? '<1m' : '0m';
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' : '') + pad(m) + ':' + pad(s);
  }
  function weekRange() {
    var t = new Date(), mon = addDays(t, -((t.getDay() + 6) % 7));
    return [key(mon), key(addDays(mon, 6))];
  }
  function monthRange() {
    var t = new Date(), p = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-';
    return [p + '01', p + '31'];
  }
  function toast(msg) {
    var box = $('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }

  /* ---------- storage ---------- */
  var F = (function () {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.days) return { days: s.days, tasks: s.tasks || {}, sessions: s.sessions || [] };
    } catch (e) {}
    return { days: {}, tasks: {}, sessions: [] };
  })();
  function saveF() { try { localStorage.setItem(KEY, JSON.stringify(F)); } catch (e) {} }

  var sess = (function () {
    try {
      var s = JSON.parse(localStorage.getItem(SKEY));
      if (s && typeof s === 'object') {
        return { tid: s.tid || '*', title: s.title || 'General focus', mode: s.mode === 'stopwatch' ? 'stopwatch' : 'timer',
                 dur: +s.dur > 0 ? +s.dur : 1500, acc: +s.acc || 0, t0: s.t0 || null, begin: +s.begin || null };
      }
    } catch (e) {}
    return { tid: '*', title: 'General focus', mode: 'timer', dur: 1500, acc: 0, t0: null, begin: null };
  })();
  function saveS() { try { localStorage.setItem(SKEY, JSON.stringify(sess)); } catch (e) {} }
  function elapsed() { return sess.acc + (sess.t0 ? (Date.now() - sess.t0) / 1000 : 0); }
  function active() { return sess.t0 !== null || sess.acc > 0; }
  function resetS() { sess.acc = 0; sess.t0 = null; sess.begin = null; saveS(); }

  function habits() {
    try { var s = JSON.parse(localStorage.getItem(HKEY)); return s && Array.isArray(s.habits) ? s.habits : []; }
    catch (e) { return []; }
  }
  function habitBusy() {
    try { var s = JSON.parse(localStorage.getItem(HSESS)); return !!(s && (s.t0 || s.acc > 0)); }
    catch (e) { return false; }
  }
  function habitRunning() {
    try { var s = JSON.parse(localStorage.getItem(HSESS)); return !!(s && s.t0); }
    catch (e) { return false; }
  }

  /* ---------- tasks ---------- */
  function openTasks() {
    try {
      var s = JSON.parse(localStorage.getItem(TKEY));
      var all = s && Array.isArray(s.tasks) ? s.tasks.filter(function (t) { return !t.done; }) : [];
      var map = {}; all.forEach(function (t) { map[t.id] = t; });
      var ids = [], top = document.querySelector('#qNow [data-id]');
      if (top) ids.push(top.dataset.id);
      document.querySelectorAll('#qList .qrow[data-id]').forEach(function (li) { ids.push(li.dataset.id); });
      var out = [];
      ids.forEach(function (id) { if (map[id]) { out.push(map[id]); delete map[id]; } });
      Object.keys(map).forEach(function (id) { out.push(map[id]); });
      return out;
    } catch (e) { return []; }
  }
  function taskText(id) {
    var t = openTasks().filter(function (x) { return x.id === id; })[0];
    return t ? t.text : '';
  }
  function short(s) { return s.length > 52 ? s.slice(0, 50) + '…' : s; }

  /* ---------- public API: other files read the task focus seconds from here ---------- */
  window.TaskFocus = {
    sec: function (k) { return F.days[k] || 0; },
    range: function (a, b) { var s = 0; for (var k in F.days) { if (k >= a && k <= b) s += F.days[k]; } return s; }
  };

  /* ---------- keep the "Focus today" numbers (made by script.js) in sync ---------- */
  var els = {
    c3v: $('c3v'), c3r: $('c3r'), fToday: $('fToday'), fWeek: $('fWeek'), fMonth: $('fMonth'), sumText: $('sumText')
  };
  var RE = /(Focus time so far: |You spent )(<1m|\d+m|\d+h(?: \d+m)?)/;
  var obs = null;

  function hsum(hs, k) { return hs.reduce(function (a, h) { return a + ((h.time && h.time[k]) || 0); }, 0); }
  function hrange(hs, a, b) {
    var s = 0;
    hs.forEach(function (h) { for (var k in h.time) { if (k >= a && k <= b) s += h.time[k]; } });
    return s;
  }
  function watch() {
    if (!obs) return;
    ['c3v', 'c3r', 'fToday', 'fWeek', 'fMonth', 'sumText'].forEach(function (n) {
      if (els[n]) obs.observe(els[n], { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    });
  }
  function apply() {
    if (!els.c3v || !els.c3r) return;
    var hs = habits(), tk = todayKey(), wk = weekRange(), mo = monthRange();
    var today = hsum(hs, tk) + (F.days[tk] || 0);
    var goal = hs.reduce(function (a, h) { return a + ((h.goal && h.goal.day) || 0) * 60; }, 0);
    var ref = goal > 0 ? goal : 3600;
    var week = hrange(hs, wk[0], wk[1]) + TaskFocus.range(wk[0], wk[1]);
    var month = hrange(hs, mo[0], mo[1]) + TaskFocus.range(mo[0], mo[1]);

    if (obs) obs.disconnect();
    els.c3v.textContent = fmtDur(today);
    els.c3r.style.strokeDashoffset = 326.7 * (1 - Math.max(0, Math.min(100, today / ref * 100)) / 100);
    if (els.fToday) els.fToday.textContent = fmtDur(today);
    if (els.fWeek) els.fWeek.textContent = fmtDur(week);
    if (els.fMonth) els.fMonth.textContent = fmtDur(month);
    if (els.sumText) {
      var st = els.sumText.textContent, ns = st.replace(RE, function (m, p) { return p + fmtDur(today); });
      if (ns !== st) els.sumText.textContent = ns;
    }
    watch();
  }
  obs = new MutationObserver(function () { apply(); });

  /* ---------- the task focus card ---------- */
  var html =
    '<section id="tfocus" class="panel-deep fsess">' +
      '<div class="fs-head">' +
        '<h3 class="h3">Task focus session</h3>' +
        '<div class="seg" role="group" aria-label="Session type">' +
          '<button type="button" id="tfTimer" aria-pressed="true">Timer</button>' +
          '<button type="button" id="tfWatch" aria-pressed="false">Stopwatch</button></div>' +
      '</div>' +
      '<div class="fs-fields">' +
        '<div class="fs-f"><label class="lbl" for="tfTask">Working on</label>' +
          '<select id="tfTask" class="field"></select></div>' +
        '<div class="fs-f" id="tfCfg"><label class="lbl" for="tfMins">Timer length</label>' +
          '<div class="fs-lenrow">' +
            '<input id="tfMins" class="field" type="number" min="1" max="600" value="25" aria-label="Timer length in minutes">' +
            '<span class="fs-unit">min</span>' +
            '<span id="tfPresets" class="chiprow">' +
              '<button type="button" class="chip" data-m="15">15</button>' +
              '<button type="button" class="chip" data-m="25">25</button>' +
              '<button type="button" class="chip" data-m="45">45</button></span>' +
          '</div></div>' +
      '</div>' +
      '<div id="tfClock" class="clock serif" role="timer" aria-live="off">25:00</div>' +
      '<div class="btnrow">' +
        '<button type="button" id="tfToggle" class="btn btn-soft">Start</button>' +
        '<button type="button" id="tfSave" class="btn btn-line btn-sm">Finish &amp; save</button>' +
        '<button type="button" id="tfReset" class="btn btn-line btn-sm">Discard</button></div>' +
      '<p class="hint fs-status" id="tfStatus"></p>' +
      '<details class="fold fs-recent"><summary><h3 class="h4">Recent task sessions</h3></summary>' +
        '<ul id="tfList" class="grid gap-2"></ul></details>' +
    '</section>';

  var old = $('tfocus'); if (old) old.remove();                 // never leave a duplicate or half-built card behind
  var queue = $('queue'), pane = $('pane-tasks');
  if (queue) queue.insertAdjacentHTML('afterend', html);
  else if (pane) pane.insertAdjacentHTML('beforeend', html);
  else return;
  if (!$('tfClock') || !$('tfToggle') || !$('tfStatus')) { console.error('Task focus card could not be built'); return; }

  /* ---------- sound + quote ---------- */
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
  function quote(sec, title) {
    var d = $('qdlg'); if (!d) return;
    setText('qSub', fmtDur(sec) + ' of focus saved to “' + title + '”');
    if (window.SummitQuotes) SummitQuotes.showEnd();
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    var b = $('qClose'); if (b) b.focus();
  }

  /* ---------- saving a session ---------- */
  function record(tid, title, sec, begin) {
    var tk = todayKey();
    F.days[tk] = (F.days[tk] || 0) + sec;
    if (tid !== '*') {
      var r = F.tasks[tid] || (F.tasks[tid] = { title: title, sec: 0 });
      r.sec += sec; r.title = title;
    }
    F.sessions.unshift({ tid: tid, title: title, at: Date.now(), sec: sec, begin: begin || 0 });
    F.sessions = F.sessions.slice(0, 30);
    saveF();
    apply();
    window.dispatchEvent(new Event('peaks:tfocus'));
  }

  function finish(auto) {
    var sec = Math.round(elapsed());
    if (sess.mode === 'timer' && (auto || sec > sess.dur)) sec = sess.dur;
    var tid = sess.tid, title = sess.title || 'General focus', begin = sess.begin || 0;
    resetS();
    if (sec < 10) { toast('Too short to save (under 10 seconds)'); render(); return; }
    if (auto) beep();
    record(tid, title, sec, begin);
    render();
    quote(sec, title);
  }

  function tickClock() {
    var e = elapsed(), txt;
    if (sess.mode === 'timer') {
      var rem = sess.dur - e;
      if (sess.t0 && rem <= 0) { finish(true); return; }
      txt = fmtClock(Math.ceil(Math.max(0, rem)));
    } else txt = fmtClock(e);
    setText('tfClock', txt);
  }
  setInterval(tickClock, 250);

  /* ---------- browser tab title: ONE owner, so it never flickers ----------
     script.js writes the title every 250 ms for the habit timer. Instead of fighting it,
     every write now passes through this setter, which swaps in the task time when the task timer runs. */
  var nativeTitle = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  function taskTitle() {
    if (!sess.t0 || habitRunning()) return null;           // the habit timer owns the title when it runs
    var e = elapsed();
    return (sess.mode === 'timer' ? fmtClock(Math.ceil(Math.max(0, sess.dur - e))) : fmtClock(e)) + ' · Task focus';
  }
  if (nativeTitle && nativeTitle.set) {
    Object.defineProperty(document, 'title', {
      configurable: true,
      get: function () { return nativeTitle.get.call(document); },
      set: function (v) {
        v = String(v);
        var t = / · Summit$/.test(v) ? null : taskTitle();
        nativeTitle.set.call(document, t === null ? v : t);
      }
    });
    setInterval(function () { var t = taskTitle(); if (t !== null) document.title = t; }, 250);
  }

  /* ---------- render ---------- */
  function renderSelect() {
    var sel = $('tfTask'); if (!sel || document.activeElement === sel) return;
    var tasks = openTasks();
    var opts = '<option value="*">General focus (no specific task)</option>' +
      tasks.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(short(t.text)) + '</option>'; }).join('');
    if (sess.tid !== '*' && !tasks.some(function (t) { return t.id === sess.tid; })) {
      if (active()) opts += '<option value="' + esc(sess.tid) + '">' + esc(short(sess.title)) + ' (finished)</option>';
      else { sess.tid = '*'; sess.title = 'General focus'; saveS(); }
    }
    sel.innerHTML = opts;
    sel.value = sess.tid;
  }

  function render() {
    var act = active(), tk = todayKey(), cfg = $('tfCfg');
    renderSelect();
    setProp('tfTask', 'disabled', act);
    setAttr('tfTimer', 'aria-pressed', String(sess.mode === 'timer'));
    setAttr('tfWatch', 'aria-pressed', String(sess.mode === 'stopwatch'));
    setProp('tfTimer', 'disabled', act); setProp('tfWatch', 'disabled', act);
    if (cfg) cfg.style.display = sess.mode === 'timer' ? '' : 'none';
    setProp('tfMins', 'value', Math.round(sess.dur / 60));
    setProp('tfMins', 'disabled', act);
    document.querySelectorAll('#tfPresets button').forEach(function (b) { b.disabled = act; });
    setText('tfToggle', sess.t0 ? 'Pause' : (sess.acc > 0 ? 'Resume' : 'Start'));
    setProp('tfSave', 'disabled', !act);
    setProp('tfReset', 'disabled', !act);

    var spent = sess.tid !== '*' && F.tasks[sess.tid] ? F.tasks[sess.tid].sec : 0;
    setText('tfStatus', 'Task focus today: ' + fmtDur(F.days[tk] || 0) + (spent ? '. On this task so far: ' + fmtDur(spent) : '') + '.');

    var rows = F.sessions.slice(0, 5).map(function (s) {
      var d = new Date(s.at), same = key(d) === tk;
      var when = (same ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return '<li class="srow"><span class="font-bold">' + esc(short(s.title)) + '</span><span class="opacity-80">' + when + ' · <b>' + fmtDur(s.sec) + '</b></span></li>';
    }).join('');
    setHTML('tfList', rows || '<li class="hint">No task sessions yet. Saved time shows up here.</li>');
    tickClock();
  }

  /* ---------- events ---------- */
  on('tfTask', 'change', function (e) {
    sess.tid = e.target.value || '*';
    sess.title = sess.tid === '*' ? 'General focus' : (taskText(sess.tid) || 'Task');
    saveS(); render();
  });
  on('tfTimer', 'click', function () { sess.mode = 'timer'; saveS(); render(); });
  on('tfWatch', 'click', function () { sess.mode = 'stopwatch'; saveS(); render(); });
  on('tfMins', 'change', function (e) {
    var m = Math.max(1, Math.min(600, parseInt(e.target.value, 10) || 25));
    sess.dur = m * 60; saveS(); render();
  });
  on('tfPresets', 'click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    sess.dur = +b.dataset.m * 60; saveS(); render();
  });
  on('tfToggle', 'click', function () {
    if (!sess.t0 && habitBusy()) { toast('Finish or discard your habit focus session first, so time isn’t counted twice'); return; }
    ensureAudio();
    if (sess.t0) { sess.acc = elapsed(); sess.t0 = null; }
    else {
      if (sess.tid === '*') sess.title = 'General focus';
      else sess.title = taskText(sess.tid) || sess.title || 'Task';
      if (!sess.acc) sess.begin = Date.now();           // remember when the session really started
      sess.t0 = Date.now();
    }
    saveS(); render();
  });
  on('tfSave', 'click', function () { if (active()) finish(false); });
  on('tfReset', 'click', function () {
    if (!active()) return;
    resetS(); toast('Session discarded'); render();
  });

  // keep the task list fresh when tasks are added, finished or re-ordered
  var qn = $('qNow');
  if (qn) new MutationObserver(function () { if (!active()) renderSelect(); }).observe(qn, { childList: true });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { renderSelect(); apply(); } });

  /* ---------- start ---------- */
  render();
  apply();
})();