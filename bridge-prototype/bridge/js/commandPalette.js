/* Bridge — command palette (⌘K).
   Single overlay portal. Inject once per page; opens on ⌘K / Ctrl+K, esc to close.
   Commands cover navigation, vessel jumps, theme switching, and quick actions.
   No deps — vanilla, ~6kb. */
(function () {
  'use strict';
  if (window.__bridgeCmdK) return;
  window.__bridgeCmdK = true;

  // --- Data --------------------------------------------------------------

  var VESSELS = [
    { id: 'bridge',       label: 'bridge',       path: '~/code/bridge',       state: 'running'  },
    { id: 'open-design',  label: 'open-design',  path: '~/code/open-design',  state: 'running'  },
    { id: 'lighthouse',   label: 'lighthouse',   path: '~/code/lighthouse',   state: 'warning'  },
    { id: 'pi-runtime',   label: 'pi-runtime',   path: '~/code/pi-runtime',   state: 'error'    },
    { id: 'dialysispal',  label: 'dialysisPal',  path: '~/code/dialysisPal',  state: 'idle'     },
    { id: 'fleet-charts', label: 'fleet-charts', path: '~/code/fleet-charts', state: 'idle'     }
  ];

  var ICONS = {
    fleet:   '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 13l2-6 4-3 4 3 2 6z"/><circle cx="8" cy="9" r="1.5"/></svg>',
    log:     '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M5 5h6M5 8h6M5 11h4"/></svg>',
    charts:  '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 13h12M4 11V7M7 11V4M10 11V8M13 11V6"/></svg>',
    helm:    '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="6"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></svg>',
    sail:    '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 13h12M4 13l3-9 4 9"/></svg>',
    play:    '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 3l8 5-8 5z"/></svg>',
    stop:    '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="8" height="8" rx="1"/></svg>',
    theme:   '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5"/><path d="M8 3v10M3 8h10"/></svg>',
    accent:  '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>',
    density: '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12M2 8h12M2 12h12"/></svg>',
    vessel:  '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 11l2-4 4-2 4 2 2 4z"/></svg>',
    search:  '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg>',
    docs:    '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2h8l2 2v10H3z"/><path d="M11 2v3h2"/></svg>'
  };

  function go(href) { window.location.href = href; }
  function path() { return (window.location.pathname.split('/').pop() || 'index.html'); }

  function buildCommands() {
    var here = path();
    var nav = [
      { id: 'go-fleet', group: 'Navigate', icon: ICONS.fleet,
        title: 'Go to Fleet',        hint: '⌘1',
        match: 'fleet dashboard vessel',
        disabled: here === 'dashboard.html',
        run: function () { go('dashboard.html'); } },
      { id: 'go-log',   group: 'Navigate', icon: ICONS.log,
        title: "Go to Captain's Log", hint: '⌘2',
        match: 'log captains history events',
        disabled: here === 'captains-log.html',
        run: function () { go('captains-log.html'); } },
      { id: 'go-charts', group: 'Navigate', icon: ICONS.charts,
        title: 'Go to Fleet Charts', hint: '⌘3',
        match: 'charts analytics graph spend',
        disabled: here === 'charts.html',
        run: function () { go('charts.html'); } },
      { id: 'go-helm',  group: 'Navigate', icon: ICONS.helm,
        title: 'Go to Helm',         hint: '⌘,',
        match: 'helm settings prefs config',
        disabled: here === 'helm.html',
        run: function () { go('helm.html'); } },
      { id: 'go-welcome', group: 'Navigate', icon: ICONS.docs,
        title: 'Go to Welcome',      hint: '',
        match: 'welcome launcher home index',
        disabled: here === 'index.html' || here === '',
        run: function () { go('index.html'); } }
    ];

    var actions = [
      { id: 'act-sail',    group: 'Action', icon: ICONS.sail,
        title: 'Set Sail (commit current vessel)', hint: '⌘⇧↵',
        match: 'set sail commit push',
        run: function () { go('dashboard.html#sail'); } },
      { id: 'act-launch',  group: 'Action', icon: ICONS.play,
        title: 'Launch Pi session', hint: '⌘N',
        match: 'launch new pi session start',
        run: function () { go('dashboard.html#launch'); } },
      { id: 'act-stop',    group: 'Action', icon: ICONS.stop,
        title: 'Stop current Pi session', hint: '⌘.',
        match: 'stop halt cancel kill',
        run: function () { go('dashboard.html#stop'); } }
    ];

    var theme = [
      { id: 'theme-dark',   group: 'Theme', icon: ICONS.theme,
        title: 'Theme · Dark',   hint: '',
        match: 'theme dark night abyss',
        run: function () { window.BridgeTheme && window.BridgeTheme.set('dark'); } },
      { id: 'theme-light',  group: 'Theme', icon: ICONS.theme,
        title: 'Theme · Light',  hint: '',
        match: 'theme light day paper',
        run: function () { window.BridgeTheme && window.BridgeTheme.set('light'); } },
      { id: 'theme-system', group: 'Theme', icon: ICONS.theme,
        title: 'Theme · Match system',  hint: '',
        match: 'theme system auto os',
        run: function () { window.BridgeTheme && window.BridgeTheme.set('system'); } }
    ];

    var accentNow = (window.BridgeAccent && window.BridgeAccent.get()) || 'glow';
    var accent = (window.BridgeAccent ? window.BridgeAccent.options : []).map(function (name) {
      var label = window.BridgeAccent.labels[name] || name;
      return {
        id: 'accent-' + name,
        group: 'Accent',
        icon: ICONS.accent,
        title: 'Accent · ' + label,
        hint:  name === accentNow ? 'current' : '',
        disabled: name === accentNow,
        match: 'accent color glow ' + name + ' ' + label,
        run: function () { window.BridgeAccent && window.BridgeAccent.set(name); }
      };
    });

    var densityNow = (window.BridgeDensity && window.BridgeDensity.get()) || 'default';
    var density = (window.BridgeDensity ? window.BridgeDensity.options : []).map(function (name) {
      var label = window.BridgeDensity.labels[name] || name;
      return {
        id: 'density-' + name,
        group: 'Density',
        icon: ICONS.density,
        title: 'Density · ' + label,
        hint:  name === densityNow ? 'current' : '',
        disabled: name === densityNow,
        match: 'density spacing scale ' + name,
        run: function () { window.BridgeDensity && window.BridgeDensity.set(name); }
      };
    });

    var vessels = VESSELS.map(function (v) {
      return {
        id: 'vsl-' + v.id,
        group: 'Vessel',
        icon: ICONS.vessel,
        title: v.label,
        sub:   v.path,
        hint:  v.state,
        match: 'vessel ' + v.id + ' ' + v.label + ' ' + v.path,
        run: function () { go('dashboard.html?vessel=' + v.id); }
      };
    });

    return nav.concat(actions).concat(theme).concat(vessels);
  }

  // --- DOM ---------------------------------------------------------------

  var veil, input, list, footerCount;
  var commands = [];
  var visible = [];
  var sel = 0;

  function mount() {
    veil = document.createElement('div');
    veil.className = 'cmdk-veil';
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-modal', 'true');
    veil.setAttribute('aria-label', 'Command palette');
    veil.innerHTML =
      '<div class="cmdk">' +
        '<div class="cmdk__search">' +
          ICONS.search +
          '<input type="text" placeholder="Set a course… (vessels, screens, theme)" autocomplete="off" spellcheck="false" />' +
          '<span class="cmdk__kbd">esc</span>' +
        '</div>' +
        '<div class="cmdk__list" role="listbox"></div>' +
        '<div class="cmdk__footer">' +
          '<span class="cmdk__hint" data-count>0 commands</span>' +
          '<span class="kbds">' +
            '<span>↑↓ navigate</span>' +
            '<span>↵ run</span>' +
            '<span>esc close</span>' +
          '</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(veil);
    input = veil.querySelector('input');
    list = veil.querySelector('.cmdk__list');
    footerCount = veil.querySelector('[data-count]');

    veil.addEventListener('click', function (e) {
      if (e.target === veil) close();
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', onKey);
  }

  function render() {
    var q = (input.value || '').trim().toLowerCase();
    visible = commands.filter(function (c) {
      if (c.disabled) return false;
      if (!q) return true;
      var hay = (c.title + ' ' + (c.sub || '') + ' ' + (c.match || '')).toLowerCase();
      return q.split(/\s+/).every(function (tok) { return hay.indexOf(tok) !== -1; });
    });
    if (sel >= visible.length) sel = Math.max(0, visible.length - 1);

    if (!visible.length) {
      list.innerHTML = '<div class="cmdk__empty">No commands match "' + escapeHTML(q) + '"</div>';
      footerCount.textContent = '0 commands';
      return;
    }

    var html = '';
    var lastGroup = null;
    visible.forEach(function (c, i) {
      if (c.group !== lastGroup) {
        html += '<div class="cmdk__group">' + c.group + '</div>';
        lastGroup = c.group;
      }
      html +=
        '<div class="cmdk__item" role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '">' +
          c.icon +
          '<span class="lbl">' +
            '<b>' + escapeHTML(c.title) + '</b>' +
            (c.sub ? '<small>' + escapeHTML(c.sub) + '</small>' : '') +
          '</span>' +
          (c.hint ? '<span class="cmdk__hint">' + escapeHTML(c.hint) + '</span>' : '<span></span>') +
        '</div>';
    });
    list.innerHTML = html;
    footerCount.textContent = visible.length + (visible.length === 1 ? ' command' : ' commands');

    Array.prototype.forEach.call(list.querySelectorAll('.cmdk__item'), function (el) {
      el.addEventListener('mouseenter', function () { setSel(parseInt(el.dataset.i, 10)); });
      el.addEventListener('click', function () { setSel(parseInt(el.dataset.i, 10)); runSel(); });
    });
    scrollSelIntoView();
  }

  function setSel(i) {
    sel = Math.max(0, Math.min(visible.length - 1, i));
    Array.prototype.forEach.call(list.querySelectorAll('.cmdk__item'), function (el) {
      el.setAttribute('aria-selected', parseInt(el.dataset.i, 10) === sel ? 'true' : 'false');
    });
    scrollSelIntoView();
  }

  function scrollSelIntoView() {
    var el = list.querySelector('.cmdk__item[aria-selected="true"]');
    if (!el) return;
    var r = el.getBoundingClientRect();
    var pr = list.getBoundingClientRect();
    if (r.top < pr.top) list.scrollTop -= (pr.top - r.top) + 4;
    else if (r.bottom > pr.bottom) list.scrollTop += (r.bottom - pr.bottom) + 4;
  }

  function runSel() {
    var c = visible[sel];
    if (!c) return;
    close();
    // give the close anim a beat so the navigation feels intentional
    setTimeout(function () { try { c.run(); } catch (e) { console.error(e); } }, 80);
  }

  function onKey(e) {
    if (e.key === 'Escape')          { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); setSel(sel + 1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); setSel(sel - 1); }
    else if (e.key === 'Enter')      { e.preventDefault(); runSel(); }
  }

  function open() {
    if (!veil) mount();
    commands = buildCommands();
    input.value = '';
    sel = 0;
    render();
    veil.classList.add('open');
    requestAnimationFrame(function () { input.focus(); });
  }

  function close() {
    if (!veil) return;
    veil.classList.remove('open');
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // --- Bind global shortcut ----------------------------------------------

  document.addEventListener('keydown', function (e) {
    // ⌘K / Ctrl+K
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (veil && veil.classList.contains('open')) close(); else open();
    }
  });

  window.BridgePalette = { open: open, close: close };
})();
