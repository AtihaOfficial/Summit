(function () {
  'use strict';

  var KEY = 'peaks.brk';
  var $ = function (id) { return document.getElementById(id); };
  var CFG = { h: { toggle: 'fpToggle', go: 'habits' }, t: { toggle: 'tfToggle', go: 'tasks' } };
  var LENS = [5, 10, 15, 20];

  var S = (function () {
    var o = { len: 5, run: { h: null, t: null } };
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') {
        if (LENS.indexOf(+s.len) > -1) o.len = +s.len;
        ['h', 't'].forEach(function (k) {
          var r = s.run && s.run[k];
          if (r && +r.end > Date.now()) o.run[k] = { end: +r.end };
        });
      }
    } catch (e) {}
    return o;
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  function toggleBtn(k) { return $(CFG[k].toggle); }
  function isPaused(k) { var t = toggleBtn(k); return !!t && t.textContent.trim() === 'Resume'; }

  var boxes = {};
  function render(k) {
    var b = boxes[k]; if (!b) return;
    var r = S.run[k];
    b.innerHTML = r
      ? '<span class="brk-l">☕ Break</span><span class="brk-clock" data-clock>' + clock(r.end - Date.now()) + '</span>' +
        '<button type="button" class="btn btn-line btn-sm" data-end>End break</button>' +
        (isPaused(k) ? '<button type="button" class="btn btn-soft btn-sm" data-resume>Resume focus</button>' : '')
      : '<span class="brk-l">☕ Break</span><span class="chiprow" role="group" aria-label="Break length">' +
        LENS.map(function (m) { return '<button type="button" class="chip" data-len="' + m + '" aria-pressed="' + (S.len === m) + '">' + m + ' min</button>'; }).join('') +
        '</span><button type="button" class="btn btn-line btn-sm" data-start>Start</button>';
  }

  function start(k) {
    var t = toggleBtn(k);
    if (t && t.textContent.trim() === 'Pause') t.click();        // a running session pauses for the break
    S.run[k] = { end: Date.now() + S.len * 60000 };
    save(); render(k);
  }
  function end(k, done) {
    if (!S.run[k]) return;
    S.run[k] = null; save(); render(k);
    if (!done) return;
    var o = { title: 'Break over', kind: 'info', go: CFG[k].go,
              body: isPaused(k) ? 'Your session is paused. Press Resume when you’re ready.' : 'Ready for the next round?' };
    if (window.SummitAlert) SummitAlert(o);
  }

  function mount(k) {
    var t = toggleBtn(k), row = t && t.closest('.btnrow');
    if (!row) return;
    var b = document.createElement('div');
    b.className = 'brk'; b.id = 'brk-' + k;
    row.insertAdjacentElement('afterend', b);
    boxes[k] = b;
    b.addEventListener('click', function (e) {
      var c = e.target.closest('[data-len]');
      if (c) { S.len = +c.dataset.len; save(); render(k); return; }
      if (e.target.closest('[data-start]')) { start(k); return; }
      if (e.target.closest('[data-end]')) { end(k, false); return; }
      if (e.target.closest('[data-resume]')) {
        end(k, false);
        var t2 = toggleBtn(k); if (t2 && t2.textContent.trim() === 'Resume') t2.click();
      }
    });
    t.addEventListener('click', function () {                  // pressing Start/Resume yourself ends the break
      setTimeout(function () { if (S.run[k] && t.textContent.trim() === 'Pause') end(k, false); }, 0);
    });
    render(k);
  }
  mount('h'); mount('t');

  function tick() {
    ['h', 't'].forEach(function (k) {
      var r = S.run[k]; if (!r || !boxes[k]) return;
      var left = r.end - Date.now();
      if (left <= 0) { end(k, true); return; }
      var c = boxes[k].querySelector('[data-clock]'); if (c) c.textContent = clock(left);
    });
  }
  setInterval(tick, 500);
  try {                                                         // keeps time in a background tab
    var w = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(1)},500)'], { type: 'text/javascript' })));
    w.onmessage = tick;
  } catch (e) {}
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); render('h'); render('t'); } });
})();