import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  candidateGroups,
  candidateSetNumbers,
  codeDigits,
  extractCodes,
  formatLabel,
  replaceCodes,
} from '../src/setnum.js';

test('extractCodes trouve les références Marstoy et dédoublonne', () => {
  assert.deepEqual(extractCodes('M67201 et m67201, plus M29157.'), ['M67201', 'M29157']);
});

test('extractCodes ignore ce qui ressemble à une référence sans en être une', () => {
  assert.deepEqual(extractCodes('M12 M1234567890 ABCM1234 taille M'), []);
});

test('extractCodes lit aussi les références collées à la ponctuation', () => {
  assert.deepEqual(extractCodes('(M10276) — "M375"'), ['M10276', 'M375']);
});

test('codeDigits retire le préfixe', () => {
  assert.equal(codeDigits('M67201'), '67201');
});

test('candidateSetNumbers inverse les chiffres en priorité', () => {
  assert.equal(candidateSetNumbers('67201')[0], '10276');
  assert.equal(candidateSetNumbers('29157')[0], '75192');
});

test('candidateSetNumbers rattrape les zéros de tête perdus', () => {
  // LEGO 41900 -> 00914 -> Marstoy affiche M914 : les zéros mangés se
  // retrouvent à la fin du numéro LEGO.
  assert.deepEqual(candidateSetNumbers('914'), ['419', '4190', '41900', '914']);
});

test('candidateGroups sépare l\'inversion du repli non inversé', () => {
  assert.deepEqual(candidateGroups('914'), [['419', '4190', '41900'], ['914']]);
  assert.deepEqual(candidateGroups('67201'), [['10276'], ['67201']]);
});

test('candidateSetNumbers propose la référence non inversée en dernier recours', () => {
  const candidates = candidateSetNumbers('10276');
  assert.equal(candidates[0], '67201');
  assert.equal(candidates.at(-1), '10276');
});

test('candidateSetNumbers ne renvoie que des numéros plausibles et uniques', () => {
  const candidates = candidateSetNumbers('11111');
  assert.deepEqual(candidates, ['11111']);
  for (const candidate of candidateSetNumbers('123')) {
    assert.ok(candidate.length >= 3 && candidate.length <= 7);
  }
});

test('replaceCodes remplace uniquement les références connues', () => {
  const lookup = (code) => (code === 'M67201' ? 'Hogwarts Castle — LEGO 10276 · M67201' : null);
  assert.equal(
    replaceCodes('Boîte M67201 vs M99999', lookup),
    'Boîte Hogwarts Castle — LEGO 10276 · M67201 vs M99999',
  );
});

test('replaceCodes est idempotent (le libellé contient encore la référence)', () => {
  const lookup = (code) => (code === 'M67201' ? 'Hogwarts Castle — LEGO 10276 · M67201' : null);
  const once = replaceCodes('M67201', lookup);
  assert.equal(replaceCodes(once, lookup), once);
});

test('replaceCodes traite plusieurs références consécutives', () => {
  const lookup = (code) => `[${code}]`;
  assert.equal(replaceCodes('M111 M222 M333', lookup), '[M111] [M222] [M333]');
});

test('formatLabel applique le gabarit configuré', () => {
  const resolution = { name: 'Hogwarts Castle', num: '10276', setNum: '10276-1', year: 2020, numParts: 6020 };
  assert.equal(
    formatLabel(resolution, 'M67201', '{name} ({num}, {year}, {parts} pièces) [{code}]'),
    'Hogwarts Castle (10276, 2020, 6020 pièces) [M67201]',
  );
  assert.equal(formatLabel(resolution, 'M67201'), 'Hogwarts Castle — LEGO 10276 · M67201');
});
