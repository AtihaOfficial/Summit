(function () {
  'use strict';

  var cv = document.getElementById('sparkles');
  var cx = cv.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, stars = [], COLS = ['#fff', '#fff', '#fff', '#fff'];

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    COLS = ['--sp1', '--sp2', '--sp3', '--sp4'].map(function (v) { return cs.getPropertyValue(v).trim() || '#fff'; });
    if (reduce) draw(0);
  }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function make() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: (1.5 + Math.random() * 5) * dpr,        // star size
      ph: Math.random() * Math.PI * 2,           // twinkle offset
      sp: 0.6 + Math.random() * 1.6,             // twinkle speed
      vy: -(0.03 + Math.random() * 0.12) * dpr,  // slow upward drift
      ci: Math.floor(Math.random() * 4)          // color index
    };
  }

  function resize() {
    W = cv.width = innerWidth * dpr;
    H = cv.height = innerHeight * dpr;
    var n = Math.round(Math.min(90, Math.max(35, (innerWidth * innerHeight) / 1600)));
    stars = [];
    for (var i = 0; i < n; i++) stars.push(make());
    if (reduce) draw(0);
  }

  // Four-point sparkle with concave sides
  function sparkle(x, y, r) {
    cx.beginPath();
    cx.moveTo(x, y - r);
    cx.quadraticCurveTo(x, y, x + r, y);
    cx.quadraticCurveTo(x, y, x, y + r);
    cx.quadraticCurveTo(x, y, x - r, y);
    cx.quadraticCurveTo(x, y, x, y - r);
    cx.fill();
  }

  function draw(t) {
    cx.clearRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var a = 0.5 + 0.5 * Math.sin(t * 0.001 * s.sp + s.ph); // 0..1
      var col = COLS[s.ci];

      cx.globalAlpha = 0.12 + 0.88 * a * a;
      cx.fillStyle = col;
      cx.shadowColor = col;
      cx.shadowBlur = 8 * dpr;
      sparkle(s.x, s.y, s.r * (0.45 + 0.55 * a));

      if (!reduce) {
        s.y += s.vy;
        if (s.y < -s.r) { s.y = H + s.r; s.x = Math.random() * W; }
      }
    }
    cx.globalAlpha = 1;
    cx.shadowBlur = 0;
  }

  function loop(t) {
    draw(t);
    requestAnimationFrame(loop);
  }

  addEventListener('resize', resize);
  readColors();
  resize();
  if (!reduce) requestAnimationFrame(loop);  // reduced motion: one static frame
})();