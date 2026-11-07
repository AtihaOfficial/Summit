(function () {
  'use strict';

  var KEY = 'peaks.screen';
  var $ = function (id) { return document.getElementById(id); };
  var anchor = $('insights');
  if (!anchor) return;

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return key(new Date()); }
  function shift(k, n) { var d = parse(k); d.setDate(d.getDate() + n); return key(d); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(m) {
    m = Math.round(m);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }
  function shortDay(k) { return parse(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function num(id, max) { var v = parseInt($(id).value, 10); return isNaN(v) || v < 0 ? 0 : Math.min(v, max); }
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function toast(msg) {
    var box = $('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }
  function focusMin(k) {   // habit + task focus time logged in Summit for that day
    var s = readJSON('peaks.v3');
    if (!s || !s.habits) return 0;
    var sec = s.habits.reduce(function (a, h) { return a + ((h.time && h.time[k]) || 0); }, 0);
    return Math.round((sec + (window.TaskFocus ? TaskFocus.sec(k) : 0)) / 60);
  }
  function rangeFocus(n) {
    var s = 0, t = todayKey();
    for (var i = 0; i < n; i++) s += focusMin(shift(t, -i));
    return s;
  }

  /* ---------- "what could you have done": built from YOUR tasks and habits ---------- */
  function openTasks() {
    var s = readJSON('peaks.tasks');
    var all = s && Array.isArray(s.tasks) ? s.tasks.filter(function (t) { return !t.done; }) : [];
    var map = {}; all.forEach(function (t) { map[t.id] = t; });
    var out = [];
    document.querySelectorAll('#qNow [data-id], #qList .qrow[data-id]').forEach(function (el) {   // the queue's own order
      var t = map[el.dataset.id]; if (t) { out.push(t); delete map[el.dataset.id]; }
    });
    Object.keys(map).map(function (id) { return map[id]; })
      .sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')) || (a.created || 0) - (b.created || 0); })
      .forEach(function (t) { out.push(t); });
    return out;
  }
  function spentMin(id) {
    var f = readJSON('peaks.tfocus');
    return f && f.tasks && f.tasks[id] ? (f.tasks[id].sec || 0) / 60 : 0;
  }
  function taskItems() {
    var items = [], skipped = 0;
    openTasks().forEach(function (t) {
      if (!(t.est > 0)) { skipped++; return; }
      items.push({ label: 'Finish: ' + t.text, min: Math.max(5, Math.round(t.est - spentMin(t.id))) });
    });
    return { items: items, skipped: skipped };
  }
  function typical(h) {      // how long you usually focus on this habit
    var v = [], k;
    for (k in (h.time || {})) { if (h.time[k] >= 60) v.push(h.time[k] / 60); }
    if (!v.length) return 0;
    return Math.max(5, Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length / 5) * 5);
  }
  function habitItems(k) {   // habits that were still open on that day
    var s = readJSON('peaks.v3'), hs = s && Array.isArray(s.habits) ? s.habits : [], items = [];
    hs.forEach(function (h) {
      if (h.start > k || ((h.log && h.log[k]) || 0) >= 100) return;
      if (window.Pause && Pause.is(h.id, k)) return;
      var m = h.goal && h.goal.day > 0 ? h.goal.day : typical(h);
      if (m > 0) items.push({ label: 'Do: ' + h.title, min: m });
    });
    return items;
  }
  function fill(items, minutes) {      // take items in order while they fit
    var rem = minutes, taken = [], part = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].min <= rem) { taken.push(items[i]); rem -= items[i].min; }
      else { part = items[i]; break; }
    }
    return { taken: taken, left: rem, part: part };
  }

  function couldHtml(waste, k) {
    if (waste < 10) return '<p class="text-sm mt-3 opacity-80">Under 10 minutes. Barely a dent.</p>';
    var T = taskItems(), items = habitItems(k).concat(T.items);
    var h = '<p class="h4">With those ' + fmt(waste) + ', you could have…</p>';
    var foot = '<p class="tiny opacity-70 mt-2">Based on the time you set for your tasks and your habits’ focus goals.' +
      (T.skipped ? ' ' + T.skipped + (T.skipped === 1 ? ' open task has' : ' open tasks have') + ' no time estimate, so ' + (T.skipped === 1 ? 'it isn’t' : 'they aren’t') + ' counted.' : '') + '</p>';
    if (!items.length) {
      return h + '<p class="text-sm">I can’t say yet. Add tasks with a time estimate, or set a daily focus time on a habit, and I’ll show exactly what this time could have covered.</p>' + foot;
    }
    var r = fill(items, waste), used = waste - r.left, pct = Math.min(100, Math.round(used / waste * 100));
    if (r.taken.length) {
      h += '<ul class="could">' + r.taken.slice(0, 6).map(function (it) {
        return '<li><span class="ck">✓</span><span class="cn">' + esc(it.label) + '</span><span class="cm">' + fmt(it.min) + '</span></li>';
      }).join('') + '</ul>';
      if (r.taken.length > 6) h += '<p class="tiny mt-1">and ' + (r.taken.length - 6) + ' more</p>';
      h += '<div class="cbar"><i style="width:' + pct + '%"></i></div><p class="tiny">That fills ' + fmt(used) + ' of the ' + fmt(waste) +
        (r.left >= 5 ? '. ' + fmt(r.left) + ' left over' : '') + '.</p>';
      if (r.part && r.left >= 5) h += '<p class="tiny mt-1">Next on your list: ' + esc(r.part.label) + ' needs ' + fmt(r.part.min) + '.</p>';
    } else if (r.part) {
      h += '<p class="text-sm">That’s about ' + Math.round(waste / r.part.min * 100) + '% of <b>' + esc(r.part.label) + '</b>, which needs ' + fmt(r.part.min) + '.</p>';
    }
    return h + foot;
  }

  /* ---------- storage ---------- */
  var S = (function () {
    var s = readJSON(KEY), o = { limit: 60, days: {}, since: '', range: 30, rate: 0, cur: '' };
    if (s && typeof s === 'object') {
      if (s.days && typeof s.days === 'object') o.days = s.days;
      if (isFinite(+s.limit) && +s.limit >= 0) o.limit = +s.limit;
      if (typeof s.since === 'string') o.since = s.since;
      if (+s.range === 7 || +s.range === 30) o.range = +s.range;
      if (isFinite(+s.rate) && +s.rate > 0) o.rate = +s.rate;
      if (typeof s.cur === 'string') o.cur = s.cur.slice(0, 4);
    }
    if (!o.since) o.since = todayKey();      // the day you started using this section
    return o;
  })();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('Saving is blocked in this browser. Entries will be lost on refresh.'); }
  }
  save();

  function ensure(k) { if (!S.days[k]) S.days[k] = { total: 0, items: [] }; return S.days[k]; }
  function cleanup(k) { var d = S.days[k]; if (d && !d.total && !d.items.length) delete S.days[k]; }

  function dayData(k) {
    var d = S.days[k];
    if (!d) return { has: false, total: 0, waste: 0, sum: 0, items: [] };
    var sum = d.items.reduce(function (a, i) { return a + i.min; }, 0);
    var total = Math.max(d.total || 0, sum);
    return { has: total > 0, total: total, waste: Math.min(sum, total), sum: sum, items: d.items };
  }
  function firstDay() {
    var f = S.since;
    Object.keys(S.days).forEach(function (k) { if (k < f && dayData(k).has) f = k; });
    return f;
  }
  function missing() {            // days without an entry, oldest first, from your first day up to yesterday
    var out = [], f = firstDay(), t = todayKey();
    for (var i = 29; i >= 1; i--) { var k = shift(t, -i); if (k >= f && !dayData(k).has) out.push(k); }
    return out;
  }
  function logStreak() {
    var t = todayKey(), k = dayData(t).has ? t : shift(t, -1), n = 0;
    while (dayData(k).has) { n++; k = shift(k, -1); }
    return n;
  }

  /* ---------- section markup ---------- */
  var quick = ['Reels / Shorts', 'Social feeds', 'Games', 'YouTube drift', 'Random browsing'];
  anchor.insertAdjacentHTML('beforebegin',
    '<section id="screen">' +
      '<div class="mb-4"><h2 class="serif font-black">Screen time check</h2>' +
      '<p>Open Screen Time (iPhone) or Digital Wellbeing (Android), read the numbers, and enter them here. A web page can’t read your phone’s usage by itself.</p></div>' +
      '<div class="frame"><div class="grid lg:grid-cols-2 gap-4">' +
        '<div class="panel-deep">' +
          '<div class="flex flex-wrap items-end justify-between gap-3"><h3 class="h3">Log a day</h3>' +
            '<label class="text-xs font-bold">Day<input id="sDate" type="date" class="field mt-1"></label></div>' +

          '<p class="font-bold mt-4">1. How much total screen time did you have?</p>' +
          '<div class="flex items-center gap-2 mt-2">' +
            '<input id="sTh" class="field" style="width:80px" type="number" min="0" max="24" placeholder="0" aria-label="Total hours"><span class="font-bold">h</span>' +
            '<input id="sTm" class="field" style="width:80px" type="number" min="0" max="999" placeholder="0" aria-label="Total minutes"><span class="font-bold">min</span></div>' +

          '<p class="font-bold mt-5">2. How much of it went on things that don’t matter?</p>' +
          '<p class="hint">Scrolling, reels, idle games, random browsing. Add each one and they’re summed up.</p>' +
          '<div id="sQuick" class="flex flex-wrap gap-2 mt-2">' +
            quick.map(function (n) { return '<button type="button" class="opt" aria-pressed="false" data-n="' + n + '">' + n + '</button>'; }).join('') +
          '</div>' +
          '<form id="sForm" class="flex flex-wrap items-center gap-2 mt-3" autocomplete="off">' +
            '<input id="sName" class="field" style="flex:1 1 140px;width:auto" maxlength="40" placeholder="What was it?" aria-label="What it was">' +
            '<input id="sIh" class="field" style="width:64px" type="number" min="0" max="24" placeholder="h" aria-label="Hours">' +
            '<input id="sIm" class="field" style="width:64px" type="number" min="0" max="999" placeholder="min" aria-label="Minutes">' +
            '<button type="submit" class="btn btn-soft btn-sm">Add</button></form>' +
          '<ul id="sItems" class="grid gap-2 mt-3"></ul>' +
          '<p id="sWarn" class="text-sm font-bold mt-2"></p>' +

          '<label class="lbl mt-4">Daily limit for time that doesn’t matter (minutes)' +
            '<input id="sLimit" class="field mt-1" style="width:110px" type="number" min="0" max="1440"></label>' +
        '</div>' +
        '<div class="panel-soft"><div id="sOut"></div></div>' +
      '</div></div>' +
    '</section>');

  /* ---------- state + inputs ---------- */
  var sel = todayKey();
  function titleFor(k) {
    return k === todayKey() ? 'Today' : parse(k).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function loadInputs() {
    var d = S.days[sel], t = d ? d.total : 0;
    $('sTh').value = t ? Math.floor(t / 60) : '';
    $('sTm').value = t ? t % 60 : '';
    renderItems();
  }
  function saveTotal() {
    var d = ensure(sel);
    d.total = Math.min(1440, num('sTh', 24) * 60 + num('sTm', 999));
    cleanup(sel); save(); render();
  }

  $('sDate').max = todayKey();
  $('sDate').value = sel;
  $('sLimit').value = S.limit;

  $('sDate').addEventListener('change', function (e) {
    var v = e.target.value;
    if (!v || v > todayKey()) v = todayKey();
    sel = v; e.target.value = v;
    loadInputs(); renderOut();
  });
  ['sTh', 'sTm'].forEach(function (id) { $(id).addEventListener('input', saveTotal); });
  $('sLimit').addEventListener('input', function () {
    var v = parseInt(this.value, 10);
    S.limit = isNaN(v) || v < 0 ? 0 : Math.min(v, 1440);
    save(); renderOut();
  });
  $('sQuick').addEventListener('click', function (e) {
    var b = e.target.closest('.opt'); if (!b) return;
    $('sName').value = b.dataset.n; $('sIh').focus();
  });
  $('sForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('sName').value.trim();
    var min = Math.min(1440, num('sIh', 24) * 60 + num('sIm', 999));
    if (!name) { toast('Say what it was'); return; }
    if (min <= 0) { toast('Add how long it took'); return; }
    ensure(sel).items.push({ id: uid(), name: name, min: min });
    save();
    $('sName').value = ''; $('sIh').value = ''; $('sIm').value = '';
    render(); $('sName').focus();
  });
  $('sItems').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sdel]'); if (!b) return;
    var d = S.days[sel]; if (!d) return;
    d.items = d.items.filter(function (i) { return i.id !== b.dataset.sdel; });
    cleanup(sel); save(); render();
  });
  $('sOut').addEventListener('click', function (e) {
    var r = e.target.closest('[data-range]');
    if (r) { S.range = +r.dataset.range === 7 ? 7 : 30; save(); renderOut(); return; }
    var m = e.target.closest('[data-day]');
    if (m) { sel = m.dataset.day; $('sDate').value = sel; loadInputs(); renderOut(); $('sTh').focus(); }
  });
 

  /* ---------- render ---------- */
  function renderItems() {
    var d = S.days[sel], items = d ? d.items : [];
    var sum = items.reduce(function (a, i) { return a + i.min; }, 0);
    $('sItems').innerHTML = items.map(function (i) {
      return '<li class="qrow"><div class="flex-1 min-w-0"><b>' + esc(i.name) + '</b></div><span class="font-bold">' + fmt(i.min) +
        '</span><button type="button" class="xb" data-sdel="' + i.id + '" aria-label="Remove ' + esc(i.name) + '">×</button></li>';
    }).join('') + (items.length ? '<li class="flex justify-between text-sm font-bold px-1"><span>Total on things that don’t matter</span><span>' + fmt(sum) + '</span></li>' : '');
    var warn = '';
    if (d && sum > 0 && !d.total) warn = 'Enter your total screen time above so I can compare.';
    else if (d && sum > d.total) warn = 'Your time-wasters add up to more than your total. Check both numbers.';
    $('sWarn').textContent = warn;
  }

  function chartData(n) {
    var days = [], wk = 0, logged = 0, leaks = {}, maxTot = 0, i, d, dd;
    for (i = n - 1; i >= 0; i--) {
      d = new Date(); d.setDate(d.getDate() - i); dd = dayData(key(d));
      days.push({ x: dd, d: d, back: i });
      if (dd.has) {
        wk += dd.waste; logged++;
        if (dd.total > maxTot) maxTot = dd.total;
        dd.items.forEach(function (it) {
          var nm = it.name.trim().toLowerCase();
          leaks[nm] = leaks[nm] || { name: it.name.trim(), min: 0 };
          leaks[nm].min += it.min;
        });
      }
    }
    var labels = days.map(function (dy) {
      if (dy.back === 0) return 'Today';
      if (n <= 7) return dy.d.toLocaleDateString('en-US', { weekday: 'short' });
      return dy.back % 5 === 0 ? dy.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    });
    var cmax = Math.ceil(Math.max(60, S.limit, maxTot) / 60) * 60, svg = '';
    if (window.LineChart) {
      svg = LineChart.svg({
        labels: labels,
        series: [
          { values: days.map(function (dy) { return dy.x.has ? dy.x.total : null; }), cls: 's1' },
          { values: days.map(function (dy) { return dy.x.has ? dy.x.waste : null; }), cls: 's0', label: n <= 7 }
        ],
        min: 0, max: cmax, ticks: [0, cmax / 2, cmax], fmtTick: fmt, fmtVal: fmt,
        lines: [{ v: S.limit, label: 'limit ' + fmt(S.limit) }],
        left: 44, h: 160,
        aria: 'Line chart of total screen time and time that did not matter over the last ' + n + ' days',
        tip: function (v, idx, si) {
          return days[idx].d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ': ' + fmt(v) + (si === 0 ? ' total' : ' didn’t matter');
        }
      });
      if (n > 7) svg = svg.replace(/r="3\.3"/g, 'r="2"').replace(/r="4\.6"/g, 'r="3.2"');   // smaller dots on a long chart
    }
    return { svg: svg, wk: wk, logged: logged, leaks: leaks };
  }

  /* ---------- the cost of the time: built from your own numbers ---------- */
  var WAKE = 16 * 60;                       // awake minutes in a day
  function n1(x) { var r = Math.round(x * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); }
  function money(v) { return Math.round(v).toLocaleString('en-US'); }

  function costHtml(c, rng) {
    var waste = c.wk, avgDay = Math.round(waste / c.logged);
    if (avgDay < 20) {
      return '<div class="cost"><p class="cost-k">YOUR TIME</p><h4 class="cost-h serif">Under 20 minutes a day.</h4>' +
        '<p class="cost-p">Across ' + c.logged + (c.logged === 1 ? ' logged day' : ' logged days') + ' you gave only ' + fmt(waste) +
        ' to things that don’t matter. This is what protecting your time looks like.</p></div>';
    }

    var yearMin = avgDay * 365, yearHours = Math.round(yearMin / 60), yearWake = yearMin / WAKE;
    var pctDay = Math.round(avgDay / WAKE * 100);
    var tiles = '<div class="cost-grid">' +
      '<div class="cost-t"><span>Every logged day</span><b>' + fmt(avgDay) + '</b><i>' + pctDay + '% of your waking hours</i></div>' +
      '<div class="cost-t"><span>At this pace, one year</span><b>' + yearHours.toLocaleString('en-US') + ' hours</b><i>' +
        (yearWake >= 60 ? 'about ' + Math.round(yearWake / 30) + ' months of waking life' : Math.round(yearWake) + ' waking days') + '</i></div></div>';

    var li = [];
    var TI = taskItems().items, tt = TI.reduce(function (a, b) { return a + b.min; }, 0);
    if (TI.length && tt > 0) {
      li.push(waste >= tt
        ? 'Your ' + (TI.length === 1 ? 'open task needs' : TI.length + ' open tasks need') + ' only ' + fmt(tt) + ' in total. This time was ' +
          (waste / tt >= 2 ? Math.round(waste / tt) + ' times' : 'more than') + ' that.'
        : 'Your open tasks need ' + fmt(tt) + ' in total. This time would have covered ' + Math.round(waste / tt * 100) + '% of that.');
    }
    var fm = rangeFocus(rng);
    if (fm > 0) {
      li.push('In the same ' + rng + ' days you gave ' + fmt(fm) + ' to your habits and tasks. ' +
        (waste > fm
          ? (waste / fm >= 2 ? 'Things that don’t matter got ' + Math.round(waste / fm) + ' times as much of your time.' : 'Things that don’t matter got more of your time.')
          : 'That is more than the ' + fmt(waste) + ' that went on things that don’t matter. Good.'));
    } else {
      li.push('You logged no focus time on habits or tasks in the same ' + rng + ' days.');
    }
    if (S.rate > 0) {
      li.push('Counted at your own rate of ' + esc(S.cur) + money(S.rate) + ' an hour, that is ' + esc(S.cur) + money(waste / 60 * S.rate) +
        ' of your time. Money can be earned again. These hours cannot.');
    }

    var top = Object.keys(c.leaks).map(function (k) { return c.leaks[k]; }).sort(function (a, b) { return b.min - a.min; }), leakTotal = 0;
    top.forEach(function (t) { leakTotal += t.min; });
    top = top.slice(0, 3);
    var leaks = top.length
      ? '<p class="cost-p" style="margin-top:12px"><b>Biggest leaks:</b> ' + top.map(function (t) { return esc(t.name) + ' ' + fmt(t.min); }).join(', ') + '.' +
        (leakTotal && top[0].min / leakTotal >= 0.3 ? ' ' + esc(top[0].name) + ' alone took ' + Math.round(top[0].min / leakTotal * 100) + '% of it.' : '') + '</p>'
      : '';

    return '<div class="cost">' +
      '<p class="cost-k">THE COST</p>' +
      '<h4 class="cost-h serif">' + fmt(waste) + ' gone. It never comes back.</h4>' +
      '<p class="cost-p">Over the last ' + rng + ' days, that is ' + n1(waste / WAKE) + ' waking days of your life (counting 16 awake hours a day), spent on things you said don’t matter.</p>' +
      tiles +
      '<ul class="cost-l">' + li.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' + leaks +
      '<p class="cost-q">Money you lose, you can earn again. Time you lose is gone for good. Life doesn’t give a second try at today.</p>' +
      '<button type="button" class="btn btn-deep btn-sm" data-go="habits">Spend the next 25 minutes on purpose</button>' +
      '<div class="cost-rate"><label for="sRate">What is one hour of your time worth? <span>(optional)</span></label>' +
      '<div class="cost-rate-r"><input id="sCur" class="field" maxlength="4" placeholder="$" value="' + esc(S.cur) + '" aria-label="Currency symbol">' +
      '<input id="sRate" class="field" type="number" min="0" max="1000000" step="any" placeholder="e.g. 5" value="' + (S.rate > 0 ? S.rate : '') + '"></div></div>' +
      '</div>';
  }

    /* ---------- the cost opens in a popup instead of a long block ---------- */
  var lastCost = null;
  function costButton(c, rng) {
    var avgDay = Math.round(c.wk / c.logged);
    return '<div class="cost-open"><div><p class="cost-k">THE COST</p><p class="text-sm"><b>' + fmt(c.wk) + '</b> lost in ' + rng + ' days' +
      (avgDay >= 20 ? ' · about ' + fmt(avgDay) + ' a day' : '') + '</p></div>' +
      '<button type="button" class="btn btn-deep btn-sm" data-cost>See what it means</button></div>';
  }
  var cdlg = document.createElement('dialog');
  cdlg.id = 'costDlg'; cdlg.className = 'costdlg';
  cdlg.innerHTML = '<button type="button" class="qw-x cost-x" id="costX" aria-label="Close">×</button><div id="costBody"></div>';
  document.body.appendChild(cdlg);
  function fillCost() { if (lastCost) $('costBody').innerHTML = costHtml(lastCost.c, lastCost.rng); }
  function closeCost() { if (typeof cdlg.close === 'function') cdlg.close(); else cdlg.removeAttribute('open'); }
  $('sOut').addEventListener('click', function (e) {
    if (!e.target.closest('[data-cost]') || !lastCost) return;
    fillCost();
    if (typeof cdlg.showModal === 'function') { if (!cdlg.open) cdlg.showModal(); } else cdlg.setAttribute('open', '');
  });
  cdlg.addEventListener('click', function (e) {
    if (e.target === cdlg || e.target.closest('#costX') || e.target.closest('[data-go]')) closeCost();
  });
  cdlg.addEventListener('change', function (e) {
    if (e.target.id === 'sRate') { var v = parseFloat(e.target.value); S.rate = v > 0 ? v : 0; save(); }
    else if (e.target.id === 'sCur') { S.cur = e.target.value.trim().slice(0, 4); save(); }
    else return;
    renderOut(); fillCost();
  });
  function renderOut() {
    var x = dayData(sel), limit = S.limit, out = [];
    var useful = x.total - x.waste, pct = x.total ? Math.round(x.waste / x.total * 100) : 0;
    var verdict;
    if (!x.has) verdict = 'Nothing logged for this day yet. Enter your numbers on the left.';
    else if (x.waste === 0) verdict = 'No wasted screen time. Protect that.';
    else if (x.waste <= limit) verdict = 'Within your limit. ' + pct + '% of your screen time went on things that don’t matter.';
    else verdict = fmt(x.waste) + ' went on things that don’t matter, ' + fmt(x.waste - limit) + ' over your limit.';

    out.push('<h3 class="h3">' + titleFor(sel) + '</h3>');
    out.push('<p class="font-bold leading-snug mt-1">' + verdict + '</p>');

    if (x.has) {
      out.push('<div class="grid grid-cols-3 gap-2 mt-3">' +
        '<div class="scell"><div class="tiny opacity-75">Total</div><b class="serif">' + fmt(x.total) + '</b></div>' +
        '<div class="scell"><div class="tiny opacity-75">Didn’t matter</div><b class="serif">' + fmt(x.waste) + '</b></div>' +
        '<div class="scell"><div class="tiny opacity-75">Useful</div><b class="serif">' + fmt(useful) + '</b></div></div>');

      var lines = [];
      var prev = dayData(shift(sel, -1));
      if (prev.has) {
        var df = x.waste - prev.waste;
        lines.push(df > 0 ? fmt(df) + ' more wasted than the day before' : df < 0 ? fmt(-df) + ' less wasted than the day before' : 'Same as the day before');
      }
      var others = [];
      for (var n = 1; n <= 7; n++) { var o = dayData(shift(sel, -n)); if (o.has) others.push(o.waste); }
      if (others.length) {
        var avg = Math.round(others.reduce(function (a, b) { return a + b; }, 0) / others.length), dv = x.waste - avg;
        lines.push(dv > 0 ? fmt(dv) + ' above your recent average of ' + fmt(avg) : dv < 0 ? fmt(-dv) + ' below your recent average of ' + fmt(avg) : 'Right on your recent average of ' + fmt(avg));
      }
      lines.push(x.waste <= limit ? fmt(limit - x.waste) + ' under your ' + fmt(limit) + ' limit' : fmt(x.waste - limit) + ' over your ' + fmt(limit) + ' limit');
      var f = focusMin(sel);
      if (f > 0 || x.waste > 0) lines.push('You focused ' + fmt(f) + ' on your habits and tasks and spent ' + fmt(x.waste) + ' on things that don’t matter');
      out.push('<ul class="grid gap-1 text-sm mt-3">' + lines.map(function (l) { return '<li>• ' + l + '</li>'; }).join('') + '</ul>');

      if (x.waste > 0) out.push(couldHtml(x.waste, sel));
    }

    /* last 7 or 30 days */
    var rng = S.range, c = chartData(rng), streak = logStreak();
    var hasAny = Object.keys(S.days).some(function (k) { return dayData(k).has; });
    out.push('<div class="flex flex-wrap items-center justify-between gap-2" style="margin-top:16px"><p class="h4" style="margin:0">Last ' + rng + ' days</p>' +
      '<div class="seg" role="group" aria-label="Range">' +
        '<button type="button" data-range="7" aria-pressed="' + (rng === 7) + '">7 days</button>' +
        '<button type="button" data-range="30" aria-pressed="' + (rng === 30) + '">30 days</button></div></div>');
    out.push('<div style="margin-top:8px">' + c.svg + '</div>' +
      '<p class="tiny mt-2"><span class="lgd"></span>Didn’t matter<span class="lgd s1" style="margin-left:14px"></span>Total screen time</p>' +
      '<p class="tiny mt-1 opacity-70">Logged ' + c.logged + ' of ' + rng + ' days' + (streak ? ' · logging streak ' + streak + (streak === 1 ? ' day' : ' days') : '') + '</p>');

    /* days you didn't log */
    var miss = missing();
    if (miss.length) {
      out.push('<p class="h4">Not logged (' + miss.length + ')</p><div class="mchips">' +
        miss.slice(-12).reverse().map(function (k) { return '<button type="button" class="mchip" data-day="' + k + '">' + shortDay(k) + '</button>'; }).join('') +
        (miss.length > 12 ? '<span class="tiny">+' + (miss.length - 12) + ' older</span>' : '') + '</div>' +
        '<p class="tiny opacity-70 mt-1">Tap a day to fill it in.</p>');
    } else if (hasAny) {
      out.push('<p class="text-sm mt-3"><b>Every day is logged.</b> Nice.</p>');
    }

        if (c.logged) { lastCost = { c: c, rng: rng }; out.push(costButton(c, rng)); } else lastCost = null;

    $('sOut').innerHTML = out.join('');
  }

  function render() { renderItems(); renderOut(); }

  // your tasks change elsewhere, so refresh the estimate whenever you open this tab or finish a focus session
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-tab="screen"], [data-go="screen"]')) setTimeout(renderOut, 60);
  });
  window.addEventListener('peaks:tfocus', renderOut);

  loadInputs();
  renderOut();
})();