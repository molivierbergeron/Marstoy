/**
 * API des listes de favoris — Cloudflare Worker + KV.
 *
 * Le site est statique (GitHub Pages) : ce Worker est le seul endroit où les
 * listes vivent, ce qui permet de retrouver la sienne d'un appareil à l'autre.
 *
 * Il n'y a volontairement pas d'authentification. Le besoin exprimé était
 * d'éviter qu'un ami ajoute par mégarde dans la liste de quelqu'un d'autre, pas
 * de protéger un secret : la confirmation se fait côté site. Les listes sont
 * donc lisibles et modifiables par quiconque connaît l'adresse. Ne rien y mettre
 * de sensible.
 *
 *   GET    /api/users            liste des comptes
 *   POST   /api/users            { name }            crée un compte
 *   GET    /api/list/:slug       la liste d'un compte
 *   PUT    /api/list/:slug       { codes: [] }       la remplace
 *   DELETE /api/users/:slug      supprime un compte
 */

// Comptes créés au tout premier accès. La variable SEED_USERS les remplace si
// elle est définie, mais la valeur par défaut évite d'avoir à la configurer.
const DEFAULT_SEED_USERS = 'Marco,Christian,Marie-Claude';

const MAX_USERS = 50;
const MAX_CODES = 500;
const MAX_NAME = 40;
const KEY = (slug) => `user:${slug}`;

/** « Marc-Christian » -> « marc-christian ». */
export function toSlug(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Ne garde que des références Marstoy plausibles, dédoublonnées. */
export function sanitizeCodes(value) {
  if (!Array.isArray(value)) return null;
  const seen = [];
  for (const entry of value) {
    const code = String(entry || '').trim().toUpperCase();
    if (!/^M\d{3,7}$/.test(code)) continue;
    if (!seen.includes(code)) seen.push(code);
    if (seen.length >= MAX_CODES) break;
  }
  return seen;
}

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors(), ...extra },
  });

const cors = () => ({
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-max-age': '86400',
});

/**
 * Crée les comptes de départ au premier accès. Un marqueur empêche de les
 * ressusciter si on en supprime un plus tard.
 */
async function seedUsers(env) {
  // Définir SEED_USERS à vide désactive le semis ; l'absence de variable
  // applique la liste par défaut.
  const seeds = env.SEED_USERS === undefined ? DEFAULT_SEED_USERS : env.SEED_USERS;
  if (!seeds) return;
  if (await env.FAVORIS.get('seeded')) return;

  for (const raw of String(seeds).split(',')) {
    const name = raw.trim().slice(0, MAX_NAME);
    const slug = toSlug(name);
    if (!slug || (await env.FAVORIS.get(KEY(slug)))) continue;
    const now = new Date().toISOString();
    await env.FAVORIS.put(KEY(slug), JSON.stringify({ slug, name, codes: [], createdAt: now, updatedAt: now }));
  }
  await env.FAVORIS.put('seeded', new Date().toISOString());
}

async function listUsers(env) {
  const { keys } = await env.FAVORIS.list({ prefix: 'user:' });
  const users = await Promise.all(
    keys.map(async ({ name }) => {
      const record = await env.FAVORIS.get(name, 'json');
      if (!record) return null;
      return {
        slug: record.slug,
        name: record.name,
        count: record.codes?.length || 0,
        updatedAt: record.updatedAt || null,
      };
    }),
  );
  return users.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (!env.FAVORIS) return json({ error: 'namespace KV FAVORIS non lié' }, 500);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    try {
      await seedUsers(env);

      if (path === '/api/users' && request.method === 'GET') {
        return json({ users: await listUsers(env) });
      }

      if (path === '/api/users' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const name = String(body.name || '').trim().slice(0, MAX_NAME);
        const slug = toSlug(name);
        if (!slug) return json({ error: 'nom invalide' }, 400);

        if (await env.FAVORIS.get(KEY(slug))) {
          return json({ error: 'ce compte existe déjà', slug }, 409);
        }
        const existing = await listUsers(env);
        if (existing.length >= MAX_USERS) return json({ error: 'trop de comptes' }, 429);

        const now = new Date().toISOString();
        const record = { slug, name, codes: [], createdAt: now, updatedAt: now };
        await env.FAVORIS.put(KEY(slug), JSON.stringify(record));
        return json({ slug, name }, 201);
      }

      const listMatch = path.match(/^\/api\/list\/([a-z0-9-]{1,40})$/);
      if (listMatch) {
        const slug = listMatch[1];
        const record = await env.FAVORIS.get(KEY(slug), 'json');
        if (!record) return json({ error: 'compte inconnu' }, 404);

        if (request.method === 'GET') {
          return json({ slug, name: record.name, codes: record.codes || [], updatedAt: record.updatedAt });
        }

        if (request.method === 'PUT') {
          const body = await request.json().catch(() => ({}));
          const codes = sanitizeCodes(body.codes);
          if (codes === null) return json({ error: 'codes doit être un tableau' }, 400);

          const updatedAt = new Date().toISOString();
          await env.FAVORIS.put(KEY(slug), JSON.stringify({ ...record, codes, updatedAt }));
          return json({ ok: true, count: codes.length, updatedAt });
        }
      }

      const userMatch = path.match(/^\/api\/users\/([a-z0-9-]{1,40})$/);
      if (userMatch && request.method === 'DELETE') {
        await env.FAVORIS.delete(KEY(userMatch[1]));
        return json({ ok: true });
      }

      if (path === '/api/health') {
        return json({ ok: true, users: (await listUsers(env)).length });
      }

      return json({ error: 'route inconnue' }, 404);
    } catch (error) {
      return json({ error: String(error?.message || error) }, 500);
    }
  },
};
