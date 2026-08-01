#!/usr/bin/env node
/**
 * Construit le catalogue statique du site : découvre les produits Marstoy,
 * résout chaque référence vers le vrai set LEGO, et écrit
 * `site/data/catalog.json`.
 *
 * Tourne sur un runner GitHub Actions (accès Internet complet). Aucune clé
 * n'est nécessaire : les données LEGO viennent des exports publics de
 * Rebrickable. La résolution a lieu ici, à la compilation — le site livré au
 * navigateur ne contient donc aucun secret.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverCatalog } from './lib/marstoy.mjs';
import { loadLegoIndex, resolveFromIndex } from './lib/legodata.mjs';
import { buildFromLegoIndex } from './lib/reverse-catalog.mjs';
import { fetchCadRate, toCad } from './lib/fx.mjs';
import { loadLegoPrices } from './lib/legoprice.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = (...args) => console.log('▸', ...args);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(path.join(root, file), 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data, { pretty = false } = {}) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(data, null, pretty ? 2 : 0));
  return target;
}

// La découverte passe d'abord et son rapport est écrit tout de suite : même si
// le téléchargement Rebrickable échoue ensuite, on garde de quoi diagnostiquer.
log('Découverte du catalogue Marstoy…');
const { products, recon } = await discoverCatalog();
log(`  stratégie retenue : ${recon.strategyUsed || 'aucune'} — ${products.length} référence(s)`);
await writeJson('data/recon.json', recon, { pretty: true });

log('Téléchargement des exports Rebrickable…');
let index;
try {
  index = await loadLegoIndex();
} catch (error) {
  console.error(
    `\nÉchec du téléchargement des données LEGO : ${error?.message || error}\n` +
      'Les exports publics attendus sont https://cdn.rebrickable.com/media/downloads/sets.csv.gz\n' +
      'et themes.csv.gz. data/recon.json a tout de même été écrit.',
  );
  process.exit(1);
}
log(`  ${index.totalSets} sets, ${index.totalThemes} thèmes indexés`);

const overrides = await readJson('overrides.json', {});

const resolved = [];
const unresolved = [];

// Marstoy annonce un nombre de pièces sur chaque fiche. Sur les vrais clones il
// correspond exactement à celui du set LEGO, donc un écart net veut dire que la
// correspondance est fausse : on rejette au lieu de publier une erreur.
const PARTS_TOLERANCE = 0.2;
const rejected = [];

for (const item of products) {
  const set = resolveFromIndex(item.code, index, overrides);
  if (set.ok) {
    if (item.marstoyParts) {
      const reject = (reason) => {
        rejected.push({
          code: item.code,
          num: set.num,
          name: set.name,
          marstoyTitle: item.title,
          marstoyParts: item.marstoyParts,
          legoParts: set.numParts,
          reason,
        });
      };

      // Un livre ou un accessoire (0 pièce chez Rebrickable) ne peut pas être
      // le clone d'une boîte de briques. Ce cas était court-circuité tant que
      // la condition exigeait `set.numParts` vrai — zéro étant falsy.
      if (!set.numParts) {
        reject('le set LEGO ne contient aucune pièce');
        continue;
      }
      if (Math.abs(item.marstoyParts - set.numParts) / set.numParts > PARTS_TOLERANCE) {
        reject('nombre de pièces trop éloigné');
        continue;
      }
    }
    resolved.push({
      code: item.code,
      marstoyTitle: item.title,
      marstoyUrl: item.url,
      marstoyParts: item.marstoyParts,
      price: item.price,
      num: set.num,
      setNum: set.setNum,
      name: set.name,
      year: set.year,
      numParts: set.numParts,
      theme: set.theme,
      imgUrl: set.imgUrl,
      setUrl: set.setUrl,
      matchedBy: set.matchedBy,
    });
  } else {
    unresolved.push({ code: item.code, title: item.title, url: item.url, reason: set.reason, tried: set.tried });
  }
}

// Marstoy nous a fermé la porte (protection anti-robot, changement de site) :
// on retourne le problème et on part du catalogue LEGO, dont on déduit la
// référence Marstoy. On perd les prix et la certitude que le set est en vente,
// mais on garde l'essentiel : chercher par vrai nom et obtenir le code.
let mode = 'catalogue Marstoy';
let products_ = resolved;

if (!resolved.length) {
  log('Aucun produit Marstoy exploitable — repli sur le catalogue LEGO complet.');
  products_ = buildFromLegoIndex(index);
  mode = 'catalogue LEGO (Marstoy inaccessible)';
  log(`  ${products_.length} sets retenus (≥ 200 pièces, depuis 1998)`);
}

// Prix en dollars canadiens. Marstoy ne déclare pas sa devise (og:price:currency
// est vide), donc on prend celle qui domine parmi les fiches où on a su la lire,
// et USD à défaut.
const DEFAULT_CURRENCY = 'USD';
const seenCurrencies = new Map();
for (const item of products) {
  if (item.currency) seenCurrencies.set(item.currency, (seenCurrencies.get(item.currency) || 0) + 1);
}
const detected = [...seenCurrencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
const sourceCurrency = detected || DEFAULT_CURRENCY;

log(
  detected
    ? `Devise détectée : ${detected} (${seenCurrencies.get(detected)} fiche(s))`
    : `Devise non déclarée par la boutique — ${DEFAULT_CURRENCY} par défaut`,
);

const fx = await fetchCadRate(sourceCurrency);
if (fx) {
  log(`  taux ${sourceCurrency}→CAD : ${fx.rate} (${fx.date}, ${fx.source})`);
  for (const item of products_) {
    item.priceCad = toCad(item.price, fx.rate);
  }
} else {
  log('  conversion CAD indisponible : les prix restent dans leur devise d\'origine');
}

// Prix de détail LEGO, pour chiffrer l'économie. Beaucoup de sets sont retirés
// du catalogue officiel : l'absence de prix est normale, on affiche simplement
// l'écart quand on l'a.
const priceCache = await readJson('data/lego-prices.json', {});
const legoPrices = await loadLegoPrices(
  products_.map(({ num, year }) => ({ num, year })),
  priceCache,
  recon,
  { apiKey: process.env.BRICKSET_API_KEY, usdToCad: fx?.rate ?? null },
);
await writeJson('data/lego-prices.json', legoPrices, { pretty: true });

let withSavings = 0;
for (const item of products_) {
  const retail = legoPrices[item.num]?.price ?? null;
  item.legoPriceCad = retail;
  item.savingsCad =
    retail != null && item.priceCad != null ? Math.round(retail - item.priceCad) : null;
  // Le pourcentage est calculé ici pour que le tri et l'affichage partagent
  // exactement la même valeur.
  item.savingsPct =
    item.savingsCad != null && retail > 0 ? Math.round((item.savingsCad / retail) * 100) : null;
  if (item.savingsCad != null && item.savingsCad > 0) withSavings += 1;
}
log(`Prix LEGO : ${withSavings} set(s) avec un écart chiffrable`);
if (!process.env.BRICKSET_API_KEY) {
  log('  BRICKSET_API_KEY absente : ajouter le secret pour afficher « xx $ off ».');
}

// Les plus récents d'abord : c'est ce qu'on cherche en général.
products_.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));

const catalog = {
  generatedAt: new Date().toISOString(),
  source: recon.origin,
  strategy: recon.strategyUsed,
  mode,
  // Adresse du Worker des favoris. Absente, le site range les listes dans le
  // navigateur seulement — rien ne casse, la synchronisation disparaît.
  api: { favorites: process.env.FAVORIS_API_URL || null },
  // De quoi laisser le site déclencher une reconstruction à la demande.
  repo: {
    slug: process.env.GITHUB_REPOSITORY || null,
    ref: process.env.GITHUB_REF_NAME || null,
    workflow: 'build-catalog.yml',
    approxMinutes: 4,
  },
  currency: {
    source: sourceCurrency,
    // Le site doit pouvoir dire « USD supposé » plutôt que « USD ».
    assumed: !detected,
    cadRate: fx?.rate ?? null,
    cadRateDate: fx?.date ?? null,
    cadRateSource: fx?.source ?? null,
  },
  counts: {
    discovered: products.length,
    resolved: resolved.length,
    unresolved: unresolved.length,
    rejected: rejected.length,
    published: products_.length,
    // Pour situer la couverture : l'essentiel du catalogue Marstoy est fait de
    // leurs propres MOC, qui ne clonent aucun set officiel.
    marstoyProducts: recon.counts.sitemapProductUrls ?? null,
    marstoyOwnMocs: recon.counts.marstoyOwnMocs ?? null,
  },
  products: products_,
};

await writeJson('site/data/catalog.json', catalog);
await writeJson(
  'data/recon.json',
  { ...recon, unresolved: unresolved.slice(0, 200), rejected: rejected.slice(0, 100) },
  { pretty: true },
);

log(`Mode : ${mode} — ${products_.length} entrées publiées`);
log(`  Marstoy : ${resolved.length} résolus, ${unresolved.length} non résolus`);
if (unresolved.length) {
  log('  exemples non résolus :', unresolved.slice(0, 10).map((item) => item.code).join(', '));
}
if (rejected.length) {
  log(`  ${rejected.length} correspondance(s) rejetée(s) sur le nombre de pièces — voir data/recon.json`);
}

if (!products_.length) {
  console.error(
    "\nCatalogue vide, même en repli. Voir data/recon.json : il contient le détail des\n" +
      'tentatives et des extraits des réponses de marstoy.com.',
  );
  process.exit(1);
}

if (!resolved.length) {
  console.warn(
    "\n⚠ marstoy.com n'a rien donné : le site est publié depuis le catalogue LEGO,\n" +
      'avec les références Marstoy calculées. Voir data/recon.json pour les codes HTTP\n' +
      'obtenus et adapter le scraper.',
  );
}
