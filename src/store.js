/**
 * Cache des résolutions. Utilise le namespace KV `MR_CACHE` s'il est lié,
 * sinon retombe sur le Cache API du Worker (suffisant, mais par datacenter).
 * Un cache mémoire par isolate évite les allers-retours dans une même page.
 */

const memory = new Map();
const CACHE_ORIGIN = 'https://marstoy-real.internal/cache/';

function memoryGet(key) {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    memory.delete(key);
    return undefined;
  }
  return entry.value;
}

function memorySet(key, value, ttlSeconds) {
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  // Garde-fou mémoire : l'isolate est éphémère mais restons bornés.
  if (memory.size > 5000) {
    for (const k of memory.keys()) {
      memory.delete(k);
      if (memory.size <= 4000) break;
    }
  }
}

export async function cacheGet(key, env) {
  const local = memoryGet(key);
  if (local !== undefined) return local;

  if (env.MR_CACHE) {
    const value = await env.MR_CACHE.get(key, 'json');
    if (value != null) {
      memorySet(key, value, 600);
      return value;
    }
    return undefined;
  }

  const hit = await caches.default.match(new Request(CACHE_ORIGIN + encodeURIComponent(key)));
  if (!hit) return undefined;
  const value = await hit.json();
  memorySet(key, value, 600);
  return value;
}

export async function cacheSet(key, value, ttlSeconds, env) {
  memorySet(key, value, Math.min(ttlSeconds, 600));

  if (env.MR_CACHE) {
    await env.MR_CACHE.put(key, JSON.stringify(value), { expirationTtl: Math.max(ttlSeconds, 60) });
    return;
  }

  await caches.default.put(
    new Request(CACHE_ORIGIN + encodeURIComponent(key)),
    new Response(JSON.stringify(value), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${Math.max(ttlSeconds, 60)}`,
      },
    }),
  );
}
