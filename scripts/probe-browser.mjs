#!/usr/bin/env node
/**
 * La boutique est-elle lisible, par le chemin exact qu'emprunte le build ?
 *
 * Version précédente de cette sonde : elle chargeait les adresses avec
 * `page.goto` et concluait « ça passe ». Le build, lui, utilisait
 * `contexte.request` — un client HTTP Node qui partage les cookies du
 * navigateur mais pas sa pile réseau. Il s'est fait refuser alors que la sonde
 * avait dit oui. Une sonde qui teste autre chose que le code réel ne prédit
 * rien du tout.
 *
 * Celle-ci passe donc par `ouvrirTransport`, le transport du build lui-même.
 * Ce qu'elle constate vaut pour la collecte.
 */

import { ouvrirTransport } from './lib/marstoy-browser.mjs';

const ORIGIN = process.env.MARSTOY_ORIGIN || 'https://www.marstoy.com';
const CIBLES = [
  { url: `${ORIGIN}/sitemap.xml`, accept: 'application/xml', attendu: /<sitemapindex|<urlset/i },
  { url: `${ORIGIN}/sitemap_products_1.xml`, accept: 'application/xml', attendu: /<urlset|<loc>/i },
];

const estDefi = (texte) => /just a moment|challenges\.cloudflare\.com/i.test(texte);

console.log('\n▸ Ouverture du navigateur (le build fait exactement pareil)');
console.log('  Une fenêtre va s\'afficher. Laisse-la travailler.\n');

let transport;
try {
  transport = await ouvrirTransport({ log: (message) => console.log(`  ${message}`) });
} catch (error) {
  console.error(`\n✗ ${error?.message || error}\n`);
  process.exit(1);
}

console.log();
let reussites = 0;

try {
  for (const { url, accept, attendu } of CIBLES) {
    console.log(`  ${url}`);
    try {
      const reponse = await transport.get(url, { accept });
      const corps = await reponse.text();

      if (estDefi(corps)) {
        console.log(`    ✗ HTTP ${reponse.status} — défi Cloudflare\n`);
      } else if (!reponse.ok) {
        console.log(`    ✗ HTTP ${reponse.status}\n`);
      } else if (!attendu.test(corps)) {
        // Un 200 qui ne contient pas ce qu'on attend est un piège : la page
        // d'erreur d'une boutique répond souvent 200.
        console.log(`    ✗ HTTP 200 mais pas le document attendu — ${corps.replace(/\s+/g, ' ').slice(0, 90)}…\n`);
      } else {
        reussites += 1;
        const liens = (corps.match(/<loc>/g) || []).length;
        console.log(`    ✓ HTTP 200 — ${corps.length} octets${liens ? `, ${liens} adresse(s)` : ''}\n`);
      }
    } catch (error) {
      console.log(`    ✗ ${String(error?.message || error).split('\n')[0].slice(0, 110)}\n`);
    }
  }
} finally {
  await transport.close();
}

console.log('=== Verdict ===\n');
if (reussites === CIBLES.length) {
  console.log('✓ La boutique répond par le chemin exact du build.');
  console.log('  Lance le rafraîchissement : il empruntera le même transport.\n');
} else {
  console.log(`✗ ${CIBLES.length - reussites} adresse(s) sur ${CIBLES.length} ne répondent pas.`);
  console.log('  Envoie-moi cette sortie plutôt que de lancer une collecte de dix minutes.\n');
}

process.exit(reussites === CIBLES.length ? 0 : 1);
