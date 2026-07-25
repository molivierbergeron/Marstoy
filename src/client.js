/**
 * Script injecté dans chaque page. Il rattrape tout ce que la réécriture
 * serveur ne peut pas voir : grilles de produits rendues en JS, scroll infini,
 * résultats de recherche en AJAX, images sans référence dans leurs attributs
 * (on remonte alors à la carte produit parente pour trouver le code Marstoy).
 *
 * Servi tel quel par le Worker — pas de bundler, pas de dépendance.
 */

export const CLIENT_JS = String.raw`(() => {
  'use strict';
  if (window.__marstoyReal) return;
  window.__marstoyReal = true;

  var CODE_SOURCE = '(^|[^A-Za-z0-9])[Mm](\\d{3,7})(?!\\d)';
  // Le userscript optionnel (navigation sur le vrai marstoy.com) pointe ce
  // global vers l'URL absolue du Worker avant de charger ce script.
  var RESOLVE_URL = window.__mrResolveUrl || '/__mr/resolve';
  var RESOLVE_SEP = RESOLVE_URL.indexOf('?') === -1 ? '?' : '&';
  var CARD_SELECTOR = [
    '[data-product-id]', '[data-product-handle]', '.product-card', '.card',
    '.grid__item', '.product-item', '.product', 'li', 'article', 'a'
  ].join(',');
  var MAX_BATCH = 50;

  var known = new Map();      // code -> resolution | null (non résolu)
  var pending = new Set();    // codes en cours de requête
  var patchedImages = new WeakMap();
  var showReal = localStorage.getItem('mr:off') !== '1';
  var scheduled = false;

  function codesIn(text) {
    var out = [];
    if (!text) return out;
    var re = new RegExp(CODE_SOURCE, 'g');
    var m;
    while ((m = re.exec(text)) !== null) {
      var code = 'M' + m[2];
      if (out.indexOf(code) === -1) out.push(code);
    }
    return out;
  }

  // Écrasé par la réponse de /__mr/resolve pour rester aligné sur LABEL_FORMAT
  // côté Worker : sinon le garde-fou anti-doublon ne reconnaîtrait pas les
  // libellés déjà posés par la réécriture serveur.
  var labelFormat = '{name} — LEGO {num} · {code}';

  function labelFor(resolution, code) {
    return labelFormat
      .split('{name}').join(resolution.name)
      .split('{num}').join(resolution.num)
      .split('{setNum}').join(resolution.setNum)
      .split('{code}').join(code)
      .split('{year}').join(resolution.year == null ? '' : resolution.year)
      .split('{parts}').join(resolution.numParts == null ? '' : resolution.numParts);
  }

  function replaceIn(text) {
    return text.replace(new RegExp(CODE_SOURCE, 'g'), function (match, before, digits) {
      var code = 'M' + digits;
      var resolution = known.get(code);
      if (!resolution) return match;
      var label = labelFor(resolution, code);
      // Déjà réécrit côté serveur : ne pas imbriquer le libellé deux fois.
      if (text.indexOf(label) !== -1) return match;
      return before + label;
    });
  }

  function fetchCodes(codes) {
    var wanted = codes.filter(function (code) {
      return !known.has(code) && !pending.has(code);
    });
    if (!wanted.length) return Promise.resolve(false);
    wanted.forEach(function (code) { pending.add(code); });

    var batches = [];
    for (var i = 0; i < wanted.length; i += MAX_BATCH) batches.push(wanted.slice(i, i + MAX_BATCH));

    return Promise.all(batches.map(function (batch) {
      return fetch(RESOLVE_URL + RESOLVE_SEP + 'codes=' + encodeURIComponent(batch.join(',')), {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (data) {
          if (data && data.labelFormat) labelFormat = data.labelFormat;
          batch.forEach(function (code) {
            pending.delete(code);
            var resolution = data && data.sets ? data.sets[code] : null;
            known.set(code, resolution && resolution.ok ? resolution : null);
          });
        })
        .catch(function () {
          batch.forEach(function (code) { pending.delete(code); });
        });
    })).then(function () { return true; });
  }

  function textNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentNode;
        if (!parent) return NodeFilter.FILTER_REJECT;
        var tag = parent.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA') {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest && parent.closest('#mr-toggle')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.indexOf('M') !== -1
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function imageCode(img) {
    var direct = codesIn(
      (img.getAttribute('alt') || '') + ' ' +
      (img.getAttribute('title') || '') + ' ' +
      (img.getAttribute('src') || '') + ' ' +
      (img.getAttribute('data-src') || '')
    );
    if (direct.length) return direct[0];

    // Sinon : la référence est dans le texte de la carte produit parente.
    var node = img.parentElement;
    var depth = 0;
    while (node && depth < 8) {
      if (node.matches && node.matches(CARD_SELECTOR)) {
        var codes = codesIn(node.textContent || '');
        if (codes.length === 1) return codes[0];
        if (codes.length > 1) return null; // ambigu : on ne devine pas
      }
      node = node.parentElement;
      depth++;
    }
    return null;
  }

  function applyText(nodes) {
    nodes.forEach(function (node) {
      if (node.__mrOriginal == null) node.__mrOriginal = node.nodeValue;
      var next = showReal ? replaceIn(node.__mrOriginal) : node.__mrOriginal;
      if (node.nodeValue !== next) node.nodeValue = next;
    });
  }

  function applyImage(img) {
    var state = patchedImages.get(img);
    if (!showReal) {
      if (state && state.original && img.getAttribute('src') !== state.original) {
        img.setAttribute('src', state.original);
      }
      return;
    }

    var code = (state && state.code) || imageCode(img);
    if (!code) return;
    var resolution = known.get(code);
    if (!resolution || !resolution.imgUrl) return;
    if (img.getAttribute('src') === resolution.imgUrl) return;
    if (state && state.attempts >= 4) return;

    var original = (state && state.original) || img.getAttribute('src') || '';
    ['srcset', 'data-srcset', 'sizes', 'data-src', 'data-original', 'data-lazy', 'data-widths'].forEach(
      function (attr) { img.removeAttribute(attr); }
    );
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.setAttribute('src', resolution.imgUrl);
    img.setAttribute('data-mr-set', resolution.setNum);
    img.style.objectFit = img.style.objectFit || 'contain';
    patchedImages.set(img, {
      code: code,
      original: original,
      attempts: (state ? state.attempts : 0) + 1
    });

    if (!img.__mrErrorHooked) {
      img.__mrErrorHooked = true;
      img.addEventListener('error', function () {
        // CDN Rebrickable injoignable : on repasse par le Worker.
        var proxied = '/__mr/img/' + encodeURIComponent(code);
        if (img.getAttribute('src') !== proxied) img.setAttribute('src', proxied);
      });
    }
  }

  function scan() {
    var nodes = textNodes(document.body || document.documentElement);
    var images = Array.prototype.slice.call(document.images || []);

    var codes = [];
    nodes.forEach(function (node) {
      codesIn(node.nodeValue).forEach(function (code) {
        if (codes.indexOf(code) === -1) codes.push(code);
      });
    });
    images.forEach(function (img) {
      var code = imageCode(img);
      if (code && codes.indexOf(code) === -1) codes.push(code);
    });

    applyText(nodes);
    images.forEach(applyImage);

    fetchCodes(codes).then(function (fetched) {
      if (!fetched) return;
      applyText(nodes);
      images.forEach(applyImage);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; scan(); }, 200);
  }

  function buildToggle() {
    var button = document.createElement('button');
    button.id = 'mr-toggle';
    button.type = 'button';
    button.setAttribute('aria-live', 'polite');
    button.style.cssText = [
      'position:fixed', 'z-index:2147483000', 'right:12px',
      'bottom:calc(12px + env(safe-area-inset-bottom))',
      'padding:10px 14px', 'border:0', 'border-radius:999px',
      'font:600 13px/1 -apple-system,BlinkMacSystemFont,sans-serif',
      'color:#fff', 'background:#0b1220', 'box-shadow:0 4px 14px rgba(0,0,0,.35)',
      'opacity:.85', '-webkit-tap-highlight-color:transparent'
    ].join(';');
    function label() { button.textContent = showReal ? 'LEGO ✓' : 'Marstoy'; }
    label();
    button.addEventListener('click', function () {
      showReal = !showReal;
      localStorage.setItem('mr:off', showReal ? '0' : '1');
      label();
      scan();
    });
    (document.body || document.documentElement).appendChild(button);
  }

  function start() {
    buildToggle();
    scan();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'data-src', 'alt']
    });
    window.addEventListener('pageshow', schedule);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();`;
