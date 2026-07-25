/**
 * marstoy-real — proxy Cloudflare Worker qui affiche marstoy.com avec les vrais
 * noms et visuels LEGO. La clé Rebrickable reste un secret du Worker : elle
 * n'est jamais envoyée au navigateur.
 *
 * Routes internes (préfixe `/__mr/`) :
 *   GET /__mr/resolve?codes=M12345,M67201  -> résolutions JSON
 *   GET /__mr/img/M12345                   -> image officielle du set (relais)
 *   GET /__mr/client.js                     -> script injecté dans les pages
 *   GET /__mr/manifest.webmanifest          -> ajout à l'écran d'accueil iOS
 *   GET /__mr/icon.svg                      -> icône
 *   GET /__mr/health                        -> diagnostic
 * Tout le reste est proxifié vers Marstoy.
 */

import { CLIENT_JS } from './client.js';
import { fetchUpstream, localizeResponseHeaders, upstreamHosts } from './proxy.js';
import { resolveCodes } from './resolve.js';
import { collectCodes, localizeUrls, rewriteHtml, rewriteJson } from './rewrite.js';
import { extractCodes } from './setnum.js';

const INTERNAL_PREFIX = '/__mr/';
const DEFAULT_LABEL_FORMAT = '{name} — LEGO {num} · {code}';
const CLIENT_SCRIPT_PATH = `${INTERNAL_PREFIX}client.js?v=1`;
const AUTH_COOKIE = 'mr_auth';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(INTERNAL_PREFIX)) {
      const publicRoutes = new Set(['client.js', 'manifest.webmanifest', 'icon.svg', 'health']);
      const route = url.pathname.slice(INTERNAL_PREFIX.length).split('/')[0];
      if (!publicRoutes.has(route)) {
        // Sur les routes API, `?k=` suffit (pas de redirection) pour que le
        // userscript optionnel puisse appeler l'API depuis marstoy.com.
        const denied = enforceAccess(request, env, url, { redirect: false });
        if (denied) return denied;
      }
      return handleInternal(route, request, env, url);
    }

    const denied = enforceAccess(request, env, url);
    if (denied) return denied;

    try {
      return await handleProxy(request, env);
    } catch (error) {
      return new Response(`Erreur proxy : ${error?.message || error}`, {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  },
};

/**
 * Verrou optionnel : si le secret ACCESS_TOKEN est défini, il faut passer
 * `?k=<token>` une fois, ce qui pose un cookie. Sans token, le proxy (et donc
 * la clé Rebrickable derrière) n'est utilisable par personne d'autre.
 */
function enforceAccess(request, env, url, options = {}) {
  const token = env.ACCESS_TOKEN;
  if (!token) return null;

  const cookies = request.headers.get('cookie') || '';
  if (cookies.split(/;\s*/).includes(`${AUTH_COOKIE}=${token}`)) return null;

  if (url.searchParams.get('k') === token) {
    if (options.redirect === false) return null;
    const clean = new URL(url);
    clean.searchParams.delete('k');
    return new Response(null, {
      status: 302,
      headers: {
        location: clean.pathname + (clean.search || '') + clean.hash,
        'set-cookie': `${AUTH_COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
}

async function handleInternal(route, request, env, url) {
  switch (route) {
    case 'client.js':
      return new Response(CLIENT_JS, {
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'public, max-age=3600',
          // Permet au userscript de le charger depuis marstoy.com.
          ...corsHeaders(),
        },
      });

    case 'manifest.webmanifest':
      return json(
        {
          name: 'Marstoy (vrais sets LEGO)',
          short_name: 'Marstoy',
          start_url: '/',
          // `browser` garde la barre Safari : indispensable pour naviguer/revenir.
          display: 'browser',
          background_color: '#0b1220',
          theme_color: '#0b1220',
          icons: [{ src: `${INTERNAL_PREFIX}icon.svg`, sizes: 'any', type: 'image/svg+xml' }],
        },
        { 'cache-control': 'public, max-age=86400' },
      );

    case 'icon.svg':
      return new Response(ICON_SVG, {
        headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' },
      });

    case 'health':
      return json({
        ok: true,
        upstream: env.UPSTREAM_HOST || 'www.marstoy.com',
        rebrickableKey: Boolean(env.REBRICKABLE_API_KEY),
        kvCache: Boolean(env.MR_CACHE),
        accessToken: Boolean(env.ACCESS_TOKEN),
      });

    case 'resolve': {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      const labelFormat = env.LABEL_FORMAT || DEFAULT_LABEL_FORMAT;
      const codes = extractCodes(url.searchParams.get('codes') || '');
      if (!codes.length) return json({ labelFormat, sets: {} }, corsHeaders());
      const resolutions = await resolveCodes(codes, env);
      const sets = {};
      for (const [code, resolution] of resolutions) sets[code] = resolution;
      return json({ labelFormat, sets }, { ...corsHeaders(), 'cache-control': 'public, max-age=86400' });
    }

    case 'img': {
      const code = extractCodes(decodeURIComponent(url.pathname.split('/').pop() || ''))[0];
      if (!code) return new Response('Référence invalide', { status: 400 });
      const resolution = (await resolveCodes([code], env)).get(code);
      if (!resolution?.ok || !resolution.imgUrl) {
        return new Response('Image introuvable', { status: 404 });
      }
      const upstream = await fetch(resolution.imgUrl, { headers: { Accept: 'image/*' } });
      if (!upstream.ok) return new Response('Image introuvable', { status: 404 });
      return new Response(upstream.body, {
        status: 200,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'image/jpeg',
          'cache-control': 'public, max-age=2592000, immutable',
        },
      });
    }

    default:
      return new Response('Not found', { status: 404 });
  }
}

async function handleProxy(request, env) {
  const response = await fetchUpstream(request, env);
  const headers = localizeResponseHeaders(response, request, env);
  const contentType = response.headers.get('content-type') || '';

  if (response.status >= 300 && response.status < 400) {
    return new Response(null, { status: response.status, headers });
  }

  const labelFormat = env.LABEL_FORMAT || DEFAULT_LABEL_FORMAT;
  const hosts = upstreamHosts(env);

  if (contentType.includes('text/html')) {
    const html = localizeUrls(await response.text(), hosts);
    const resolutions = await resolveCodes(collectCodes(html), env);
    const rewritten = rewriteHtml(html, resolutions, {
      labelFormat,
      clientScriptPath: CLIENT_SCRIPT_PATH,
    });
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'no-store');
    return new Response(rewritten.body, { status: response.status, headers });
  }

  if (contentType.includes('application/json') || contentType.includes('application/ld+json')) {
    const body = localizeUrls(await response.text(), hosts);
    const resolutions = await resolveCodes(collectCodes(body), env);
    return new Response(rewriteJson(body, resolutions, labelFormat), {
      status: response.status,
      headers,
    });
  }

  return new Response(response.body, { status: response.status, headers });
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'accept, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
  };
}

function json(data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#0b1220"/>
<rect x="12" y="26" width="40" height="24" rx="4" fill="#f2c200"/>
<circle cx="22" cy="22" r="6" fill="#f2c200"/>
<circle cx="32" cy="22" r="6" fill="#f2c200"/>
<circle cx="42" cy="22" r="6" fill="#f2c200"/>
<path d="M18 38h28" stroke="#0b1220" stroke-width="4" stroke-linecap="round"/>
</svg>`;
