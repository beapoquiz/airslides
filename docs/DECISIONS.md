# Decisions

Choices that aren't obvious from the code, and why. Newest context first within each section.

## Tooling

- **TypeScript 6.0, not 7.** TypeScript 7 (the native port) was the latest release, but
  `typescript-eslint` 8.71 supports `>=4.8.4 <6.1.0`. Pinned `~6.0.3` so lint and types agree. TS 6
  defaults `types` to `[]`, so `tsconfig.json` lists `vite/client` and `node` explicitly.
- **Latest majors elsewhere:** Vite 8 (Rolldown), Vitest 5, ESLint 10 (flat config),
  Playwright 1.63, `@mediapipe/tasks-vision` 1.0.1, `pdfjs-dist` 6.3. APIs were checked against
  the installed `.d.ts` files (e.g. pdf.js 6 renders with `render({ canvas, viewport })`, and
  `PDFDocumentProxy` has no `destroy()`, so teardown goes through `loadingTask.destroy()`).
- **Separate `vitest.config.ts`** so unit tests don't load the HTTPS plugin; `passWithNoTests`
  lets the very first scaffold commit pass.
- **Asset copying with a small Node script** (`scripts/copy-assets.mjs`) instead of
  `vite-plugin-static-copy`: one fewer dependency, and copying into `public/` makes the files
  available to the dev server _and_ the build with no plugin logic. The copies are gitignored.
  The script resolves packages by path because `@mediapipe/tasks-vision`'s `exports` map hides
  its `package.json`.
- **All three MediaPipe WASM variants are shipped** (SIMD, no-SIMD, ES-module; ~34 MB total).
  Only the first two are used today, but the loader picks the variant at runtime and the extra
  12 MB on GitHub Pages is cheaper than a hard-to-debug load failure after a package upgrade.
- **pdf.js cMaps, standard fonts, JPX/JBIG2 WASM and ICC profiles are self-hosted** too (~4 MB)
  so PDFs with non-embedded fonts or JPEG 2000 images render, with no third-party requests.
- **`fetch-model.mjs` warns locally but fails in CI.** Offline development still works (the
  runtime falls back to Google's CDN), but a deploy can never ship without the local model.
- **Base path from `BASE_PATH`.** Production builds default to `/airslides/`. The deploy
  workflow sets `BASE_PATH=/${{ github.event.repository.name }}/`, so a renamed repo needs no code
  change. `vite preview` uses the production base too, so E2E tests the real path.
- **E2E runs against the production build**, not the dev server, so the base path, lazy chunks,
  self-hosted WASM and pdf.js worker are all exercised.
- **Deploy gates on typecheck + unit tests + build only**, as specified. E2E lives in `ci.yml`.
  `actions/configure-pages` is not used: it fails when Pages isn't enabled yet, and the base path
  is derived from the repo name anyway.
- **GitHub Actions versions** (`checkout@v7`, `setup-node@v7`, `upload-pages-artifact@v5`,
  `deploy-pages@v5`, `upload-artifact@v7`) are the latest major tags at the time of writing.
- **`.gitattributes` forces LF** so Prettier's `endOfLine: lf` check passes on Windows checkouts.

## Engine and runtime

- **`LandmarkEngine.detect` may return a Promise.** The spec's interface returns a `HandFrame`
  synchronously, which suits MediaPipe, but `onnxruntime-web` (phase 2) is async. The frame loop
  awaits the result and never starts another inference while one is pending.
- **The model is fetched as bytes, then passed as `modelAssetBuffer`.** This allows a clean
  local → Google CDN fallback and a size check. Vite's dev server answers missing files with
  `index.html` and HTTP 200, so "is it > 1 MB" is the check that actually catches a missing
  model. The same buffer is reused for the GPU and CPU delegate attempts.
- **GPU → CPU fallback at creation time.** `createFromOptions` throws when WebGL2 isn't usable.
- **Status stays "Loading…" until the first inference completes.** The GPU delegate compiles
  shaders on the first frame (seconds on slow devices; ~11 s in headless Chromium). That first
  inference is excluded from the reported average.
- **Handedness is swapped.** MediaPipe assumes a mirrored (selfie) input; we feed the raw camera
  frame, so its "Left" is the presenter's right hand. Handedness is display-only.
- **Frame loop:** `requestVideoFrameCallback` where available, otherwise `requestAnimationFrame`
  plus a `currentTime` check. A 1 s watchdog switches to rAF if rVFC stops firing (some browsers
  stop it for a video that isn't painted). For the same reason the camera bubble is hidden with
  opacity, never `display: none`.
- **One shared runtime** (camera, engine, controller) for all views: switching between Present
  and Playground doesn't re-prompt for the camera or reload the model. The single `<video>` element
  is moved between views.
- **Camera start:** automatic only if permission was already granted (Permissions API).
  Otherwise it starts when the user starts a deck or clicks "Enable camera", so first-time
  visitors aren't greeted by a permission prompt.
- **Dev-only debugging handle** `window.__airslides` (runtime + controller). It is stripped
  from production builds (verified in `dist/`).

## Gesture logic

Everything in §5 of the brief is implemented as written. The items below are additions or
interpretations, several of them found by replaying **real MediaPipe output**. Headless
Chromium was fed a Y4M "camera" clip of a real hand photo moving across the frame; the
`HandFrame`s were captured and replayed through the controller offline.

- **Laser smoothing happens in camera pixels.** With normalised coordinates, speeds are ~1–3
  units/s, so `beta = 0.02` barely raises the cutoff and the laser lags. In camera pixels (~300–600
  px/s), the specified starting values (`minCutoff 1.0, beta 0.02, dCutoff 1.0`) behave as
  intended. The filtered point is then mapped through the active region.
- **Pinch index-reach guard** (`pinchMinIndexReach = 1.1`). In a fist the curled index tip rests
  next to the thumb: the synthetic fist has a thumb–index ratio of ~0.2, well under the 0.35 enter
  threshold. Entering a pinch therefore also requires
  `dist(wrist, indexTip) / dist(wrist, indexMCP) ≥ 1.1` (≈ 0.85 in a fist, ≈ 1.5 when pinching).
  It only gates _entering_, so an established pinch doesn't flicker.
- **"Open hand" for swiping is judged over the window, not per frame.** ≥ 70 % of samples in the
  350 ms window must be open, because fast motion blurs fingers for a frame or two. Three
  consecutive not-open frames wipe the history, so motion made with a closed hand never counts
  once the hand opens.
- **Tracking-glitch rejection.** Three rules:
  1. A frame-to-frame jump faster than 50 palm/s (≈ 5 m/s) restarts the history.
  2. Speed measured across a dropout longer than 100 ms doesn't count toward the peak speed.
  3. At least **2 consecutive frame pairs** must move at swipe speed.

  Real data showed MediaPipe losing the hand for one frame and re-detecting it 4 palms away
  97 ms later. That single step fell just under both thresholds 1 and 2 and fired a phantom
  "previous". With rule 3, a 40 s capture (the clip loops, re-detecting the hand each time)
  detected 5 of 5 swipes with no false triggers.

- **Rejected swipe candidates consume their motion** (buffer cleared). Otherwise a return stroke
  suppressed at t = 900 ms would still sit in the buffer and fire at t = 1001 ms.
- **Cooldown and return-stroke timers survive a hand loss.** A fast swipe often carries the
  hand out of frame; when it comes back it must not fire the other way.
- **Hold presence is a time budget, not a sliding frame ratio.** "Present in ≥ 80 % of frames in
  the window" with a fixed 1 s window would delay every hold after a different pose (old frames
  must age out first). Instead a hold starts on the first matching frame and tolerates up to
  (1 − 0.8) × duration = 200 ms of cumulative absence. Stationarity is measured from where the
  hold began.
- **After a swipe, the palm hold is latched until the hand is lowered.** Presenters often keep an
  open hand raised after swiping; without this, one second of rest would black out the screen.
  Found while writing tests: sequences with an open hand resting > 1 s between swipes blacked out.
- **Canned "None" wins.** As specified, a confident (≥ 0.6) canned label overrides the rules,
  including `None → other`. In the real-hand test clip MediaPipe reported `None (0.63)`, just
  over the threshold. If palm / fist / thumbs-up holds feel unreliable with real hands, the first
  thing to try is trusting only canned labels that map to a pose, or raising `cannedMinScore`.
  The Playground shows canned and rule-based poses side by side for exactly this comparison.
- **Controller state priority:** `LOCKED > BLACKOUT > NO_HAND > PINCHING > ACTIVE`, so the bubble
  shows the lock even with no hand in view. Lock and blackout live in the controller; the `L`/`B`
  keys call the same methods as the gestures, so both paths emit identical events.
- **More tunables than the brief lists** (`swipeOpenFraction`, `swipeClosedFramesReset`,
  `swipeMaxSpeed`, `swipeMaxGapMs`, `swipeMinMovingFrames`, `pinchMinIndexReach`): all in
  `config.ts` with comments. The most useful ones are sliders in the Playground.
- **Settings store only values that differ from the defaults**, so improving a default in a
  later release reaches existing users.

## Present view and UX

- **Keyboard next/previous during blackout restores the slide** instead of navigating (like
  PowerPoint's B). Gestures can't navigate during blackout at all, as specified.
- **Tap zones on touch screens:** left third = previous, elsewhere = next. Phones have no
  keyboard, and gesture-less presenting still needs to work.
- **Swipe left on the start screen starts the tutorial.** A palm-hold there is ignored, since
  there is nothing to black out.
- **The tutorial's practice slide (2) intercepts only _gesture_ navigation** until both
  directions were practised. Keyboard users can always move on.
- **The tutorial deck reflows for portrait phones** (container queries, one "slide unit" that is
  height-based in landscape and width-based in portrait). PDFs keep their aspect ratio and show
  "Turn your phone sideways" in portrait.
- **pdf.js legacy build** (includes polyfills) for older iPads and Android tablets. Canvases
  are capped at 16 MP to avoid out-of-memory crashes on 4K screens at high zoom. An LRU cache of 6
  rendered pages plus prerendering of the neighbours makes navigation instant.
- **Deck, slide position and talk timer survive a trip to Help or the Playground**, and are
  reset when the deck is closed.
- **Blackout dims the camera bubble** (to 40 %) rather than hiding it, so the presenter can
  still see the palm-hold ring when restoring.
- **Help icons are simple rounded-shape drawings** made for this project (no icon packs or
  copyrighted assets).

## Recordings and tests

- **Recording format:** `{ version, label, engine, recordedAt, durationMs, frames: HandFrame[] }`.
  The replay test also accepts a bare `HandFrame[]` and takes the label from the filename.
- **`idle_talking` asserts "no navigation" only**, as specified. Holds are allowed there, since
  a long still hand could legitimately be a hold.
- **No real-hand fixtures are committed.** The FreiHAND-based clip used during development came
  from a research-only dataset and stays out of the repo. The folder ships empty with a README;
  the test skips until real recordings are added.
- **`docs/demo.gif` is a UI tour** built from screenshots of the real app, with a comment in the
  README explaining how to replace it with a recording of real gestures.

## Publishing

- **Git identity:** the existing global identity was used, as instructed (no per-repo override).
- **`gh` was not installed**, so the repo was committed locally and the GitHub commands were
  handed over instead of run (brief §12).
