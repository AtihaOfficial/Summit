(function () {
  'use strict';

  var form = document.getElementById('tForm');
  var text = document.getElementById('tText');
  if (!form || !text || form.dataset.wz) return;
  form.dataset.wz = '1';
  var $ = function (id) { return document.getElementById(id); };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtT(v) { var p = v.split(':'), h = +p[0]; return (h % 12 || 12) + ':' + p[1] + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function fmtD(v) { var p = v.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function fmtM(m) { if (m < 60) return m + ' min'; var h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? ' ' + r + 'm' : ''); }
  function toast(msg) {
    var box = $('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }

  /* ---------- the questions. Every one can be skipped, and "def" is what a skip assumes. ---------- */
  var STEPS = [
    { q: 'due', short: 'Deadline', t: 'When does it truly have to be done?', h: 'Not when you’d like it done. When it actually matters.',
      o: [['0', 'Today'], ['1', 'Tomorrow'], ['3', 'In 3 days'], ['7', 'Next week'], ['x', 'No deadline']],
      c: { type: 'date', label: 'Or pick a date', btn: 'Use this date' },
      def: { v: 'x', label: 'Skipped · no deadline' } },
    { q: 'time', short: 'By', t: 'By what time?', h: 'Optional. Skip it if the hour doesn’t matter.',
      o: [['09:00', 'Morning · 9 AM'], ['12:00', 'Noon'], ['15:00', 'Afternoon · 3 PM'], ['18:00', 'Evening · 6 PM'], ['21:00', 'Night · 9 PM'], ['', 'End of day']],
      c: { type: 'time', label: 'Or pick an exact time', btn: 'Use this time' },
      def: { v: '', label: 'Skipped · end of day' },
      when: function (a) { return !a.due || a.due.v !== 'x'; } },
    { q: 'est', short: 'Takes', t: 'How long will it take?', h: 'A rough guess is fine. It tells me when you must start.',
      o: [['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '1 hour'], ['120', '2 hours'], ['180', '3 hours'], ['240', '4 hours or more'], ['0', 'Not sure']],
      c: { type: 'number', label: 'Or type minutes', btn: 'Use this' },
      def: { v: '0', label: 'Skipped · not sure' } },
    { q: 'cons', short: 'If skipped', t: 'What breaks if you skip it?', h: '',
      o: [['2', 'Something I care about (grades, health, money, a person)'], ['1', 'A small setback I’d recover from'], ['0', 'Nothing, really']],
      def: { v: '1', label: 'Skipped · a small setback assumed' } },
    { q: 'goal', short: 'Goal', t: 'Does it move a goal you’re building?', h: '',
      o: [['2', 'Directly'], ['1', 'A little'], ['0', 'Not at all']],
      def: { v: '1', label: 'Skipped · a little assumed' } },
    { q: 'wait', short: 'Someone waiting', t: 'Is someone waiting on you?', h: '',
      o: [['1', 'Yes, someone is counting on it'], ['0', 'No, it’s just me']],
      def: { v: '0', label: 'Skipped · assumed no' } },
    { q: 'oth', short: 'Could someone else', t: 'Could someone else do it?', h: '',
      o: [['0', 'No, only I can'], ['1', 'Yes, someone else could'], ['2', 'It doesn’t really need doing']],
      def: { v: '0', label: 'Skipped · assumed only you' } }
  ];

  /* ---------- move the long question list out of sight (it still does the sorting behind the scenes) ---------- */
  var legacy = document.createElement('div');
  legacy.id = 'wzLegacy';
  legacy.hidden = true;
  legacy.setAttribute('aria-hidden', 'true');
  legacy.style.display = 'none';
  [].slice.call(form.children).forEach(function (el) {
    var keep = el.tagName === 'H3' || el === text || (el.tagName === 'LABEL' && el.getAttribute('for') === 'tText');
    if (!keep) legacy.appendChild(el);
  });
  form.appendChild(legacy);

  var h3 = form.querySelector('h3'); if (h3) h3.textContent = 'New task';
  var go = document.createElement('button');
  go.type = 'button'; go.id = 'wzStart'; go.className = 'btn btn-deep'; go.textContent = 'Add a task';
  form.appendChild(go);
  var qk = document.createElement('button');
  qk.type = 'button'; qk.id = 'wzQuick'; qk.className = 'btn btn-line'; qk.textContent = 'Add without questions';
  form.appendChild(qk);
  var note = document.createElement('p');
  note.className = 'hint qw-note';
  note.textContent = 'Write it messily. I’ll ask a few quick questions, one at a time, to decide where it goes in line. You can skip any of them.';
  form.appendChild(note);

  /* ---------- the popup, built like the About Summit card ---------- */
  var dlg = document.createElement('dialog');
  dlg.id = 'qwdlg'; dlg.className = 'about-dialog qwdlg';
  dlg.setAttribute('aria-label', 'Add a task');
  dlg.innerHTML =
    '<div class="about-content qw">' +
      '<div class="qw-head"><p class="about-eyebrow" id="qwEye"></p>' +
      '<button type="button" class="qw-x" id="qwX" aria-label="Close">×</button></div>' +
      '<div class="qw-bar"><i id="qwBar"></i></div>' +
      '<div id="qwBody"></div>' +
      '<p class="qw-err" id="qwErr" role="alert" hidden></p>' +
    '</div>';
  document.body.appendChild(dlg);
  var body = $('qwBody');

  var A = {}, i = 0, dir = 1, busy = false, submitting = false, taskTxt = '';

  function active() { return STEPS.filter(function (s) { return !s.when || s.when(A); }); }
  function err(m) { var e = $('qwErr'); e.textContent = m || ''; e.hidden = !m; }
  function head(eye, pct) { $('qwEye').textContent = eye; $('qwBar').style.width = pct + '%'; }
  function closeDlg() { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }

  // push an answer into the hidden form, which still decides where the task lands
  function apply(q, a) {
    if (a.custom) {
      var el = q === 'due' ? $('tDue') : q === 'time' ? $('tTime') : $('tEst');
      el.value = a.custom;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      var b = form.querySelector('[data-q="' + q + '"] [data-v="' + a.v + '"]');
      if (b) b.click();
    }
  }

  // fill every unanswered question from step "start" onward with its default
  function skipFrom(start) {
    var idx = start, guard = 0;
    while (guard++ < 20) {
      var steps = active();
      if (idx >= steps.length) break;
      var s = steps[idx];
      if (!A[s.q]) { A[s.q] = { v: s.def.v, label: s.def.label, skipped: true }; apply(s.q, A[s.q]); }
      idx++;
    }
    return idx;
  }

  function customHTML(s, cur) {
    var c = s.c, val = cur && cur.custom ? cur.custom : '';
    var attrs = c.type === 'date' ? ' min="' + todayStr() + '"' : c.type === 'number' ? ' min="1" max="1440" placeholder="minutes"' : '';
    return '<div class="qw-custom"><label for="qwC">' + esc(c.label) + '</label><div class="qw-row">' +
      '<input id="qwC" class="field" type="' + c.type + '" value="' + esc(val) + '"' + attrs + '>' +
      '<button type="button" class="btn btn-soft btn-sm" data-custom>' + esc(c.btn) + '</button></div></div>';
  }

  function render() {
    err('');
    var steps = active();
    if (i >= steps.length) { review(steps); return; }
    var s = steps[i], cur = A[s.q];
    head('QUESTION ' + (i + 1) + ' OF ' + steps.length, Math.round(i / steps.length * 100));
    var long = s.o.some(function (o) { return o[1].length > 22; });
    body.innerHTML =
      '<div class="qw-step' + (dir < 0 ? ' back' : '') + '">' +
        '<p class="qw-task">“' + esc(taskTxt) + '”</p>' +
        '<h2 class="serif qw-q">' + esc(s.t) + '</h2>' + (s.h ? '<p class="qw-hint">' + esc(s.h) + '</p>' : '') +
        '<div class="qw-opts' + (long ? ' one' : '') + '" role="group" aria-label="' + esc(s.t) + '">' +
          s.o.map(function (o, n) {
            return '<button type="button" class="qw-opt" data-n="' + n + '" aria-pressed="' + (cur && !cur.custom && !cur.skipped && cur.v === o[0] ? 'true' : 'false') + '">' +
              '<kbd>' + (n + 1) + '</kbd><span>' + esc(o[1]) + '</span></button>';
          }).join('') +
        '</div>' + (s.c ? customHTML(s, cur) : '') +
        '<div class="qw-foot">' + (i > 0 ? '<button type="button" class="btn btn-line-dark btn-sm" data-back>Back</button>' : '<span></span>') +
          '<span class="qw-r"><button type="button" class="btn btn-line-dark btn-sm" data-skip>Skip</button>' +
          (i < steps.length - 1 ? '<button type="button" class="btn btn-line-dark btn-sm" data-rest>Skip the rest</button>' : '') + '</span></div>' +
      '</div>';
    var f = body.querySelector('.qw-opt'); if (f) f.focus();
  }

  function review(steps) {
    head('ALL SET', 100);
    var prev = $('tPrev') ? $('tPrev').innerHTML : '';
    var rows = steps.map(function (s, n) {
      var a = A[s.q];
      return '<li><span class="qw-k">' + esc(s.short) + '</span><span class="qw-v' + (a && a.skipped ? ' skipped' : '') + '">' + esc(a ? a.label : '–') +
        '</span><button type="button" class="link" data-jump="' + n + '">Change</button></li>';
    }).join('');
    body.innerHTML =
      '<div class="qw-step' + (dir < 0 ? ' back' : '') + '">' +
        '<p class="qw-task">“' + esc(taskTxt) + '”</p>' +
        '<h2 class="serif qw-q">Here’s where it lands</h2>' +
        '<div class="pv">' + prev + '</div><ul class="qw-rev">' + rows + '</ul>' +
        '<div class="qw-foot"><button type="button" class="btn btn-line-dark btn-sm" data-back>Back</button>' +
        '<button type="button" class="btn btn-deep" data-add>Add to queue</button></div>' +
      '</div>';
    var b = body.querySelector('[data-add]'); if (b) b.focus();
  }

  function choose(n) {
    if (busy) return;
    var s = active()[i], o = s.o[n];
    busy = true;
    A[s.q] = { v: o[0], label: o[1] };
    apply(s.q, A[s.q]);
    body.querySelectorAll('.qw-opt').forEach(function (b, k) { b.setAttribute('aria-pressed', k === n ? 'true' : 'false'); });
    setTimeout(function () { busy = false; i++; dir = 1; render(); }, 170);
  }

  function custom() {
    if (busy) return;
    var s = active()[i], el = $('qwC'), v = el ? el.value : '';
    if (s.q === 'due') {
      if (!v) { err('Pick a date first.'); return; }
      if (v < todayStr()) { err('That date has already passed.'); return; }
      A.due = { v: 'custom', custom: v, label: fmtD(v) };
    } else if (s.q === 'time') {
      if (!v) { err('Pick a time first.'); return; }
      A.time = { v: 'custom', custom: v, label: fmtT(v) };
    } else {
      var n = parseInt(v, 10);
      if (!(n >= 1)) { err('Type a number of minutes, 1 or more.'); return; }
      n = Math.min(n, 1440);
      A.est = { v: 'custom', custom: String(n), label: fmtM(n) };
    }
    apply(s.q, A[s.q]);
    i++; dir = 1; render();
  }

  function skip() {
    var s = active()[i];
    A[s.q] = { v: s.def.v, label: s.def.label, skipped: true };
    apply(s.q, A[s.q]);
    i++; dir = 1; render();
  }
  function skipRest() { i = skipFrom(i); dir = 1; render(); }
  function back() { if (i > 0) { i--; dir = -1; render(); } }

  function submitNow() {
    submitting = true;
    try { if (form.requestSubmit) form.requestSubmit(); else $('tAdd').click(); }
    finally { submitting = false; }
    return !text.value.trim();
  }
  function commit() {
    if (!submitNow()) { err('Something is missing. Please go back and check your answers.'); return; }
    closeDlg();
    setTimeout(function () { text.focus(); }, 0);
  }

  function reset() {
    A = {}; i = 0; dir = 1; busy = false; taskTxt = text.value.trim();
    var eod = form.querySelector('[data-q="time"] [data-v=""]'); if (eod) eod.click();   // clear leftovers from a cancelled run
  }

  function start() {
    if (!text.value.trim()) { toast('Write the task first, even messily'); text.focus(); return; }
    reset(); render();
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  }
  function quick() {
    if (!text.value.trim()) { toast('Write the task first, even messily'); text.focus(); return; }
    reset(); skipFrom(0);
    if (!submitNow()) toast('Couldn’t add the task. Try the questions instead.');
    else setTimeout(function () { text.focus(); }, 0);
  }

  /* ---------- events ---------- */
  go.addEventListener('click', start);
  qk.addEventListener('click', quick);
  // Enter in the text box opens the questions instead of submitting
  document.addEventListener('submit', function (e) {
    if (e.target !== form || submitting) return;
    e.preventDefault(); e.stopImmediatePropagation();
    start();
  }, true);

  body.addEventListener('click', function (e) {
    var o = e.target.closest('.qw-opt'); if (o) { choose(+o.dataset.n); return; }
    if (e.target.closest('[data-back]')) { back(); return; }
    if (e.target.closest('[data-skip]')) { skip(); return; }
    if (e.target.closest('[data-rest]')) { skipRest(); return; }
    if (e.target.closest('[data-custom]')) { custom(); return; }
    var j = e.target.closest('[data-jump]'); if (j) { i = +j.dataset.jump; dir = -1; render(); return; }
    if (e.target.closest('[data-add]')) { commit(); }
  });
  dlg.addEventListener('keydown', function (e) {
    if (e.target.id === 'qwC' && e.key === 'Enter') { e.preventDefault(); custom(); return; }
    if (e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
    var n = parseInt(e.key, 10); if (!n) return;
    var steps = active();
    if (i < steps.length && steps[i].o[n - 1]) { e.preventDefault(); choose(n - 1); }
  });
  $('qwX').addEventListener('click', closeDlg);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDlg(); });
})();