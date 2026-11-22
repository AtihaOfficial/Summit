(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SESS = { h: 'peaks.sess', t: 'peaks.tsess' };
  var BTN = {
    h: { toggle: 'fpToggle', save: 'fpSave', pane: 'pane-habits', kind: 'HABIT FOCUS' },
    t: { toggle: 'tfToggle', save: 'tfSave', pane: 'pane-tasks', kind: 'TASK FOCUS' }
  };

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clockText(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' : '') + pad(m) + ':' + pad(s);
  }
  function readJ(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function habitTitle(id) {
    var s = readJ('peaks.v3'), hs = s && Array.isArray(s.habits) ? s.habits : [];
    var h = hs.filter(function (x) { return x.id === id; })[0];
    return h ? h.title : '';
  }
  function toast(msg) {
    var box = $('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }
  function setText(el, txt) { if (el && el.textContent !== txt) el.textContent = txt; }

  /* ---------- what is running right now (read from the saved sessions) ---------- */
  function read(kind) {
    var s = readJ(SESS[kind]);
    if (!s || typeof s !== 'object') return null;
    var t0 = s.t0 || null, acc = +s.acc || 0;
    if (!t0 && !(acc > 0)) return null;
    var mode = s.mode === 'stopwatch' ? 'stopwatch' : 'timer', dur = +s.dur > 0 ? +s.dur : 1500;
    var el = acc + (t0 ? (Date.now() - t0) / 1000 : 0);
    return {
      kind: kind, mode: mode, dur: dur, el: el, running: !!t0,
      title: kind === 'h' ? (habitTitle(s.hid) || 'Habit focus') : (s.title || 'Task focus'),
      text: mode === 'timer' ? clockText(Math.ceil(Math.max(0, dur - el))) : clockText(el),
      pct: mode === 'timer' ? Math.min(100, el / dur * 100) : 0
    };
  }
  function current() {
    var a = read('h'), b = read('t');
    if (a && a.running) return a;
    if (b && b.running) return b;
    return a || b;
  }
  var cur = null;

  /* ---------- display style: digits or blocks ("juice boxes") ---------- */
  var PREF_KEY = 'peaks.fv';
  var pref = readJ(PREF_KEY) || {};
  var view = pref.view === 'blocks' ? 'blocks' : 'digits';
  var bsz = +pref.block > 0 ? +pref.block : 'auto';
  // 12 full-screen colours: [id, name, background, text, accent (digits, boxes, bar)]
  var THEMES = [
    ['summit',   'Summit',   '#5B1523', '#F6E7C8', '#D8B98A'],
    ['midnight', 'Midnight', '#0F172A', '#E2E8F0', '#38BDF8'],
    ['forest',   'Forest',   '#0F2A1D', '#E6F4EA', '#4ADE80'],
    ['ocean',    'Ocean',    '#0B3954', '#E0F2FE', '#5EEAD4'],
    ['ember',    'Ember',    '#2B1308', '#FFEDD5', '#FB923C'],
    ['rose',     'Rose',     '#3A1020', '#FFE4EC', '#FB7185'],
    ['lavender', 'Lavender', '#241B3F', '#EDE9FE', '#A78BFA'],
    ['gold',     'Gold',     '#1C1917', '#FEF3C7', '#FBBF24'],
    ['graphite', 'Graphite', '#18181B', '#F4F4F5', '#A1A1AA'],
    ['mint',     'Mint',     '#E8F5EE', '#123524', '#15803D'],
    ['cream',    'Cream',    '#FBF7F1', '#3B2A1E', '#B45309'],
    ['sky',      'Sky',      '#EAF3FB', '#12304A', '#1D6FB8']
  ];
  var theme = THEMES.some(function (t) { return t[0] === pref.theme; }) ? pref.theme : 'auto';   // auto = follow the app's light/dark colours
  function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ view: view, block: bsz, theme: theme })); } catch (e) {} }
  var SIZES = [['auto', 'Auto'], [10, '10 sec'], [30, '30 sec'], [60, '1 min'], [300, '5 min'], [600, '10 min'], [900, '15 min']];
  function sizeLabel(s) { return s < 60 ? s + ' sec' : (s / 60) + ' min'; }
  function blockSecs(c) {                                        // how long one box is
    var s = bsz;
    if (s === 'auto') s = c.mode === 'timer' ? (c.dur <= 360 ? 10 : c.dur <= 3600 ? 300 : 600) : 600;
    if (c.mode === 'timer') while (Math.ceil(c.dur / s) > 1000) s *= 2;
    return s;
  }
  function colsFor(n) {
    if (n <= 6) return Math.max(1, n);
    if (n % 6 === 0) return 6;
    if (n % 5 === 0) return 5;
    if (n % 4 === 0) return 4;
    if (n % 3 === 0) return 3;
    return Math.ceil(Math.sqrt(n));
  }
  function layout(c) {
    var size = blockSecs(c), elU = c.el / size, caps = [], n, i, tot;
    if (c.mode === 'timer') {
      tot = c.dur / size; n = Math.max(1, Math.ceil(tot - 1e-9));
      for (i = 0; i < n; i++) caps.push(Math.min(1, tot - i));
      return { size: size, elU: elU, n: n, cols: colsFor(n), caps: caps, tot: tot };
    }
    n = Math.max(6, Math.ceil((Math.floor(elU) + 1) / 6) * 6);   // a stopwatch grows one row at a time
    for (i = 0; i < n; i++) caps.push(1);
    return { size: size, elU: elU, n: n, cols: 6, caps: caps, tot: 0 };
  }

    function cellPx(n, mini) {                                    // the more boxes there are, the smaller each one gets
    var s = n <= 6 ? 48 : n <= 12 ? 40 : n <= 24 ? 32 : n <= 48 ? 26 : 20;
    return mini ? Math.max(12, Math.round(s * 0.55)) : s;
  }
  // pick the number of columns that makes the boxes as big as possible inside W x H
  function bestFit(n, W, H, gap, aspect) {
    var best = { cols: Math.min(n, 6), cell: 12 }, bestScore = 0, c, r, cw, ch, cell, score;
    for (c = 1; c <= n; c++) {
      r = Math.ceil(n / c);
      cw = (W - (c - 1) * gap) / c;
      ch = (H - (r - 1) * gap) / r / aspect;
      cell = Math.floor(Math.min(cw, ch));
      score = cell * (n % c === 0 ? 1.08 : 1);                 // a full last row looks tidier
      if (score > bestScore) { bestScore = score; best = { cols: c, cell: cell }; }
    }
    return best;
  }
  /* ---------- water sound: a wave sliding away each time a box empties (or rising as one fills) ---------- */
  var actx = null, noiseBuf = null;
  function audioCtx() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
    return actx;
  }
  function splash(up, vol) {
    var ctx = audioCtx(); if (!ctx) return;
    var t = ctx.currentTime, k, bt, o, og, base, vv = (vol || 0.4) / 0.4;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    }
    var n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuf; bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(up ? 400 : 1800, t); bp.frequency.exponentialRampToValueAtTime(up ? 1600 : 350, t + 0.7);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * vv, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    n.connect(bp); bp.connect(g); g.connect(ctx.destination); n.start(t); n.stop(t + 0.85);
    for (k = 0; k < 3; k++) {                                     // little bottle "glugs"
      bt = t + 0.05 + k * (0.09 + Math.random() * 0.05);
      base = (up ? 500 + k * 80 : 380 - k * 40) * (0.85 + Math.random() * 0.4);
      o = ctx.createOscillator(); og = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(base, bt); o.frequency.exponentialRampToValueAtTime(base * 2.2, bt + 0.07);
      og.gain.setValueAtTime(0.0001, bt); og.gain.exponentialRampToValueAtTime(0.14 * vv, bt + 0.015); og.gain.exponentialRampToValueAtTime(0.0001, bt + 0.11);
      o.connect(og); og.connect(ctx.destination); o.start(bt); o.stop(bt + 0.13);
    }
  }
  window.SummitBlocks = { on: function () { return view === 'blocks'; }, splash: splash };   // alerts.js asks before it ticks
  var wKey = '', wN = -1;
  function emptiedCount(L, c) {
    var e = L.elU + 1e-6, full = Math.floor(e);
    if (c.mode !== 'timer') return full;
    if (full >= L.n) return L.n;
    return (L.caps[full] < 1 && e - full >= L.caps[full]) ? full + 1 : full;
  }
  function waterCheck(c, L) {                                     // one splash per box, however many screens draw it
    var key = c.kind + '|' + c.title + '|' + c.mode, n = emptiedCount(L, c);
    if (key !== wKey) { wKey = key; wN = n; return; }
    if (n > wN && c.running && SND && SND.get() === 'water' && SND.isOn(c.mode)) splash(c.mode !== 'timer', SND.vol ? SND.vol() : 0.4);
    wN = n;
  }

  // timer: every box starts full and empties one by one. stopwatch: boxes fill up one by one.
  function drawBlocks(host, c) {
    var grid = host.querySelector('.jb-grid'), cap = host.querySelector('.jb-cap');
    var L = layout(c), i, h, lv, pct, f, isCur, count = 0;
    waterCheck(c, L);
    var fit = host.getAttribute('data-fit'), mini = host.classList.contains('jbox-mini');
    var cols = L.cols, cell = cellPx(L.n, mini), gap = Math.max(3, Math.round(cell * 0.14));
    if (fit || mini) {                                           // fit the boxes to the space they live in
      var gp = fit === 'pip' ? 5 : fit === 'full' ? 12 : 8;
      gp = L.n > 300 ? 2 : L.n > 120 ? 3 : L.n > 48 ? 5 : gp;
      var fw = host.clientWidth, fh = fit ? host.clientHeight - cap.offsetHeight - 14 : 220;
      if (fw >= 40 && fh >= 40) {
        var bf = bestFit(L.n, fw, fh, gp, 1.1);
        cols = bf.cols; gap = gp;
        cell = Math.max(fit === 'full' ? 10 : 6, Math.min(bf.cell, fit === 'full' ? 170 : fit === 'pip' ? 60 : 64));
      }
    }
    var sig = c.mode + ':' + L.n + ':' + cols + ':' + cell;
    if (grid.getAttribute('data-sig') !== sig) {
      grid.setAttribute('data-sig', sig); grid.style.setProperty('--cols', cols);
      grid.style.setProperty('--cell', cell + 'px');
      grid.style.setProperty('--gap', gap + 'px');
      h = ''; for (i = 0; i < L.n; i++) h += '<span class="jb"><i></i></span>';
      grid.innerHTML = h;
    }
    var cells = grid.children, curIdx = Math.min(L.n - 1, Math.floor(L.elU));
    for (i = 0; i < L.n; i++) {
      if (c.mode === 'timer') { lv = L.caps[i] - Math.max(0, Math.min(L.caps[i], L.elU - i)); if (lv <= 0.001) count++; lv = lv / L.caps[i]; }
      else { lv = Math.max(0, Math.min(1, L.elU - i)); if (lv >= 0.999) count++; }
      pct = (Math.round(lv * 1000) / 10) + '%';
      f = cells[i].firstChild; if (f.style.height !== pct) f.style.height = pct;
      isCur = i === curIdx && (c.mode !== 'timer' || L.elU < L.tot);
      if (cells[i].classList.contains('cur') !== isCur) cells[i].classList.toggle('cur', isCur);
    }
    setText(cap, 'Each box = ' + sizeLabel(L.size) + ' · ' + (c.mode === 'timer' ? count + ' / ' + L.n + ' emptied · ' + (L.n - count) + ' left' : count + ' filled'));
  }
  // same boxes, painted on the canvas that feeds the browser's own floating video window
  function drawBlocksCanvas(x, c, W, H, top, fg, ac) {
    var L = layout(c), n = L.n, gap = n > 120 ? 2 : 4, f = bestFit(n, W - 24, H - top - 10, gap, 1.1);
    var cell = Math.max(6, f.cell), cols = f.cols, rows = Math.ceil(n / cols), bw = cell, bh = cell * 1.1;
    var x0 = (W - (cols * bw + (cols - 1) * gap)) / 2, y0 = top + ((H - top) - (rows * bh + (rows - 1) * gap)) / 2, i, lv, cx, cy;
    for (i = 0; i < n; i++) {
      lv = c.mode === 'timer' ? (L.caps[i] - Math.max(0, Math.min(L.caps[i], L.elU - i))) / L.caps[i] : Math.max(0, Math.min(1, L.elU - i));
      cx = x0 + (i % cols) * (bw + gap); cy = y0 + Math.floor(i / cols) * (bh + gap);
      x.globalAlpha = 0.5; x.strokeStyle = fg; x.lineWidth = 1.5; x.strokeRect(cx, cy, bw, bh); x.globalAlpha = 1;
      x.fillStyle = ac; x.fillRect(cx, cy + bh * (1 - lv), bw, bh * lv);
    }
  }

  /* ---------- markup ---------- */
  document.body.insertAdjacentHTML('beforeend',
    '<div id="fvPill" class="fvpill" hidden>' +
      '<button type="button" class="fvp-main" data-fv="full" title="Open full screen"><span class="fvp-t"></span><span class="fvp-n"></span></button>' +
      '<button type="button" class="fvp-i" data-fv="float" title="Float over other windows" aria-label="Float over other windows">⧉</button>' +
      '<button type="button" class="fvp-i" data-fv="hide" title="Hide" aria-label="Hide the small timer">×</button>' +
    '</div>' +
    '<div id="fv" class="fv" role="dialog" aria-modal="true" aria-label="Full screen timer" hidden>' +
      '<div class="fv-top"><span class="fv-kind"></span><button type="button" class="fv-x" data-fv="close" aria-label="Close full screen">×</button></div>' +
      '<div class="fv-mid">' +
        '<p class="fv-title"></p>' +
        '<div class="fv-clock" role="timer" aria-live="off">00:00</div>' +
        '<div class="jbox" id="fvJb" data-fit="full" hidden><div class="jb-grid" aria-hidden="true"></div><p class="jb-cap"></p></div>' +
        '<p class="fv-sub"></p>' +
        '<div class="fv-bar"><i></i></div>' +
      '</div>' +
      '<div class="fv-bottom">' +
        '<div class="fv-btns">' +
          '<button type="button" class="btn btn-soft" data-fv="toggle">Pause</button>' +
          '<button type="button" class="btn btn-line" data-fv="save">Finish &amp; save</button>' +
          '<button type="button" class="btn btn-line" data-fv="float">⧉ Float</button>' +
        '</div>' +
        '<div class="fv-snd" style="margin-top:14px">' +
          '<span class="seg" role="group" aria-label="Display style">' +
            '<button type="button" data-fv="digits" aria-pressed="true">Digits</button>' +
            '<button type="button" data-fv="blocks" aria-pressed="false">Blocks</button></span>' +
          '<label id="fvBsL">Each box = <select id="fvBs" class="field" aria-label="Time one box stands for"></select></label>' +
        '</div>' +
        '<div class="fv-snd" style="margin-top:10px">' +
          '<label>Tick sound <select id="fvSnd" class="field" aria-label="Tick sound"></select></label>' +
          '<button type="button" class="btn btn-line btn-sm" data-fv="ticks">Ticking: Off</button>' +
        '</div>' +
      '</div>' +
    '</div>');

  var pill = $('fvPill'), fv = $('fv');
  fv.querySelectorAll('.fv-snd')[0].insertAdjacentHTML('afterend',
    '<div class="fv-themes" role="group" aria-label="Full screen colour">' +
      '<button type="button" class="fv-auto" data-theme="auto" aria-pressed="false" title="Follow the app colours">Auto</button>' +
      THEMES.map(function (t) {
        return '<button type="button" class="fv-sw" data-theme="' + t[0] + '" aria-pressed="false" title="' + t[1] + '" aria-label="' + t[1] + '" style="--sw-bg:' + t[2] + ';--sw-ac:' + t[4] + '"></button>';
      }).join('') +
    '</div>');
  function applyTheme() {
    var t = THEMES.filter(function (x) { return x[0] === theme; })[0];
    ['--deep', '--deep-ink', '--sky', '--on', '--on-ink', '--tb'].forEach(function (k) { fv.style.removeProperty(k); });
    if (t) {
      fv.style.setProperty('--deep', t[2]); fv.style.setProperty('--tb', t[2]); fv.style.setProperty('--on-ink', t[2]);
      fv.style.setProperty('--deep-ink', t[3]); fv.style.setProperty('--on', t[3]); fv.style.setProperty('--sky', t[4]);
    }
    fv.querySelectorAll('[data-theme]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.theme === theme)); });
  }
  fv.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme]'); if (!b) return;
    theme = b.dataset.theme; savePref(); applyTheme();
  });
  applyTheme();
  var pillT = pill.querySelector('.fvp-t'), pillN = pill.querySelector('.fvp-n');
  var fvKind = fv.querySelector('.fv-kind'), fvTitle = fv.querySelector('.fv-title'), fvClock = fv.querySelector('.fv-clock');
  var fvSub = fv.querySelector('.fv-sub'), fvBar = fv.querySelector('.fv-bar i'), fvBarWrap = fv.querySelector('.fv-bar');
  var fvToggle = fv.querySelector('[data-fv="toggle"]'), fvSnd = $('fvSnd'), fvTicks = fv.querySelector('[data-fv="ticks"]');
  var fvJb = $('fvJb'), fvBs = $('fvBs'), fvBsL = $('fvBsL');
  var fvDigits = fv.querySelector('[data-fv="digits"]'), fvBlocks = fv.querySelector('[data-fv="blocks"]');
  var pillHidden = false, fullEnd = 0;
  fvBs.innerHTML = SIZES.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
  fvBs.addEventListener('change', function () { bsz = fvBs.value === 'auto' ? 'auto' : +fvBs.value; savePref(); loop(); });

  // buttons + small boxes under each clock
  var cards = [];
  [['fpClock', 'h'], ['tfClock', 't']].forEach(function (p) {
    var el = $(p[0]); if (!el) return;
    el.insertAdjacentHTML('afterend',
      '<div class="fvbar"><button type="button" class="link" data-fv="full">⛶ Full screen</button>' +
      '<button type="button" class="link" data-fv="float">⧉ Float</button>' +
      '<button type="button" class="link" data-fv="view">▦ Blocks</button></div>' +
      '<div class="jbox jbox-mini" data-kind="' + p[1] + '" hidden><div class="jb-grid" aria-hidden="true"></div><p class="jb-cap"></p></div>');
    cards.push(el.parentNode.querySelector('.jbox-mini[data-kind="' + p[1] + '"]'));
  });

  // sound picker (alerts.js provides SummitSound)
  var SND = window.SummitSound || null;
  if (SND) {
    fvSnd.innerHTML = SND.list.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
    fvSnd.addEventListener('change', function () { SND.set(fvSnd.value); SND.preview(); });
  } else {
    fvSnd.closest('.fv-snd').hidden = true;
  }

  /* ---------- actions: the real timer buttons do the work ---------- */
  function press(id) { var b = $(id); if (b && !b.disabled) b.click(); }
  function act(a) {
    if (!cur) return;
    var m = BTN[cur.kind];
    if (a === 'toggle') press(m.toggle);
    else if (a === 'save') { press(m.save); closeFull(); }
    setTimeout(loop, 60);
  }

  /* ---------- full screen ---------- */
  var wl = null;
  function wake(on) {
    try {
      if (on && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wl = l; }).catch(function () {});
      else if (!on && wl) { wl.release(); wl = null; }
    } catch (e) {}
  }
  function adopt(on) {                                           // pop-ups and toasts must live inside the full screen view to be seen
    var host = on ? fv : document.body;
    ['alerts', 'toast'].forEach(function (id) {
      var b = $(id); if (b && b.parentNode !== host) host.appendChild(b);
    });
  }
  function openFull() {
    cur = current();
    if (!cur) { toast('Start a timer or stopwatch first'); return; }
    fullEnd = 0; fv.hidden = false; document.body.classList.add('fv-on'); adopt(true);
    var rq = fv.requestFullscreen || fv.webkitRequestFullscreen;
    if (rq) { try { var p = rq.call(fv); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    wake(true); loop();
  }
  function hideFull() { fv.hidden = true; document.body.classList.remove('fv-on'); adopt(false); wake(false); }
  function closeFull() {
    hideFull();
    var fe = document.fullscreenElement || document.webkitFullscreenElement;
    if (fe) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
  }
  function onFsChange() {
    var fe = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fe && !fv.hidden) hideFull();                      // Esc leaves full screen and closes the view
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  document.addEventListener('keydown', function (e) {
    if (fv.hidden) return;
    if (e.key === 'Escape') { closeFull(); return; }
    if (e.key === ' ' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') { e.preventDefault(); act('toggle'); }
  });

  /* ---------- floating window over other apps (Picture-in-Picture) ---------- */
  var pip = null, pipEls = null, pipEnd = 0;
  function buildPip(w) {
    var cs = getComputedStyle(fv);
    var bg = cs.getPropertyValue('--deep').trim() || '#241E31';
    var fg = cs.getPropertyValue('--deep-ink').trim() || '#F0D9E4';
    var ac = cs.getPropertyValue('--sky').trim() || '#9DBBD6';
    var d = w.document, st = d.createElement('style');
    st.textContent =
      'html,body{margin:0;height:100%}' +
      'body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px;box-sizing:border-box;' +
        'background:' + bg + ';color:' + fg + ';font:700 12px system-ui,sans-serif}' +
      ':root{--sky:' + ac + '}' +
      '.gw{flex:1;min-height:0;width:100%;display:flex;flex-direction:column}.gw[hidden]{display:none}' +
      '.jb-grid{display:grid;grid-template-columns:repeat(var(--cols,6),minmax(0,var(--cell,20px)));gap:var(--gap,5px);justify-content:center;align-content:center;flex:1;min-height:0}' +
      '.jb{position:relative;display:block;aspect-ratio:1/1.1;border-radius:4px;overflow:hidden;border:1.5px solid color-mix(in srgb,currentColor 50%,transparent)}' +
      '.jb i{position:absolute;left:0;right:0;bottom:0;height:0;background:var(--sky);transition:height .35s linear}' +
      '.jb.cur{border-color:var(--sky)}' +
      '.jb-cap{margin:2px 0 0;text-align:center;font-size:10px;font-weight:700;opacity:.75}' +
      '.n{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85}' +
      '.c{font:900 46px/1 Georgia,serif;color:' + ac + ';font-variant-numeric:tabular-nums}' +
      '.b{display:flex;gap:6px;margin-top:4px}' +
      'button{font:inherit;cursor:pointer;border-radius:99px;padding:4px 12px;border:2px solid ' + fg + ';background:transparent;color:' + fg + '}' +
      'button.p{background:' + fg + ';color:' + bg + '}' +
      '.ban{position:absolute;inset:0;background:' + bg + ';padding:10px 12px;box-sizing:border-box;display:flex;flex-direction:column;gap:5px;overflow:hidden}' +
      '.ban[hidden]{display:none}' +
      '.ban b{font:900 14px Georgia,serif;color:' + ac + ';padding-right:22px}' +
      '.ban p{margin:0;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}' +
      '.ban img{max-height:70px;max-width:100%;object-fit:cover;border-radius:8px;align-self:flex-start}' +
      '.ban .x{position:absolute;top:6px;right:8px;border:0;padding:0 4px;font-size:18px;line-height:1}';
    d.head.appendChild(st);
    d.body.innerHTML = '<div class="n" id="n"></div><div class="c" id="c">--:--</div>' +
      '<div class="gw" id="gw" data-fit="pip" hidden><div class="jb-grid"></div><p class="jb-cap"></p></div>' +
      '<div class="b"><button class="p" id="b1" data-a="toggle">Pause</button><button data-a="save">Finish</button></div>' +
      '<div class="ban" id="ban" hidden><button class="x" id="bx" aria-label="Dismiss">×</button><b id="bt"></b><p id="bb"></p><img id="bi" alt="" hidden></div>';
    pipEls = { n: d.getElementById('n'), c: d.getElementById('c'), gw: d.getElementById('gw'), b: d.getElementById('b1'),
               ban: d.getElementById('ban'), bt: d.getElementById('bt'), bb: d.getElementById('bb'), bi: d.getElementById('bi') };
    d.getElementById('bx').addEventListener('click', function () { pipEls.ban.hidden = true; });
    d.body.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-a]') : null;
      if (b) act(b.getAttribute('data-a'));
    });
    w.addEventListener('pagehide', function () { pip = null; pipEls = null; });
    pip = w; pipEnd = 0; loop();
  }

  var banTimer = 0;
  window.SummitFloat = {                                        // alerts.js sends every pop-up here too
    notify: function (o) {
      if (!pip || !pipEls || !o) return;
      pipEls.bt.textContent = o.title || '';
      pipEls.bb.textContent = o.body || '';
      pipEls.bb.hidden = !o.body;
      pipEls.bi.hidden = !o.img;
      if (o.img) pipEls.bi.src = o.img; else pipEls.bi.removeAttribute('src');
      pipEls.ban.hidden = false;
      clearTimeout(banTimer);
      banTimer = setTimeout(function () { if (pipEls) pipEls.ban.hidden = true; }, o.kind === 'miss' ? 20000 : 12000);
    }
  };

  var vcan = null, vvid = null;
  function drawVideo() {
    if (!vcan) return;
    var x = vcan.getContext('2d'), cs = getComputedStyle(fv);
    x.fillStyle = cs.getPropertyValue('--deep').trim() || '#241E31'; x.fillRect(0, 0, vcan.width, vcan.height);
    x.textAlign = 'center';
    var fgc = cs.getPropertyValue('--deep-ink').trim() || '#F0D9E4', acc = cs.getPropertyValue('--sky').trim() || '#9DBBD6';
    if (cur && view === 'blocks') {
      x.fillStyle = fgc; x.font = '700 13px system-ui,sans-serif';
      x.fillText(cur.title.slice(0, 40), vcan.width / 2, 22);
      drawBlocksCanvas(x, cur, vcan.width, vcan.height, 34, fgc, acc);
      return;
    }
    x.fillStyle = fgc; x.font = '700 16px system-ui,sans-serif';
    x.fillText(cur ? cur.title.slice(0, 34) : 'Session finished', vcan.width / 2, 40);
    x.fillStyle = acc; x.font = '900 76px Georgia,serif';
    x.fillText(cur ? cur.text : '✓', vcan.width / 2, 122);
  }
  function videoPip() {
    if (!document.pictureInPictureEnabled) { toast('This browser can’t float the timer. Use Full screen instead.'); return; }
    try {
      if (!vcan) {
        vcan = document.createElement('canvas'); vcan.width = 320; vcan.height = 160;
        vvid = document.createElement('video'); vvid.muted = true; vvid.playsInline = true;
        vvid.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:0;top:0';
        document.body.appendChild(vvid);
        vvid.srcObject = vcan.captureStream(5);
      }
      drawVideo();
      vvid.play().then(function () { return vvid.requestPictureInPicture(); })
        .catch(function () { toast('Couldn’t open the floating timer in this browser.'); });
    } catch (e) { toast('Couldn’t open the floating timer in this browser.'); }
  }

  function openFloat() {
    cur = current();
    if (!cur) { toast('Start a timer or stopwatch first'); return; }
    if (pip) { try { pip.focus(); } catch (e) {} return; }
    if (window.documentPictureInPicture) {
      documentPictureInPicture.requestWindow({ width: 300, height: 180 }).then(buildPip).catch(videoPip);
    } else videoPip();
  }

  /* ---------- drawing ---------- */
  function renderPill() {
    if (!cur) pillHidden = false;
    var show = !!cur && !pillHidden && fv.hidden;
    if (cur) { var p = $(BTN[cur.kind].pane); if (p && !p.hidden) show = false; }   // the timer card is already on screen
    pill.hidden = !show;
    if (show) { setText(pillT, cur.text); setText(pillN, cur.title + (cur.running ? '' : ' (paused)')); }
  }
  function renderFull() {
    if (fv.hidden) return;
    if (!cur) {
      if (!fullEnd) fullEnd = Date.now();
      setText(fvClock, '✓'); setText(fvSub, 'Session finished'); fvJb.hidden = true;
      if (Date.now() - fullEnd > 1200) closeFull();
      return;
    }
    fullEnd = 0;
    setText(fvKind, BTN[cur.kind].kind);
    setText(fvTitle, cur.title);
    setText(fvClock, cur.text);
    setText(fvSub, (cur.mode === 'timer' ? 'Timer · ' + Math.round(cur.dur / 60) + ' min' : 'Stopwatch') + (cur.running ? '' : ' · paused'));
    fv.classList.toggle('blocks', view === 'blocks');
    fvJb.hidden = view !== 'blocks';
    if (view === 'blocks') drawBlocks(fvJb, cur);
    fvDigits.setAttribute('aria-pressed', String(view === 'digits'));
    fvBlocks.setAttribute('aria-pressed', String(view === 'blocks'));
    fvBsL.hidden = view !== 'blocks';
    if (document.activeElement !== fvBs && fvBs.value !== String(bsz)) fvBs.value = String(bsz);
    fvBar.style.width = cur.pct + '%';
    fvBarWrap.style.visibility = cur.mode === 'timer' ? 'visible' : 'hidden';
    setText(fvToggle, cur.running ? 'Pause' : 'Resume');
    if (SND) {
      if (document.activeElement !== fvSnd && fvSnd.value !== SND.get()) fvSnd.value = SND.get();
      setText(fvTicks, 'Ticking: ' + (SND.isOn(cur.mode) ? 'On' : 'Off'));
    }
  }
  function renderCards() {
    var links = document.querySelectorAll('.fvbar [data-fv="view"]'), i;
    for (i = 0; i < links.length; i++) setText(links[i], view === 'blocks' ? 'Digits' : '▦ Blocks');
    cards.forEach(function (b) {
      var kind = b.getAttribute('data-kind');
      var show = view === 'blocks' && !!cur && cur.kind === kind;
      var ck = $(kind === 'h' ? 'fpClock' : 'tfClock');
      if (ck) ck.style.display = show ? 'none' : '';             // one style at a time: digits or boxes
      b.hidden = !show;
      if (show) drawBlocks(b, cur);
    });
  }
  function renderPip() {
    if (!pip || !pipEls) return;
    if (cur) {
      pipEnd = 0;
      setText(pipEls.n, cur.title); setText(pipEls.c, cur.text); setText(pipEls.b, cur.running ? 'Pause' : 'Resume');
      pipEls.c.hidden = view === 'blocks';                       // one style at a time: digits or boxes
      pipEls.gw.hidden = view !== 'blocks';
      if (view === 'blocks') drawBlocks(pipEls.gw, cur);
    } else {
      pipEls.c.hidden = false; pipEls.gw.hidden = true;
      if (!pipEnd) pipEnd = Date.now();
      setText(pipEls.n, 'Session finished'); setText(pipEls.c, '✓');
      if (Date.now() - pipEnd > 2500) { try { pip.close(); } catch (e) {} pip = null; pipEls = null; }
    }
  }
  function loop() {
    cur = current();
    renderPill(); renderFull(); renderCards(); renderPip();
    if (vvid && document.pictureInPictureElement === vvid) drawVideo();
  }
  setInterval(loop, 250);
  try {                                                         // keeps time in a background tab
    var worker = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(1)},250)'], { type: 'text/javascript' })));
    worker.onmessage = loop;
  } catch (e) {}
  document.addEventListener('visibilitychange', loop);

  /* ---------- clicks ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-fv]'); if (!b) return;
    var a = b.dataset.fv;
    if (a === 'full') openFull();
    else if (a === 'float') openFloat();
    else if (a === 'close') closeFull();
    else if (a === 'hide') { pillHidden = true; loop(); }
    else if (a === 'view') { view = view === 'blocks' ? 'digits' : 'blocks'; savePref(); loop(); }
    else if (a === 'digits' || a === 'blocks') { view = a; savePref(); loop(); }
    else if (a === 'toggle' || a === 'save') act(a);
    else if (a === 'ticks' && SND && cur) { SND.setOn(cur.mode, !SND.isOn(cur.mode)); loop(); }
  });

  loop();
})();