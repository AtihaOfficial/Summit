(function () {
  'use strict';

  var TABS = ['overview', 'habits', 'tasks', 'screen', 'quotes'];
  var $ = function (id) { return document.getElementById(id); };
  var tabBtns = [].slice.call(document.querySelectorAll('.tab[data-tab]'));

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* ---------- tabs ---------- */
  function show(name, keepHash) {
    if (TABS.indexOf(name) < 0) name = 'overview';
    TABS.forEach(function (t) { var p = $('pane-' + t); if (p) p.hidden = t !== name; });
    tabBtns.forEach(function (b) {
      var on = b.dataset.tab === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    if (!keepHash) { try { history.replaceState(null, '', '#' + name); } catch (e) {} }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('.tab[data-tab]');
    if (t) { show(t.dataset.tab); return; }
    var g = e.target.closest('[data-go]');
    if (g) show(g.dataset.go);
  });

  var tablist = document.querySelector('.tabs');
  if (tablist) {
    tablist.addEventListener('keydown', function (e) {
      var i = tabBtns.indexOf(document.activeElement);
      if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      var n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabBtns.length) % tabBtns.length;
      tabBtns[n].focus(); show(tabBtns[n].dataset.tab); e.preventDefault();
    });
  }
  window.addEventListener('hashchange', function () {
    var h = location.hash.slice(1);
    if (TABS.indexOf(h) > -1) show(h, true);
  });

  var h0 = location.hash.slice(1);
  show(TABS.indexOf(h0) > -1 ? h0 : 'overview', true);

  /* ---------- 7-day line chart (replaces the bars that script.js draws) ---------- */
  var wk = $('weekChart');

  function habits() {
    try { var s = JSON.parse(localStorage.getItem('peaks.v3')); return s && Array.isArray(s.habits) ? s.habits : []; }
    catch (e) { return []; }
  }
  function fmtMin(m) {
    m = Math.round(m);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }

  function drawWeek() {
    if (!wk || !window.LineChart) return;
    var hs = habits();
    var mode = $('chartFocus') && $('chartFocus').getAttribute('aria-pressed') === 'true' ? 'focus' : 'done';
    var labels = [], vals = [], i, d, k;

    for (i = 6; i >= 0; i--) {
      d = new Date(); d.setDate(d.getDate() - i); k = key(d);
      labels.push(i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }));
      if (mode === 'done') {
        var pause = window['Pause'];
        var act = hs.filter(function (h) { return h.start <= k && !(pause && pause.is(h.id, k)); });   // paused habits don't count
        vals.push(act.length
          ? Math.round(act.reduce(function (a, h) { return a + Math.min((h.log && h.log[k]) || 0, 100); }, 0) / act.length)
          : null);
      } else {
        vals.push(Math.round((hs.reduce(function (a, h) { return a + ((h.time && h.time[k]) || 0); }, 0) + (window.TaskFocus ? TaskFocus.sec(k) : 0)) / 60));
      }
    }

    var opts;
    if (mode === 'done') {
      opts = { min: 0, max: 100, ticks: [0, 50, 100], fmtTick: function (v) { return v + '%'; }, fmtVal: function (v) { return v + '%'; }, left: 34 };
    } else {
      var top = Math.max(30, Math.ceil(Math.max.apply(null, vals) / 30) * 30);
      opts = { min: 0, max: top, ticks: [0, top / 2, top], fmtTick: fmtMin, fmtVal: fmtMin, left: 44 };
    }
    opts.labels = labels;
    opts.series = [{ values: vals, label: true, area: true }];
    opts.h = 150;
    opts.aria = mode === 'done' ? 'Line chart of daily habit completion over the last 7 days' : 'Line chart of daily focus time over the last 7 days';

    wk.innerHTML = LineChart.svg(opts);
  }

  drawWeek();
  window.addEventListener('peaks:stats', drawWeek);     // script.js fires this after every recalculation
  window.addEventListener('peaks:tfocus', drawWeek);
  window.addEventListener('peaks:pause', drawWeek);

  /* ---------- overview: mirror the top task from the queue ---------- */
  function cd(ms) {
    var over = ms < 0, s = Math.floor(Math.abs(ms) / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    var t = d > 0 ? d + 'd ' + h + 'h' : h > 0 ? h + 'h ' + m + 'm' : m > 0 ? m + 'm ' + pad(sec) + 's' : sec + 's';
    return t + (over ? ' overdue' : ' left');
  }
  function mirror() {
    var t = $('ovTask'), g = $('ovTag'), c = $('ovCd');
    if (!t) return;
    var tx = document.querySelector('#qNow .tx');
    if (!tx) { t.textContent = 'Nothing waiting'; g.textContent = 'Your queue is clear'; c.textContent = ''; return; }
    var tag = document.querySelector('#qNow .tag'), cdEl = document.querySelector('#qNow .cd[data-dl]');
    t.textContent = tx.textContent;
    g.textContent = tag ? tag.textContent : '';
    c.textContent = cdEl ? cd(+cdEl.dataset.dl - Date.now()) : 'No deadline';
  }

    document.querySelectorAll('details.fold[id]').forEach(function (d) {
    var k = 'peaks.fold.' + d.id;
    try { d.open = localStorage.getItem(k) === '1'; } catch (e) {}
    d.addEventListener('toggle', function () { try { localStorage.setItem(k, d.open ? '1' : '0'); } catch (e) {} });
  });
  
  setInterval(mirror, 1000);
  mirror();
})();