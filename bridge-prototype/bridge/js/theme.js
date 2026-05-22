/* Bridge — theme bootstrap.
   Inline-loadable, applies data-theme BEFORE first paint to prevent a dark→light flash.
   Stores user choice in localStorage as 'dark' | 'light' | 'system'.
   Exposes window.BridgeTheme for the Helm settings + command palette to use. */
(function () {
  'use strict';
  var KEY = 'bridge-theme';
  var media = window.matchMedia('(prefers-color-scheme: light)');

  function resolve(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    return media.matches ? 'light' : 'dark';
  }

  function apply(resolved) {
    var root = document.documentElement;
    if (resolved === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  }

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (_) {}
  var pref = stored || 'dark';
  apply(resolve(pref));

  // React to OS theme change only when user chose "system"
  function onMedia() {
    try {
      var cur = localStorage.getItem(KEY) || 'dark';
      if (cur === 'system') apply(resolve('system'));
    } catch (_) {}
  }
  if (media.addEventListener) media.addEventListener('change', onMedia);
  else if (media.addListener) media.addListener(onMedia);

  window.BridgeTheme = {
    get: function () {
      try { return localStorage.getItem(KEY) || 'dark'; } catch (_) { return 'dark'; }
    },
    resolved: function () { return resolve(this.get()); },
    set: function (pref) {
      try { localStorage.setItem(KEY, pref); } catch (_) {}
      apply(resolve(pref));
      window.dispatchEvent(new CustomEvent('bridge-theme', { detail: { pref: pref, resolved: resolve(pref) } }));
    },
    cycle: function () {
      var order = ['dark', 'light', 'system'];
      var i = order.indexOf(this.get());
      this.set(order[(i + 1) % order.length]);
    }
  };

  /* ----- BridgeAccent — swaps the --glow trio via data-accent on <html> ----- */
  var ACCENT_KEY = 'bridge-accent';
  var ACCENTS = ['glow', 'sea', 'brass', 'cargo', 'crew'];
  var ACCENT_LABELS = {
    glow:  'Glow (cyan)',
    sea:   'Sea green',
    brass: 'Brass',
    cargo: 'Cargo blue',
    crew:  'Crew purple'
  };

  function applyAccent(name) {
    var root = document.documentElement;
    if (name && name !== 'glow') root.setAttribute('data-accent', name);
    else root.removeAttribute('data-accent');
  }

  var storedAccent = null;
  try { storedAccent = localStorage.getItem(ACCENT_KEY); } catch (_) {}
  if (storedAccent && ACCENTS.indexOf(storedAccent) === -1) storedAccent = null;
  applyAccent(storedAccent || 'glow');

  window.BridgeAccent = {
    options: ACCENTS,
    labels: ACCENT_LABELS,
    get: function () {
      try { return localStorage.getItem(ACCENT_KEY) || 'glow'; } catch (_) { return 'glow'; }
    },
    set: function (name) {
      if (ACCENTS.indexOf(name) === -1) return;
      try { localStorage.setItem(ACCENT_KEY, name); } catch (_) {}
      applyAccent(name);
      window.dispatchEvent(new CustomEvent('bridge-accent', { detail: { accent: name } }));
    },
    cycle: function () {
      var i = ACCENTS.indexOf(this.get());
      this.set(ACCENTS[(i + 1) % ACCENTS.length]);
    }
  };

  /* ----- BridgeDensity — scales spacing tokens via data-density on <html> ----- */
  var DENSITY_KEY = 'bridge-density';
  var DENSITIES = ['compact', 'default', 'comfortable'];
  var DENSITY_LABELS = {
    compact: 'Compact',
    'default': 'Default',
    comfortable: 'Comfortable'
  };

  function applyDensity(name) {
    var root = document.documentElement;
    if (name && name !== 'default') root.setAttribute('data-density', name);
    else root.removeAttribute('data-density');
  }

  var storedDensity = null;
  try { storedDensity = localStorage.getItem(DENSITY_KEY); } catch (_) {}
  if (storedDensity && DENSITIES.indexOf(storedDensity) === -1) storedDensity = null;
  applyDensity(storedDensity || 'default');

  window.BridgeDensity = {
    options: DENSITIES,
    labels: DENSITY_LABELS,
    get: function () {
      try { return localStorage.getItem(DENSITY_KEY) || 'default'; } catch (_) { return 'default'; }
    },
    set: function (name) {
      if (DENSITIES.indexOf(name) === -1) return;
      try { localStorage.setItem(DENSITY_KEY, name); } catch (_) {}
      applyDensity(name);
      window.dispatchEvent(new CustomEvent('bridge-density', { detail: { density: name } }));
    },
    cycle: function () {
      var i = DENSITIES.indexOf(this.get());
      this.set(DENSITIES[(i + 1) % DENSITIES.length]);
    }
  };
})();
