(function () {
  'use strict';

  var KEY = 'peaks.quotes', IDX = 'peaks.quotes.idx';
  var main = document.querySelector('main'), tabs = document.querySelector('.tabs');
  if (!main || !tabs) return;
  var $ = function (id) { return document.getElementById(id); };

  // [text, when]  when: both = anytime, run = while focusing, end = when a session ends
  var STARTER = [
    ['One day at a time. One step at a time.', 'both'],
    ['Small steps, taken daily, add up to something big.', 'both'],
    ['Start before you feel ready.', 'both'],
    ['You don’t need a perfect day. You need a done one.', 'both'],
    ['Focus on the next ten minutes only.', 'run'],
    ['Progress counts even when it’s slow.', 'both'],
    ['Future you is watching. Make them proud.', 'run'],
    ['Show up first. Motivation follows.', 'both'],
    ['A little today beats a lot someday.', 'both'],
    ['Stay with it. This is the part that matters.', 'run'],
    ['See, you can. It wasn’t that hard. The fear was only in your mind.', 'end'],
    ['You showed up, and it wasn’t nearly as scary as you thought.', 'end'],
    ['Another proof that you can do hard things.', 'end'],
    ['That was easier than the dread of starting it. Remember this next time.', 'end']
  ];
  var EVERY = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60], MAX = 500, MAXLEN = 220, MAXPIC = 40;
  var WHEN = { both: 'Anytime', run: 'While focusing', end: 'At the end' };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var box = $('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }

  /* ---------- data ---------- */
  function clean(x) {
    return {
      id: x.id || uid(), text: String(x.text || ''),
      img: typeof x.img === 'string' && x.img.indexOf('data:image/') === 0 ? x.img : '',
      when: x.when === 'run' || x.when === 'end' ? x.when : 'both'
    };
  }
  function starter() { return STARTER.map(function (a) { return { id: uid(), text: a[0], img: '', when: a[1] }; }); }
  var Q = (function () {
    var s = null, o = { on: true, every: 5, timers: true, watches: true, order: 'random', endOn: true, endOrder: 'random', list: null };
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (s && typeof s === 'object') {
      if (s.on === false) o.on = false;
      if (+s.every >= 1 && +s.every <= 240) o.every = Math.round(+s.every);
      if (s.timers === false) o.timers = false;
      if (s.watches === false) o.watches = false;
      if (s.order === 'seq') o.order = 'seq';
      if (s.endOn === false) o.endOn = false;
      if (s.endOrder === 'seq') o.endOrder = 'seq';
      if (Array.isArray(s.list)) o.list = s.list.filter(function (x) { return x && (x.text || x.img); }).map(clean);
    }
    if (!o.list) o.list = starter();
    return o;
  })();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(Q)); return true; }
    catch (e) { toast('Storage is full. Remove a few pictures and try again.'); return false; }
  }
  save();

  /* ---------- picking a quote (used by alerts.js, script.js and taskfocus.js) ---------- */
  var lastPick = { run: -1, end: -1 };
  function idxLoad() { try { return JSON.parse(localStorage.getItem(IDX)) || {}; } catch (e) { return {}; } }
  function pick(kind) {
    var pool = Q.list.filter(function (x) { return x.when === 'both' || x.when === kind; });
    if (!pool.length) return null;
    var seq = (kind === 'end' ? Q.endOrder : Q.order) === 'seq', i;
    if (seq) {
      var ix = idxLoad(); i = (+ix[kind] || 0) % pool.length; ix[kind] = i + 1;
      try { localStorage.setItem(IDX, JSON.stringify(ix)); } catch (e) {}
    } else {
      i = Math.floor(Math.random() * pool.length);
      if (pool.length > 1 && i === lastPick[kind]) i = (i + 1) % pool.length;
      lastPick[kind] = i;
    }
    return pool[i];
  }
  function fillEnd(p) {
    var b = $('qBody'), im = $('qImg'); if (!b || !im) return;
    b.hidden = !(p && p.text); b.textContent = p && p.text ? p.text : '';
    im.hidden = !(p && p.img);
    if (p && p.img) im.src = p.img; else im.removeAttribute('src');
  }
  window.SummitQuotes = {
    cfg: function () { return Q; },
    pick: pick,
    showEnd: function () { fillEnd(Q.endOn ? pick('end') : null); }   // fills the card that opens after a saved session
  };

  /* ---------- tab + pane (layout.js shows and hides the pane) ---------- */
  var tab = document.createElement('button');
  tab.type = 'button'; tab.className = 'tab'; tab.setAttribute('role', 'tab');
  tab.id = 'tab-quotes';
  tab.setAttribute('data-tab', 'quotes'); tab.setAttribute('aria-controls', 'pane-quotes');
  tab.setAttribute('aria-selected', 'false'); tab.textContent = 'Quotes';
  tabs.appendChild(tab);

  var pane = document.createElement('section');
  pane.id = 'pane-quotes'; pane.className = 'pane'; pane.setAttribute('role', 'tabpanel');
  pane.setAttribute('aria-labelledby', 'tab-quotes'); pane.hidden = true;
  var foot = main.querySelector('.foot');
  if (foot && foot.parentNode) foot.parentNode.insertBefore(pane, foot);
  else main.appendChild(pane);

  function tog(id, label) { return '<label class="tg"><input type="checkbox" id="' + id + '" aria-label="' + label + '"><i></i></label>'; }
  function seg(attr, label) {
    return '<div class="seg" role="group" aria-label="' + label + '"><button type="button" data-' + attr + '="random">Random</button>' +
      '<button type="button" data-' + attr + '="seq">In order</button></div>';
  }
  pane.innerHTML =
    '<div class="pane-head"><div><h2 class="h2">Quotes &amp; pictures</h2>' +
    '<p class="hint">Your own words or pictures. They pop up while you focus and when a session ends.</p></div></div>' +
    '<div class="qpane">' +
      '<section class="card qset">' +
        '<h3 class="h3">While you focus</h3>' +
        '<div class="set"><div class="set-t"><b>Send reminders</b><span>Pop up a quote or picture during focus sessions.</span></div><div class="set-c">' + tog('qOn', 'Send reminders') + '</div></div>' +
        '<div class="set set-col"><div class="set-t"><b>Every</b><span>Minutes between reminders.</span></div>' +
          '<div class="chiprow" id="qEvery"></div>' +
          '<div class="qcust"><span>or</span><input type="number" id="qCust" min="1" max="240" class="field" placeholder="minutes" aria-label="Custom minutes"><span>minutes</span></div></div>' +
        '<div class="set"><div class="set-t"><b>During timers</b></div><div class="set-c">' + tog('qT', 'During timers') + '</div></div>' +
        '<div class="set"><div class="set-t"><b>During stopwatches</b></div><div class="set-c">' + tog('qW', 'During stopwatches') + '</div></div>' +
        '<div class="set"><div class="set-t"><b>Order</b><span>Random, or down the list.</span></div><div class="set-c">' + seg('ord', 'Order while focusing') + '</div></div>' +

        '<h3 class="h3" style="margin-top:22px">When a session ends</h3>' +
        '<div class="set"><div class="set-t"><b>Show one at the end</b><span>A card appears when a timer finishes or you save a session.</span></div><div class="set-c">' + tog('qEndOn', 'Show one at the end') + '</div></div>' +
        '<div class="set"><div class="set-t"><b>Order</b><span>Random, or down the list.</span></div><div class="set-c">' + seg('eord', 'Order at the end') + '</div></div>' +

        '<div class="qtest"><div class="flex flex-wrap gap-2"><button type="button" class="btn btn-line btn-sm" id="qTest">Test a pop-up</button>' +
        '<button type="button" class="btn btn-line btn-sm" id="qTestEnd">Preview the end card</button></div>' +
        '<p class="hint">Reminders appear inside Summit. Turn on browser notifications from the bell to get the text in other tabs too.</p></div>' +
      '</section>' +
      '<section class="card">' +
        '<div class="flex flex-wrap items-center justify-between gap-2"><h3 class="h3">Your reminders <span class="hint" id="qCount"></span></h3>' +
        '<span class="flex gap-4"><button type="button" class="link" id="qRestore">Add starter quotes</button><button type="button" class="link" id="qClear">Delete all</button></span></div>' +
        '<form id="qForm" class="qadd">' +
          '<textarea id="qText" class="field" rows="2" maxlength="2000" placeholder="Write a reminder. One per line adds several at once. Or add just a picture." aria-label="New quote"></textarea>' +
          '<div class="qpic"><label class="btn btn-line btn-sm qfile">📷 Add picture<input type="file" id="qFile" accept="image/*" hidden></label>' +
            '<span id="qPrev"></span>' +
            '<select id="qWhen" class="field" style="width:auto" aria-label="When it appears">' +
              '<option value="both">Anytime</option><option value="run">While focusing</option><option value="end">At the end</option></select></div>' +
          '<div class="flex items-center justify-between gap-2"><span class="hint">Ctrl + Enter to add. A picture goes with the first line.</span><button type="submit" class="btn btn-deep btn-sm">Add</button></div>' +
        '</form>' +
        '<ul id="qUl" class="qul"></ul>' +
      '</section>' +
    '</div>';

  /* ---------- settings ---------- */
  var editing = '', pending = '';
  function renderSettings() {
    $('qOn').checked = Q.on; $('qT').checked = Q.timers; $('qW').checked = Q.watches; $('qEndOn').checked = Q.endOn;
    $('qEvery').innerHTML = EVERY.map(function (m) {
      return '<button type="button" class="chip" data-ev="' + m + '" aria-pressed="' + (Q.every === m) + '">' + m + ' min</button>';
    }).join('');
    $('qCust').value = EVERY.indexOf(Q.every) < 0 ? Q.every : '';
    pane.querySelectorAll('[data-ord]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.ord === Q.order)); });
    pane.querySelectorAll('[data-eord]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.eord === Q.endOrder)); });
  }
  $('qOn').addEventListener('change', function () { Q.on = this.checked; save(); });
  $('qT').addEventListener('change', function () { Q.timers = this.checked; save(); });
  $('qW').addEventListener('change', function () { Q.watches = this.checked; save(); });
  $('qEndOn').addEventListener('change', function () { Q.endOn = this.checked; save(); });
  $('qEvery').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ev]'); if (!b) return;
    Q.every = +b.dataset.ev; save(); renderSettings();
  });
  $('qCust').addEventListener('change', function () {
    var v = parseInt(this.value, 10);
    if (v >= 1 && v <= 240) { Q.every = v; save(); }
    renderSettings();
  });
  pane.addEventListener('click', function (e) {
    var o = e.target.closest('[data-ord]');
    if (o) { Q.order = o.dataset.ord === 'seq' ? 'seq' : 'random'; save(); renderSettings(); return; }
    o = e.target.closest('[data-eord]');
    if (o) { Q.endOrder = o.dataset.eord === 'seq' ? 'seq' : 'random'; save(); renderSettings(); }
  });
  $('qTest').addEventListener('click', function () {
    var p = pick('run');
    if (!p) { toast('Add a reminder for “While focusing” first'); return; }
    if (window.SummitAlert) SummitAlert({ title: 'Keep going', body: p.text ? '“' + p.text + '”' : '', img: p.img, kind: 'quote', nolog: true, sysForce: true });
    else toast(p.text || 'Picture reminder');
  });
  $('qTestEnd').addEventListener('click', function () {
    var p = pick('end'), d = $('qdlg');
    if (!p) { toast('Add a reminder for “At the end” first'); return; }
    if (!d) return;
    fillEnd(p);
    $('qSub').textContent = 'Preview of the end-of-session card';
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  });

  /* ---------- pictures ---------- */
  function shrink(file, cb) {
    var r = new FileReader();
    r.onerror = function () { cb(null); };
    r.onload = function () {
      var im = new Image();
      im.onerror = function () { cb(null); };
      im.onload = function () {
        var s = Math.min(1, 640 / Math.max(im.width, im.height)), c = document.createElement('canvas'), x;
        c.width = Math.max(1, Math.round(im.width * s)); c.height = Math.max(1, Math.round(im.height * s));
        x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(im, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', 0.75));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  }
  function renderPrev() {
    $('qPrev').innerHTML = pending
      ? '<span class="qprev"><img alt="Picture to add" src="' + esc(pending) + '"><button type="button" class="xb" id="qPrevX" aria-label="Remove picture">×</button></span>' : '';
  }
  $('qFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = '';
    if (!f) return;
    if (Q.list.filter(function (q) { return q.img; }).length >= MAXPIC) { toast('You can keep up to ' + MAXPIC + ' pictures. Delete a few first.'); return; }
    shrink(f, function (d) { if (!d) { toast('That file couldn’t be read as a picture'); return; } pending = d; renderPrev(); });
  });
  $('qPrev').addEventListener('click', function (e) { if (e.target.closest('#qPrevX')) { pending = ''; renderPrev(); } });

  /* ---------- the list ---------- */
  function renderList() {
    $('qCount').textContent = '(' + Q.list.length + ')';
    $('qUl').innerHTML = Q.list.length ? Q.list.map(function (q) {
      var th = q.img ? '<img class="qthumb" alt="" src="' + esc(q.img) + '">' : '';
      if (q.id === editing) {
        return '<li class="qitem editing">' + th + '<input class="field" id="qEdit" maxlength="' + MAXLEN + '" value="' + esc(q.text) + '" aria-label="Edit quote">' +
          '<span class="qbtns"><button type="button" class="link" data-qs="' + q.id + '">Save</button><button type="button" class="link" data-qc>Cancel</button></span></li>';
      }
      return '<li class="qitem">' + th + '<div class="flex-1 min-w-0">' +
        (q.text ? '<p class="qtx">“' + esc(q.text) + '”</p>' : '<p class="qtx hint">Picture only</p>') +
        '<button type="button" class="aside-b" style="margin-top:6px" data-qw="' + q.id + '" title="Tap to change when this appears">' + WHEN[q.when] + '</button></div>' +
        '<span class="qbtns"><button type="button" class="link" data-qe="' + q.id + '">Edit</button>' +
        '<button type="button" class="xb" data-qd="' + q.id + '" aria-label="Delete this reminder">×</button></span></li>';
    }).join('') : '<li class="hint">Nothing yet. Add a few above, or restore the starter set.</li>';
    if (editing) { var f = $('qEdit'); if (f) { f.focus(); f.select(); } }
  }

  $('qUl').addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-qd]'))) { Q.list = Q.list.filter(function (q) { return q.id !== b.dataset.qd; }); save(); renderList(); return; }
    if ((b = e.target.closest('[data-qe]'))) { editing = b.dataset.qe; renderList(); return; }
    if ((b = e.target.closest('[data-qw]'))) {
      Q.list.forEach(function (q) { if (q.id === b.dataset.qw) q.when = q.when === 'both' ? 'run' : q.when === 'run' ? 'end' : 'both'; });
      save(); renderList(); return;
    }
    if (e.target.closest('[data-qc]')) { editing = ''; renderList(); return; }
    if ((b = e.target.closest('[data-qs]'))) saveEdit(b.dataset.qs);
  });
  $('qUl').addEventListener('keydown', function (e) {
    if (e.target.id !== 'qEdit') return;
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(editing); }
    if (e.key === 'Escape') { editing = ''; renderList(); }
  });
  function saveEdit(id) {
    var v = ($('qEdit') ? $('qEdit').value : '').trim(), item = Q.list.filter(function (q) { return q.id === id; })[0];
    if (!item) return;
    if (!v && !item.img) { toast('A reminder can’t be empty'); return; }
    item.text = v.slice(0, MAXLEN);
    editing = ''; save(); renderList();
  }

  function addQuotes() {
    var lines = $('qText').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!lines.length && !pending) { toast('Write something or add a picture first'); return; }
    var room = MAX - Q.list.length;
    if (room <= 0) { toast('You’ve reached ' + MAX + ' reminders. Delete a few to add more.'); return; }
    var when = $('qWhen').value, before = Q.list.slice(), add = [];
    if (!lines.length) add.push({ id: uid(), text: '', img: pending, when: when });
    else lines.slice(0, room).forEach(function (t, i) { add.push({ id: uid(), text: t.slice(0, MAXLEN), img: i === 0 ? pending : '', when: when }); });
    add.slice().reverse().forEach(function (x) { Q.list.unshift(x); });
    if (!save()) { Q.list = before; renderList(); return; }
    $('qText').value = ''; pending = ''; renderPrev(); renderList();
    toast(add.length === 1 ? 'Added' : add.length + ' added' + (lines.length > room ? ' (the rest didn’t fit)' : ''));
  }
  $('qForm').addEventListener('submit', function (e) { e.preventDefault(); addQuotes(); });
  $('qText').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addQuotes(); } });

  $('qRestore').addEventListener('click', function () {
    var have = {}; Q.list.forEach(function (q) { have[q.text] = 1; });
    var add = starter().filter(function (q) { return !have[q.text]; }).slice(0, Math.max(0, MAX - Q.list.length));
    Q.list = Q.list.concat(add); save(); renderList();
    toast(add.length ? add.length + ' starter quotes added' : 'The starter quotes are already there');
  });
  $('qClear').addEventListener('click', function () {
    if (!Q.list.length) return;
    if (!confirm('Delete all ' + Q.list.length + ' reminders, pictures included?')) return;
    Q.list = []; save(); renderList();
  });

  renderSettings(); renderList();
})();