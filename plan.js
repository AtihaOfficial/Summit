(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var list = $('list'), pane = $('pane-habits');
  if (!list || !pane) return;

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function diffDays(a, b) { return Math.round((b - a) / 86400000); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtM(m) {
    m = Math.round(m);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }
  function short(s) { s = String(s); return s.length > 22 ? s.slice(0, 20) + '…' : s; }
  function shortDate(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function habits() {
    try { var s = JSON.parse(localStorage.getItem('peaks.v3')); return s && Array.isArray(s.habits) ? s.habits : []; }
    catch (e) { return []; }
  }

  var sel = get('peaks.plan.sel') || '';
  var mode = get('peaks.plan.mode') === 'focus' ? 'focus' : 'done';

  var panel = document.createElement('section');
  panel.id = 'planPanel'; panel.className = 'card plan'; panel.hidden = true;
  list.parentNode.insertBefore(panel, list);

  /* ---------- the 21-day round for one habit ---------- */
  function typical(h) {      // how long you usually focus on this habit
    var v = [], k;
    for (k in (h.time || {})) { if (h.time[k] >= 60) v.push(h.time[k] / 60); }
    return v.length ? Math.max(5, Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length / 5) * 5) : 0;
  }
  function compute(h) {
    var today = parse(key(new Date())), start = parse(h.start);
    var idx = Math.max(0, diffDays(start, today)), round = Math.floor(idx / 21), within = idx % 21, sprint = Math.floor(within / 3);
    var base = addDays(start, round * 21), days = [], mx = 0, i, d, k, m;
    for (i = 0; i < 21; i++) {
      d = addDays(base, i); k = key(d);
      m = Math.round(((h.time && h.time[k]) || 0) / 60);
      if (m > mx) mx = m;
      days.push({ i: i, d: d, k: k, future: d > today, today: i === within, pz: !!(window.Pause && Pause.is(h.id, k)),
                  p: Math.min((h.log && h.log[k]) || 0, 100), min: m });
    }
    var goal = h.goal && h.goal.day > 0 ? h.goal.day : 0;
    return { days: days, round: round, within: within, sprint: sprint, goal: goal, ref: goal || typical(h) || mx || 30 };
  }

  /* ---------- draw the panel ---------- */
  var lastSig = '';
  function render() {
    var hs = habits();
    panel.hidden = !hs.length;
    if (!hs.length) return;
    var h = hs.filter(function (x) { return x.id === sel; })[0] || hs[0];
    sel = h.id;
    var F = mode === 'focus', c = compute(h), goal = c.goal;

    var blocks = [], cleared = 0, doneDays = 0, roundMin = 0, b, ds, act, dn, mn;
    for (b = 0; b < 7; b++) {
      ds = c.days.slice(b * 3, b * 3 + 3);
      act = ds.filter(function (x) { return !x.pz; });
      dn = act.filter(function (x) { return x.p >= 100; }).length;
      mn = ds.reduce(function (a, x) { return a + x.min; }, 0);
      if (act.length && dn === act.length) cleared++;
      doneDays += dn; roundMin += mn;
      blocks.push({ b: b, ds: ds, act: act.length, dn: dn, mn: mn, st: b < c.sprint ? 'past' : b === c.sprint ? 'now' : 'later' });
    }
    var cur = blocks[c.sprint], s0 = c.sprint * 3;
    var soFar = c.days.slice(0, c.within + 1).filter(function (x) { return !x.pz; }).length;

    function state(x) {
      if (x.pz) return 'pz';
      if (F) { if (x.min <= 0) return ''; return goal && x.min >= goal ? 'full' : 'part'; }
      return x.p >= 100 ? 'full' : x.p > 0 ? 'part' : '';
    }
    function pct(x) { return F ? Math.min(100, Math.round(x.min / c.ref * 100)) : x.p; }
    function circ(x) {
      var s = state(x);
      return '<span class="pd ' + s + (x.today ? ' tod' : '') + (x.future ? ' fut' : '') + '" style="--p:' + pct(x) + '">' + (s === 'full' ? '✓' : s === 'pz' ? '–' : '') + '</span>';
    }
    function big(x) {
      var s = state(x), v, sub = '';
      if (x.pz) v = '⏸ Paused';
      else if (F) {
        v = x.min > 0 ? fmtM(x.min) : (x.future ? 'Upcoming' : '–');
        if (!x.future && goal) sub = 'goal ' + fmtM(goal);
      } else {
        v = x.p >= 100 ? '✓ Done' : x.p > 0 ? x.p + '%' : x.future ? 'Upcoming' : x.today ? 'Not yet' : 'Missed';
      }
      return '<div class="pl-day ' + s + (x.today ? ' tod' : '') + (x.future ? ' fut' : '') + '">' +
        '<span class="pl-dn">Day ' + (x.i + 1) + '</span><span class="pl-dd">' + (x.today ? 'Today' : shortDate(x.d)) + '</span>' +
        '<b class="pl-dv">' + v + '</b>' + (sub ? '<span class="pl-dd">' + sub + '</span>' : '') + '</div>';
    }
    function sum(bl) {
      if (bl.st === 'later') return 'Later';
      if (!bl.act) return '⏸ Paused';
      return F ? (bl.mn ? fmtM(bl.mn) : '–') : (bl.dn === bl.act ? '✓ Cleared' : bl.dn + ' of ' + bl.act);
    }

    var title = 'Sprint ' + (c.sprint + 1) + ' of 7 · Days ' + (s0 + 1) + ' to ' + (s0 + 3) + (c.round > 0 ? ' · Round ' + (c.round + 1) : '');
    var sub = !cur.act
      ? 'These 3 days are paused. Rest up. Nothing is counted against you.'
      : cur.dn === cur.act
        ? (c.sprint < 6 ? 'Sprint cleared. Next up: days ' + (s0 + 4) + ' to ' + (s0 + 6) + '.' : 'Round complete. A fresh 21-day round starts after day 21.')
        : 'Just these 3 days. Ignore the rest for now.';
    var line = F
      ? 'Focus this sprint: ' + fmtM(cur.mn) + (goal ? ' of ' + fmtM(goal * 3) + ' goal' : '') + ' · this round: ' + fmtM(roundMin) +
        (goal ? '' : '. Set a daily focus time when you edit this habit to track a target.')
      : doneDays + ' of ' + soFar + ' active days done this round · ' + cleared + ' of 7 sprints cleared';

    var html =
      '<details class="fold" id="foldPlan"' + (get('peaks.fold.plan') === '1' ? ' open' : '') + '>' +
      '<summary><h3 class="h3">21-day plan</h3></summary>' +
      '<div class="pl-head"><p class="hint">Three days at a time. Only the highlighted sprint matters right now.</p>' +
      '<div class="seg" role="group" aria-label="Plan view">' +
        '<button type="button" data-mode="done" aria-pressed="' + !F + '">Completion</button>' +
        '<button type="button" data-mode="focus" aria-pressed="' + F + '">Focus</button></div></div>' +
      '<div class="pl-chips" role="group" aria-label="Choose a habit">' + hs.map(function (x) {
        return '<button type="button" class="chip pl-chip" data-hid="' + esc(x.id) + '" aria-pressed="' + (x.id === h.id) + '">' + esc(short(x.title)) + '</button>';
      }).join('') + '</div>' +
      '<p class="pl-title serif">' + title + '</p><p class="pl-sub">' + sub + '</p>' +
      '<div class="pl-now">' + cur.ds.map(big).join('') + '</div>' +
      '<div class="pl-grid">' + blocks.map(function (bl) {
        return '<div class="pl-blk ' + bl.st + '"><div class="pl-bl">Days ' + (bl.b * 3 + 1) + '–' + (bl.b * 3 + 3) + '</div>' +
          '<div class="pl-ds">' + bl.ds.map(circ).join('') + '</div><div class="pl-bs">' + sum(bl) + '</div></div>';
      }).join('') + '</div>' +
      '<p class="pl-foot">' + line + '</p></details>';

    if (html === lastSig) return;
    lastSig = html;
    var ae = document.activeElement, fid = '';
    if (ae && panel.contains(ae)) fid = ae.dataset.hid ? 'hid' : ae.dataset.mode ? 'mode' : '';
    var fv = fid ? (ae.dataset.hid || ae.dataset.mode) : '';
    panel.innerHTML = html;
    if (fid) { var back = panel.querySelector('[data-' + fid + '="' + fv + '"]'); if (back) back.focus(); }
  }

  /* ---------- a small "Day 8 of 21" pill on each habit card ---------- */
  function decorate() {
    var map = {};
    habits().forEach(function (h) { map[h.id] = h; });
    list.querySelectorAll('.habit').forEach(function (li) {
      var h = map[li.dataset.id]; if (!h) return;
      var c = compute(h), txt = 'Day ' + (c.within + 1) + ' of 21 · Sprint ' + (c.sprint + 1) + '/7';
      var b = li.querySelector('.pill-btn');
      if (b) { if (b.textContent !== txt) b.textContent = txt; return; }
      var pill = li.querySelector('.pill'); if (!pill) return;
      b = document.createElement('button');
      b.type = 'button'; b.className = 'pill pill-btn'; b.setAttribute('data-plan', h.id);
      b.setAttribute('aria-label', 'Open the 21-day plan for ' + h.title);
      b.textContent = txt;
      pill.parentNode.appendChild(b);
    });
  }

  function refresh() { decorate(); render(); }

  /* ---------- events ---------- */
  panel.addEventListener('click', function (e) {
    var m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode === 'focus' ? 'focus' : 'done'; set('peaks.plan.mode', mode); render(); return; }
    var c = e.target.closest('[data-hid]');
    if (c) { sel = c.dataset.hid; set('peaks.plan.sel', sel); render(); }
  });
    panel.addEventListener('toggle', function (e) {
    if (e.target.id === 'foldPlan') set('peaks.fold.plan', e.target.open ? '1' : '0');
  }, true);
  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-plan]'); if (!b) return;
    sel = b.dataset.plan; set('peaks.plan.sel', sel); render();
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  new MutationObserver(refresh).observe(list, { childList: true });
  var t = 0;
  list.addEventListener('input', function () { clearTimeout(t); t = setTimeout(refresh, 400); });
  window.addEventListener('peaks:pause', refresh);
  setInterval(refresh, 3000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });

  refresh();
})();