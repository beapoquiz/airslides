#!/usr/bin/env node
// Downloads the MediaPipe gesture recognizer model into public/models/ if it
// is missing. Runs automatically before `dev` and `build`.
//
// The .task file is gitignored: model weights never go into git. At runtime
// the app loads this local copy and falls back to the Google URL if needed.
//
// Offline locally → warns and continues (the runtime fallback still works).
// In CI (CI env var set) → fails, so a deploy never ships without the model.
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const MIN_BYTES = 1_000_000; // a truncated download is smaller than this

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models');
const outFile = join(outDir, 'gesture_recognizer.task');

function isPresent() {
  return existsSync(outFile) && statSync(outFile).size >= MIN_BYTES;
}

async function main() {
  if (isPresent()) {
    console.log(`[fetch-model] model present (${(statSync(outFile).size / 1e6).toFixed(1)} MB)`);
    return;
  }
  mkdirSync(outDir, { recursive: true });
  console.log(`[fetch-model] downloading ${MODEL_URL}`);
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_BYTES) throw new Error(`download too small (${buf.length} bytes)`);
  const tmp = `${outFile}.part`;
  writeFileSync(tmp, buf);
  renameSync(tmp, outFile);
  console.log(`[fetch-model] saved ${outFile} (${(buf.length / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  try {
    rmSync(`${outFile}.part`, { force: true });
  } catch {
    /* ignore */
  }
  const msg = `[fetch-model] could not download the model: ${err instanceof Error ? err.message : err}`;
  if (process.env.CI) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`${msg}\n[fetch-model] continuing; the app will load the model from Google's CDN.`);
});
