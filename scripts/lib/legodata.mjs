/**
 * Données LEGO depuis les exports publics de Rebrickable (`sets.csv.gz`,
 * `themes.csv.gz`) : un téléchargement au lieu de milliers d'appels API, et
 * aucune clé requise. La clé ne sert qu'au repli API pour les rares références
 * absentes du dump.
 */

import { gunzipSync } from 'node:zlib';

import { get } from './fetch-util.mjs';
import { candidateGroups, codeDigits } from '../../lib/setnum.js';

const DOWNLOADS = 'https://cdn.rebrickable.com/media/downloads';

/** Parseur CSV minimal mais correct (guillemets et virgules échappées). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift() || [];
  return rows
    .filter((cells) => cells.length >= header.length)
    .map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index]])));
}

async function loadGzippedCsv(name) {
  const response = await get(`${DOWNLOADS}/${name}.csv.gz`, { accept: 'application/gzip' });
  if (!response.ok) throw new Error(`Téléchargement ${name}.csv.gz : HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return parseCsv(gunzipSync(buffer).toString('utf8'));
}

/**
 * Index des sets LEGO : `12345` -> liste des éditions (`12345-1`, `12345-2`…),
 * plus le nom des thèmes.
 */
export async function loadLegoIndex() {
  const [sets, themes] = await Promise.all([loadGzippedCsv('sets'), loadGzippedCsv('themes')]);

  const themeNames = new Map(themes.map((theme) => [theme.id, theme.name]));
  const themeParents = new Map(themes.map((theme) => [theme.id, theme.parent_id]));
  const fullThemeName = (id) => {
    const parts = [];
    let current = id;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const name = themeNames.get(current);
      if (!name) break;
      if (!parts.includes(name)) parts.unshift(name);
      current = themeParents.get(current);
    }
    return parts.join(' › ') || null;
  };

  const byNumber = new Map();
  for (const set of sets) {
    const base = String(set.set_num).split('-')[0];
    const entry = {
      setNum: set.set_num,
      num: base,
      name: set.name,
      year: set.year ? Number(set.year) : null,
      numParts: set.num_parts ? Number(set.num_parts) : null,
      themeId: set.theme_id || null,
      theme: fullThemeName(set.theme_id),
      imgUrl: set.img_url || null,
      setUrl: `https://rebrickable.com/sets/${set.set_num}/`,
    };
    if (!byNumber.has(base)) byNumber.set(base, []);
    byNumber.get(base).push(entry);
  }

  return { byNumber, totalSets: sets.length, totalThemes: themes.length };
}

/** Entre plusieurs éditions/candidats, garde le plus récent puis le plus gros. */
function pickBest(entries) {
  return [...entries].sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.numParts ?? 0) - (a.numParts ?? 0),
  )[0];
}

/**
 * Résout une référence Marstoy avec l'index local. `overrides` permet de forcer
 * un numéro, `null` pour ignorer la référence.
 */
export function resolveFromIndex(code, index, overrides = {}) {
  if (Object.prototype.hasOwnProperty.call(overrides, code)) {
    const forced = overrides[code];
    if (forced === null) return { ok: false, code, reason: 'ignoré via overrides.json' };
    const base = String(typeof forced === 'string' ? forced : forced.num).split('-')[0];
    const entries = index.byNumber.get(base);
    if (!entries) return { ok: false, code, reason: `override ${forced} absent du dump Rebrickable` };
    const exact = entries.find((entry) => entry.setNum === forced);
    return { ok: true, code, matchedBy: 'override', ...(exact || pickBest(entries)) };
  }

  const groups = candidateGroups(codeDigits(code));
  for (const [depth, group] of groups.entries()) {
    const hits = group.flatMap((candidate) => index.byNumber.get(candidate) || []);
    if (hits.length) {
      return {
        ok: true,
        code,
        matchedBy: depth === 0 ? 'inversion' : 'référence brute',
        ...pickBest(hits),
      };
    }
  }

  return { ok: false, code, reason: 'aucun set LEGO correspondant', tried: groups.flat() };
}
