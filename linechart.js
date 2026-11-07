(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function r(x) { return Math.round(x * 10) / 10; }

  /*
    LineChart.svg({
      labels:  ['Mon', ...],                    x-axis labels
      series:  [{ values:[n|null,...], cls:'s0'|'s1', label:true, area:true }],
      min, max, ticks:[...], fmtTick(v), fmtVal(v),
      bands:   [{ from, to }],                  shaded horizontal band
      lines:   [{ v, label }],                  dashed reference line
      h, left, aria, tip(v, i, seriesIndex)
    })
  */
  window.LineChart = {
    svg: function (o) {
      var W = 340, H = o.h || 150, L = o.left || 34, R = 14, T = 20, B = 24;
      var n = o.labels.length, pw = W - L - R, ph = H - T - B;
      var min = o.min == null ? 0 : o.min, max = o.max;
      if (!(max > min)) max = min + 1;
      var fv = o.fmtVal || function (v) { return String(v); };

      function X(i) { return n < 2 ? L + pw / 2 : L + i * pw / (n - 1); }
      function Y(v) { return T + ph - (Math.max(min, Math.min(max, v)) - min) / (max - min) * ph; }

      var s = '<svg class="lc" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || 'Line chart') +
        '" xmlns="http://www.w3.org/2000/svg">';

      (o.bands || []).forEach(function (b) {
        var y1 = Y(b.to), y2 = Y(b.from);
        s += '<rect class="lc-band" x="' + L + '" y="' + r(y1) + '" width="' + pw + '" height="' + r(Math.max(3, y2 - y1)) + '" rx="4"/>';
      });

      (o.ticks || []).forEach(function (t) {
        var y = r(Y(t));
        s += '<line class="lc-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>' +
          '<text class="lc-t" x="' + (L - 6) + '" y="' + r(y + 3.5) + '" text-anchor="end">' + esc((o.fmtTick || fv)(t)) + '</text>';
      });

      (o.lines || []).forEach(function (l) {
        var y = r(Y(l.v));
        s += '<line class="lc-ref" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>';
        if (l.label) s += '<text class="lc-reft" x="' + (W - R) + '" y="' + r(y - 4) + '" text-anchor="end">' + esc(l.label) + '</text>';
      });

      (o.series || []).forEach(function (se, si) {
        var cls = 'lc-' + (se.cls || ('s' + si)), segs = [], cur = [];
        se.values.forEach(function (v, i) {
          if (v == null) { if (cur.length) segs.push(cur); cur = []; }
          else cur.push([X(i), Y(v), i, v]);
        });
        if (cur.length) segs.push(cur);

        segs.forEach(function (sg) {
          if (sg.length < 2) return;
          var d = 'M' + sg.map(function (p) { return r(p[0]) + ' ' + r(p[1]); }).join(' L');
          if (se.area) {
            s += '<path class="lc-area ' + cls + '" d="' + d + ' L' + r(sg[sg.length - 1][0]) + ' ' + (T + ph) +
              ' L' + r(sg[0][0]) + ' ' + (T + ph) + 'Z"/>';
          }
          s += '<path class="lc-line ' + cls + '" d="' + d + '"/>';
        });

        segs.forEach(function (sg) {
          sg.forEach(function (p) {
            var tip = o.tip ? o.tip(p[3], p[2], si) : o.labels[p[2]] + ': ' + fv(p[3]);
            s += '<circle class="lc-dot ' + cls + '" cx="' + r(p[0]) + '" cy="' + r(p[1]) + '" r="' + (p[2] === n - 1 ? 4.6 : 3.3) +
              '"><title>' + esc(tip) + '</title></circle>';
            if (se.label) s += '<text class="lc-v" x="' + r(p[0]) + '" y="' + r(p[1] - 7) + '" text-anchor="middle">' + esc(fv(p[3])) + '</text>';
          });
        });
      });

      o.labels.forEach(function (lb, i) {
        s += '<text class="lc-x' + (i === n - 1 ? ' now' : '') + '" x="' + r(X(i)) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(lb) + '</text>';
      });

      return s + '</svg>';
    }
  };
})();