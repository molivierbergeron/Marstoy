/**
 * Le registre des créations maison. Ce qu'il doit garantir tient en une
 * phrase : ne jamais faire disparaître une copie légale du catalogue, quel que
 * soit le temps de collecte qu'il fait gagner.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { choisirFiches, elaguer, majRegistre } from '../scripts/lib/moc-registry.mjs';

const LE = (jour) => new Date(`2026-09-${jour}T12:00:00Z`);

test('une fiche jamais vue est toujours chargée', () => {
  const tri = choisirFiches(['https://m/a', 'https://m/b'], {}, { maintenant: LE(30) });
  assert.deepEqual(tri.aCharger, ['https://m/a', 'https://m/b']);
  assert.equal(tri.nouvelles, 2);
  assert.equal(tri.ignorees, 0);
});

test('une création maison connue est ignorée', () => {
  const registre = { 'https://m/moc': '2026-09-28' };
  const tri = choisirFiches(['https://m/moc', 'https://m/neuf'], registre, { maintenant: LE(30) });

  assert.deepEqual(tri.aCharger, ['https://m/neuf']);
  assert.equal(tri.ignorees, 1);
});

test('une fiche qui livre enfin un code sort du registre', () => {
  // Marstoy renomme « The Rack Railway » en « MOC M70334 » : elle devient une
  // vraie copie et doit être rechargée à chaque passage désormais.
  const registre = { 'https://m/x': '2026-09-01', 'https://m/y': '2026-09-01' };
  const suivant = majRegistre(registre, [
    { url: 'https://m/x', aCode: true },
    { url: 'https://m/y', aCode: false },
  ], LE(30));

  assert.equal(suivant['https://m/x'], undefined);
  assert.equal(suivant['https://m/y'], '2026-09-30');
});

test('les fiches connues sont revisitées, mais pas toutes le même jour', () => {
  // 500 créations inscrites le même jour, toutes expirées : sans plafond,
  // une collecte sur treize serait aussi lente qu'avant.
  const registre = {};
  const urls = [];
  for (let i = 0; i < 500; i += 1) {
    const url = `https://m/moc-${i}`;
    urls.push(url);
    registre[url] = '2026-01-01';
  }

  const tri = choisirFiches(urls, registre, { maintenant: LE(30), revisitesMax: 200 });
  assert.equal(tri.revisitees, 200);
  assert.equal(tri.ignorees, 300);
});

test('la revisite prend les plus anciennes d\'abord, pour tourner', () => {
  const registre = {
    'https://m/vieille': '2026-01-01',
    'https://m/moyenne': '2026-03-01',
    'https://m/fraiche': '2026-09-29',
  };
  const tri = choisirFiches(Object.keys(registre), registre, {
    maintenant: LE(30),
    revisitesMax: 1,
  });

  assert.deepEqual(tri.aCharger, ['https://m/vieille']);
});

test('une date illisible ne bloque pas la fiche pour toujours', () => {
  // Un registre corrompu à la main ne doit pas condamner une fiche au silence.
  const registre = { 'https://m/cassee': 'pas-une-date' };
  const tri = choisirFiches(['https://m/cassee'], registre, { maintenant: LE(30) });
  assert.deepEqual(tri.aCharger, ['https://m/cassee']);
});

test('un produit retiré de la boutique quitte le registre', () => {
  const registre = { 'https://m/a': '2026-09-01', 'https://m/parti': '2026-09-01' };
  assert.deepEqual(elaguer(registre, ['https://m/a']), { 'https://m/a': '2026-09-01' });
});
