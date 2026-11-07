(function () {
  'use strict';

  var KEY = 'peaks.pause', MAIN = 'peaks.v3', HT = 'peaks.htimes';
  var $ = function (id) { return document.getElementById(id); };
  var list = $('list');
  if (!list) return;

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function today() { return key(new Date()); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function fmtD(k) { return parse(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function fmtT(m) { var h = Math.floor(m / 60); return (h % 12 || 12) + ':' + pad(m % 60) + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function safe(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function toast(msg) {
    var box = $('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }
  function habits() { var s = safe(MAIN, null); return s && Array.isArray(s.habits) ? s.habits : []; }
  function lg(h, k) { return Math.min((h.log && h.log[k]) || 0, 100); }

  /* ---------- the pause rules ---------- */
  // { id, gid, hid, from:'YYYY-MM-DD', to:'YYYY-MM-DD' or '', every: 0 or N days, why:'' }
  var D = (function () {
    var s = safe(KEY, null), r = s && Array.isArray(s.rules) ? s.rules : [];
    return { rules: r.filter(function (x) { return x && x.hid && /^\d{4}-\d{2}-\d{2}$/.test(x.from || ''); }) };
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} }

  function active(r, k) {
    if (k < r.from) return false;
    if (!r.every) return !r.to || k <= r.to;
    if (!r.to || r.to < r.from) return true;
    return diff(r.from, k) % r.every < diff(r.from, r.to) + 1;
  }
  function activeRule(hid, k) {
    for (var i = 0; i < D.rules.length; i++) if (D.rules[i].hid === hid && active(D.rules[i], k)) return D.rules[i];
    return null;
  }
  // other files ask this: was this habit paused on that day?
  window.Pause = {
    is: function (hid, k) { return !!activeRule(hid, k || today()); },
    rules: function (hid) { return D.rules.filter(function (r) { return r.hid === hid; }); },
    any: function () { return D.rules.length > 0; }
  };

  function ruleText(r) {
    var t;
    if (r.every) t = 'Repeats every ' + r.every + ' days · ' + (diff(r.from, r.to) + 1) + ' days each, starting ' + fmtD(r.from);
    else if (r.to) t = fmtD(r.from) + ' to ' + fmtD(r.to);
    else t = 'From ' + fmtD(r.from) + ' until you resume';
    return t + (r.why ? ' · ' + r.why : '');
  }
  function pausedText(h) {
    var tk = today(), r = activeRule(h.id, tk);
    if (!r) return 'Paused';
    var t;
    if (r.every) {
      var len = diff(r.from, r.to) + 1, n = diff(r.from, tk) % r.every;
      t = 'Paused until ' + fmtD(key(addDays(parse(tk), len - 1 - n)));
    } else t = r.to ? 'Paused until ' + fmtD(r.to) : 'Paused until you resume';
    return t + (r.why ? ' · ' + r.why : '');
  }

  /* ---------- streaks that skip paused days ---------- */
  function streakAdj(h) {
    var d = new Date(), n = 0, k = key(d), i = 0;
    if (!Pause.is(h.id, k) && lg(h, k) < 100) d = addDays(d, -1);
    while (i++ < 3700) {
      k = key(d);
      if (k < h.start) break;
      if (Pause.is(h.id, k)) { d = addDays(d, -1); continue; }
      if (lg(h, k) >= 100) { n++; d = addDays(d, -1); } else break;
    }
    return n;
  }
  function bestAdj(h) {
    var k = h.start, end = today(), run = 0, best = 0, i = 0;
    while (k <= end && i++ < 3700) {
      if (!Pause.is(h.id, k)) {
        if (lg(h, k) >= 100) { run++; if (run > best) best = run; } else run = 0;
      }
      k = key(addDays(parse(k), 1));
    }
    return best;
  }

  /* ---------- numbers on Overview + Habits: paused habits don't count ---------- */
  var obs = null, over = false;
  var WATCH = ['c1v', 'c2v', 'miniCount', 'avg', 'avgBar', 'verdict', 'nextUp', 'banner', 'bannerMsg', 'bestNow', 'bestStreak', 'perfect', 'wkAvg'];
  function setT(id, t) { var e = $(id); if (e && e.textContent !== t) e.textContent = t; }
  function watch() {
    if (!obs) return;
    WATCH.forEach(function (id) {
      var e = $(id);
      if (e) obs.observe(e, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    });
  }
  function kick() { var r = $('targetRange'); if (r) r.dispatchEvent(new Event('input', { bubbles: true })); }   // makes script.js recompute its own numbers

  function stats() {
    if (!D.rules.length) {
      if (over) { over = false; kick(); }
      return;
    }
    over = true;
    var hs = habits(), tk = today(), target = +(safe(MAIN, {}).target) || 80;
    var act = hs.filter(function (h) { return h.start <= tk && !Pause.is(h.id, tk); });
    var pausedN = hs.filter(function (h) { return h.start <= tk && Pause.is(h.id, tk); }).length;
    var n = act.length, done = 0, sum = 0, i, k, best = 0, cur = 0;
    act.forEach(function (h) { var p = lg(h, tk); if (p >= 100) done++; sum += p; });
    var pct = n ? Math.round(done / n * 100) : 0, avg = n ? Math.round(sum / n) : 0;

    hs.forEach(function (h) { cur = Math.max(cur, streakAdj(h)); best = Math.max(best, bestAdj(h)); });

    var tot = [], perfect = 0;
    for (i = 6; i >= 0; i--) {
      k = key(addDays(new Date(), -i));
      var a = hs.filter(function (h) { return h.start <= k && !Pause.is(h.id, k); });
      if (!a.length) continue;
      var s = 0, all = true;
      a.forEach(function (h) { var p = lg(h, k); s += p; if (p < 100) all = false; });
      tot.push(Math.round(s / a.length));
      if (all) perfect++;
    }

    if (obs) obs.disconnect();
    setT('c1v', n ? pct + '%' : '–');
    var r1 = $('c1r'); if (r1) r1.style.strokeDashoffset = 326.7 * (1 - pct / 100);
    setT('c2v', n ? avg + '%' : '–');
    var r2 = $('c2r'); if (r2) r2.style.strokeDashoffset = 326.7 * (1 - avg / 100);
    setT('miniCount', done + '/' + n);
    setT('avg', avg + '%');
    var bar = $('avgBar'); if (bar) bar.style.width = avg + '%';
    var df = avg - target;
    setT('verdict', !n ? 'All habits are paused' : df > 0 ? df + ' points ahead of target' : df === 0 ? 'Right on target' : Math.abs(df) + ' points to reach target');
    var first = list.querySelector('.habit:not(.done):not(.paused) .title');
    setT('nextUp', n === 0 ? (hs.length ? 'All habits are paused' : 'Add a habit') : first ? first.textContent : 'All done. Rest well.');
    var bn = $('banner');
    if (bn && n > 0 && done === n) {
      bn.classList.add('show');
      setT('bannerMsg', 'All ' + n + (n === 1 ? ' habit' : ' habits') + ' done today' + (pausedN ? ' (' + pausedN + ' paused)' : '') +
        ', with ' + avg + '% average progress against your ' + target + '% target.');
    }
    setT('bestNow', String(cur));
    setT('bestStreak', best + (best === 1 ? ' day' : ' days'));
    setT('perfect', String(perfect));
    setT('wkAvg', tot.length ? Math.round(tot.reduce(function (x, y) { return x + y; }, 0) / tot.length) + '%' : '0%');
    watch();
  }
  obs = new MutationObserver(function () { stats(); });

  /* ---------- habit cards: pause button, paused look, small finished habits ---------- */
  var OPEN = {};
  function doneTime(h) {
    var d = safe(HT, {}).done, v = d && d[h.id] && d[h.id][today()];
    return typeof v === 'number' && v >= 0 ? v : null;
  }
  function streakText(li) {
    var p = [].slice.call(li.querySelectorAll('.pill')).filter(function (x) { return /streak/i.test(x.textContent); })[0];
    return p ? p.textContent : '';
  }

  function decorate() {
    var hs = habits(), map = {}, tk = today();
    hs.forEach(function (h) { map[h.id] = h; });
    list.querySelectorAll('.habit').forEach(function (li) {
      var h = map[li.dataset.id]; if (!h) return;
      var pz = Pause.is(h.id, tk), done = li.classList.contains('done');

      li.classList.toggle('paused', pz);
      li.classList.toggle('cmp', pz || done);
      li.classList.toggle('open', !!OPEN[h.id]);

      li.querySelectorAll('.pill').forEach(function (p) {            // a streak that skips paused days
        if (!/streak/i.test(p.textContent)) return;
        var st = streakAdj(h), t = st > 0 ? '🔥 ' + st + (st === 1 ? ' day' : ' days') + ' streak' : 'Start your streak';
        if (p.textContent !== t) p.textContent = t;
      });

      var edit = li.querySelector('[data-act="edit"]'), pb = li.querySelector('[data-pz="open"]');
      if (edit && !pb) {
        pb = document.createElement('button');
        pb.type = 'button'; pb.className = 'link'; pb.setAttribute('data-pz', 'open');
        edit.parentNode.insertBefore(pb, edit.nextSibling);
      }
      if (pb) {
        var c = Pause.rules(h.id).filter(function (r) { return r.every || !r.to || r.to >= tk; }).length;
        var t2 = '⏸ Pause' + (c ? ' (' + c + ')' : '');
        if (pb.textContent !== t2) pb.textContent = t2;
      }

      li.querySelectorAll('.dot[data-k]').forEach(function (d) { d.classList.toggle('pz', Pause.is(h.id, d.dataset.k)); });

      var mini = li.querySelector('.mini'), hx = li.querySelector('.hx');
      if (pz || done) {
        if (!mini) {
          mini = document.createElement('p'); mini.className = 'mini';
          var tt = li.querySelector('.title'); if (tt) tt.insertAdjacentElement('afterend', mini);
        }
        if (mini) {
          var html;
          if (pz) html = '⏸ ' + esc(pausedText(h)) + ' <button type="button" class="link" data-pz="resume">Resume</button>';
          else {
            var dt = doneTime(h), st2 = streakText(li), parts = ['Done' + (dt !== null ? ' at ' + fmtT(dt) : '')];
            if (st2 && st2 !== 'Start your streak') parts.push(st2);
            html = esc(parts.join(' · '));
          }
          if (mini.innerHTML !== html) mini.innerHTML = html;
        }
        if (!hx) {
          var row = li.querySelector('.relative > .flex');
          if (row) { hx = document.createElement('button'); hx.type = 'button'; hx.className = 'hx'; hx.setAttribute('data-hx', ''); row.appendChild(hx); }
        }
        if (hx) {
          var o = !!OPEN[h.id];
          hx.textContent = o ? '▴' : '▾';
          hx.setAttribute('aria-expanded', String(o));
          hx.setAttribute('aria-label', (o ? 'Hide' : 'Show') + ' details for ' + h.title);
        }
      } else {
        if (mini) mini.remove();
        if (hx) hx.remove();
      }
    });
  }

  function refreshAll() { decorate(); stats(); window.dispatchEvent(new Event('peaks:pause')); }

  /* ---------- the pause dialog ---------- */
  var WHY = ['Rest', 'Period', 'Sick', 'Travel', 'Other'];
  var dlg = document.createElement('dialog');
  dlg.id = 'pzdlg'; dlg.className = 'about-dialog pzdlg';
  dlg.innerHTML =
    '<form id="pzForm" class="about-content" autocomplete="off">' +
      '<p class="about-eyebrow">TAKE A BREAK</p>' +
      '<h2 class="serif">Pause habits</h2>' +
      '<p class="pz-note">Paused days never break a streak, never count against you, and send no alerts. Handy for rest days, cycles, illness or travel.</p>' +
      '<div id="pzCur"></div>' +
      '<h3 class="h4" style="margin-top:18px">New pause</h3>' +
      '<div id="pzHab" class="pz-habs"></div>' +
      '<div class="pz-dates">' +
        '<div><label class="lbl" for="pzFrom">From</label><input id="pzFrom" type="date" class="field"></div>' +
        '<div><label class="lbl" for="pzTo">Until <span class="hint">(optional)</span></label><input id="pzTo" type="date" class="field"></div>' +
      '</div>' +
      '<p class="hint" id="pzDur" style="margin-top:6px"></p>' +
      '<p class="lbl">Reason <span class="hint">(optional)</span></p>' +
      '<div id="pzWhy" class="chiprow"></div>' +
      '<label class="chk" style="margin-top:14px"><input type="checkbox" id="pzRep"><span>Repeat this pause (for example every cycle)</span></label>' +
      '<div id="pzRepBox" hidden><div class="pz-row"><label for="pzEvery">Repeat every</label><input id="pzEvery" type="number" min="2" max="365" value="28" class="field"><span>days</span></div></div>' +
      '<p class="qw-err" id="pzErr" role="alert" hidden></p>' +
      '<div class="cl-foot"><button type="button" class="btn btn-line-dark" id="pzNo">Close</button><button type="submit" class="btn btn-deep">Pause</button></div>' +
    '</form>';
  document.body.appendChild(dlg);

  var cur = '', why = '';
  function err(m) { var e = $('pzErr'); e.textContent = m || ''; e.hidden = !m; }
  function showDlg() { if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', ''); }
  function hideDlg() { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }

  function fillHabs() {
    $('pzHab').innerHTML = habits().map(function (h) {
      return '<label class="chk"><input type="checkbox" data-pzh value="' + esc(h.id) + '"' + (h.id === cur ? ' checked' : '') + '><span>' + esc(h.title) + '</span></label>';
    }).join('');
  }
  function fillWhy() {
    $('pzWhy').innerHTML = WHY.map(function (w) {
      return '<button type="button" class="chip" data-why="' + w + '" aria-pressed="' + (why === w) + '">' + w + '</button>';
    }).join('');
  }
  function fillCur() {
    var tk = today();
    var rows = Pause.rules(cur).filter(function (r) { return r.every || !r.to || r.to >= tk; });
    $('pzCur').innerHTML = rows.length
      ? '<h3 class="h4" style="margin-top:14px">Current and planned</h3>' + rows.map(function (r) {
          var on = active(r, tk), label = on ? (r.every ? 'Stop repeating' : 'Resume now') : 'Delete';
          return '<div class="pz-r"><span>' + (on ? '<b>Paused now</b> · ' : '') + esc(ruleText(r)) + '</span>' +
            '<button type="button" class="link" data-pzr="' + r.id + '">' + label + '</button></div>';
        }).join('')
      : '';
  }
  function hint() {
    var f = $('pzFrom').value, t = $('pzTo').value;
    $('pzDur').textContent = f && t && t >= f ? (diff(f, t) + 1) + (diff(f, t) === 0 ? ' day' : ' days') + ' paused' : '';
  }
  function openDlg(hid) {
    cur = hid; why = '';
    $('pzFrom').value = today(); $('pzTo').value = '';
    $('pzRep').checked = false; $('pzRepBox').hidden = true; $('pzEvery').value = 28;
    err(''); fillHabs(); fillWhy(); fillCur(); hint(); showDlg();
  }

  function removeRule(id) { D.rules = D.rules.filter(function (r) { return r.id !== id; }); }
  function endNow(r) {
    var y = key(addDays(new Date(), -1));
    if (r.every || r.from > y) removeRule(r.id); else r.to = y;
  }
  function resumeToday(hid) {
    var tk = today(), rs = D.rules.filter(function (r) { return r.hid === hid && active(r, tk); });
    if (!rs.length) return;
    if (rs.some(function (r) { return r.every; }) && !confirm('This pause repeats. Resuming now stops the repeating pause for this habit. Continue?')) return;
    rs.forEach(endNow);
    save(); refreshAll(); toast('Habit resumed');
  }

  $('pzCur').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pzr]'); if (!b) return;
    var r = D.rules.filter(function (x) { return x.id === b.dataset.pzr; })[0]; if (!r) return;
    if (active(r, today())) endNow(r); else removeRule(r.id);
    save(); fillCur(); refreshAll();
  });
  $('pzWhy').addEventListener('click', function (e) {
    var b = e.target.closest('[data-why]'); if (!b) return;
    why = why === b.dataset.why ? '' : b.dataset.why; fillWhy();
  });
  $('pzRep').addEventListener('change', function () { $('pzRepBox').hidden = !this.checked; });
  $('pzFrom').addEventListener('input', hint);
  $('pzTo').addEventListener('input', hint);
  $('pzNo').addEventListener('click', hideDlg);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) hideDlg(); });

  $('pzForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var ids = [].slice.call(dlg.querySelectorAll('[data-pzh]:checked')).map(function (i) { return i.value; });
    var from = $('pzFrom').value, to = $('pzTo').value, rep = $('pzRep').checked, every = parseInt($('pzEvery').value, 10) || 0;
    if (!ids.length) return err('Pick at least one habit.');
    if (!from) return err('Pick a start date.');
    if (to && to < from) return err('“Until” can’t be before “From”.');
    if (rep) {
      if (!to) return err('A repeating pause needs an “Until” date, so I know how long each pause lasts.');
      var len = diff(from, to) + 1;
      if (every < 2 || every > 365) return err('Repeat every 2 to 365 days.');
      if (every <= len) return err('Each pause lasts ' + len + ' days, so it has to repeat less often than that.');
    }
    var gid = uid();
    ids.forEach(function (id) { D.rules.push({ id: uid(), gid: gid, hid: id, from: from, to: to, every: rep ? every : 0, why: why }); });
    save(); hideDlg(); refreshAll();
    toast((ids.length === 1 ? 'Habit' : ids.length + ' habits') + ' paused' + (from > today() ? ' from ' + fmtD(from) : ''));
  });

  /* ---------- clicks on the habit cards ---------- */
  list.addEventListener('click', function (e) {          // blocked first, before script.js sees the click
    var t = e.target.closest('[data-act="toggle"]');
    if (t) {
      var li = t.closest('.habit');
      if (li && li.classList.contains('paused')) {
        e.stopImmediatePropagation(); e.preventDefault();
        toast('This habit is paused today. Resume it to check it off.');
        return;
      }
    }
    if (e.target.closest('.dot.pz')) {
      e.stopImmediatePropagation(); e.preventDefault();
      toast('That day was paused.');
    }
  }, true);

  list.addEventListener('click', function (e) {
    var li = e.target.closest('.habit'); if (!li) return;
    if (e.target.closest('[data-hx]')) { OPEN[li.dataset.id] = !OPEN[li.dataset.id]; decorate(); return; }
    var b = e.target.closest('[data-pz]');
    if (!b) return;
    if (b.dataset.pz === 'open') openDlg(li.dataset.id); else if (b.dataset.pz === 'resume') resumeToday(li.dataset.id);
  });

  /* ---------- keep everything fresh ---------- */
  function prune() {
    var hs = habits();
    if (!hs.length) return;
    var ids = {}; hs.forEach(function (h) { ids[h.id] = 1; });
    var n = D.rules.length;
    D.rules = D.rules.filter(function (r) { return ids[r.hid]; });
    if (D.rules.length !== n) save();
  }
  new MutationObserver(function () { prune(); decorate(); stats(); }).observe(list, { childList: true });
  window.addEventListener('peaks:htimes', decorate);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { decorate(); stats(); } });
  setInterval(function () { decorate(); stats(); }, 5000);

  prune(); decorate(); stats();
})();