# Manual test checklist (real camera)

Automated tests use synthetic hands and a fake camera, so they can't tell whether _your_ hands, in
_your_ lighting, are recognised reliably. Run this checklist before a talk or after changing
thresholds. Keep the **Playground** open in another tab: when something misfires, its readouts
(speed sparkline, pinch meter, hold bars, event log) show why.

Record anything interesting as a fixture (Playground → _Record a test fixture_) so it becomes a
regression test. See `tests/fixtures/recorded/README.md`.

## Setup

- [ ] Laptop: Chrome or Edge, `npm run dev` (or the live site), camera allowed
- [ ] Note the Playground **FPS** and **engine** (GPU / CPU): ______
- [ ] Two distances: **near** ≈ 0.5 m and **far** ≈ 1.5 m from the camera
- [ ] Two lighting setups: **bright** (lamp or daylight in front) and **dim** (one lamp, or a window behind you)
- [ ] Both hands (left and right)

## Each gesture × 5 attempts

Start the tutorial or open a PDF. For each row, do the gesture five times and count successes
(the intended action fired exactly once) and false triggers (anything else fired).

| Gesture                               | Near / bright | Near / dim | Far / bright | Far / dim | Left hand | Notes |
| ------------------------------------- | ------------- | ---------- | ------------ | --------- | --------- | ----- |
| Swipe left → next (×5)                | \_ / 5        | \_ / 5     | \_ / 5       | \_ / 5    | \_ / 5    |       |
| Swipe right → previous (×5)           | \_ / 5        | \_ / 5     | \_ / 5       | \_ / 5    | \_ / 5    |       |
| Swipe + natural swing back: no "prev" | \_ / 5        | \_ / 5     | \_ / 5       | \_ / 5    | \_ / 5    |       |
| Pinch → laser appears / follows       | \_ / 5        | \_ / 5     | \_ / 5       | \_ / 5    | \_ / 5    |       |
| Laser reaches all 4 slide corners     | \_ / 5        | \_ / 5     | \_ / 5       | \_ / 5    | \_ / 5    |       |
| Open palm hold → blackout toggles     | \_ / 5        | \_ / 5     | \_ / 5       | \_ / 5    | \_ / 5    |       |
| Thumbs up hold → timer toggles        | \_ / 5        | \_ / 5     | \_ / 5       | \_ / 5    | \_ / 5    |       |
| Fist hold → lock toggles              | \_ / 5        | \_ / 5     | \_ / 5       | \_ / 5    | \_ / 5    |       |

## False-trigger checks (expect **zero** events)

| Scenario (≈ 30 s each)                                            | Events fired | Notes |
| ----------------------------------------------------------------- | ------------ | ----- |
| **Locked**, talking with your hands expressively                  |              |       |
| Unlocked, talking with small, low hand movements                  |              |       |
| Raising a hand into the frame and lowering it, 10×                |              |       |
| Swipe, then keep the open hand raised still for 3 s (no blackout) |              |       |
| Scratching your face / adjusting glasses                          |              |       |
| Someone walking behind you                                        |              |       |

## Devices (live URL: https://beapoquiz.github.io/airslides/)

| Device / browser             | Camera starts | FPS | Tutorial usable | PDF opens | Portrait OK | Landscape OK | Notes |
| ---------------------------- | ------------- | --- | --------------- | --------- | ----------- | ------------ | ----- |
| Windows laptop · Chrome/Edge |               |     |                 |           | n/a         |              |       |
| Android phone · Chrome       |               |     |                 |           |             |              |       |
| iPhone · Safari              |               |     |                 |           |             |              |       |
| iPad / tablet                |               |     |                 |           |             |              |       |

Also check on a phone: the camera bubble doesn't cover important content, the timer and counter
are readable, taps on the left/right third navigate, and "Turn your phone sideways" shows for PDFs
in portrait.

## Keyboard-only run (camera blocked)

- [ ] Block the camera → friendly "permission blocked" message; the app still works
- [ ] Tutorial: → / ← / PageDown / PageUp / Space / Home / End
- [ ] PDF: open via button and via drag-and-drop; navigate the whole deck
- [ ] B, T, R, L, F, C, ? all behave as documented

## If something fails

1. Reproduce it in the Playground and watch the relevant readout.
2. Adjust the slider (it saves automatically), retry, and note the value that works.
3. Record a fixture of the failing gesture, change the default in `src/config.ts`, run `npm test`.
