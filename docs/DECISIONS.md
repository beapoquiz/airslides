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
- **Swipe detection is built around how MediaPipe behaves during a fast swipe** (measured, see
  "Swipe responsiveness pass" below): landmarks freeze and then leap, the hand drops out for a
  few frames, and blur distorts palm size and finger state. Palm size and "open hand" are
  therefore measured while the hand is still and held during motion, and a single large
  horizontal leap (or a dropout of up to 300 ms ending in one) counts as swipe evidence.
- **Rejected swipe candidates consume their motion** (buffer cleared). Otherwise a return stroke
  suppressed at t = 900 ms would still sit in the buffer and fire at t = 1001 ms.
- **Cooldown and return-stroke timers survive a hand loss.** A fast swipe often carries the
  hand out of frame; when it comes back it must not fire the other way.
- **Hold presence is a time budget, not a sliding frame ratio.** "Present in ≥ 80 % of frames in
  the window" with a fixed 1 s window would delay every hold after a different pose (old frames
  must age out first). Instead a hold starts on the first matching frame and tolerates up to
  (1 − 0.8) × duration = 200 ms of cumulative absence. Stationarity is measured from where the
  hold began.
- **Holds fire after a 300 ms confirmation window** (`holdConfirmMs`): the progress ring fills in
  1 s, then the pose must stay still a little longer. See below for why.
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
  `swipeMaxSpeed`, `swipeMaxGapMs`, `swipeMaxDropoutMs`, `swipeMinMovingFrames`,
  `swipeSettleSpeed`, `holdConfirmMs`, `pinchMinIndexReach`): all in `config.ts` with comments.
  The most useful ones are sliders in the Playground.
- **Settings store only values that differ from the defaults**, so improving a default in a
  later release reaches existing users.

## Swipe responsiveness pass (October 2026)

Swipes felt unreliable and slow in real use, so they were measured on **real MediaPipe output**
instead of being tuned blind.

**Benchmark.** A 74 s camera clip was rendered from real hand photos (four FreiHAND images,
three hand sizes) with realistic velocity profiles and camera motion blur (70 % exposure). It
contains 20 swipes from 140 to 420 ms, each followed by a natural swing-back (60–450 ms pause,
220–600 ms long), plus negatives: a slow 2.6 s drift, a fast vertical move, and a hand sliding
into the frame. Headless Chromium played it as a fake camera into the dev build. Every
`HandFrame` was captured (two captures, 78 s and 40 s), aligned to the clip's ground truth, and
replayed offline through any controller version. A frame-fingerprint check confirmed that the
camera frames changed on almost every processed frame during motion, so the effects below are
MediaPipe's, not the harness's. FreiHAND is research-only, so the clip and captures are not in
the repo.

**What MediaPipe does during a fast, blurred swipe:**

1. **Landmarks freeze, then leap.** The tracker keeps reporting the old position for 100–250 ms
   while the hand is already moving, then reports it at the far side in one frame (up to
   ~100 palm sizes/s).
2. **The hand drops out** for 1–6 frames (up to ~270 ms) mid-swipe.
3. **Palm size is distorted** by up to ±60 %, and fingers can look curled.
4. **Handedness flips** with high confidence (e.g. Right 0.97 → Left 0.91) during the motion.

The original detector rejected exactly this pattern as a "tracking glitch". Missed swipes then
let the slower, well-tracked swing-back fire the _opposite_ direction. Separately, a palm resting
~1 s before a swipe plus the frozen frames completed the 1 s palm hold, blacking out the screen
and swallowing every later swipe.

**Changes:**

- A single big horizontal leap, or a dropout of ≤ 300 ms ending in one, counts as two moving
  frames. It is rejected only if mostly vertical or if the palm size changes drastically
  (< 0.4× or > 2.5×). Handedness and tight size checks were tried and dropped: points 3 and 4
  made them reject real swipes.
- Palm size (the distance unit) and the open-hand state are taken from still frames and held
  while the hand moves; only _still_, closed frames wipe the history.
- A swipe-shaped motion that didn't fire still suppresses its own swing-back, and a swing-back
  that starts inside the suppression window stays suppressed until the hand settles. When it
  settles, its buffered motion is discarded.
- Repeats are faster: cooldown 700 → 400 ms, plus a settle rule (the hand must drop below
  1.5 palm/s before the same direction fires again) so one long sweep can't fire twice.
- Swipe distance 1.5 → 1.2 palm sizes. On real 30 fps tracking this fires roughly 10 ms
  earlier per swipe; 1.0 was slightly faster still in the benchmark, but 1.2 keeps more margin
  against talking with your hands. The Playground slider goes lower.
- Holds need a 300 ms confirmation window after the ring fills, so a swipe hidden by frozen
  landmarks cancels the hold instead of turning into a blackout.

**Result** (full system, default settings):

|                                               | Before       | After             |
| --------------------------------------------- | ------------ | ----------------- |
| Swipes detected, capture 1 / 2                | 7/21 · 4/12  | **21/21 · 12/12** |
| Slide moved the wrong way                     | 9            | **0**             |
| Accidental blackouts                          | 3            | **0**             |
| Median latency on swipes both versions caught | 236 · 305 ms | **225 · 190 ms**  |
| Negatives triggered                           | 0            | 1 (see below)     |

The one negative trigger is a stall in Chrome's fake camera that skipped 600 ms of video, so
one hand appeared to teleport to a different spot. In real use this corresponds to tracking
jumping to another hand of similar size, which is rare. Most of the remaining latency is
MediaPipe's own tracking lag on blurred frames. Bright lighting shortens the camera's exposure,
which reduces blur and lag, and the Help page now says so.

**Differences from the original brief:** swipe cooldown 400 ms (brief: 700), swipe distance
1.2 palm sizes (brief: 1.5), and holds fire at ~1.3 s (brief: ~1 s), all for the reasons above.

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
