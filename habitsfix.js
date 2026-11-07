(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var pane = $('pane-habits'), list = $('list'), focus = $('focus');
  if (!pane || !list || !focus) return;

  /* ---------- one tidy left column, Focus card on the right ---------- */
  var cols = pane.querySelector('.cols2');
  var stack = pane.querySelector('.stack');
  var bench = $('avg') ? $('avg').closest('section') : null;
  var week = $('weekChart') ? $('weekChart').closest('section') : null;

  if (cols && stack && bench && week && list.parentNode === cols && !cols.querySelector('.hmain')) {
    var main = document.createElement('div');
    main.className = 'hmain';
    cols.insertBefore(main, list);
    main.appendChild(list);
    bench.classList.add('hextra');
    week.classList.add('hextra');
    main.appendChild(week);
    main.appendChild(bench);
    cols.appendChild(focus);
    stack.remove();
  }

  /* ---------- only ONE add-habit button at any time ---------- */
  var headBtn = pane.querySelector('.pane-head .js-add');
  var IDEAS = ['Read 20 pages', 'Walk for 30 minutes', 'Drink 2 liters of water', 'Plan tomorrow', 'Stretch for 10 minutes', 'Sleep before 11 PM'];
  var EMPTY =
    '<li class="hempty card"><div class="hempty-ic" aria-hidden="true">⛰️</div><div>' +
    '<h3 class="serif">No habits yet</h3>' +
    '<p>A habit is one small thing you repeat every day. Start with one, then build from there.</p>' +
    '<button type="button" class="btn btn-deep js-add">+ Add your first habit</button>' +
    '<p class="hint">Or start from an idea:</p><div class="hempty-chips">' +
    IDEAS.map(function (t) { return '<button type="button" class="chip" data-suggest="' + t + '">' + t + '</button>'; }).join('') +
    '</div></div></li>';

  function sync() {
    var has = !!list.querySelector('.habit');
    pane.classList.toggle('is-empty', !has);
    if (headBtn) headBtn.style.display = has ? '' : 'none';      // the empty card has its own button
    if (!has && !list.querySelector('.hempty')) list.innerHTML = EMPTY;
  }
  new MutationObserver(sync).observe(list, { childList: true });
  sync();

  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-suggest]'); if (!b) return;
    var add = list.querySelector('.hempty .js-add') || headBtn;
    if (add) add.click();
    var t = $('dTitle');
    if (t) { t.value = b.dataset.suggest; t.focus(); t.select(); }
  });
})();