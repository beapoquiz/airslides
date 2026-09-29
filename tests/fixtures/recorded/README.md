# Recorded gesture fixtures

Real landmark recordings from your own camera, replayed by
[`tests/fixtures.test.ts`](../../fixtures.test.ts) to make sure the gesture
logic behaves on real data and not only on the synthetic hands in
`tests/helpers/`. The folder starts empty and the test is skipped until you
add a recording.

A recording contains only the 21 landmarks per frame (plus handedness and
MediaPipe's gesture label). It contains **no video or images**.

## Recording a fixture

1. `npm run dev`, open <http://localhost:5173/#/playground> and allow the camera.
2. In **Record a test fixture**, pick a gesture label and a duration (3–5 s is plenty).
3. Click **● Record**. You get a 3-second countdown, then do the gesture **once**.
   Recording stops by itself, or click **■ Stop** to stop early.
4. The browser downloads `label_YYYYMMDD-HHMMSS.json`. Move it into this folder.
5. `npm test`. The file shows up as its own test case.

## Labels and what the test expects

| Label             | Do this while recording                                   | Expected                             |
| ----------------- | --------------------------------------------------------- | ------------------------------------ |
| `swipe_left`      | one open-hand swipe toward your left, then lower the hand | exactly one `next`, no `prev`        |
| `swipe_right`     | one open-hand swipe toward your right                     | exactly one `prev`, no `next`        |
| `pinch`           | pinch and move the laser around, then release             | at least one `laserMove`, no nav     |
| `open_palm_hold`  | hold an open palm still for ~1.5 s, then lower it         | exactly one `toggleBlackout`, no nav |
| `thumbs_up_hold`  | hold a thumbs up still for ~1.5 s                         | exactly one `toggleTimer`, no nav    |
| `fist_hold`       | hold a fist still for ~1.5 s                              | exactly one `toggleLock`, no nav     |
| `idle_talking`    | talk naturally with your hands for the whole recording    | no `next` / `prev`                   |
| `hand_enter_exit` | move your hand into the frame and out again, a few times  | no `next` / `prev`                   |

The label comes from the file's `label` field (or from the filename prefix),
so keep the downloaded name.

## Tips

- Record each label at a couple of distances (≈0.5 m and ≈1.5 m) and in
  different lighting. Those are the cases the synthetic tests can't cover.
- If a recording fails, that's a real bug report: open the same gesture in the
  Playground, look at the speed sparkline / pinch meter / hold bars, adjust the
  thresholds in `src/config.ts`, and re-run `npm test`.
- Keep files small (a few seconds each). They're JSON, so git handles them
  fine, but don't commit dozens of long recordings.
