(function () {
  'use strict';

  /* Guided tour of the whole site. Opens from the "?" button in the top bar,
     from the More menu, from About, or from the one-time welcome note. */

  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'peaks.tour';
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  // sel: a selector or a list of selectors (first visible one is used). No match = centred card.
  var STEPS = [
    { tab: 'overview', title: 'Welcome to Summit',
      text: 'A one-minute tour of the whole site. Use the buttons or the arrow keys to move, and Esc to leave at any time.' },
    { tab: 'overview', sel: '.tabs', title: 'Five tabs',
      text: 'Overview, Habits, Tasks, Screen and Quotes. Everything in Summit lives in one of them.' },
    { tab: 'overview', sel: '.hero', title: 'Overview',
      text: 'Your day at a glance: today’s progress, your running streak, the next habit and the task to do first.' },
    { tab: 'habits', sel: ['#pane-habits .pane-head .js-add', '#list .hempty .js-add'], title: 'Add your first habit',
      text: 'A habit is one small thing you repeat daily. Tap the box to finish it, drag the slider for partial progress, and tap a past day to backfill it.' },
    { tab: 'habits', sel: '#focus', title: 'Focus session',
      text: 'Pick a habit, choose Timer or Stopwatch and press Start. Finish & save adds the time to your habit. You can also go full screen or float the timer, pick one of 12 colours, and take breaks.' },
    { tab: 'habits', sel: '#foldWeek', title: 'Last 7 days',
      text: 'See how your completion and focus time moved over the past week.' },
    { tab: 'tasks', sel: ['#tForm', '#pane-tasks'], title: 'Add a task',
      text: 'Write the task, even messily, then press Add a task. A few quick questions (you can skip any) decide where it goes in line. Or use Add without questions.' },
    { tab: 'tasks', sel: ['#qNow', '#pane-tasks'], title: 'Do first',
      text: 'Your queue is sorted by urgency. The task at the top is the one to do first.' },
    { tab: 'tasks', sel: '#tfocus', title: 'Task focus',
      text: 'Work on a task with its own timer or stopwatch, just like a habit.' },
    { tab: 'screen', sel: '#pane-screen .card', title: 'Screen',
      text: 'A quick screen-time check with simple insights, so you can see where your time goes.' },
    { tab: 'quotes', sel: '#boostCard', title: 'Study boost',
      text: 'Paste any link (YouTube, Spotify, Facebook, Pinterest…) or choose a file for a song, rhythm or dua. It plays before a session starts and again with the “You did it” card.' },
    { tab: 'quotes', sel: '#pane-quotes .qpane > :nth-child(3)', title: 'Your reminders',
      text: 'Add your own quotes or pictures. They pop up while you focus and when a session ends.' },
    { tab: 'overview', sel: '#themeBtn', title: 'Light or dark',
      text: 'Switch the look of the whole site here.' },
    { tab: 'overview', sel: '#moreBtn', title: 'More',
      text: 'About Summit and this tour are always here. You can replay the tour whenever you like.' },
    { tab: 'overview', title: 'You’re ready',
      text: 'Start with one small habit today. One step at a time.' }
  ];

  var ov = null, hl = null, card = null, idx = 0, origin = 'overview', raf = 0;

  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function targetOf(s) {
    if (!s.sel) return null;
    var list = Array.isArray(s.sel) ? s.sel : [s.sel], i, el;
    for (i = 0; i < list.length; i++) { el = document.querySelector(list[i]); if (el && visible(el)) return el; }
    return null;
  }
  function goTab(name) {
    var t = document.querySelector('.tab[data-tab="' + name + '"]');
    if (t && !t.classList.contains('on')) t.click();
  }
  function curTab() { var t = document.querySelector('.tab.on'); return t ? t.dataset.tab : 'overview'; }

  function place() {
    if (!ov) return;
    var s = STEPS[idx], el = targetOf(s), vw = window.innerWidth, vh = window.innerHeight;
    var w = Math.min(360, vw - 24), pad = 8, top, left;
    card.style.width = w + 'px';
    if (!el) {
      hl.style.display = 'none'; ov.classList.add('dim');
      top = Math.max(12, (vh - card.offsetHeight) / 2); left = (vw - w) / 2;
    } else {
      ov.classList.remove('dim');
      var r = el.getBoundingClientRect();
      var t = Math.max(4, r.top - pad), l = Math.max(4, r.left - pad);
      hl.style.display = 'block';
      hl.style.top = t + 'px'; hl.style.left = l + 'px';
      hl.style.width = Math.min(vw - l - 4, r.right + pad - l) + 'px';
      hl.style.height = Math.min(vh - t - 4, r.bottom + pad - t) + 'px';
      var ch = card.offsetHeight;
      if (vh - r.bottom - pad > ch + 20) top = r.bottom + pad + 12;
      else if (r.top - pad > ch + 20) top = r.top - pad - 12 - ch;
      else top = vh - ch - 16;                                   // very large target: dock at the bottom
      left = Math.max(12, Math.min(r.left, vw - w - 12));
    }
    card.style.top = top + 'px'; card.style.left = left + 'px';
  }
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); }

  function render() {
    var s = STEPS[idx], last = idx === STEPS.length - 1;
    card.innerHTML =
      '<p class="tour-n">' + (idx + 1) + ' of ' + STEPS.length + '</p>' +
      '<h3 class="tour-h serif"></h3><p class="tour-p"></p>' +
      '<div class="tour-btns">' +
        '<button type="button" class="link" data-t="skip">' + (last ? '' : 'Skip tour') + '</button>' +
        '<span class="tour-nav">' +
          (idx > 0 ? '<button type="button" class="btn btn-line-dark btn-sm" data-t="back">Back</button>' : '') +
          '<button type="button" class="btn btn-deep btn-sm" data-t="next">' + (last ? 'Finish' : 'Next') + '</button>' +
        '</span></div>';
    card.querySelector('.tour-h').textContent = s.title;
    card.querySelector('.tour-p').textContent = s.text;
    var skip = card.querySelector('[data-t="skip"]'); if (last) skip.style.visibility = 'hidden';
  }

  function show(i) {
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    var s = STEPS[idx];
    goTab(s.tab);
    render();
    setTimeout(function () {
      if (!ov) return;
      var el = targetOf(s);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
      place();
      var n = card.querySelector('[data-t="next"]'); if (n) n.focus({ preventScroll: true });
    }, 90);
  }

  function end() {
    if (!ov) return;
    ov.remove(); ov = hl = card = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    set('done'); goTab(origin);
  }
  function onKey(e) {
    if (!ov) return;
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      if (e.key === 'Enter' && e.target.closest && e.target.closest('[data-t]')) return;      // the focused button handles it
      e.preventDefault(); if (idx < STEPS.length - 1) show(idx + 1); else end();
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
  }

  function start() {
    if (ov) return;
    var nudge = document.querySelector('.tour-nudge'); if (nudge) nudge.remove();
    origin = curTab();
    ov = document.createElement('div'); ov.className = 'tour-ov';
    hl = document.createElement('div'); hl.className = 'tour-hl';
    card = document.createElement('div'); card.className = 'tour-card';
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'Summit tour');
    ov.appendChild(hl); ov.appendChild(card);
    document.body.appendChild(ov);
    card.addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      var a = b.dataset.t;
      if (a === 'next') { if (idx < STEPS.length - 1) show(idx + 1); else end(); }
      else if (a === 'back') show(idx - 1);
      else end();
    });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    show(0);
  }
  window.SummitTour = { start: start };

  /* ---------- entry points ---------- */
  var themeBtn = $('themeBtn');
  if (themeBtn && !$('tourBtn')) {
    var tb = document.createElement('button');
    tb.id = 'tourBtn'; tb.type = 'button'; tb.className = 'ibtn tour-q';
    tb.setAttribute('aria-label', 'Take a tour of Summit'); tb.title = 'Take a tour'; tb.textContent = '?';
    themeBtn.parentNode.insertBefore(tb, themeBtn);
  }
  var menu = $('aboutMenu'), about = $('aboutBtn');
  if (menu && about && !$('tourMenu')) {
    var mb = document.createElement('button');
    mb.id = 'tourMenu'; mb.type = 'button'; mb.textContent = 'Take a tour';
    menu.insertBefore(mb, about);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#tourBtn,#tourMenu,[data-tour]'); if (!b) return;
    var m = $('aboutMenu'); if (m) m.hidden = true;
    var mo = $('moreBtn'); if (mo) mo.setAttribute('aria-expanded', 'false');
    var d = $('aboutDlg'); if (d && d.open && d.close) d.close();
    start();
  });

  /* ---------- one-time welcome note (never blocks the page) ---------- */
  if (!get()) {
    setTimeout(function () {
      if (get() || ov) return;
      var n = document.createElement('div');
      n.className = 'tour-nudge'; n.setAttribute('role', 'region'); n.setAttribute('aria-label', 'Welcome');
      n.innerHTML =
        '<p><b>New to Summit?</b> Take a one-minute tour of the site.</p>' +
        '<div class="tour-btns"><button type="button" class="link" data-n="no">Not now</button>' +
        '<button type="button" class="btn btn-deep btn-sm" data-n="go">Take the tour</button></div>';
      n.addEventListener('click', function (e) {
        var b = e.target.closest('[data-n]'); if (!b) return;
        if (b.dataset.n === 'go') start(); else { set('seen'); n.remove(); }
      });
      document.body.appendChild(n);
    }, 900);
  }
})();