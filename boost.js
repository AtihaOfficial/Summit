(function () {
  'use strict';

  /* Study boost: a song, rhythm or dua from any link (YouTube, Spotify, Facebook, Pinterest, a direct audio file…), shown inside the window, OR a file on your device.
     Plays before a session starts, and again with the "You did it" card after you save one.
     Files stay in this browser (IndexedDB). Settings card sits at the top of the Quotes tab. */

  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'peaks.boost', SLOTS = ['before', 'after'];

  /* ---------- settings ---------- */
  var cfg = (function () {
    var o = { on: true, vol: 0.8, url: { before: '', after: '' }, text: { before: '', after: '' } };
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') {
        o.on = s.on !== false;
        var v = +s.vol; if (v >= 0 && v <= 1) o.vol = v;
        SLOTS.forEach(function (k) {
          if (s.url && typeof s.url[k] === 'string') o.url[k] = s.url[k].slice(0, 300);
          if (s.text && typeof s.text[k] === 'string') o.text[k] = s.text[k].slice(0, 140);
        });
      }
    } catch (e) {}
    return o;
  })();
  function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
  function toast(msg) {
    var box = $('toast'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }

  /* ---------- audio files in IndexedDB ---------- */
  var dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      try {
        var r = indexedDB.open('peaks-boost', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('f'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('f', mode), rq = fn(t.objectStore('f'));
        t.oncomplete = function () { res(rq && rq.result); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  function getF(k) { return tx('readonly', function (s) { return s.get(k); }).catch(function () { return null; }); }
  function putF(k, v) { return tx('readwrite', function (s) { return s.put(v, k); }); }
  function delF(k) { return tx('readwrite', function (s) { return s['delete'](k); }).catch(function () {}); }

  var have = { before: '', after: '' };                          // chosen file names ('' = none)
  function loadNames() {
    return Promise.all(SLOTS.map(function (k) {
      return getF(k).then(function (r) { have[k] = r && r.blob ? (r.name || 'Audio file') : ''; });
    })).then(function () { updateLinks(); if (typeof fillCard === 'function') fillCard(); });
  }

  /* ---------- what to play: a file if one is chosen, else the YouTube link ---------- */
  function parseYT(s) {
    s = String(s || '').trim(); if (!s) return null;
    var u, m, id = '', start = 0, t;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
    var h = u.hostname.replace(/^(www|m|music)\./, '');
    if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else if ((m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/))) id = m[2];
    } else return null;
    if (!/^[\w-]{11}$/.test(id)) return null;
    t = u.searchParams.get('t') || u.searchParams.get('start') || '';
    if (/^\d+$/.test(t)) start = +t;
    else if (t && (m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/))) start = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    return { id: id, start: start };
  }
  // any link: YouTube, Spotify, SoundCloud, Vimeo, Facebook, Instagram, TikTok, Pinterest, a direct audio/video file, or any other page
  function parseLink(s) {
    s = String(s || '').trim(); if (!s) return null;
    var y = parseYT(s); if (y) { y.t = 'yt'; return y; }
    var u, m;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.indexOf('.') < 0) return null;
    var h = u.hostname.replace(/^(www|m|web|open|mobile)\./, ''), p = u.pathname, q = encodeURIComponent(u.href);
    if (/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(p)) return { t: 'media', url: u.href, video: false };
    if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(p)) return { t: 'media', url: u.href, video: true };
    if (h === 'spotify.com' && (m = p.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/)))
      return { t: 'frame', src: 'https://open.spotify.com/embed/' + m[1] + '/' + m[2], h: (m[1] === 'track' || m[1] === 'episode') ? 152 : 352 };
    if (h === 'soundcloud.com' && p.length > 1) return { t: 'frame', src: 'https://w.soundcloud.com/player/?auto_play=true&url=' + q, h: 166 };
    if (h === 'vimeo.com' && (m = p.match(/^\/(\d+)/))) return { t: 'frame', src: 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1' };
    if ((h === 'facebook.com' && /\/(videos?|watch|reel|reels)\b/.test(p + u.search)) || h === 'fb.watch')
      return { t: 'frame', src: 'https://www.facebook.com/plugins/video.php?show_text=false&autoplay=true&href=' + q };
    if (h === 'instagram.com' && (m = p.match(/^\/(p|reel|tv)\/([\w-]+)/))) return { t: 'frame', src: 'https://www.instagram.com/' + m[1] + '/' + m[2] + '/embed', h: 480 };
    if (h === 'tiktok.com' && (m = p.match(/\/video\/(\d+)/))) return { t: 'frame', src: 'https://www.tiktok.com/embed/v2/' + m[1], h: 480 };
    if (/(^|\.)pinterest\.[a-z.]+$/.test(h) && (m = p.match(/\/pin\/(\d+)/))) return { t: 'frame', src: 'https://assets.pinterest.com/ext/embed.html?id=' + m[1], h: 420 };
    if ((h === 'x.com' || h === 'twitter.com') && (m = p.match(/\/status\/(\d+)/))) return { t: 'frame', src: 'https://platform.twitter.com/embed/Tweet.html?id=' + m[1], h: 480 };
    if (h === 'dailymotion.com' && (m = p.match(/\/video\/(\w+)/))) return { t: 'frame', src: 'https://www.dailymotion.com/embed/video/' + m[1] + '?autoplay=1' };
    if (h === 'drive.google.com' && (m = p.match(/\/file\/d\/([\w-]+)/))) return { t: 'frame', src: 'https://drive.google.com/file/d/' + m[1] + '/preview', h: 300 };
    if (h === 'music.apple.com') return { t: 'frame', src: 'https://embed.music.apple.com' + p + u.search, h: /\/song\/|[?&]i=/.test(p + u.search) ? 175 : 450 };
    return { t: 'page', url: u.href, host: h };                  // any other link is tried inside the window, never in a new tab
  }
  function link(k) { return parseLink(cfg.url[k]); }
  function autoEnd(src) { return !!(src && (src.blob || src.t === 'yt' || src.t === 'media')); }   // can we tell when it finishes?
  function boxClass(src) { return src.blob || src.t === 'media' ? ' aud' : ''; }
  function hasSrc(k) { return !!(have[k] || link(k)); }
  function getSrc(k) {
    if (have[k]) return getF(k).then(function (r) { return r && r.blob ? { blob: r.blob, name: r.name } : (link(k) || null); });
    return Promise.resolve(link(k));
  }

  /* ---------- players ---------- */
  var apiState = 0, apiQ = [];                                   // 0 not loaded, 1 loading, 2 ready, 3 failed
  function flushApi(ok) { apiState = ok ? 2 : 3; var q = apiQ; apiQ = []; q.forEach(function (f) { f(ok); }); }
  function loadApi(cb) {
    if (window.YT && window.YT.Player) { cb(true); return; }
    if (apiState === 3) { cb(false); return; }
    apiQ.push(cb);
    if (apiState === 1) return;
    apiState = 1;
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (typeof prev === 'function') prev(); flushApi(true); };
    var sc = document.createElement('script');
    sc.src = 'https://www.youtube.com/iframe_api';
    sc.onerror = function () { flushApi(false); };
    document.head.appendChild(sc);
  }
  function mountYT(host, lk, onEnd, onFail) {
    var holder = document.createElement('div'), dead = false, p = null;
    host.appendChild(holder);
    loadApi(function (ok) {
      if (dead) return;
      if (!ok) { if (onFail) onFail('load'); return; }
      try {
        p = new window.YT.Player(holder, {
          width: '100%', height: '100%', videoId: lk.id,
          playerVars: { autoplay: 1, rel: 0, playsinline: 1, start: lk.start || 0 },
          events: {
            onReady: function (e) { try { e.target.setVolume(Math.round(cfg.vol * 100)); e.target.playVideo(); } catch (x) {} },
            onStateChange: function (e) { if (e.data === 0 && !dead && onEnd) onEnd(); },
            onError: function (e) { if (!dead && onFail) onFail(e.data); }
          }
        });
      } catch (x) { if (onFail) onFail('init'); }
    });
    return {
      destroy: function () { dead = true; try { if (p && p.destroy) p.destroy(); } catch (x) {} if (holder.parentNode) holder.parentNode.removeChild(holder); },
      volume: function (v) { try { if (p && p.setVolume) p.setVolume(v); } catch (x) {} }
    };
  }
  function mountFile(host, src, onEnd, onFail) {
    var url = URL.createObjectURL(src.blob), a = document.createElement('audio'), dead = false;
    a.className = 'boost-audio'; a.controls = true; a.src = url; a.volume = cfg.vol;
    a.onended = function () { if (!dead && onEnd) onEnd(); };
    a.onerror = function () { if (!dead && onFail) onFail('file'); };
    host.appendChild(a);
    var pr = a.play(); if (pr && pr.catch) pr.catch(function () {});     // blocked: the controls let you press play
    return {
      destroy: function () { dead = true; a.pause(); a.removeAttribute('src'); try { a.load(); } catch (x) {} if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); },
      volume: function (v) { a.volume = v / 100; }
    };
  }
  function mountFrame(host, src) {
    var f = document.createElement('iframe');
    f.src = src.src; f.title = 'Study boost'; f.setAttribute('allowfullscreen', '');
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    if (src.h) { host.style.aspectRatio = 'auto'; host.style.minHeight = '0'; host.style.height = src.h + 'px'; }
    host.appendChild(f);
    return { destroy: function () { if (f.parentNode) f.parentNode.removeChild(f); }, volume: function () {} };
  }
  function mountMedia(host, src, onEnd, onFail) {
    var a = document.createElement(src.video ? 'video' : 'audio'), dead = false;
    a.className = 'boost-audio'; a.controls = true; a.src = src.url; a.volume = cfg.vol; a.setAttribute('playsinline', '');
    a.onended = function () { if (!dead && onEnd) onEnd(); };
    a.onerror = function () { if (!dead && onFail) onFail('media'); };
    host.appendChild(a);
    var pr = a.play(); if (pr && pr.catch) pr.catch(function () {});
    return { destroy: function () { dead = true; a.pause(); a.removeAttribute('src'); try { a.load(); } catch (x) {} if (a.parentNode) a.parentNode.removeChild(a); }, volume: function (v) { a.volume = v / 100; } };
  }
  function mountPage(host, src) {
    var f = document.createElement('iframe');
    f.src = src.url; f.title = 'Study boost'; f.referrerPolicy = 'no-referrer';
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms');   // no pop-ups, no new tabs
    f.allow = 'autoplay; encrypted-media; fullscreen';
    host.style.aspectRatio = 'auto'; host.style.minHeight = '0';
    host.style.height = Math.round(Math.min(440, window.innerHeight * 0.5)) + 'px';
    host.appendChild(f);
    return { destroy: function () { if (f.parentNode) f.parentNode.removeChild(f); }, volume: function () {} };
  }
  function mountPlayer(host, src, onEnd, onFail) {
    if (src.blob) return mountFile(host, src, onEnd, onFail);
    if (src.t === 'yt') return mountYT(host, src, onEnd, onFail);
    if (src.t === 'frame') return mountFrame(host, src);
    if (src.t === 'media') return mountMedia(host, src, onEnd, onFail);
    return mountPage(host, src);
  }

  /* ---------- the card that holds the player (before Start, and previews) ---------- */
  var ov = null, ovPl = null;
  function closeOv() {
    if (ovPl) { ovPl.destroy(); ovPl = null; }
    if (ov) { ov.remove(); ov = null; }
  }
  function showOv(o) {                                           // o: text, sub, src, goLabel, cancelLabel, go, cancel, onEnd, onFail
    closeOv();
    ov = document.createElement('div');
    ov.className = 'boost-ov';
    ov.innerHTML =
      '<div class="boost-card" role="dialog" aria-modal="true" aria-label="Study boost">' +
        '<div class="boost-vid' + boxClass(o.src) + '"></div><p class="boost-t"></p><p class="boost-s"></p>' +
        '<div class="boost-btns">' +
          (o.goLabel ? '<button type="button" class="btn btn-soft" data-bo="go">' + o.goLabel + '</button>' : '') +
          '<button type="button" class="btn btn-line" data-bo="cancel">' + (o.cancelLabel || 'Cancel') + '</button></div></div>';
    ov.querySelector('.boost-t').textContent = o.text || 'Take a breath. You’ve got this.';
    ov.querySelector('.boost-s').textContent = o.sub || '';
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('[data-bo]'); if (!b) return;
      if (b.dataset.bo === 'go' && o.go) o.go(); else if (o.cancel) o.cancel();
    });
    document.body.appendChild(ov);
    ovPl = mountPlayer(ov.querySelector('.boost-vid'), o.src, o.onEnd, o.onFail);
    var f = ov.querySelector('[data-bo="go"]') || ov.querySelector('[data-bo="cancel"]'); if (f) f.focus();
  }

  /* ---------- before Start: play, then start the session ---------- */
  var bypass = false, introBusy = false;
  function runIntro(btn) {
    if (ov || introBusy) return;
    introBusy = true;
    var done = false;
    function finish(startIt) {
      if (done) return; done = true; introBusy = false; closeOv();
      if (startIt) { bypass = true; try { btn.click(); } finally { bypass = false; } }
    }
    getSrc('before').then(function (src) {
      if (!src) { finish(true); return; }
      showOv({
        text: cfg.text.before,
        sub: autoEnd(src) ? 'Your session starts when it ends. Press play if it does not start by itself.'
                          : src.t === 'page' ? 'If this stays blank, the site does not allow being shown here. Tap Start now when you are ready.' : 'Press play, then tap Start now when you are ready.',
        src: src, goLabel: 'Start now', cancelLabel: 'Cancel',
        go: function () { finish(true); }, cancel: function () { finish(false); },
        onEnd: function () { finish(true); },
        onFail: function () { toast('That could not be played, so your session started.'); finish(true); }
      });
    });
  }
  document.addEventListener('click', function (e) {
    if (bypass) return;
    var b = e.target.closest && e.target.closest('#fpToggle,#tfToggle');
    if (!b || !cfg.on || !hasSrc('before')) return;
    if (b.textContent.trim() !== 'Start') return;                // Pause and Resume are left alone
    e.preventDefault(); e.stopImmediatePropagation();
    runIntro(b);
  }, true);

  /* ---------- after saving: "You did it" + the second track ---------- */
  var qd = $('qdlg'), wasOpen = false, afterPl = null, afterWrap = null;
  function stopAfter() {
    if (afterPl) { afterPl.destroy(); afterPl = null; }
    if (afterWrap) afterWrap.hidden = true;
  }
  function headline() {
    var sub = $('qSub'); if (!sub) return;
    var p = qd.querySelector('.boost-did');
    if (!p) { p = document.createElement('p'); p.className = 'boost-did serif'; sub.insertAdjacentElement('beforebegin', p); }
    p.textContent = cfg.text.after || 'You did it!';
    p.hidden = !cfg.on;
  }
  function playAfter() {
    if (!cfg.on || !hasSrc('after')) return;
    var close = $('qClose'); if (!close) return;
    getSrc('after').then(function (src) {
      if (!src || !wasOpen) return;
      if (!afterWrap) { afterWrap = document.createElement('div'); close.insertAdjacentElement('beforebegin', afterWrap); }
      afterWrap.removeAttribute('style');
      afterWrap.className = 'boost-ytwrap' + boxClass(src);
      afterWrap.hidden = false;
      afterPl = mountPlayer(afterWrap, src, null, function () { stopAfter(); });
    });
  }
  if (qd) {
    new MutationObserver(function () {
      var open = qd.open || qd.hasAttribute('open');
      if (open && !wasOpen) { wasOpen = true; headline(); stopAfter(); playAfter(); }
      else if (!open && wasOpen) { wasOpen = false; stopAfter(); }
    }).observe(qd, { attributes: true, attributeFilter: ['open'] });
  }

  /* ---------- the settings card lives in the Quotes tab ---------- */
  function slot(k, title, ph) {
    return '<div class="boost-slot" data-slot="' + k + '"><p class="lbl" style="margin-top:0">' + title + '</p>' +
      '<input type="url" class="field" data-url inputmode="url" autocomplete="off" maxlength="300" placeholder="Paste any link (YouTube, Spotify, Facebook, Pinterest…)" aria-label="' + title + ': YouTube link">' +
      '<input class="field" maxlength="140" data-text placeholder="' + ph + '" aria-label="' + title + ': line to show">' +
      '<div class="boost-row"><span class="boost-file" data-st></span>' +
      '<span class="boost-acts"><label class="btn btn-line btn-sm">Choose file<input type="file" accept="audio/*" hidden data-pick></label>' +
      '<button type="button" class="btn btn-line btn-sm" data-test>▶ Preview</button>' +
      '<button type="button" class="btn btn-line btn-sm" data-rm>Clear</button></span></div></div>';
  }
  var qpane = document.querySelector('#pane-quotes .qpane');
  var card = document.createElement('section');
  card.id = 'boostCard'; card.className = 'card qset';
  card.innerHTML =
    '<h3 class="h3">Study boost</h3>' +
    '<div class="set"><div class="set-t"><b>Play my boost</b></div>' +
      '<div class="set-c"><label class="tg"><input type="checkbox" id="bsOn" aria-label="Play my boost"><i></i></label></div></div>' +
    slot('before', 'Before you start', 'Line to show (optional)') +
    slot('after', 'After you finish', 'Line to show (default: You did it!)') +
    '<label class="lbl" for="bsVol">Volume</label><input id="bsVol" type="range" min="0" max="100" step="5" style="width:100%">' +
    '<p class="hint" id="bsMsg"></p>';
  if (qpane && qpane.firstElementChild) qpane.insertBefore(card, qpane.firstElementChild.nextSibling);   // row 1: settings | boost

  function stText(k) {
    if (have[k]) return '🎵 ' + have[k];
    var v = cfg.url[k].trim(); if (!v) return '';
    var l = parseLink(v);
    if (!l) return 'That does not look like a link.';
    if (l.t === 'page') return '✓ Link added. It shows here if the site allows it.';
    return l.t === 'media' ? '✓ ' + (l.video ? 'Video' : 'Audio') + ' file link' : '✓ Player found';
  }
  function paintSlot(k) {
    var s = card.querySelector('[data-slot="' + k + '"]');
    s.querySelector('[data-st]').textContent = stText(k);
    s.querySelector('[data-test]').style.display = hasSrc(k) ? '' : 'none';
    s.querySelector('[data-rm]').style.display = (have[k] || cfg.url[k]) ? '' : 'none';
    return s;
  }
  function fillCard() {
    $('bsOn').checked = cfg.on;
    $('bsVol').value = Math.round(cfg.vol * 100);
    SLOTS.forEach(function (k) {
      var s = paintSlot(k);
      var u = s.querySelector('[data-url]'); if (document.activeElement !== u) u.value = cfg.url[k];
      var t = s.querySelector('[data-text]'); if (document.activeElement !== t) t.value = cfg.text[k];
    });
    $('bsMsg').textContent = location.protocol === 'file:' ? 'Open the site with Live Server so embedded players can play.' : '';
  }
  card.addEventListener('click', function (e) {
    var s = e.target.closest('[data-slot]'); if (!s) return;
    var k = s.dataset.slot;
    if (e.target.closest('[data-test]')) {
      getSrc(k).then(function (src) {
        if (!src) return;
        function shut() { closeOv(); }
        showOv({
          text: cfg.text[k] || (k === 'before' ? 'Take a breath. You’ve got this.' : 'You did it!'), sub: 'Preview', src: src, cancelLabel: 'Close',
          cancel: shut, onFail: function () { shut(); toast('That could not be played here. Try another.'); }
        });
      });
    } else if (e.target.closest('[data-rm]')) {
      cfg.url[k] = ''; saveCfg(); delF(k).then(loadNames);
    }
  });
  card.addEventListener('change', function (e) {
    if (e.target.id === 'bsOn') { cfg.on = e.target.checked; saveCfg(); updateLinks(); return; }
    if (!e.target.matches('[data-pick]')) return;
    var f = e.target.files && e.target.files[0], k = e.target.closest('[data-slot]').dataset.slot;
    e.target.value = '';
    if (!f) return;
    if (f.type && f.type.indexOf('audio') !== 0) { toast('Pick an audio file (mp3, m4a, wav or ogg).'); return; }
    if (f.size > 60 * 1024 * 1024) { toast('That file is over 60 MB. Pick a shorter one.'); return; }
    putF(k, { name: f.name, type: f.type, blob: f })
      .then(function () { cfg.url[k] = ''; saveCfg(); var u = card.querySelector('[data-slot="' + k + '"] [data-url]'); if (u) u.value = ''; return loadNames(); })
      .catch(function () { toast('This browser could not save the file.'); });
  });
  card.addEventListener('input', function (e) {
    if (e.target.id === 'bsVol') { cfg.vol = e.target.value / 100; if (ovPl) ovPl.volume(e.target.value); if (afterPl) afterPl.volume(e.target.value); saveCfg(); return; }
    var k = e.target.closest('[data-slot]'); k = k && k.dataset.slot; if (!k) return;
    if (e.target.matches('[data-url]')) {
      cfg.url[k] = e.target.value.trim().slice(0, 300); saveCfg();
      if (cfg.url[k] && have[k]) { delF(k).then(loadNames); return; }      // a typed link replaces the chosen file
      paintSlot(k); updateLinks();
    } else if (e.target.matches('[data-text]')) { cfg.text[k] = e.target.value.slice(0, 140); saveCfg(); }
  });

  /* ---------- the small link under each session card jumps to the card ---------- */
  var links = [];
  ['fpStatus', 'tfStatus'].forEach(function (id) {
    var st = $(id); if (!st) return;
    st.insertAdjacentHTML('beforebegin', '<p class="boost-linkrow"><button type="button" class="link" data-go="quotes" data-boost>🎵 Study boost</button></p>');
    links.push(st.previousElementSibling.firstChild);
  });
  function updateLinks() {
    var on = cfg.on && (hasSrc('before') || hasSrc('after'));
    links.forEach(function (b) { b.textContent = '🎵 Study boost' + (on ? ' · On' : ' · Off'); });
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-boost]')) setTimeout(function () { card.scrollIntoView({ block: 'start' }); }, 60);
  });

  fillCard();
  updateLinks();
  loadNames();
})();