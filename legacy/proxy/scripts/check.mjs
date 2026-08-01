#!/usr/bin/env node
/**
 * Diagnostic rapide, sans déploiement : vérifie que la clé Rebrickable
 * fonctionne et que l'inversion des chiffres tombe sur les bons sets.
 *
 *   npm run check M67201 M29157
 *
 * La clé est lue dans la variable d'environnement REBRICKABLE_API_KEY ou dans
 * le fichier `.dev.vars` (ignoré par git). Elle n'est jamais affichée.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveUncached } from '../src/resolve.js';
import { candidateSetNumbers, codeDigits, extractCodes } from '../src/setnum.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readKey() {
  if (process.env.REBRICKABLE_API_KEY) return process.env.REBRICKABLE_API_KEY;
  try {
    const contents = await readFile(path.join(root, '.dev.vars'), 'utf8');
    const line = contents.split('\n').find((row) => row.trim().startsWith('REBRICKABLE_API_KEY='));
    const value = line?.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
    if (value) return value;
  } catch {
    // pas de .dev.vars : on tombe dans l'erreur ci-dessous
  }
  return null;
}

const args = process.argv.slice(2);
const codes = extractCodes(args.join(' '));

if (!codes.length) {
  console.error('Usage : npm run check M67201 M29157 …');
  process.exit(2);
}

const apiKey = await readKey();
if (!apiKey) {
  console.error(
    'Clé Rebrickable introuvable.\n' +
      "  cp .dev.vars.example .dev.vars   puis renseigne REBRICKABLE_API_KEY\n" +
      '  (ou exporte REBRICKABLE_API_KEY dans ton shell)',
  );
  process.exit(2);
}

let failures = 0;

for (const code of codes) {
  const candidates = candidateSetNumbers(codeDigits(code));
  const resolution = await resolveUncached(code, apiKey);

  if (resolution.ok) {
    const details = [resolution.year, resolution.numParts ? `${resolution.numParts} pièces` : null]
      .filter(Boolean)
      .join(', ');
    console.log(`✅ ${code} → LEGO ${resolution.num} · ${resolution.name}${details ? ` (${details})` : ''}`);
    console.log(`   image : ${resolution.imgUrl}`);
    console.log(`   fiche : ${resolution.setUrl}`);
  } else {
    failures += 1;
    console.log(`❌ ${code} → ${resolution.reason}`);
    console.log(`   candidats essayés : ${candidates.join(', ')}`);
  }
}

if (failures) {
  console.log(
    `\n${failures} référence(s) non résolue(s). Si tu connais le bon set, ajoute-le dans ` +
      'overrides.json (ex. "M12345": "10276-1") et redéploie.',
  );
}

process.exit(failures ? 1 : 0);
