import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Production base path. GitHub Pages serves project sites from /<repo>/, so the
 * deploy workflow sets BASE_PATH=/<repo-name>/. Renaming the repo therefore
 * needs no code change. Locally, `npm run build` defaults to /airslides/.
 */
function productionBase(): string {
  const raw = process.env.BASE_PATH ?? '/airslides/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export default defineConfig(({ command, mode, isPreview }) => {
  const plugins: Plugin[] = [];
  // `npm run dev:https` → self-signed cert so phones on the same Wi-Fi get a
  // secure context (getUserMedia requires HTTPS off localhost).
  if (mode === 'https') plugins.push(basicSsl());

  return {
    base: command === 'build' || isPreview ? productionBase() : '/',
    plugins,
    build: {
      target: 'es2022',
      sourcemap: true,
    },
    optimizeDeps: {
      // Both ship pre-bundled ESM; skipping the optimizer keeps their
      // import.meta.url-relative asset logic intact.
      exclude: ['@mediapipe/tasks-vision', 'pdfjs-dist'],
    },
    server: { port: 5173 },
    preview: { port: 4173 },
  };
});
