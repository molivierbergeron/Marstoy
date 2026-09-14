#!/usr/bin/env node
/**
 * Un vrai navigateur passe-t-il là où `fetch` échoue ?
 *
 * Constat du 14 septembre 2026 : le défi Cloudflare refuse aussi bien un runner
 * GitHub qu'une connexion résidentielle. Ce n'est donc pas l'adresse IP qui est
 * jugée, mais le client — Node annonce une signature TLS/HTTP qui n'est pas
 * celle d'un navigateur, et aucun en-tête n'y change quoi que ce soit.
 *
 * Reste une question, et une seule : un Chrome réel, piloté depuis cette même
 * machine, obtient-il les pages ? Le défi Cloudflare est *fait* pour laisser
 * passer les vrais navigateurs — si celui-ci passe, la collecte redevient
 * possible ; sinon, la porte est définitivement close et on arrête d'y croire.
 *
 * Ce script ne collecte rien. Il charge trois adresses et dit ce qu'il a reçu.
 */

const CIBLES = [
  'https://www.marstoy.com/',
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

console.log('\n▸ Ouverture d\'un vrai navigateur…\n');

const navigateur = await chromium.launch({ headless: true });
const contexte = await navigateur.newContext({
  locale: 'en-US',
  timezoneId: 'America/Toronto',
  viewport: { width: 1280, height: 800 },
});
const page = await contexte.newPage();

let reussites = 0;

for (const url of CIBLES) {
  process.stdout.write(`  ${url}\n`);
  try {
    const reponse = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const statut = reponse?.status() ?? 0;

    // Le défi s'affiche puis se résout tout seul en quelques secondes : on lui
    // laisse le temps avant de conclure.
    let contenu = await page.content();
    if (/just a moment|challenges\.cloudflare\.com/i.test(contenu)) {
      process.stdout.write('    défi en cours, on patiente 15 s…\n');
      await page.waitForTimeout(15000);
      contenu = await page.content();
    }

    const encoreDefie = /just a moment|challenges\.cloudflare\.com/i.test(contenu);
    const apercu = contenu.replace(/\s+/g, ' ').slice(0, 110);

    if (encoreDefie) {
      console.log(`    ✗ HTTP ${statut} — toujours le défi Cloudflare\n`);
    } else {
      reussites += 1;
      console.log(`    ✓ HTTP ${statut} — ${apercu}…\n`);
    }
  } catch (error) {
    console.log(`    ✗ ${String(error?.message || error).split('\n')[0].slice(0, 110)}\n`);
  }
  // Rythme poli : on n'est pas pressé, la boutique non plus.
  await page.waitForTimeout(2000);
}

await navigateur.close();

console.log('=== Verdict ===\n');
if (reussites === CIBLES.length) {
  console.log('✓ Un vrai navigateur passe. La collecte automatique redevient possible :');
  console.log('  envoie-moi cette sortie et je réécris le scraper sur cette base.\n');
} else if (reussites > 0) {
  console.log(`~ ${reussites} adresse(s) sur ${CIBLES.length} sont passées. Envoie-moi cette sortie,`);
  console.log('  le détail décide de ce qui est récupérable.\n');
} else {
  console.log('✗ Même un vrai navigateur est refusé depuis cette machine.');
  console.log('  La porte est close : il faudra demander un accès à Marstoy.\n');
}

process.exit(reussites === 0 ? 1 : 0);
