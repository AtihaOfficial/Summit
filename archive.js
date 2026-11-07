(function () {
  'use strict';

  var KEY = 'peaks.arch', CKEY = 'peaks.arch.clear';
  var $ = function (id) { return document.getElementById(id); };
  var lists = { h: $('fpList'), t: $('tfList') };
  var NAMES = { h: 'Focus session archive', t: 'Task session archive' };
  var SUBS = { h: 'Every habit focus session, day by day.', t: 'Every task focus session, day by day.' };
  var TABS = { h: 'habits', t: 'tasks' };
  var TABNAME = { h: 'Habits', t: 'Tasks' };
  var PANES = ['overview', 'habits', 'tasks', 'screen'];
  var WK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var main = document.querySelector('main');
  if (!main || (!lists.h && !lists.t)) return;

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dur(sec) {
    var m = Math.round(sec / 60);
    if (m === 0) return sec > 0 ? '<1m' : '0m';
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }
  function short(s) { s = String(s || ''); return s.length > 48 ? s.slice(0, 46) + '…' : s; }
  function tm(ms) { return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function safe(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function longDay(k) { return parse(k).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function shortDay(k) { return parse(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function toast(msg) {
    var box = $('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }

  /* ---------- data ---------- */
  var A = safe(KEY, []);
  if (!Array.isArray(A)) A = [];
  var CL = safe(CKEY, {});
  if (!CL || typeof CL !== 'object') CL = {};
  function saveA() { try { localStorage.setItem(KEY, JSON.stringify(A)); } catch (e) {} }
  function saveCL() { try { localStorage.setItem(CKEY, JSON.stringify(CL)); } catch (e) {} }

  // copy every finished session into the archive, so nothing is lost when the app trims its own list
  function mirror() {
    var seen = {}, changed = false;
    A.forEach(function (e) { seen[e.k + ':' + e.at] = 1; });
    function take(k, arr) {
      (arr || []).forEach(function (s) {
        if (!s || !s.at || !s.sec) return;
        if (s.at <= (CL[k] || 0)) return;                    // cleared earlier, never bring it back
        var id = k + ':' + s.at;
        if (seen[id]) return;
        seen[id] = 1; changed = true;
                A.push({ k: k, hid: s.hid || '', begin: s.begin || 0, title: s.title || (k === 'h' ? 'Habit' : 'Task'), at: s.at, sec: s.sec });
      });
    }
    var m = safe('peaks.v3', null), t = safe('peaks.tfocus', null);
    take('h', m && m.sessions);
    take('t', t && t.sessions);
    if (changed) {
      A.sort(function (a, b) { return b.at - a.at; });
      A = A.slice(0, 1500);
      saveA();
    }
    return changed;
  }

  function dayMap(k) {
    var m = {};
    A.forEach(function (e) {
      if (e.k !== k) return;
      var d = key(new Date(e.at)), g = m[d] || (m[d] = { sec: 0, n: 0, rows: [] });
      g.sec += e.sec; g.n++; g.rows.push(e);
    });
    Object.keys(m).forEach(function (d) { m[d].rows.sort(function (a, b) { return a.at - b.at; }); });
    return m;
  }

  /* ---------- the two archive pages ---------- */
  var panes = {}, view = {};
  var foot = main.querySelector('.foot');
  ['h', 't'].forEach(function (k) {
    if (!lists[k]) return;
    var s = document.createElement('section');
    s.id = 'arch-' + k; s.className = 'pane archpane'; s.hidden = true;
    s.innerHTML =
      '<div class="arch-top"><button type="button" class="link" data-back>← Back to ' + TABNAME[k] + '</button></div>' +
      '<div class="pane-head"><div><h2 class="h2">' + NAMES[k] + '</h2><p class="hint">' + SUBS[k] + '</p></div>' +
      '<button type="button" class="btn btn-line btn-sm" data-clear>Clear…</button></div>' +
      '<div class="arch-grid"><section class="card acal" data-cal></section><section class="card aday" data-day></section></div>';
        if (foot && foot.parentNode) foot.parentNode.insertBefore(s, foot);
    else main.appendChild(s);
    panes[k] = s;
    view[k] = { m: monthStart(new Date()), sel: key(new Date()) };
  });

  function pickDay(k, m) {
    var now = new Date(), y = m.getFullYear(), mo = m.getMonth();
    if (y === now.getFullYear() && mo === now.getMonth()) return key(now);
    var map = dayMap(k), dim = new Date(y, mo + 1, 0).getDate(), best = '', max = 0, d, dk;
    for (d = 1; d <= dim; d++) { dk = key(new Date(y, mo, d)); if (map[dk] && map[dk].sec > max) { max = map[dk].sec; best = dk; } }
    return best || key(new Date(y, mo, 1));
  }

  function renderPane(k) {
    var p = panes[k]; if (!p) return;
    var st = view[k], map = dayMap(k), y = st.m.getFullYear(), mo = st.m.getMonth();
    var now = new Date(), today = key(now), atNow = y === now.getFullYear() && mo === now.getMonth();
    var dim = new Date(y, mo + 1, 0).getDate(), lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    var max = 0, tot = 0, cnt = 0, act = 0, best = '', d, dk, g;
    for (d = 1; d <= dim; d++) {
      dk = key(new Date(y, mo, d)); g = map[dk];
      if (g) { tot += g.sec; cnt += g.n; act++; if (g.sec > max) { max = g.sec; best = dk; } }
    }

    var cells = '';
    for (d = 0; d < lead; d++) cells += '<span class="ac blank"></span>';
    for (d = 1; d <= dim; d++) {
      dk = key(new Date(y, mo, d)); g = map[dk];
      var fut = dk > today, lvl = 0;
      if (g && max) { var r = g.sec / max; lvl = r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.8 ? 3 : 4; }
      var label = shortDay(dk) + (g ? ': ' + g.n + (g.n === 1 ? ' session, ' : ' sessions, ') + dur(g.sec) : ': no sessions');
      cells += '<button type="button" class="ac' + (lvl ? ' h' + lvl : '') + (dk === st.sel ? ' sel' : '') + (dk === today ? ' tod' : '') +
        '" data-d="' + dk + '"' + (fut ? ' disabled' : '') + ' aria-label="' + esc(label) + '" aria-pressed="' + (dk === st.sel) + '">' +
        '<span class="an">' + d + '</span>' + (g ? '<span class="at">' + dur(g.sec) + '</span>' : '') + '</button>';
    }

    p.querySelector('[data-cal]').innerHTML =
      '<div class="acal-head"><button type="button" class="ibtn2" data-prev aria-label="Previous month">‹</button>' +
      '<h3 class="serif">' + st.m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + '</h3>' +
      '<button type="button" class="ibtn2" data-next aria-label="Next month"' + (atNow ? ' disabled' : '') + '>›</button></div>' +
      '<div class="acal-sub"><span>' + (cnt ? cnt + (cnt === 1 ? ' session' : ' sessions') + ' · ' + dur(tot) : 'No sessions this month') +
      '</span><button type="button" class="link" data-today>Today</button></div>' +
      '<div class="awk">' + WK.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="agrid">' + cells + '</div>' +
      '<div class="alegend"><span>Less</span><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>More</span></div>';

    var mine = A.filter(function (e) { return e.k === k; });
    var allSec = mine.reduce(function (a, e) { return a + e.sec; }, 0);
    var gd = map[st.sel];
    var rows = gd ? '<ul class="alist">' + gd.rows.map(function (e) {
      return '<li><span class="atm">' + tm(e.at) + '</span><span class="ant">' + esc(short(e.title)) + '</span><b>' + dur(e.sec) + '</b></li>';
    }).join('') + '</ul>' : '';

    p.querySelector('[data-day]').innerHTML =
      '<h3 class="serif">' + longDay(st.sel) + (st.sel === today ? '<span class="atag">Today</span>' : '') + '</h3>' +
      (gd ? '<p class="hint">' + gd.n + (gd.n === 1 ? ' session' : ' sessions') + ' · ' + dur(gd.sec) + ' in total</p>' + rows
          : '<p class="hint aempty">No sessions on this day.</p>') +
      '<h4 class="h4">This month</h4>' +
      '<dl class="akpi"><div><dt>Total time</dt><dd>' + (tot ? dur(tot) : '–') + '</dd></div>' +
      '<div><dt>Sessions</dt><dd>' + cnt + '</dd></div>' +
      '<div><dt>Active days</dt><dd>' + act + '</dd></div>' +
      '<div><dt>Best day</dt><dd>' + (best ? shortDay(best) + ' · ' + dur(map[best].sec) : '–') + '</dd></div></dl>' +
      '<p class="hint" style="margin-top:12px">' + (mine.length
        ? 'All time: ' + mine.length + (mine.length === 1 ? ' session' : ' sessions') + ' · ' + dur(allSec)
        : 'Nothing here yet. Finish a focus session and it shows up in this calendar.') + '</p>';
  }

  Object.keys(panes).forEach(function (k) {
    panes[k].addEventListener('click', function (e) {
      var st = view[k], b;
      if ((b = e.target.closest('[data-d]'))) { st.sel = b.dataset.d; renderPane(k); return; }
      if (e.target.closest('[data-prev]')) { st.m = new Date(st.m.getFullYear(), st.m.getMonth() - 1, 1); st.sel = pickDay(k, st.m); renderPane(k); return; }
      if (e.target.closest('[data-next]')) {
        var n = new Date(st.m.getFullYear(), st.m.getMonth() + 1, 1);
        if (n <= new Date()) { st.m = n; st.sel = pickDay(k, n); renderPane(k); }
        return;
      }
      if (e.target.closest('[data-today]')) { st.m = monthStart(new Date()); st.sel = key(new Date()); renderPane(k); return; }
      if (e.target.closest('[data-back]')) { var tab = document.querySelector('.tab[data-tab="' + TABS[k] + '"]'); if (tab) tab.click(); return; }
      if (e.target.closest('[data-clear]')) openClear(k);
    });
  });

  /* ---------- open and close the pages ---------- */
  function openArch(k) {
    if (!panes[k]) return;
    var tab = document.querySelector('.tab[data-tab="' + TABS[k] + '"]');
    if (tab) tab.click();                                   // highlights the tab and hides the other sections
    PANES.forEach(function (n) { var el = $('pane-' + n); if (el) el.hidden = true; });
    Object.keys(panes).forEach(function (x) { panes[x].hidden = x !== k; });
    view[k] = { m: monthStart(new Date()), sel: key(new Date()) };
    renderPane(k);
    window.scrollTo(0, 0);
  }
  function closeArch() { Object.keys(panes).forEach(function (x) { panes[x].hidden = true; }); }

  /* ---------- the "recent sessions" lists under each timer (today only) ---------- */
  var obs = {};
  function recentRow(e) {
    return '<li class="srow"><span class="font-bold">' + esc(short(e.title)) + '</span><span class="opacity-80">Today, ' +
      tm(e.at) + ' · <b>' + dur(e.sec) + '</b></span></li>';
  }
  function renderRecent() {
    var tk = key(new Date());
    ['h', 't'].forEach(function (k) {
      var ul = lists[k]; if (!ul || !panes[k]) return;
      var recent = A.filter(function (e) { return e.k === k && key(new Date(e.at)) === tk; }).slice(0, 5);
      if (obs[k]) obs[k].disconnect();
      ul.innerHTML = recent.length ? recent.map(recentRow).join('')
        : '<li class="hint">No sessions yet today. Finished sessions show here, then move to the archive.</li>';
      if (obs[k]) obs[k].observe(ul, { childList: true });
    });
  }

  var lastDay = key(new Date());
  function render() {
    lastDay = key(new Date());
    renderRecent();
    Object.keys(panes).forEach(function (k) { if (!panes[k].hidden) renderPane(k); });
  }

  ['h', 't'].forEach(function (k) {
    var ul = lists[k]; if (!ul || !panes[k]) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-line btn-sm arch-open';
    b.setAttribute('data-arch-open', k); b.textContent = 'Open archive calendar';
    ul.insertAdjacentElement('afterend', b);
    // the other scripts rewrite these lists, so take them back over every time
    obs[k] = new MutationObserver(function () { mirror(); render(); });
    obs[k].observe(ul, { childList: true });
  });

  /* ---------- three-dot menu entries ---------- */
  var menu = $('aboutMenu'), more = $('moreBtn');
  if (menu && !menu.querySelector('[data-arch]')) {
    var items = '';
    if (panes.h) items += '<button type="button" data-arch="h">Focus session archive</button>';
    if (panes.t) items += '<button type="button" data-arch="t">Task session archive</button>';
    menu.insertAdjacentHTML('afterbegin', items);
  }
  document.addEventListener('click', function (e) {
    var m = e.target.closest('[data-arch]');
    if (m) {
      if (menu) menu.hidden = true;
      if (more) more.setAttribute('aria-expanded', 'false');
      openArch(m.dataset.arch); return;
    }
    var o = e.target.closest('[data-arch-open]');
    if (o) { openArch(o.dataset.archOpen); return; }
    if (e.target.closest('.tab[data-tab], [data-go]')) closeArch();   // going to any normal tab leaves the archive
  });

  /* ---------- clear ---------- */
  var cd = document.createElement('dialog');
  cd.id = 'cldlg'; cd.className = 'about-dialog';
  cd.innerHTML =
    '<div class="about-content">' +
      '<p class="about-eyebrow">CLEAR ARCHIVE</p>' +
      '<h2 class="serif" id="clT">Clear sessions?</h2>' +
      '<p id="clP"></p>' +
      '<div class="cl-opts">' +
        '<label class="chk"><input type="radio" name="clScope" value="one" checked><span id="clOne"></span></label>' +
        '<label class="chk"><input type="radio" name="clScope" value="all"><span>Both archives (habit and task sessions)</span></label>' +
      '</div>' +
      '<label class="chk"><input type="checkbox" id="clTot"><span>Also reset the focus time totals (Focus today, charts and goals). The page will reload. Habits that require focus time will need it again.</span></label>' +
      '<div class="cl-foot"><button type="button" class="btn btn-line-dark" id="clNo">Cancel</button>' +
      '<button type="button" class="btn btn-deep" id="clYes">Clear</button></div>' +
    '</div>';
  document.body.appendChild(cd);
  var ckind = 'h';

  function scopeVal() { return cd.querySelector('input[name="clScope"]:checked').value; }
  function clearText() {
    var kinds = scopeVal() === 'all' ? ['h', 't'] : [ckind];
    var n = A.filter(function (e) { return kinds.indexOf(e.k) > -1; }).length;
    $('clP').textContent = n
      ? 'This removes ' + n + (n === 1 ? ' session' : ' sessions') + ' from the calendar and today’s list. It can’t be undone.'
      : 'There are no sessions to remove, but you can still reset the totals below.';
  }
  function openClear(k) {
    ckind = k;
    $('clT').textContent = 'Clear the ' + NAMES[k] + '?';
    $('clOne').textContent = 'Only the ' + (k === 'h' ? 'focus session' : 'task session') + ' archive';
    cd.querySelector('input[name="clScope"][value="one"]').checked = true;
    $('clTot').checked = false;
    clearText();
    if (typeof cd.showModal === 'function') cd.showModal(); else cd.setAttribute('open', '');
    $('clNo').focus();
  }
  function closeClear() { if (typeof cd.close === 'function') cd.close(); else cd.removeAttribute('open'); }

  function resetTotals(kinds) {
    if (kinds.indexOf('h') > -1) {
      var s = safe('peaks.v3', null);
      if (s && Array.isArray(s.habits)) {
        s.habits.forEach(function (h) { h.time = {}; });
        s.sessions = [];
        try { localStorage.setItem('peaks.v3', JSON.stringify(s)); } catch (e) {}
      }
    }
    if (kinds.indexOf('t') > -1) {
      try { localStorage.setItem('peaks.tfocus', JSON.stringify({ days: {}, tasks: {}, sessions: [] })); } catch (e) {}
    }
    location.reload();       // the other scripts hold their own copy in memory, so reload to start clean
  }

  cd.querySelectorAll('input[name="clScope"]').forEach(function (r) { r.addEventListener('change', clearText); });
  $('clNo').addEventListener('click', closeClear);
  cd.addEventListener('click', function (e) { if (e.target === cd) closeClear(); });
  $('clYes').addEventListener('click', function () {
    var kinds = scopeVal() === 'all' ? ['h', 't'] : [ckind], now = Date.now(), totals = $('clTot').checked;
    kinds.forEach(function (k) { CL[k] = now; });
    A = A.filter(function (e) { return kinds.indexOf(e.k) < 0; });
    saveA(); saveCL();
    closeClear();
    if (totals) { resetTotals(kinds); return; }
    Object.keys(view).forEach(function (k) { view[k].sel = key(new Date()); });
    render();
    toast(kinds.length > 1 ? 'Both archives cleared' : NAMES[kinds[0]] + ' cleared');
  });

  setInterval(function () {
    var c = mirror(), d = key(new Date());
    if (c || d !== lastDay) render();
  }, 2000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { mirror(); render(); } });

  mirror();
  render();
})();