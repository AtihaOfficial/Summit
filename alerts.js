(function () {
  'use strict';

  var SKEY = 'peaks.notify', FKEY = 'peaks.notify.fired', LKEY = 'peaks.notify.log', SEEN = 'peaks.notify.seen';
  var $ = function (id) { return document.getElementById(id); };
  var nav = document.querySelector('.nav');
  if (!nav) return;

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toMin(s) { var p = String(s).split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  function wrap(m) { return ((m % 1440) + 1440) % 1440; }
  function fmtT(m) { m = wrap(Math.round(m)); var h = Math.floor(m / 60); return (h % 12 || 12) + ':' + pad(m % 60) + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function mins(m) {
    m = Math.round(m);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }
  function ago(m) {
    var n;
    if (m % 1440 === 0) { n = m / 1440; return n + (n === 1 ? ' day' : ' days'); }
    if (m % 60 === 0) { n = m / 60; return n + (n === 1 ? ' hour' : ' hours'); }
    return m + ' minutes';
  }
  function sday(k) {
    var p = k.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safe(k, fb) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; }
  }
  function habits() { var s = safe('peaks.v3', null); return s && Array.isArray(s.habits) ? s.habits : []; }
  function tasks() { var s = safe('peaks.tasks', null); return s && Array.isArray(s.tasks) ? s.tasks : []; }
  function habitTitle(id) {
    var h = habits().filter(function (x) { return x.id === id; })[0];
    return h ? h.title : '';
  }
  function paused(id, k) { return !!(window.Pause && Pause.is(id, k)); }
  function winOf(w) {                       // a habit's daily window, from the new { s, e } or the older { t, w } format
    var s, e;
    if (w.s !== undefined) { s = toMin(w.s); e = toMin(w.e); }
    else { var T = toMin(w.t), W = w.w || 30; s = T - W; e = T + W; }
    return { s: s, e: Math.max(s + 1, e) };
  }
  function deadline(t) {
    if (!t.due) return null;
    var p = t.due.split('-'), tm = (t.dueTime || '23:59').split(':');
    return new Date(+p[0], +p[1] - 1, +p[2], +tm[0] || 0, +tm[1] || 0, t.dueTime ? 0 : 59).getTime();
  }
  function dueText(t, dl) {
    var d = new Date(dl), same = key(d) === key(new Date());
    var day = same ? 'today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return day + (t.dueTime ? ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ' (end of day)');
  }

  /* ---------- settings ---------- */
  var DEF = {
    on: true, sound: true,
    tickTimer: false, tickWatch: false, vol: 0.4, nudge: 0,
    hOpen: true, hSoon: 10, hMiss: true, eve: true, eveT: '21:00', rem: {},
    tLeads: [60, 10], tCustom: 0, tStart: true, tMiss: true,
    sOn: true, sT: '21:00', sMiss: true
  };
  var S = (function () {
    var s = safe(SKEY, {}), o = {}, k;
    for (k in DEF) o[k] = s[k] !== undefined ? s[k] : DEF[k];
    if (!o.rem || typeof o.rem !== 'object') o.rem = {};
    if (!Array.isArray(o.tLeads)) o.tLeads = DEF.tLeads.slice();
    return o;
  })();
  function saveS() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }

  var F = safe(FKEY, {}), dirty = false;
  (function () {
    var cut = Date.now() - 5 * 86400000;
    Object.keys(F).forEach(function (k) { if (F[k] < cut) { delete F[k]; dirty = true; } });
  })();
  function fired(k) { return !!F[k]; }
  function mark(k) { F[k] = Date.now(); dirty = true; }
  function flush() { if (dirty) { try { localStorage.setItem(FKEY, JSON.stringify(F)); } catch (e) {} dirty = false; } }

  var LOG = safe(LKEY, []);
  if (!Array.isArray(LOG)) LOG = [];
  var seenAt = +localStorage.getItem(SEEN) || 0;

 
  /* ---------- sound ---------- */
  var ctx = null;
  function audio() {
    try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {}
    return ctx;
  }
  document.addEventListener('pointerdown', audio, { passive: true });   // browsers only allow sound after a click

  function chime() {
    var c = audio();
    if (!c || c.state !== 'running' || !S.sound) return;
    [[0, 784], [0.16, 1047]].forEach(function (n) {
      var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + n[0];
      o.type = 'sine'; o.frequency.value = n[1]; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    });
  }
  function tick(sec) {
    var c = audio();
    if (!c || c.state !== 'running') return;
    var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = sec % 2 ? 1150 : 1550;
    o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, S.vol * 0.5), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.start(t); o.stop(t + 0.06);
  }

  /* ---------- bell button + popup stack ---------- */
  var bell = document.createElement('button');
  bell.id = 'bellBtn'; bell.type = 'button'; bell.className = 'ibtn';
  bell.setAttribute('aria-label', 'Alerts and sounds');
  bell.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' +
    '<span class="bell-badge" hidden></span>';
  nav.insertBefore(bell, $('themeBtn') || null);

  var box = document.createElement('div');
  box.id = 'alerts'; box.setAttribute('aria-live', 'polite');
  document.body.appendChild(box);

  function badge() {
    var n = LOG.filter(function (e) { return e.t > seenAt; }).length;
    var b = bell.querySelector('.bell-badge');
    b.hidden = n === 0;
    b.textContent = n > 9 ? '9+' : String(n);
  }

  function sys(o) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var n = new Notification(o.title, { body: o.body || '', tag: 'summit-' + o.title });
      n.onclick = function () { window.focus(); n.close(); };
    } catch (e) {}
  }

  var GO = { habits: 'Open habits', tasks: 'Open tasks', screen: 'Open screen time' };
  function popup(o, force) {
    if (!S.on && !force) return;
    var kind = o.kind || 'info';
    if (!o.nolog) {
      LOG.unshift({ t: Date.now(), title: o.title, body: o.body || '', kind: kind });
      LOG = LOG.slice(0, 30);
      try { localStorage.setItem(LKEY, JSON.stringify(LOG)); } catch (e) {}
      badge();
    }

    var card = document.createElement('div');
    card.className = 'alert ' + kind;
    card.setAttribute('role', 'status');
       card.innerHTML =
      '<div class="alert-b"><b>' + (kind === 'quote' ? '✦ ' : '') + esc(o.title) + '</b>' +
      (o.body ? '<p>' + esc(o.body) + '</p>' : '') +
      (o.img ? '<img class="alert-img" alt="" src="' + esc(o.img) + '">' : '') +
      (o.go ? '<div class="alert-act"><button type="button" class="btn btn-deep btn-sm" data-go="' + o.go + '">' + (GO[o.go] || 'Open') + '</button></div>' : '') +
      '</div><button type="button" class="alert-x" aria-label="Dismiss">×</button>';
    box.insertBefore(card, box.firstChild);
    while (box.children.length > 4) box.removeChild(box.lastChild);
    var tm = setTimeout(function () { card.remove(); }, kind === 'miss' ? 30000 : kind === 'quote' ? 18000 : 14000);
    card.addEventListener('click', function (e) {
      if (e.target.closest('.alert-x') || e.target.closest('[data-go]')) { clearTimeout(tm); card.remove(); }
    });
    if (!o.silent) chime();
    if (o.sysForce || document.hidden || !document.hasFocus()) sys(o);
  }
  window.SummitAlert = function (o) { popup(o, true); };      // the Quotes tab uses this for its test button

  /* ---------- timers and stopwatches (habit + task) ---------- */
  function readSess(k) {
    var s = safe(k, null);
    if (!s || typeof s !== 'object') return null;
    return { mode: s.mode === 'stopwatch' ? 'stopwatch' : 'timer', dur: +s.dur > 0 ? +s.dur : 1500,
             acc: +s.acc || 0, t0: s.t0 || null, hid: s.hid, title: s.title };
  }
  var last = { h: null, t: null }, tickSec = { h: -1, t: -1 };

  function timerDone(run) {
    var k = 's:' + run.k + ':' + run.t0;
    if (fired(k)) return;
    mark(k);
    popup({ title: 'Timer complete', body: run.title + ': ' + mins(run.dur / 60) + ' done.', kind: 'info', silent: true,
            go: run.k === 'h' ? 'habits' : 'tasks' });
  }

  function handle(kind, s, now) {
    var prev = last[kind];
    if (s && s.t0) {
      var title = kind === 'h' ? (habitTitle(s.hid) || 'Habit') : (s.title || 'Task focus');
      var run = { k: kind, t0: s.t0, acc: s.acc, dur: s.dur, mode: s.mode, title: title };
      last[kind] = run;
      var e = s.acc + (now - s.t0) / 1000, sec = Math.floor(e);
      if (tickSec[kind] !== sec) {
        tickSec[kind] = sec;
        if (s.mode === 'timer' ? S.tickTimer : S.tickWatch) tick(sec);
      }
      if (s.mode === 'timer' && e >= s.dur) timerDone(run);
      else {
        if (s.mode === 'stopwatch' && S.nudge > 0) {
          var n = Math.floor(e / (S.nudge * 60));
          if (n >= 1) {
            var k2 = 'sw:' + kind + ':' + s.t0 + ':' + n;
            if (!fired(k2)) { mark(k2); popup({ title: 'Still focusing', body: title + ': ' + mins(n * S.nudge) + ' so far.', kind: 'info' }); }
          }
        }
               var SQ = window.SummitQuotes, Q = SQ ? SQ.cfg() : null;   // a reminder every N minutes
        if (Q && Q.on && (s.mode === 'timer' ? Q.timers : Q.watches)) {
          var nq = Math.floor(e / (Q.every * 60));
          if (nq >= 1 && !(s.mode === 'timer' && s.dur - e < 15)) {
            var k3 = 'mq:' + kind + ':' + s.t0 + ':' + nq;
            if (!fired(k3)) {
              mark(k3);
              var pq = SQ.pick('run');
              if (pq) popup({ title: 'Keep going', body: pq.text ? '“' + pq.text + '”' : '', img: pq.img, kind: 'quote', nolog: true });
            }
          }
        }
      }
    } else {
      last[kind] = null;
      tickSec[kind] = -1;
      // the session vanished: if it was a timer that ran out, it finished; a manual finish or discard happens earlier
      if (prev && prev.mode === 'timer' && (!s || s.acc === 0) && now >= prev.t0 + (prev.dur - prev.acc) * 1000 - 1500) timerDone(prev);
    }
  }

  /* ---------- scheduled alerts: habits, tasks, screen time ---------- */
  var firstScan = true;
  function scan(now) {
    if (!S.on) return;
    var d = new Date(now), tk = key(d), mid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var out = [];
    function add(k, trig, grace, item) {
      if (fired(k) || now < trig) return;
      mark(k);
      if (grace !== null && now - trig > grace) return;       // too old to be useful, skip quietly
      out.push(item);
    }

    var hs = habits(), sc = (safe('peaks.htimes', {}) || {}).sched || {};
    var open = [];
    hs.forEach(function (h) {
      if (h.start > tk) return;
      if (paused(h.id, tk)) return;                           // paused habits never send alerts
      if (((h.log && h.log[tk]) || 0) >= 100) return;
      open.push(h);

      var rt = S.rem[h.id];
      if (rt) add('h:' + h.id + ':' + tk + ':rem', mid + toMin(rt) * 60000, 30 * 60000,
        { title: 'Time for: ' + h.title, body: h.note || 'Keep your streak going.', go: 'habits', kind: 'info' });

      var wd = sc[h.id];
      if (wd) {
        var w = winOf(wd), ws = mid + w.s * 60000, we = mid + w.e * 60000;
        if (S.hOpen) add('h:' + h.id + ':' + tk + ':open', ws, 30 * 60000,
          { title: 'Window open: ' + h.title, body: 'Do it between ' + fmtT(w.s) + ' and ' + fmtT(w.e) + '.', go: 'habits', kind: 'info' });
        if (S.hSoon > 0) add('h:' + h.id + ':' + tk + ':soon', we - S.hSoon * 60000, 10 * 60000,
          { title: h.title + ' closes in ' + S.hSoon + ' min', body: 'The window ends at ' + fmtT(w.e) + '.', go: 'habits', kind: 'warn' });
        if (S.hMiss) add('h:' + h.id + ':' + tk + ':miss', we, null,
          { title: 'Missed: ' + h.title, body: 'Its window closed at ' + fmtT(w.e) + '. It still counts if you do it now.', go: 'habits', kind: 'miss' });
      }
    });

    if (S.eve && open.length) {
      add('eve:' + tk, mid + toMin(S.eveT) * 60000, 3 * 3600000, {
        title: open.length + (open.length === 1 ? ' habit is' : ' habits are') + ' still open today',
        body: open.slice(0, 4).map(function (h) { return h.title; }).join(', ') + (open.length > 4 ? ' and more' : ''),
        go: 'habits', kind: 'warn'
      });
    }

    if (S.hMiss) {
      var yd = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1), yk = key(yd);
      if (!fired('y:' + yk)) {
        mark('y:' + yk);
        var miss = hs.filter(function (h) { return h.start <= yk && !paused(h.id, yk) && ((h.log && h.log[yk]) || 0) < 100; });
        if (miss.length) out.push({
          title: 'Missed yesterday',
          body: miss.slice(0, 4).map(function (h) { return h.title; }).join(', ') + (miss.length > 4 ? ' and more' : ''),
          go: 'habits', kind: 'miss'
        });
      }
    }

    tasks().forEach(function (t) {
      if (t.done || !t.due) return;
      var dl = deadline(t); if (dl === null) return;
      var cr = t.created || 0;
      if (cr > dl) return;

      var leads = S.tLeads.slice();
      if (S.tCustom > 0 && leads.indexOf(S.tCustom) < 0) leads.push(S.tCustom);
      leads.forEach(function (m) {
        var trig = dl - m * 60000;
        if (cr > trig) return;                                   // you added it after this point, so you already know
        add('t:' + t.id + ':' + m, trig, 10 * 60000,
          { title: 'Due in ' + ago(m) + ': ' + t.text, body: 'Deadline ' + dueText(t, dl) + '.', go: 'tasks', kind: 'warn' });
      });

      if (S.tStart && t.est > 0) {
        var st = dl - t.est * 60000;
        if (cr <= st) add('t:' + t.id + ':start', st, 10 * 60000,
          { title: 'Time to start: ' + t.text, body: 'It needs about ' + mins(t.est) + ' and is due ' + dueText(t, dl) + '.', go: 'tasks', kind: 'warn' });
      }
      if (S.tMiss) add('t:' + t.id + ':miss', dl, 3 * 86400000,
        { title: 'Missed: ' + t.text, body: 'It was due ' + dueText(t, dl) + '.', go: 'tasks', kind: 'miss' });
    });

    /* screen time: today's reminder, and days that were never logged */
    if (S.sOn || S.sMiss) {
      var sd = safe('peaks.screen', null) || {}, sdays = sd.days || {};
      var logged = function (k) { var x = sdays[k]; return !!x && ((x.total || 0) > 0 || (x.items && x.items.length > 0)); };

      if (S.sOn && !logged(tk)) add('scr:' + tk, mid + toMin(S.sT) * 60000, 3 * 3600000,
        { title: 'Log today’s screen time', body: 'Open Screen Time on your phone, then enter the numbers so you can see what mattered.', go: 'screen', kind: 'warn' });

      if (S.sMiss) {
        var first = sd.since || tk;
        Object.keys(sdays).forEach(function (k) { if (logged(k) && k < first) first = k; });
        var gone = [];
        for (var i = 30; i >= 1; i--) {
          var k2 = key(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i));
          if (k2 >= first && !logged(k2)) gone.push(k2);
        }
        if (gone.length) add('scrm:' + tk, mid, null, {
          title: 'Screen time: ' + gone.length + (gone.length === 1 ? ' day' : ' days') + ' not logged',
          body: gone.slice(-4).map(sday).join(', ') + (gone.length > 4 ? ' and ' + (gone.length - 4) + ' more' : '') + '. Tap to fill them in.',
          go: 'screen', kind: 'miss'
        });
      }
    }

    if (out.length > 3) {
      popup({ title: out.length + ' alerts' + (firstScan ? ' while you were away' : ''),
              body: out.slice(0, 4).map(function (o) { return o.title; }).join(' · ') + ' …', kind: 'warn', go: 'habits' });
    } else out.forEach(function (o) { popup(o); });
    firstScan = false;
  }

  /* ---------- the heartbeat (a worker keeps time even when the tab is in the background) ---------- */
  var lastScan = 0;
  function loop() {
    var now = Date.now();
    handle('h', readSess('peaks.sess'), now);
    handle('t', readSess('peaks.tsess'), now);
    if (now - lastScan >= 1000) { lastScan = now; scan(now); }
    flush();
  }
  setInterval(loop, 250);
  try {
    var worker = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(1)},250)'], { type: 'text/javascript' })));
    worker.onmessage = loop;
  } catch (e) {}

  /* ---------- the Alerts & sounds dialog: six tabs, one setting per row ---------- */
  var TABS = [['gen', 'General'], ['hab', 'Habits'], ['task', 'Tasks'], ['tim', 'Timers'], ['scr', 'Screen'], ['log', 'Recent']];
  var LEADS = [[1440, '1 day'], [180, '3 hours'], [60, '1 hour'], [30, '30 min'], [10, '10 min']];

  function row(t, d, c) { return '<div class="set"><div class="set-t"><b>' + t + '</b>' + (d ? '<span>' + d + '</span>' : '') + '</div><div class="set-c">' + c + '</div></div>'; }
  function tg(id, label) { return '<label class="tg"><input type="checkbox" id="' + id + '" aria-label="' + label + '"><i></i></label>'; }
  function sel(id, label, opts) {
    return '<select id="' + id + '" class="field" aria-label="' + label + '">' +
      opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select>';
  }

  var dlg = document.createElement('dialog');
  dlg.id = 'adlg'; dlg.className = 'adlg';
  dlg.innerHTML =
    '<div class="adlg-in">' +
      '<div class="adlg-head"><div><h2 class="h2">Alerts &amp; sounds</h2>' +
        '<p class="hint">Alerts fire while Summit is open in a browser tab. A background tab is fine.</p></div>' +
        '<button type="button" class="btn btn-deep btn-sm" id="aDone">Done</button></div>' +
      '<div class="atabs" role="tablist" aria-label="Alert settings">' +
        TABS.map(function (t) { return '<button type="button" class="atab" role="tab" data-ap="' + t[0] + '" aria-selected="false">' + t[1] + '</button>'; }).join('') + '</div>' +

      '<div class="apane" data-pane="gen">' +
        row('Alerts', 'The master switch for every reminder.', tg('aOn', 'Alerts')) +
        row('Chime', 'A short sound with each alert.', tg('aSnd', 'Chime')) +
        row('Browser notifications', '<span id="aPerm"></span>', '<button type="button" class="btn btn-line-dark btn-sm" id="aAsk">Turn on</button>') +
        row('Test it', 'See and hear what an alert looks like.', '<button type="button" class="btn btn-line-dark btn-sm" id="aTest">Send test</button>') +
      '</div>' +

      '<div class="apane" data-pane="hab">' +
        row('Window opens', 'When a habit’s daily window starts.', tg('aOpen', 'Window opens')) +
        row('Closing soon', 'A warning before the window ends.', sel('aSoon', 'Closing soon', [['0', 'Off'], ['5', '5 min before'], ['10', '10 min before'], ['15', '15 min before'], ['30', '30 min before']])) +
        row('Missed', 'When a window closes undone, or a habit wasn’t done yesterday.', tg('aHMiss', 'Missed habits')) +
        row('Evening check', 'List the habits still open at this time.', tg('aEve', 'Evening check') + '<input type="time" id="aEveT" class="field" aria-label="Evening check time">') +
        '<h3 class="h4 aq">Reminder time for each habit</h3>' +
        '<p class="hint">Optional. Paused habits never send alerts.</p>' +
        '<div id="aRem"></div>' +
      '</div>' +

      '<div class="apane" data-pane="task">' +
        '<h3 class="h4 aq" style="margin-top:12px">Remind me before the deadline</h3>' +
        '<div class="chiprow" id="aLeads">' + LEADS.map(function (l) { return '<button type="button" class="chip" data-lead="' + l[0] + '" aria-pressed="false">' + l[1] + '</button>'; }).join('') + '</div>' +
        row('Custom reminder', 'Minutes before the deadline.', '<input type="number" min="0" max="10080" id="aCustom" class="field" placeholder="none" aria-label="Custom reminder in minutes">') +
        row('Time to start', 'Deadline minus the time the task needs.', tg('aStart', 'Time to start')) +
        row('Missed', 'When a deadline passes and the task is still open.', tg('aTMiss', 'Missed tasks')) +
      '</div>' +

      '<div class="apane" data-pane="tim">' +
        row('Ticking: timers', 'A soft tick every second.', tg('aTickT', 'Ticking during timers')) +
        row('Ticking: stopwatches', 'A soft tick every second.', tg('aTickW', 'Ticking during stopwatches')) +
        row('Tick volume', '', '<span class="vol"><input type="range" id="aVol" min="5" max="100" step="5" aria-label="Tick volume"><button type="button" class="btn btn-line-dark btn-sm" id="aTry">Try</button></span>') +
        row('Stopwatch check-in', 'A popup every so often while a stopwatch runs.', sel('aNudge', 'Stopwatch check-in', [['0', 'Off'], ['15', 'Every 15 min'], ['30', 'Every 30 min'], ['45', 'Every 45 min'], ['60', 'Every 60 min'], ['90', 'Every 90 min']])) +
        row('Motivation quotes', 'Your own quotes, sent every few minutes while you focus.', '<button type="button" class="btn btn-line-dark btn-sm" data-goq>Open Quotes</button>') +
      '</div>' +

      '<div class="apane" data-pane="scr">' +
        row('Daily reminder', 'Remind me to log today’s screen time.', tg('aScr', 'Daily screen time reminder') + '<input type="time" id="aScrT" class="field" aria-label="Reminder time">') +
        row('Missed days', 'Tell me about days I didn’t log.', tg('aScrMiss', 'Missed screen time days')) +
      '</div>' +

      '<div class="apane" data-pane="log">' +
        '<div class="flex items-center justify-between" style="margin-top:12px"><h3 class="h4" style="margin:0">Recent alerts</h3><button type="button" class="link" id="aClear">Clear</button></div>' +
        '<ul id="aLog" class="alog"></ul>' +
      '</div>' +
    '</div>';
  document.body.appendChild(dlg);

  var curTab = 'gen';
  function showTab(t) {
    curTab = t;
    dlg.querySelectorAll('[data-ap]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.ap === t)); });
    dlg.querySelectorAll('.apane').forEach(function (p) { p.hidden = p.dataset.pane !== t; });
  }

  function permText() {
    var p = $('aPerm'), ask = $('aAsk');
    if (!('Notification' in window)) { p.textContent = 'This browser can’t show system notifications. Popups inside the page still work.'; ask.style.display = 'none'; return; }
    var s = Notification.permission;
    ask.style.display = s === 'default' ? '' : 'none';
    p.textContent = s === 'granted' ? 'On. They show when this tab is in the background.'
      : s === 'denied' ? 'Blocked. Allow them from the lock icon in the address bar.'
      : 'Also get alerts when you’re in another tab or window.';
  }
  function fillRem() {
    var hs = habits();
    $('aRem').innerHTML = hs.length ? hs.map(function (h) {
      return row(esc(h.title), '', '<input type="time" class="field" data-rem="' + esc(h.id) + '" value="' + esc(S.rem[h.id] || '') + '" aria-label="Reminder time for ' + esc(h.title) + '">' +
        '<button type="button" class="xb" data-remx="' + esc(h.id) + '" aria-label="Clear reminder">×</button>');
    }).join('') : '<p class="hint">Add a habit first.</p>';
  }
  function fillLog() {
    $('aLog').innerHTML = LOG.length ? LOG.slice(0, 10).map(function (e) {
      var d = new Date(e.t);
      var when = (key(d) === key(new Date()) ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) +
        ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return '<li><b>' + esc(e.title) + '</b><br><span class="opacity-75">' + when + (e.body ? ' · ' + esc(e.body) : '') + '</span></li>';
    }).join('') : '<li class="hint">Nothing yet.</li>';
  }
  function fill() {
    $('aOn').checked = S.on; $('aSnd').checked = S.sound;
    $('aTickT').checked = S.tickTimer; $('aTickW').checked = S.tickWatch;
    $('aVol').value = Math.round(S.vol * 100); $('aNudge').value = String(S.nudge);
    $('aOpen').checked = S.hOpen; $('aSoon').value = String(S.hSoon); $('aHMiss').checked = S.hMiss;
    $('aEve').checked = S.eve; $('aEveT').value = S.eveT;
    dlg.querySelectorAll('[data-lead]').forEach(function (b) { b.setAttribute('aria-pressed', String(S.tLeads.indexOf(+b.dataset.lead) > -1)); });
    $('aCustom').value = S.tCustom || '';
    $('aStart').checked = S.tStart; $('aTMiss').checked = S.tMiss;
    $('aScr').checked = S.sOn; $('aScrT').value = S.sT; $('aScrMiss').checked = S.sMiss;
    fillRem(); fillLog(); permText();
  }
  function collect() {
    S.on = $('aOn').checked; S.sound = $('aSnd').checked;
    S.tickTimer = $('aTickT').checked; S.tickWatch = $('aTickW').checked;
    S.vol = Math.max(0.05, Math.min(1, (+$('aVol').value || 40) / 100));
    S.nudge = +$('aNudge').value || 0;
    S.hOpen = $('aOpen').checked; S.hSoon = +$('aSoon').value || 0; S.hMiss = $('aHMiss').checked;
    S.eve = $('aEve').checked; S.eveT = $('aEveT').value || '21:00';
    S.tLeads = [].slice.call(dlg.querySelectorAll('[data-lead][aria-pressed="true"]')).map(function (b) { return +b.dataset.lead; });
    S.tCustom = Math.max(0, Math.min(10080, parseInt($('aCustom').value, 10) || 0));
    S.tStart = $('aStart').checked; S.tMiss = $('aTMiss').checked;
    S.sOn = $('aScr').checked; S.sT = $('aScrT').value || '21:00'; S.sMiss = $('aScrMiss').checked;
    [].slice.call(dlg.querySelectorAll('[data-rem]')).forEach(function (i) {
      if (i.value) S.rem[i.dataset.rem] = i.value; else delete S.rem[i.dataset.rem];
    });
    saveS();
  }

  function openDlg() {
    fill(); showTab(curTab); audio();
    seenAt = Date.now();
    try { localStorage.setItem(SEEN, String(seenAt)); } catch (e) {}
    badge();
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  }
  function closeDlg() { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }

  bell.addEventListener('click', openDlg);
  document.addEventListener('click', function (e) { if (e.target.closest('[data-alerts]')) { curTab = 'tim'; openDlg(); } });
  $('aDone').addEventListener('click', closeDlg);
  dlg.addEventListener('change', collect);
  dlg.addEventListener('input', function (e) { if (e.target.id === 'aVol' || e.target.id === 'aCustom') collect(); });
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) { closeDlg(); return; }
    var t = e.target.closest('[data-ap]'); if (t) { showTab(t.dataset.ap); return; }
    var l = e.target.closest('[data-lead]');
    if (l) { l.setAttribute('aria-pressed', String(l.getAttribute('aria-pressed') !== 'true')); collect(); return; }
    var x = e.target.closest('[data-remx]');
    if (x) { delete S.rem[x.dataset.remx]; saveS(); fillRem(); return; }
    if (e.target.closest('[data-goq]')) {
      closeDlg();
      var q = document.querySelector('.tab[data-tab="quotes"]'); if (q) q.click();
    }
  });
  $('aClear').addEventListener('click', function () {
    LOG = []; try { localStorage.setItem(LKEY, '[]'); } catch (e) {} fillLog(); badge();
  });
  $('aAsk').addEventListener('click', function () {
    try {
      var p = Notification.requestPermission(permText);
      if (p && p.then) p.then(permText);
    } catch (e) {}
  });
  $('aTest').addEventListener('click', function () {
    audio();
    popup({ title: 'Test alert', body: 'This is how Summit alerts look and sound.', kind: 'info', sysForce: true }, true);
    fillLog();
  });
  $('aTry').addEventListener('click', function () {
    audio();
    [0, 1, 2].forEach(function (i) { setTimeout(function () { tick(i); }, i * 600); });
  });

  // a small shortcut under each timer
  ['fpStatus', 'tfStatus'].forEach(function (id) {
    var el = $(id);
    if (el) el.insertAdjacentHTML('afterend', '<button type="button" class="link" data-alerts>Alerts &amp; sounds</button>');
  });

  showTab('gen');
  badge();
})();