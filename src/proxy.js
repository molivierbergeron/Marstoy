/**
 * Proxy HTTP vers Marstoy : on garde la navigation sur notre domaine pour que
 * chaque page traverse la réécriture (liens, redirections, cookies, formulaires).
 */

const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

const STRIPPED_RESPONSE_HEADERS = [
  // Sinon la CSP amont bloque le script injecté et les images Rebrickable.
  'content-security-policy',
  'content-security-policy-report-only',
  'report-to',
  'reporting-endpoints',
  'nel',
  'x-frame-options',
  'content-encoding',
  'content-length',
  'strict-transport-security',
  'alt-svc',
];

export function upstreamHosts(env) {
  const primary = env.UPSTREAM_HOST || 'www.marstoy.com';
  const apex = primary.replace(/^www\./, '');
  return [...new Set([primary, apex, `www.${apex}`])];
}

export async function fetchUpstream(request, env) {
  const incoming = new URL(request.url);
  const host = env.UPSTREAM_HOST || 'www.marstoy.com';
  const target = new URL(incoming.pathname + incoming.search, `https://${host}`);

  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP) headers.delete(header);
  headers.delete('accept-encoding');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ray');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  headers.set('host', host);
  if (headers.has('origin')) headers.set('origin', target.origin);
  const referer = headers.get('referer');
  if (referer) {
    try {
      const parsed = new URL(referer);
      headers.set('referer', target.origin + parsed.pathname + parsed.search);
    } catch {
      headers.delete('referer');
    }
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  return fetch(target.toString(), {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
  });
}

/** Nettoie les en-têtes de réponse et ramène redirections/cookies sur notre hôte. */
export function localizeResponseHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  for (const header of [...HOP_BY_HOP, ...STRIPPED_RESPONSE_HEADERS]) headers.delete(header);

  const hosts = upstreamHosts(env);
  const self = new URL(request.url);

  const location = headers.get('location');
  if (location) {
    headers.set('location', localizeUrl(location, hosts, self));
  }

  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  if (cookies.length) {
    headers.delete('set-cookie');
    for (const cookie of cookies) {
      // Le cookie doit appartenir à notre domaine, sinon Safari le jette.
      headers.append('set-cookie', cookie.replace(/;\s*domain=[^;]*/gi, ''));
    }
  }

  headers.set('x-robots-tag', 'noindex, nofollow');
  return headers;
}

function localizeUrl(value, hosts, self) {
  try {
    const parsed = new URL(value, `https://${hosts[0]}`);
    if (hosts.includes(parsed.host)) {
      return self.origin + parsed.pathname + parsed.search + parsed.hash;
    }
    return parsed.toString();
  } catch {
    return value;
  }
}
