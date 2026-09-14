#!/usr/bin/env node
/**
 * Un vrai navigateur passe-t-il là où `fetch` échoue ?
 *
 * Constat du 14 septembre 2026 : le défi Cloudflare refuse aussi bien un runner
 * GitHub qu'une connexion résidentielle. Ce n'est donc pas l'adresse IP qui est
 * jugée, mais le client — Node annonce une signature TLS/HTTP qui n'est pas
 * celle d'un navigateur, et aucun en-tête n'y change quoi que ce soit.
 *
 * Premier essai : Chrome **sans interface** (headless), refusé lui aussi. Ce
 * n'est pas concluant pour autant — un Chrome headless se détecte à des dizaines
 * de détails et se fait défier là où le même Chrome, avec fenêtre, passe.
 *
 * D'où cet essai-ci, le dernier de cette piste, au plus près d'une navigation
 * ordinaire :
 *   - une vraie fenêtre, visible ;
 *   - le Google Chrome de la machine quand il est installé, pas le Chromium de
 *     test ;
 *   - un profil persistant, comme un navigateur qu'on rouvre ;
 *   - le temps de résoudre le défi (jusqu'à 60 s), au lieu de 15 s chrono ;
 *   - la page d'accueil d'abord : une fois le défi passé, le cookie obtenu vaut
 *     pour les adresses suivantes.
 *
 * Le script ne collecte rien et ne publie rien. Il charge trois adresses et dit
 * ce qu'il a reçu. Si ça échoue encore, la piste du navigateur est close.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFIL = path.join(racine, '.profil-navigateur');

const ACCUEIL = 'https://www.marstoy.com/';
const SUITE = [
  'https://www.marstoy.com/sitemap_products_1.xml',
  'https://www.marstoy.com/products.json?limit=1',
];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error("✗ Playwright n'est pas installé. Lance plutôt scripts/try-browser.sh.");
  process.exit(2);
}

const defie = (html) => /just a moment|challenges\.cloudflare\.com|cf-browser-verification/i.test(html);

/** Ouvre une vraie fenêtre, avec le Chrome du système si on en trouve un. */
async function ouvrir() {
  const commun = {
    headless: false,
    viewport: { width: 1280, height: 820 },
    locale: 'en-US',
    timezoneId: 'America/Toronto',
  };
  try {
    const contexte = await chromium.launchPersistentContext(PROFIL, { ...commun, channel: 'chrome' });
    console.log('  (Google Chrome du système)\n');
    return contexte;
  } catch {
    const contexte = await chromium.launchPersistentContext(PROFIL, commun);
    console.log('  (Chromium fourni par Playwright — Chrome introuvable)\n');
    return contexte;
  }
}

console.log('\n▸ Ouverture d\'une vraie fenêtre de navigateur…');
console.log('  Une fenêtre va s\'afficher. Laisse-la travailler, ne la ferme pas.\n');

const contexte = await ouvrir();
const page = contexte.pages()[0] ?? (await contexte.newPage());

// --- La page d'accueil, avec le temps qu'il faut -------------------------

console.log(`  ${ACCUEIL}`);
let passe = false;
try {
  await page.goto(ACCUEIL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Le défi se résout tout seul, mais pas en un temps fixe. On regarde toutes
  // les 3 secondes plutôt que de parier sur une durée.
  for (let essai = 0; essai < 20; essai += 1) {
    if (!defie(await page.content())) {
      passe = true;
      break;
    }
    if (essai === 0) process.stdout.write('    défi en cours');
    process.stdout.write('.');
    await page.waitForTimeout(3000);
  }
  console.log();
  console.log(passe ? '    ✓ défi franchi\n' : '    ✗ défi toujours affiché après 60 s\n');
} catch (error) {
  console.log(`\n    ✗ ${String(error?.message || error).split('\n')[0].slice(0, 110)}\n`);
}

// --- Les adresses qui nous intéressent vraiment --------------------------

let reussites = 0;

if (passe) {
  for (const url of SUITE) {
    console.log(`  ${url}`);
    try {
      const reponse = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const statut = reponse?.status() ?? 0;
      let contenu = await page.content();

      for (let essai = 0; essai < 10 && defie(contenu); essai += 1) {
        await page.waitForTimeout(3000);
        contenu = await page.content();
      }

      if (defie(contenu)) {
        console.log(`    ✗ HTTP ${statut} — toujours le défi\n`);
      } else {
        reussites += 1;
        console.log(`    ✓ HTTP ${statut} — ${contenu.replace(/\s+/g, ' ').slice(0, 110)}…\n`);
      }
    } catch (error) {
      console.log(`    ✗ ${String(error?.message || error).split('\n')[0].slice(0, 110)}\n`);
    }
    await page.waitForTimeout(2000);
  }
}

await contexte.close();

console.log('=== Verdict ===\n');
if (passe && reussites === SUITE.length) {
  console.log('✓ Un vrai navigateur passe, et les adresses utiles répondent.');
  console.log('  La collecte redevient possible : envoie-moi cette sortie et je');
  console.log('  réécris la découverte sur cette base.\n');
} else if (passe) {
  console.log(`~ Le défi est franchi, mais ${SUITE.length - reussites} adresse(s) sur ${SUITE.length} résistent.`);
  console.log('  Envoie-moi cette sortie : le détail décide de ce qui est récupérable.\n');
} else {
  console.log('✗ Même une vraie fenêtre de Chrome est refusée depuis cette machine.');
  console.log('  Cette fois la piste du navigateur est close pour de bon.');
  console.log('  La suite n\'est plus technique : il faut demander un accès à Marstoy.\n');
}

process.exit(passe ? 0 : 1);
