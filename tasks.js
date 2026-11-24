(function () {
  'use strict';

  var KEY = 'peaks.tasks';
  var $ = function (id) { return document.getElementById(id); };
  var anchor = $('habits');
  if (!anchor) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return key(new Date()); }
  function plus(n) { var d = new Date(); d.setDate(d.getDate() + n); return key(d); }
  function until(k) { return Math.round((parse(k) - parse(todayKey())) / 86400000); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var box = $('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }
  function fmtMin(m) {
    m = Math.round(m);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }
  function fmtSpan(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    if (m < 2880) return fmtMin(m);
    return Math.floor(m / 1440) + 'd ' + Math.floor(m % 1440 / 60) + 'h';
  }
  function cdText(ms, full) {
    var over = ms < 0, s = Math.floor(Math.abs(ms) / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60, txt;
    if (full) txt = d > 0 ? d + 'd ' + pad(h) + 'h ' + pad(m) + 'm ' + pad(sec) + 's' : pad(h) + ':' + pad(m) + ':' + pad(sec);
    else if (d > 0) txt = d + 'd ' + h + 'h';
    else if (h > 0) txt = h + 'h ' + m + 'm';
    else txt = s < 60 ? '<1m' : m + 'm';
    return txt + (over ? ' overdue' : ' left');
  }

  /* ---------- storage ---------- */
  var st = (function () {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.tasks)) return s; } catch (e) {}
    return { tasks: [] };
  })();
  st.tasks.forEach(function (t) {          // older tasks get safe defaults
    t.due = t.due || ''; t.dueTime = t.dueTime || '';
    t.est = +t.est || 0; t.cons = +t.cons || 0; t.goal = +t.goal || 0;
    t.wait = +t.wait || 0; t.oth = +t.oth || 0; t.aside = +t.aside || 0;
  });
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); }
    catch (e) { toast('Saving is blocked in this browser. Tasks will be lost on refresh.'); }
  }
  var cutoff = Date.now() - 30 * 86400000;   // forget completed tasks after 30 days
  st.tasks = st.tasks.filter(function (t) { return !t.done || t.doneAt > cutoff; });
  function find(id) { return st.tasks.filter(function (x) { return x.id === id; })[0]; }

  /* ---------- Eisenhower logic ---------- */
  var Q = {
    1: { name: 'Do first',          short: 'Do',        sub: 'Urgent + important',           c: 1 },
    2: { name: 'Schedule',          short: 'Schedule',  sub: 'Important, not urgent',        c: 0 },
    3: { name: 'Delegate or batch', short: 'Delegate',  sub: 'Urgent, not important',        c: 2 },
    4: { name: 'Eliminate',         short: 'Eliminate', sub: 'Neither urgent nor important', c: 3 }
  };

  function deadline(t) {
    if (!t.due) return null;
    var p = t.due.split('-'), tm = (t.dueTime || '23:59').split(':');
    return new Date(+p[0], +p[1] - 1, +p[2], +tm[0] || 0, +tm[1] || 0, t.dueTime ? 0 : 59).getTime();
  }
  function left(t) { var d = deadline(t); return d === null ? null : d - Date.now(); }
  function isOver(t) { var l = left(t); return l !== null && l < 0; }

  // Urgent: due within 48 hours, or the time left is less than 3x the time needed
  function isUrgent(t) {
    var l = left(t); if (l === null) return false;
    return l <= 48 * 3600000 || (t.est > 0 && l <= t.est * 60000 * 3);
  }
  function score(t) { return t.cons + t.goal + (t.wait ? 1 : 0); }     // 0 to 5
  function isImportant(t) { return score(t) >= 2; }
  function quad(t) {
    var imp = isImportant(t), urg = isUrgent(t);
    if (!imp && t.oth === 2) return 4;                                   // "doesn't really need doing"
    return imp && urg ? 1 : imp ? 2 : urg ? 3 : 4;
  }
  function order(a, b) {
    var qa = quad(a), qb = quad(b);
    if (qa !== qb) return qa - qb;
    var da = deadline(a), db = deadline(b);
    da = da === null ? Infinity : da; db = db === null ? Infinity : db;
    if (da !== db) return da - db;
    if (score(a) !== score(b)) return score(b) - score(a);
    return a.created - b.created;
  }

  /* the queue: open tasks that are not set aside. If nothing else is left, set-aside tasks come back on top. */
  function openAll() { return st.tasks.filter(function (t) { return !t.done; }); }
  function asideSorted() {
    return openAll().filter(function (t) { return t.aside; }).sort(function (a, b) {
      var da = deadline(a), db = deadline(b);
      da = da === null ? Infinity : da; db = db === null ? Infinity : db;
      return da !== db ? da - db : a.aside - b.aside;       // most overdue first
    });
  }
  var restored = false;
  function open() {
    var a = openAll().filter(function (t) { return !t.aside; }).sort(order);
    if (a.length) { restored = false; return a; }
    var s = asideSorted(); restored = s.length > 0; return s;
  }

  function tipFor(t, n) {
    if (n === 1) return 'Drop everything else and do this now.';
    if (n === 2) return 'Block time for it now, before it turns into an emergency.';
    if (n === 3) return t.oth === 1 ? 'Hand it to someone else today.' : 'Batch it with other small tasks and knock it out fast.';
    return 'Drop it unless you can say why it matters.';
  }
  function whenLabel(t) {
    var dl = deadline(t); if (dl === null) return 'No deadline';
    var d = new Date(dl), n = until(t.due);
    var day = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday'
      : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return 'Due ' + day + (t.dueTime ? ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ' (end of day)');
  }
  function startInfo(t) {
    var dl = deadline(t); if (dl === null || !t.est) return '';
    var sb = dl - t.est * 60000;
    if (sb <= Date.now()) return 'Start now';
    var d = new Date(sb), same = key(d) === todayKey();
    return 'Start by ' + (same ? '' : d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ') +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function warn(t) {
    var l = left(t); if (l === null) return '';
    if (l < 0) return 'Overdue';
    if (t.est > 0 && l < t.est * 60000) return 'Tight: needs ' + fmtMin(t.est) + ', only ' + fmtSpan(l) + ' left';
    return '';
  }

  /* ---------- section markup ---------- */
  function grp(q, arr, cls) {
    return '<div class="opts flex flex-wrap gap-2' + (cls ? ' ' + cls : '') + '" data-q="' + q + '">' +
      arr.map(function (o) {
        return '<button type="button" class="opt" aria-pressed="false" data-v="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>';
  }

  anchor.insertAdjacentHTML('beforebegin',
    '<section id="queue" class="mt-10">' +
      '<div class="mb-4"><h2 class="serif text-3xl sm:text-4xl font-black">Priority queue</h2>' +
      '</div>' +
      '<div class="frame">' +
        '<div id="qNow"></div>' +
        '<div class="grid lg:grid-cols-2 gap-4 mt-4">' +
          '<form id="tForm" class="panel-soft" autocomplete="off">' +
            '<h3 class="serif text-2xl font-black">Add a task</h3>' +
            '<label class="block text-sm font-bold mt-3 mb-1" for="tText">What is it?</label>' +
            '<input id="tText" class="field" maxlength="120" placeholder="e.g. phys chap 4 revise + past paper">' +
            '<p id="tProg" class="text-xs font-bold mt-3 opacity-75"></p>' +

            '<p class="text-sm font-bold mt-5">1. When does it truly have to be done?</p>' +
            '<p class="text-xs opacity-70 mb-2">Not when you’d like it done. When it actually matters.</p>' +
            grp('due', [['0', 'Today'], ['1', 'Tomorrow'], ['3', 'In 3 days'], ['7', 'Next week'], ['x', 'No deadline']]) +
            '<input id="tDue" type="date" class="field mt-2" style="max-width:190px" aria-label="Or pick a due date">' +

            '<div id="tTimeG">' +
              '<p class="text-sm font-bold mt-5">2. By what time? <span class="font-medium opacity-70">(optional)</span></p>' +
              '<p class="text-xs opacity-70 mb-2">Leave it on end of day if the hour doesn’t matter.</p>' +
              grp('time', [['09:00', 'Morning 9 AM'], ['12:00', 'Noon'], ['15:00', 'Afternoon 3 PM'], ['18:00', 'Evening 6 PM'], ['21:00', 'Night 9 PM'], ['', 'End of day']]) +
              '<input id="tTime" type="time" class="field mt-2" style="max-width:190px" aria-label="Or pick an exact time">' +
            '</div>' +

            '<p class="text-sm font-bold mt-5">3. How long will it take?</p>' +
            '<p class="text-xs opacity-70 mb-2">A rough guess is fine. It helps me work out when you must start.</p>' +
            grp('est', [['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '1 hour'], ['120', '2 hours'], ['180', '3 hours'], ['240', '4 hours+'], ['0', 'Not sure']]) +
            '<div class="flex items-center gap-2 mt-2"><input id="tEst" type="number" min="1" max="1440" class="field" style="width:110px" placeholder="minutes" aria-label="Or type minutes"><span class="text-xs opacity-70">or type your own</span></div>' +

            '<p class="text-sm font-bold mt-5 mb-2">4. What breaks if you skip it?</p>' +
            grp('cons', [['2', 'Something I care about (grades, health, money, a person)'], ['1', 'A small setback I’d recover from'], ['0', 'Nothing, really']]) +

            '<p class="text-sm font-bold mt-5 mb-2">5. Does it move a goal you’re building?</p>' +
            grp('goal', [['2', 'Directly'], ['1', 'A little'], ['0', 'Not at all']]) +

            '<p class="text-sm font-bold mt-5 mb-2">6. Is someone waiting on you?</p>' +
            grp('wait', [['1', 'Yes, someone is counting on it'], ['0', 'No, it’s just me']]) +

            '<p class="text-sm font-bold mt-5 mb-2">7. Could someone else do it?</p>' +
            grp('oth', [['0', 'No, only I can'], ['1', 'Yes, someone else could'], ['2', 'It doesn’t really need doing']]) +

            '<p id="tPrev" class="pv" aria-live="polite"></p>' +
            '<button type="submit" id="tAdd" class="btn btn-deep mt-4" disabled>Add to queue</button>' +
          '</form>' +
          '<div class="panel-deep">' +
            '<div id="qMatrix" class="qmatrix"></div>' +
            '<h3 class="serif text-xl font-black mt-5 mb-2">Up next</h3>' +
            '<ul id="qList" class="grid gap-2"></ul>' +
            '<div id="qAside"></div>' +
            '<div id="qDone" class="mt-5 text-sm"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>');

  /* ---------- render ---------- */
  var lastSig = '';

  function row(t, pos) {
    var q = Q[quad(t)], dl = deadline(t);
    var cd = dl === null ? 'No deadline' : '<span class="cd" data-dl="' + dl + '"></span>';
    var ab = isOver(t) && !t.aside
      ? '<button type="button" class="aside-b" data-aside="' + t.id + '" title="Do the next tasks first. The overdue time keeps counting.">Set aside</button>' : '';
    return '<li class="qrow" data-id="' + t.id + '"><span class="qn">' + pos + '</span>' +
      '<div class="flex-1 min-w-0"><p class="tx font-bold leading-snug">' + esc(t.text) + '</p>' +
      '<p class="text-xs opacity-75">' + q.short + (t.est ? ' · ~' + fmtMin(t.est) : '') + ' · ' + cd + '</p></div>' + ab +
      '<button type="button" class="mck" data-done="' + t.id + '" aria-label="Complete: ' + esc(t.text) + '">✓</button>' +
      '<button type="button" class="xb" data-del="' + t.id + '" aria-label="Remove: ' + esc(t.text) + '">×</button></li>';
  }

  function asideRow(t) {
    var dl = deadline(t);
    return '<li class="arow2" data-id="' + t.id + '"><div class="flex-1 min-w-0"><p class="tx">' + esc(t.text) + '</p>' +
      '<p class="aside-s">' + (dl === null ? 'No deadline' : '<span class="cd" data-dl="' + dl + '"></span>') + (t.est ? ' · needs ~' + fmtMin(t.est) : '') + '</p></div>' +
      '<button type="button" class="aside-b" data-unaside="' + t.id + '">Bring back</button>' +
      '<button type="button" class="mck" data-done="' + t.id + '" aria-label="Complete: ' + esc(t.text) + '">✓</button>' +
      '<button type="button" class="xb" data-del="' + t.id + '" aria-label="Remove: ' + esc(t.text) + '">×</button></li>';
  }

  function render() {
    var q = open(), counts = { 1: 0, 2: 0, 3: 0, 4: 0 }, wasRestored = restored;
    q.forEach(function (t) { counts[quad(t)]++; });
    lastSig = q.map(function (t) { return t.id + ':' + quad(t); }).join(',');
    var top = q[0];
    var aside = wasRestored ? [] : asideSorted();

    if (top) {
      var n = quad(top), dl = deadline(top), w = warn(top), si = startInfo(top);
      var canAside = isOver(top) && !top.aside;
      $('qNow').innerHTML =
        '<div class="panel-deep" data-id="' + top.id + '">' +
          '<p class="text-xs font-bold opacity-80" style="letter-spacing:.08em">DO THIS FIRST</p>' +
          '<h3 class="tx serif text-3xl sm:text-4xl font-black leading-tight mt-2">' + esc(top.text) + '</h3>' +
          '<div class="mt-4">' + (dl === null
            ? '<p class="serif text-2xl font-black">No deadline</p>'
            : '<p class="cdbig serif"><span class="cd" data-dl="' + dl + '" data-full="1"></span></p>' +
              '<p class="text-sm mt-1 opacity-85">' + whenLabel(top) + '</p>') + '</div>' +
          '<div class="flex flex-wrap gap-2 mt-4"><span class="tag">' + Q[n].name + ': ' + Q[n].sub + '</span>' +
            (top.est ? '<span class="tag">Needs about ' + fmtMin(top.est) + '</span>' : '') +
            (si ? '<span class="tag">' + si + '</span>' : '') +
            (w ? '<span class="tag urgent">' + w + '</span>' : '') + '</div>' +
          '<p class="text-sm mt-3 opacity-90">' + tipFor(top, n) + '</p>' +
          (wasRestored ? '<p class="text-sm mt-1 opacity-85">Everything else is done, so your set-aside tasks are back on top.</p>' : '') +
          '<p class="text-sm mt-1 opacity-75">' + (q.length > 1 ? (q.length - 1) + ' more in line. Next: ' + esc(q[1].text) : 'This is the last one in the queue.') + '</p>' +
          '<div class="qact">' +
            '<button type="button" class="btn btn-soft" data-done="' + top.id + '">✓ Done, bring up the next</button>' +
            (canAside ? '<button type="button" class="btn btn-line" data-aside="' + top.id + '">Set aside for now</button>' : '') +
          '</div>' +
          (canAside ? '<p class="text-xs mt-2 opacity-70">Stuck on an overdue task? Do the next one first. This one waits under “Set aside”, and its overdue time keeps counting.</p>' : '') +
        '</div>';
    } else {
      $('qNow').innerHTML =
        '<div class="panel-deep qnone"><p class="text-xs font-bold opacity-80" style="letter-spacing:.08em">DO THIS FIRST</p>' +
        '<h3 class="serif text-3xl font-black mt-2">Nothing waiting.</h3>' +
        '<p class="mt-2 text-sm opacity-85">Add a task below and I’ll tell you where it belongs in line.</p></div>';
    }

    $('qMatrix').innerHTML = [1, 2, 3, 4].map(function (k) {
      return '<div class="qcell c' + Q[k].c + '"><span class="qname">' + Q[k].short + '</span>' +
        '<span class="qsb">' + Q[k].sub + '</span><b class="serif qcount">' + counts[k] + '</b></div>';
    }).join('');

    var rest = q.slice(1);
    $('qList').innerHTML = rest.length
      ? rest.map(function (t, i) { return row(t, i + 2); }).join('')
      : '<li class="text-sm opacity-75">' + (q.length ? 'Nothing else waiting.' : 'Add tasks and they line up here in the order you should do them.') + '</li>';

    $('qAside').innerHTML = aside.length
      ? '<div class="aside"><div class="aside-h"><b>Set aside · ' + aside.length + '</b><span>overdue <span data-sum></span> in total</span></div>' +
        '<ul>' + aside.map(asideRow).join('') + '</ul></div>'
      : '';

    var prev = $('qDone').querySelector('details'), wasOpen = !!(prev && prev.open);
    var done = st.tasks.filter(function (t) { return t.done; }).sort(function (a, b) { return b.doneAt - a.doneAt; });
    var today = done.filter(function (t) { return key(new Date(t.doneAt)) === todayKey(); }).length;
    $('qDone').innerHTML = done.length
      ? '<p class="font-bold">Done today: ' + today + '</p>' +
        '<details class="mt-2"' + (wasOpen ? ' open' : '') + '><summary class="cursor-pointer opacity-85">Completed (' + done.length + ')</summary>' +
        '<ul class="grid gap-1 mt-2">' + done.slice(0, 8).map(function (t) { return '<li class="cut">' + esc(t.text) + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="link mt-2" data-clear>Clear completed</button></details>'
      : '';
    tick();
  }

  /* ---------- live countdown ---------- */
  function tick() {
    var now = Date.now(), sum = 0;
    document.querySelectorAll('#queue .cd').forEach(function (el) {
      var ms = +el.dataset.dl - now;
      el.textContent = cdText(ms, el.dataset.full === '1');
      el.classList.toggle('over', ms < 0);
      if (ms < 0 && el.closest('#qAside')) sum += -ms;
    });
    var se = document.querySelector('#qAside [data-sum]');
    if (se) se.textContent = fmtSpan(sum);
  }
  var ticks = 0;
  setInterval(function () {
    tick();
    if (++ticks % 15 === 0) {      // time moves tasks between boxes, so re-check the order
      var sig = open().map(function (t) { return t.id + ':' + quad(t); }).join(',');
      if (sig !== lastSig) render();
    }
  }, 1000);

  /* ---------- actions ---------- */
  var busy = false;
  function complete(id) {
    var t = find(id);
    if (busy || !t || t.done) return;
    busy = true;
    document.querySelectorAll('#queue [data-id="' + id + '"] .tx').forEach(function (el) { el.classList.add('cut'); });
    setTimeout(function () {
      t.done = true; t.doneAt = Date.now(); save(); busy = false; render();
      var nx = open()[0];
      toast(nx ? 'Done. Next up: ' + nx.text : 'Queue clear. Nice work.');
    }, reduce ? 0 : 700);
  }
  function remove(id) {
    st.tasks = st.tasks.filter(function (x) { return x.id !== id; });
    save(); render(); toast('Removed');
  }
  function setAside(id) {
    var t = find(id);
    if (!t || t.done || t.aside) return;
    t.aside = Date.now(); save(); render();
    var nx = open()[0];
    toast(nx && nx.id !== id ? 'Set aside. Next up: ' + nx.text : 'Set aside. The overdue time keeps counting.');
  }
  function bringBack(id) {
    var t = find(id);
    if (!t) return;
    t.aside = 0; save(); render(); toast('Back in the queue');
  }

  $('queue').addEventListener('click', function (e) {
    var b = e.target.closest('[data-done]');
    if (b) { complete(b.dataset.done); return; }
    b = e.target.closest('[data-aside]');
    if (b) { setAside(b.dataset.aside); return; }
    b = e.target.closest('[data-unaside]');
    if (b) { bringBack(b.dataset.unaside); return; }
    b = e.target.closest('[data-del]');
    if (b) { remove(b.dataset.del); return; }
    if (e.target.closest('[data-clear]')) {
      st.tasks = st.tasks.filter(function (t) { return !t.done; });
      save(); render(); return;
    }
    var o = e.target.closest('.opt');
    if (o && o.closest('#tForm')) pick(o);
  });

  /* ---------- add-task form ---------- */
  var ans;
  function clearAns() { ans = { due: false, est: null, cons: null, goal: null, wait: null, oth: null }; }
  clearAns();

  function unpress(sel) {
    $('tForm').querySelectorAll(sel + ' .opt').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
  }
  function syncTime() { $('tTimeG').classList.toggle('is-off', !$('tDue').value); }

  function pick(o) {
    var g = o.closest('.opts'), q = g.dataset.q, v = o.dataset.v;
    g.querySelectorAll('.opt').forEach(function (x) { x.setAttribute('aria-pressed', x === o ? 'true' : 'false'); });
    if (q === 'due') { ans.due = true; $('tDue').value = v === 'x' ? '' : plus(+v); syncTime(); }
    else if (q === 'time') { $('tTime').value = v; }
    else if (q === 'est') { ans.est = +v; $('tEst').value = +v > 0 ? v : ''; }
    else ans[q] = +v;
    preview();
  }

  $('tDue').addEventListener('input', function () {
    unpress('[data-q="due"]');
    ans.due = !!this.value; syncTime(); preview();
  });
  $('tTime').addEventListener('input', function () {
    unpress('[data-q="time"]'); preview();
  });
  $('tEst').addEventListener('input', function () {
    unpress('[data-q="est"]');
    var v = parseInt(this.value, 10);
    ans.est = v > 0 ? Math.min(v, 1440) : null; preview();
  });
  $('tText').addEventListener('input', preview);

  function draft() {
    var due = $('tDue').value;
    return { due: due, dueTime: due ? $('tTime').value : '', est: ans.est || 0,
             cons: ans.cons, goal: ans.goal, wait: ans.wait, oth: ans.oth };
  }
  function ready() {
    return ans.due && ans.est !== null && ans.cons !== null && ans.goal !== null && ans.wait !== null && ans.oth !== null;
  }

  function preview() {
    var n = [ans.due, ans.est !== null, ans.cons !== null, ans.goal !== null, ans.wait !== null, ans.oth !== null].filter(Boolean).length;
    $('tProg').textContent = n + ' of 6 questions answered (the time question is optional)';
    $('tAdd').disabled = !(ready() && $('tText').value.trim());
    var p = $('tPrev');
    if (!ready()) { p.textContent = 'Answer the questions and I’ll show where this lands.'; return; }
    var d = draft(), k = quad(d), parts = [whenLabel(d)];
    if (d.est) parts.push('needs about ' + fmtMin(d.est));
    var si = startInfo(d), w = warn(d);
    if (si) parts.push(si.charAt(0).toLowerCase() + si.slice(1));
    p.innerHTML = '<b>' + Q[k].name + '</b> · ' + Q[k].sub + '. ' + tipFor(d, k) +
      '<br><span class="text-xs opacity-80">' + parts.join(' · ') + '</span>' +
      (w ? '<br><b>' + w + '</b>' : '');
  }

  function resetForm() {
    clearAns();
    $('tText').value = ''; $('tDue').value = ''; $('tTime').value = ''; $('tEst').value = '';
    $('tForm').querySelectorAll('.opt').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    var eod = $('tForm').querySelector('[data-q="time"] [data-v=""]');
    if (eod) eod.setAttribute('aria-pressed', 'true');     // end of day is the default
    syncTime();
  }

  $('tForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = $('tText').value.trim();
    if (!text || !ready()) return;
    var d = draft();
    var t = { id: uid(), text: text, due: d.due, dueTime: d.dueTime, est: d.est, cons: d.cons, goal: d.goal,
              wait: d.wait, oth: d.oth, aside: 0, created: Date.now(), done: false };
    st.tasks.push(t); save();
    resetForm(); render(); preview();
    var pos = open().map(function (x) { return x.id; }).indexOf(t.id) + 1;
    toast('Added at position ' + pos + ' in line');
    $('tText').focus();
  });

  // deadlines drift with time, so refresh when you come back to the tab
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  resetForm();
  render();
  preview();
})();