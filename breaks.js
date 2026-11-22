(function () {
  'use strict';

  var KEY = 'peaks.brk';
  var $ = function (id) { return document.getElementById(id); };
  var CFG = { h: { toggle: 'fpToggle', go: 'habits' }, t: { toggle: 'tfToggle', go: 'tasks' } };
  var PRESETS = [5, 10];          // the only fixed buttons
  var MIN = 1, MAX = 180;         // typed / scrolled range, in minutes

  function clampLen(v) {
    v = Math.round(+v);
    if (!isFinite(v)) return null;
    return Math.max(MIN, Math.min(MAX, v));
  }

  var S = (function () {
    var o = { len: 5, run: { h: null, t: null } };
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') {
        var l = clampLen(s.len); if (l) o.len = l;
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
      : '<span class="brk-l">☕ Break</span>' +
        '<span class="brk-pick" role="group" aria-label="Break length">' +
          PRESETS.map(function (m) {
            return '<button type="button" class="chip" data-len="' + m + '" aria-pressed="' + (S.len === m) + '">' + m + '</button>';
          }).join('') +
          '<label class="brk-in"><input type="number" class="field" data-in min="' + MIN + '" max="' + MAX + '" step="1" value="' + S.len + '" aria-label="Break minutes"><span>min</span></label>' +
        '</span>' +
        '<button type="button" class="btn btn-line btn-sm" data-start>Start</button>';
  }

  function syncChips(k) {
    var b = boxes[k]; if (!b) return;
    b.querySelectorAll('[data-len]').forEach(function (c) {
      c.setAttribute('aria-pressed', String(+c.dataset.len === S.len));
    });
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
      if (c) {
        S.len = +c.dataset.len; save();
        var inp = b.querySelector('[data-in]'); if (inp) inp.value = S.len;
        syncChips(k); return;
      }
      if (e.target.closest('[data-start]')) { start(k); return; }
      if (e.target.closest('[data-end]')) { end(k, false); return; }
      if (e.target.closest('[data-resume]')) {
        end(k, false);
        var t2 = toggleBtn(k); if (t2 && t2.textContent.trim() === 'Resume') t2.click();
      }
    });

    // typed minutes
    b.addEventListener('input', function (e) {
      if (!e.target.matches('[data-in]')) return;
      var v = clampLen(e.target.value);
      if (v) { S.len = v; save(); syncChips(k); }
    });
    // tidy the box once typing is finished
    b.addEventListener('focusout', function (e) {
      if (e.target.matches && e.target.matches('[data-in]')) e.target.value = S.len;
    });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('[data-in]')) { e.preventDefault(); start(k); }
    });
    // scrolled minutes (mouse wheel while the box is focused)
    b.addEventListener('wheel', function (e) {
      var inp = e.target.closest && e.target.closest('[data-in]');
      if (!inp || document.activeElement !== inp) return;
      e.preventDefault();
      var v = clampLen(S.len + (e.deltaY < 0 ? 1 : -1));
      if (v) { S.len = v; save(); inp.value = v; syncChips(k); }
    }, { passive: false });

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
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    tick();
    ['h', 't'].forEach(function (k) {
      var inp = boxes[k] && boxes[k].querySelector('[data-in]');
      if (inp && document.activeElement === inp) return;        // don't wipe what is being typed
      render(k);
    });
  });
})();