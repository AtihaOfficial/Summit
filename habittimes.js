(function () {
  'use strict';

  var KEY = 'peaks.htimes', MAIN = 'peaks.v3';
  var list = document.getElementById('list');
  if (!list) return;

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function wrap(m) { return ((m % 1440) + 1440) % 1440; }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function toMin(s) { var p = String(s).split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  function toStr(m) { m = wrap(Math.round(m)); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function fmtT(m) { m = wrap(Math.round(m)); var h = Math.floor(m / 60); return (h % 12 || 12) + ':' + pad(m % 60) + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function fmtS(m) { m = wrap(Math.round(m)); var h = Math.floor(m / 60); return (h % 12 || 12) + ':' + pad(m % 60) + (h >= 12 ? 'p' : 'a'); }
  function fmtHr(m) { m = wrap(Math.round(m)); var h = Math.floor(m / 60); return (h % 12 || 12) + (h >= 12 ? 'p' : 'a'); }
  function span(min) {
    min = Math.round(min);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60), r = min % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }
  function dur(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return h > 0 ? h + 'h ' + pad(m) + 'm ' + pad(sec) + 's' : m > 0 ? m + 'm ' + pad(sec) + 's' : sec + 's';
  }
  function toast(msg) {
    var box = document.getElementById('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }
  function isPaused(id, k) { return !!(window.Pause && Pause.is(id, k)); }

  /* ---------- storage ---------- */
  // sched: { habitId: { s:'06:30', e:'07:30' } }   (older saves used { t, w } and are converted on the fly)
  // done:  { habitId: { 'YYYY-MM-DD': minutesSinceMidnight, or -1 if unknown } }
  var D = (function () {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.sched && s.done) return s; } catch (e) {}
    return { sched: {}, done: {} };
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} }

  function win(hid) {
    var sc = D.sched[hid]; if (!sc) return null;
    var s, e;
    if (sc.s !== undefined) { s = toMin(sc.s); e = toMin(sc.e); }
    else { var T = toMin(sc.t), w = sc.w || 30; s = T - w; e = T + w; }
    s = Math.max(0, Math.min(1439, s));
    e = Math.max(s + 1, Math.min(1440, e));
    return { s: s, e: e };
  }

  var HM = {};
  function habits() {
    try { var s = JSON.parse(localStorage.getItem(MAIN)); return s && Array.isArray(s.habits) ? s.habits : []; }
    catch (e) { return []; }
  }

  /* ---------- record the time each habit is completed ---------- */
  var first = true;
  function sync() {
    var hs = habits(), tk = key(new Date()), changed = false, ids = {};
    HM = {};
    hs.forEach(function (h) {
      HM[h.id] = h; ids[h.id] = 1;
      var isDone = ((h.log && h.log[tk]) || 0) >= 100;
      var rec = D.done[h.id] || (D.done[h.id] = {});
      if (isDone && rec[tk] === undefined) { rec[tk] = first ? -1 : nowMin(); changed = true; }   // already done before this file ran: time unknown
      else if (!isDone && rec[tk] !== undefined) { delete rec[tk]; changed = true; }
    });
    if (hs.length) {
      Object.keys(D.done).forEach(function (id) { if (!ids[id]) { delete D.done[id]; delete D.sched[id]; changed = true; } });
    }
    first = false;
    if (changed) { save(); window.dispatchEvent(new Event('peaks:htimes')); }
    return changed;
  }

  /* ---------- countdown status ---------- */
  function status(hid) {
    var w = win(hid); if (!w) return null;
    var now = Date.now(), d = new Date(); d.setHours(0, 0, 0, 0);
    if (isPaused(hid, key(new Date()))) return { cls: '', main: 'Paused today', sub: 'No countdown while this habit is paused.' };
    var mid = d.getTime(), start = mid + w.s * 60000, end = mid + w.e * 60000;
    var rec = (D.done[hid] || {})[key(new Date())];

    if (rec !== undefined) {
      var sub = 'Next window opens in ' + dur(start + 86400000 - now);
      if (rec < 0) return { cls: '', main: 'Done today', sub: sub };
      var inWin = rec >= w.s && rec <= w.e;
      var how = inWin ? '✓ in window' : rec < w.s ? span(w.s - rec) + ' before the window' : span(rec - w.e) + ' after the window';
      return { cls: '', main: 'Done at ' + fmtT(rec) + ' · ' + how, sub: sub };
    }
    var range = 'Window ' + fmtT(w.s) + ' to ' + fmtT(w.e);
    if (now < start) return { cls: '', main: 'Opens in ' + dur(start - now), sub: range };
    if (now <= end) return { cls: 'on', main: 'Do it now · closes in ' + dur(end - now), sub: range };
    return { cls: 'late', main: 'Window closed ' + dur(now - end) + ' ago', sub: 'Still counts if you do it now' };
  }

  /* ---------- line chart of the times you did it ---------- */
  function chartHTML(h, w) {
    if (!window.LineChart) return '';
    var rec = D.done[h.id] || {}, labels = [], values = [], vals = [], i, d, v;
    for (i = 6; i >= 0; i--) {
      d = new Date(); d.setDate(d.getDate() - i); v = rec[key(d)];
      labels.push(i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }));
      if (v !== undefined && v >= 0) { values.push(v); vals.push(v); } else values.push(null);
    }
    if (!vals.length) return '';

    var all = vals.slice();
    if (w) { all.push(w.s); all.push(w.e); }
    var mn = Math.min.apply(null, all), mx = Math.max.apply(null, all);
    var lo = Math.max(0, Math.floor((mn - 60) / 60) * 60), hi = Math.min(1440, Math.ceil((mx + 60) / 60) * 60);
    if (hi - lo < 180) { hi = Math.min(1440, lo + 180); lo = Math.max(0, hi - 180); }
    var step = (hi - lo) <= 240 ? 60 : (hi - lo) <= 480 ? 120 : 240;
    hi = Math.min(1440, lo + Math.ceil((hi - lo) / step) * step);
    var ticks = [], t;
    for (t = lo; t <= hi; t += step) ticks.push(t);

    var svg = LineChart.svg({
      labels: labels,
      series: [{ values: values, label: true }],
      min: lo, max: hi, ticks: ticks, fmtTick: fmtHr, fmtVal: fmtS,
      bands: w ? [{ from: w.s, to: w.e }] : [],
      h: 140, left: 32,
      aria: 'Line chart of the time of day you completed this habit over the last 7 days',
      tip: function (val, idx) { return labels[idx] + ': ' + fmtT(val); }
    });

    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    var line = 'Average ' + fmtT(sum / vals.length) + ' · earliest ' + fmtT(Math.min.apply(null, vals)) + ' · latest ' + fmtT(Math.max.apply(null, vals));
    if (w) {
      var inN = vals.filter(function (x) { return x >= w.s && x <= w.e; }).length;
      line += ' · ' + inN + ' of ' + vals.length + ' in window';
    }
    return '<p class="ht-title">When you do it · last 7 days</p>' + svg + '<p class="htsum">' + line + '</p>';
  }

    function blockHTML(h) {
    var w = win(h.id);
    var left = w ? '<div><div class="ht-live" data-hid="' + h.id + '"></div><div class="ht-sub"></div></div>' : '';
    var links = '<span class="ht-links"><button type="button" class="link" data-ht="set">⏰ ' +
      (w ? fmtT(w.s) + ' to ' + fmtT(w.e) + ' · Edit' : 'Set a daily time') + '</button>' +
      '<button type="button" class="link" data-ht="hist">🕒 History</button></span>';
    return '<div class="ht"><div class="ht-top">' + left + links + '</div></div>';
  }

  /* ---------- put the block under every habit card ---------- */
  function renderBlocks() {
    list.querySelectorAll('.habit').forEach(function (li) {
      var old = li.querySelector('.ht'); if (old) old.remove();
      var h = HM[li.dataset.id]; if (!h) return;
      var host = li.querySelector('.relative .flex-1'); if (!host) return;
      host.insertAdjacentHTML('beforeend', blockHTML(h));
    });
    updateLive();
  }

  function updateLive() {
    list.querySelectorAll('.ht-live').forEach(function (el) {
      var s = status(el.dataset.hid); if (!s) return;
      var cls = 'ht-live' + (s.cls ? ' ' + s.cls : '');
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== s.main) el.textContent = s.main;
      var sub = el.parentNode.querySelector('.ht-sub'); if (sub && sub.textContent !== (s.sub || '')) sub.textContent = s.sub || '';
    });
  }

  /* ---------- order: open habits (soonest window end first), then done, then paused ---------- */
  var mo = null;
  function attach() { if (mo) mo.observe(list, { childList: true }); }

  function sortList() {
    var ae = document.activeElement;
    if (ae && ae.type === 'range' && list.contains(ae)) return;      // don't shuffle while a slider is being dragged
    var items = [].slice.call(list.children).filter(function (li) { return li.classList && li.classList.contains('habit'); });
    if (items.length < 2) return;
    var tk = key(new Date());

    var info = items.map(function (li, i) {
      var id = li.dataset.id, w = win(id), g, k;
      if (isPaused(id, tk)) { g = 2; k = 0; }
      else if (li.classList.contains('done')) { g = 1; var rec = (D.done[id] || {})[tk]; k = rec === undefined ? -1 : rec; }
      else { g = 0; k = w ? w.e : Infinity; }
      return { li: li, i: i, g: g, k: k };
    });
    info.sort(function (a, b) {
      if (a.g !== b.g) return a.g - b.g;
      if (a.k !== b.k) return a.k < b.k ? -1 : 1;
      return a.i - b.i;
    });
    var changed = info.some(function (x, idx) { return x.li !== items[idx]; });
    if (!changed) return;

    if (mo) mo.disconnect();
    info.forEach(function (x) { list.appendChild(x.li); });
    attach();
  }

  // script.js re-draws the habit list after every change, so put our blocks back and re-sort each time
  mo = new MutationObserver(function () {
    mo.disconnect();
    try { sync(); renderBlocks(); sortList(); } catch (e) {}
    attach();
  });
  attach();

  var ticks = 0;
  function tick() {
    if (sync()) renderBlocks(); else updateLive();
    if (++ticks % 5 === 0) sortList();
  }
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  window.addEventListener('peaks:pause', function () { sync(); renderBlocks(); sortList(); });

  /* ---------- "set a daily time" dialog: start and end ---------- */
  var QUICK = [['Early morning', '05:00', '07:00'], ['Morning', '07:00', '10:00'], ['Midday', '11:00', '14:00'],
               ['Afternoon', '15:00', '18:00'], ['Evening', '18:00', '21:00'], ['Night', '21:00', '23:30']];
  var dlg = document.createElement('dialog');
  dlg.id = 'htdlg'; dlg.className = 'about-dialog';
  dlg.innerHTML =
    '<form id="htForm" class="about-content" autocomplete="off">' +
      '<p class="about-eyebrow">DAILY TIME</p>' +
      '<h2 class="serif">When should it happen?</h2>' +
      '<p class="pz-note" id="htName"></p>' +
      '<div class="pz-dates">' +
        '<div><label class="lbl" for="htS">Starts at</label><input id="htS" type="time" class="field" required></div>' +
        '<div><label class="lbl" for="htE">Ends at</label><input id="htE" type="time" class="field" required></div>' +
      '</div>' +
      '<p class="lbl">Quick picks</p>' +
      '<div class="chiprow" id="htQ">' + QUICK.map(function (q, i) { return '<button type="button" class="chip" data-q="' + i + '">' + q[0] + '</button>'; }).join('') + '</div>' +
      '<p class="hint" id="htHelp" style="margin-top:12px"></p>' +
      '<p class="qw-err" id="htErr" role="alert" hidden></p>' +
      '<div class="cl-foot"><button type="button" class="btn btn-line-dark" id="htRm" style="margin-right:auto">Remove time</button>' +
      '<button type="button" class="btn btn-line-dark" id="htCancel">Cancel</button><button type="submit" class="btn btn-deep">Save</button></div>' +
    '</form>';
  document.body.appendChild(dlg);

  var editId = null;
  function $(id) { return document.getElementById(id); }
  function showDlg() { if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', ''); }
  function hideDlg() { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }
  function err(m) { var e = $('htErr'); e.textContent = m || ''; e.hidden = !m; }
  function help() {
    err('');
    var s = $('htS').value, e = $('htE').value;
    if (!s || !e) { $('htHelp').textContent = ''; return; }
    var a = toMin(s), b = toMin(e);
    $('htHelp').textContent = b > a
      ? 'The countdown runs to ' + fmtT(a) + ', then to ' + fmtT(b) + '. That’s a window of ' + span(b - a) + '.'
      : '';
  }

  function openDlg(hid) {
    var h = HM[hid]; if (!h) return;
    editId = hid; err('');
    var w = win(hid), vals = [], rec = D.done[hid] || {};
    Object.keys(rec).forEach(function (k) { if (rec[k] >= 0) vals.push(rec[k]); });
    var guess = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 480;
    $('htName').textContent = h.title;
    $('htS').value = w ? toStr(w.s) : toStr(guess - 30);
    $('htE').value = w ? toStr(w.e) : toStr(guess + 30);
    $('htRm').style.display = w ? '' : 'none';
    help(); showDlg(); $('htS').focus();
  }

  $('htS').addEventListener('input', help);
  $('htE').addEventListener('input', help);
  $('htQ').addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]'); if (!b) return;
    var q = QUICK[+b.dataset.q]; $('htS').value = q[1]; $('htE').value = q[2]; help();
  });
  $('htCancel').addEventListener('click', hideDlg);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) hideDlg(); });
  $('htRm').addEventListener('click', function () {
    delete D.sched[editId]; save(); hideDlg(); renderBlocks(); sortList(); toast('Daily time removed');
  });
  $('htForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var s = $('htS').value, en = $('htE').value;
    if (!s || !en) return err('Pick a start and an end time.');
    if (toMin(en) <= toMin(s)) return err('The end has to be after the start. For a late window, end it at 11:59 PM.');
    D.sched[editId] = { s: s, e: en };
    save(); hideDlg(); renderBlocks(); sortList();
    toast('Daily time set: ' + fmtT(toMin(s)) + ' to ' + fmtT(toMin(en)));
  });

  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ht="set"]'); if (!b) return;
    var li = b.closest('.habit'); if (li) openDlg(li.dataset.id);
  });
  /* ---------- history: when you started and finished, day by day (opens on request) ---------- */
  function safeJ(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function tmOf(ms) { var d = new Date(ms); return fmtT(d.getHours() * 60 + d.getMinutes()); }
  function sessionsOf(h) {
    var seen = {}, out = [];
    function take(arr, arch) {
      (arr || []).forEach(function (s) {
        if (!s || !s.at || !s.sec || seen[s.at]) return;
        if (arch && s.k !== 'h') return;
        if (!(s.hid ? s.hid === h.id : s.title === h.title)) return;
        seen[s.at] = 1; out.push({ at: s.at, sec: s.sec, begin: s.begin || 0 });
      });
    }
    var m = safeJ(MAIN); take(m && m.sessions, false);
    take(safeJ('peaks.arch'), true);
    return out;
  }

  var hdlg = document.createElement('dialog');
  hdlg.id = 'hhdlg'; hdlg.className = 'about-dialog hdlg';
  hdlg.innerHTML =
    '<div class="about-content">' +
      '<div class="qw-head"><p class="about-eyebrow">HISTORY</p><button type="button" class="qw-x" id="hhX" aria-label="Close">×</button></div>' +
      '<h2 class="serif" id="hhName"></h2>' +
      '<div class="seg" role="group" aria-label="Range"><button type="button" data-r="7">7 days</button>' +
        '<button type="button" data-r="14">14 days</button><button type="button" data-r="30">30 days</button></div>' +
      '<div id="hhBody"></div>' +
    '</div>';
  document.body.appendChild(hdlg);
  var hhId = '', hhRange = 7;

  function renderHist() {
    var h = HM[hhId]; if (!h) return;
    $('hhName').textContent = h.title;
    hdlg.querySelectorAll('[data-r]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.r === hhRange)); });
    var w = win(h.id), rec = D.done[h.id] || {}, by = {}, rows = '', i, d, k;
    sessionsOf(h).forEach(function (s) { var dk = key(new Date(s.at)); (by[dk] = by[dk] || []).push(s); });

    for (i = 0; i < hhRange; i++) {
      d = new Date(); d.setDate(d.getDate() - i); k = key(d);
      if (k < h.start) break;
      var p = Math.min((h.log && h.log[k]) || 0, 100), v = rec[k], line, cls = '';
      if (isPaused(h.id, k)) { line = '⏸ Paused'; cls = ' hd-pz'; }
      else if (v !== undefined && v >= 0) {
        line = '✓ Done at ' + fmtT(v) + (w ? (v >= w.s && v <= w.e ? ' · in your window' : v < w.s ? ' · ' + span(w.s - v) + ' before the window' : ' · ' + span(v - w.e) + ' after the window') : '');
        cls = ' hd-ok';
      }
      else if (p >= 100) { line = '✓ Done (time not recorded)'; cls = ' hd-ok'; }
      else if (p > 0) line = p + '% done';
      else line = i === 0 ? 'Not done yet' : 'Not done';

      var ss = (by[k] || []).sort(function (a, b) { return (a.begin || a.at - a.sec * 1000) - (b.begin || b.at - b.sec * 1000); });
      var sh = ss.length ? '<ul class="hd-sess">' + ss.map(function (s) {
        return '<li>▶ Started ' + (s.begin ? '' : 'about ') + tmOf(s.begin || s.at - s.sec * 1000) + ' · focused ' + span(Math.max(1, s.sec / 60)) + ' · saved ' + tmOf(s.at) + '</li>';
      }).join('') + '</ul>' : '';

      rows += '<li class="hd' + cls + '"><div class="hd-day"><b>' + (i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'short' })) +
        '</b><span>' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</span></div>' +
        '<div class="hd-body"><p class="hd-line">' + line + '</p>' + sh + '</div></li>';
    }
    var chart = chartHTML(h, w);
    $('hhBody').innerHTML = '<ul class="hd-list">' + rows + '</ul>' +
      (chart ? '<details class="fold hd-chart"><summary><h3 class="h4">Time-of-day chart</h3></summary>' + chart + '</details>' : '');
  }
  function openHist(id) {
    hhId = id; renderHist();
    if (typeof hdlg.showModal === 'function') { if (!hdlg.open) hdlg.showModal(); } else hdlg.setAttribute('open', '');
  }
  hdlg.addEventListener('click', function (e) {
    if (e.target === hdlg || e.target.closest('#hhX')) { if (typeof hdlg.close === 'function') hdlg.close(); else hdlg.removeAttribute('open'); return; }
    var r = e.target.closest('[data-r]'); if (r) { hhRange = +r.dataset.r; renderHist(); }
  });
  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ht="hist"]'); if (!b) return;
    var li = b.closest('.habit'); if (li) openHist(li.dataset.id);
  });


  /* ---------- start ---------- */
  sync();
  renderBlocks();
  sortList();
})();