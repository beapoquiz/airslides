#!/usr/bin/env node
// Copies runtime assets that must be served as plain files (not bundled) from
// node_modules into public/, so the dev server and the production build both
// serve them from the app's own origin:
//
//   @mediapipe/tasks-vision/wasm → public/mediapipe/wasm   (JS/WASM versions always match)
//   pdfjs-dist/{cmaps,standard_fonts,wasm,iccs} → public/pdfjs/…  (non-embedded fonts, JPX/JBIG2)
//
// Cross-platform (plain Node, no shell syntax). Runs before `dev` and `build`.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Resolved by path: @mediapipe/tasks-vision's "exports" map hides package.json.
function pkgDir(name) {
  return join(root, 'node_modules', ...name.split('/'));
}

const jobs = [
  {
    from: join(pkgDir('@mediapipe/tasks-vision'), 'wasm'),
    to: join(root, 'public', 'mediapipe', 'wasm'),
  },
  ...['cmaps', 'standard_fonts', 'wasm', 'iccs'].map((d) => ({
    from: join(pkgDir('pdfjs-dist'), d),
    to: join(root, 'public', 'pdfjs', d),
  })),
];

for (const { from, to } of jobs) {
  if (!existsSync(from)) {
    console.warn(`[copy-assets] missing ${from} (skipped)`);
    continue;
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}
console.log('[copy-assets] MediaPipe WASM + pdf.js assets copied to public/');
