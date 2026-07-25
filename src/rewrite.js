/**
 * Réécriture du HTML Marstoy : noms de sets réels dans le texte, images
 * officielles à la place des photos Marstoy, et injection du script client qui
 * s'occupe de tout ce qui est rendu en JavaScript (grilles, scroll infini...).
 */

import { extractCodes, formatLabel, replaceCodes } from './setnum.js';

const SKIP_TAGS = 'script, style, noscript, template';
const IMAGE_ATTRS = ['src', 'data-src', 'data-original', 'data-lazy', 'alt', 'title'];
const TEXTUAL_ATTRS = {
  a: ['title', 'aria-label'],
  img: ['alt', 'title'],
  meta: ['content'],
  option: ['label'],
  input: ['placeholder', 'value'],
  button: ['aria-label'],
};

/** Références Marstoy présentes dans une page (texte comme attributs). */
export function collectCodes(html) {
  return extractCodes(html);
}

/** Renvoie les URLs absolues du site upstream pointant vers notre proxy. */
export function localizeUrls(html, hosts) {
  let out = html;
  for (const host of hosts) {
    out = out.replaceAll(`https://${host}`, '').replaceAll(`http://${host}`, '').replaceAll(`//${host}`, '');
  }
  return out;
}

export function rewriteHtml(html, resolutions, options) {
  const { labelFormat, clientScriptPath, injectClient = true } = options;

  const lookup = (code) => {
    const resolution = resolutions.get(code);
    return resolution?.ok ? formatLabel(resolution, code, labelFormat) : null;
  };
  const resolutionFor = (value) => {
    for (const code of extractCodes(value)) {
      const resolution = resolutions.get(code);
      if (resolution?.ok) return resolution;
    }
    return null;
  };

  let skipping = false;
  let clientInjected = false;

  const rewriter = new HTMLRewriter()
    .on(SKIP_TAGS, {
      element(element) {
        skipping = true;
        element.onEndTag(() => {
          skipping = false;
        });
      },
    })
    .on('img', {
      element(element) {
        let resolution = null;
        for (const attr of IMAGE_ATTRS) {
          resolution = resolutionFor(element.getAttribute(attr));
          if (resolution) break;
        }

        if (resolution?.imgUrl) {
          element.setAttribute('src', resolution.imgUrl);
          element.setAttribute('data-mr-set', resolution.setNum);
          element.setAttribute('referrerpolicy', 'no-referrer');
          element.setAttribute('loading', 'lazy');
          // Neutralise les variantes qui ré-imposeraient l'image Marstoy.
          for (const attr of ['srcset', 'data-srcset', 'sizes', 'data-src', 'data-original', 'data-lazy', 'data-widths']) {
            element.removeAttribute(attr);
          }
          element.setAttribute('alt', `${resolution.name} (LEGO ${resolution.num})`);
          return;
        }

        rewriteAttributes(element, 'img');
      },
    })
    .on('source[srcset]', {
      element(element) {
        // Dans un <picture>, une <source> gagne sur le <img> : on la retire si
        // le <img> a été remplacé par l'image officielle.
        if (resolutionFor(element.getAttribute('srcset'))) element.remove();
      },
    })
    .on('a', { element: (element) => rewriteAttributes(element, 'a') })
    .on('meta', { element: (element) => rewriteAttributes(element, 'meta') })
    .on('option', { element: (element) => rewriteAttributes(element, 'option') })
    .on('input', { element: (element) => rewriteAttributes(element, 'input') })
    .on('button', { element: (element) => rewriteAttributes(element, 'button') })
    .on('*', {
      text(chunk) {
        if (skipping) return;
        const original = chunk.text;
        if (!original.trim()) return;
        const replaced = replaceCodes(original, lookup);
        if (replaced !== original) chunk.replace(replaced, { html: false });
      },
    });

  if (injectClient) {
    rewriter.on('head', {
      element(element) {
        clientInjected = true;
        element.append(headExtras(clientScriptPath), { html: true });
      },
    });
    rewriter.on('body', {
      element(element) {
        // Filet de sécurité si la page n'a pas de <head> exploitable.
        if (!clientInjected) element.prepend(headExtras(clientScriptPath), { html: true });
      },
    });
  }

  function rewriteAttributes(element, tag) {
    for (const attr of TEXTUAL_ATTRS[tag] || []) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const replaced = replaceCodes(value, lookup);
      if (replaced !== value) element.setAttribute(attr, replaced);
    }
  }

  return rewriter.transform(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
}

function headExtras(clientScriptPath) {
  return [
    '<link rel="manifest" href="/__mr/manifest.webmanifest">',
    '<meta name="theme-color" content="#0b1220">',
    `<script src="${clientScriptPath}" defer></script>`,
  ].join('');
}

/**
 * Réécriture des réponses JSON (recherche Shopify, `products.json`, etc.).
 * On remplace les références dans les valeurs textuelles, sans toucher aux URLs.
 */
export function rewriteJson(body, resolutions, labelFormat) {
  const lookup = (code) => {
    const resolution = resolutions.get(code);
    return resolution?.ok ? formatLabel(resolution, code, labelFormat) : null;
  };
  try {
    const data = JSON.parse(body);
    return JSON.stringify(mapStrings(data, lookup));
  } catch {
    return body;
  }
}

function mapStrings(value, lookup) {
  if (typeof value === 'string') {
    // Ne pas casser les URLs, chemins de fichiers et handles techniques.
    if (/^(https?:)?\/\//.test(value) || value.startsWith('/') || /\.(jpe?g|png|webp|gif|svg|css|js)(\?|$)/i.test(value)) {
      return value;
    }
    return replaceCodes(value, lookup);
  }
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, lookup));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) out[key] = mapStrings(nested, lookup);
    return out;
  }
  return value;
}
