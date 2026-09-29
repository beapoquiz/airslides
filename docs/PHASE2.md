# Phase 2: the thesis model as a second engine

Goal: add **BlazeHand-KD**, the BlazeHandLandmark student from my thesis
([heterogeneous-kd-2d-hand-pose-estimation](https://github.com/beapoquiz/heterogeneous-kd-2d-hand-pose-estimation)),
as a second `LandmarkEngine`. Then compare it live against MediaPipe in the Playground. v1
already has the extension point: `src/engine/registry.ts` lists the engine (disabled, "coming
soon"), and nothing after the engine depends on MediaPipe.

## 1. Which checkpoint

Use **`checkpoints/freihand_ft_best.pth`**, the FreiHAND fine-tune (50 epochs, starting from the
RHD-distilled `distilled_v2_ft_epoch_150.pth`). It has the best real-hand accuracy:

| Checkpoint             | Trained on                  | FreiHAND val (1,628 imgs)             |
| ---------------------- | --------------------------- | ------------------------------------- |
| `freihand_ft_best.pth` | RHD distillation → FreiHAND | **99.6 % PCK@0.2**, MPJPE 7.4 px      |
| RHD-only checkpoints   | synthetic RHD               | weaker on real hands, esp. fingertips |

Caveat: 99.6 % is measured on FreiHAND's **pre-cropped, hand-centred** images. Live, the crop
comes from a detector and is noisier (off-centre, partly cut off, motion blur), so expect lower
accuracy. That gap is exactly what the A/B mode (§6) should measure.

Checkpoints are gitignored in the thesis repo, so the weights first need to be published (§7).

## 2. Model I/O

From `student_model/blazehand_landmark.py`:

- **Input:** `1 × 3 × 256 × 256`, RGB, float32 in **[0, 1]** (`/ 255`, no mean/std).
  `forward` pads to 257×257 internally.
- **Outputs** (`forward` returns a tuple):
  - `hand_flag`: `(1,)`, sigmoid, hand-presence confidence.
  - `handedness`: `(1,)`, sigmoid.
  - `landmarks`: `(1, 21, 3)`, already divided by 256 → **crop-normalised** (x, y in [0, 1]
    of the 256×256 crop; z relative). Same 21-joint order as MediaPipe.

No gesture classifier: the engine emits `HandFrame`s **without** `cannedGesture`, and the
rule-based poses in `src/gestures/pose.ts` take over automatically.

## 3. Export to ONNX

```python
import torch, onnxruntime as ort, numpy as np
from blazehand_landmark import BlazeHandLandmark

model = BlazeHandLandmark()
model.load_state_dict(torch.load("checkpoints/freihand_ft_best.pth", map_location="cpu"))
model.eval()

x = torch.rand(1, 3, 256, 256)
torch.onnx.export(
    model, x, "blazehand_kd.onnx",
    input_names=["image"], output_names=["hand_flag", "handedness", "landmarks"],
    opset_version=17, dynamic_axes=None,
)

# Verify against PyTorch on a few random + real crops
sess = ort.InferenceSession("blazehand_kd.onnx", providers=["CPUExecutionProvider"])
with torch.no_grad():
    ref = [t.numpy() for t in model(x)]
out = sess.run(None, {"image": x.numpy()})
for name, a, b in zip(["hand_flag", "handedness", "landmarks"], ref, out):
    print(name, "max |Δ| =", float(np.abs(a - b).max()))   # expect < 1e-4
```

- Check the `F.pad` and bilinear `F.interpolate` ops export cleanly at opset 17. If not, try
  `align_corners=False` explicitly or opset 18.
- Optional **fp16**: `onnxconverter_common.float16.convert_float_to_float16` (≈ 4 MB instead of
  ≈ 8 MB). Re-run the max-|Δ| check; fp16 landmark error should stay well below 1 px.

## 4. Browser runtime

`onnxruntime-web`, trying the **WebGPU** execution provider first and falling back to **WASM**
(SIMD + threads where cross-origin isolation allows). Same pattern as the MediaPipe engine's
GPU → CPU fallback. Self-host the ORT `.wasm` files like the MediaPipe ones
(`scripts/copy-assets.mjs`).

`session.run()` is asynchronous. `LandmarkEngine.detect` may already return a `Promise`, and
the frame loop never starts a new inference while one is pending, so no interface change is
needed.

## 5. Where the crop comes from

The model is only the landmark stage; it needs a square hand crop.

**Option A — reuse MediaPipe's landmarks (fastest to build).** Same approach as the thesis
`webcam_demo_finetuned.py`: take MediaPipe's 21 points, compute their bounding box, pad by 25 %
on each side, make it square around the centre, clamp to the frame, crop and resize to 256×256.
Simple, but not independent (MediaPipe still runs), so it's useful mainly for the A/B comparison.

**Option B — fully independent pipeline.** Export **BlazePalm** too (`student_model/blazepalm.py`

- `anchors_palm.npy` + `blazepalm.pth`): run the palm detector on a letterboxed frame, decode
  anchors, NMS, rotate/expand the palm box into a hand ROI, then run BlazeHand-KD. Track between
  frames by deriving the next ROI from the previous landmarks and re-detect only when `hand_flag`
  drops. More work, but a real second engine.

## 6. Back to image coordinates, and the Playground A/B mode

For a crop `(x1, y1, w, h)` in video pixels (no rotation in option A):

```
x_img = (x1 + lm.x * w) / videoWidth
y_img = (y1 + lm.y * h) / videoHeight
```

(For a rotated ROI in option B, apply the inverse ROI transform.) Emit the result as a
`HandFrame` (un-mirrored normalised coords, `handedness` from the sigmoid with the same mirroring
convention as the MediaPipe adapter, no `cannedGesture`), and drop the hand when
`hand_flag < 0.5`.

**A/B mode in the Playground:** run both engines on the same frame and overlay both skeletons in
two colours. Show per-joint pixel distance (table + mean), FPS and inference ms for each engine,
and which engine drives the controller. Add a "record both" option so fixtures can be replayed
through either engine's output.

## 7. Hosting the weights

Never commit weights to git. Publish `blazehand_kd.onnx` (and the fp16 variant) as a **GitHub
Release** asset on the thesis repo, or on **Hugging Face**. Then extend `scripts/fetch-model.mjs`
to download it into `public/models/` (gitignored), with the same local-first / remote-fallback
logic as the MediaPipe model. Include the model card: training data (RHD + FreiHAND),
FreiHAND-val metrics, and the pre-cropped-evaluation caveat above.

## 8. Checklist

- [ ] Export + verify ONNX (fp32, optional fp16)
- [ ] Publish weights (Release / Hugging Face) + fetch script
- [ ] `src/engine/blazehandEngine.ts` (onnxruntime-web, WebGPU → WASM)
- [ ] Crop source: option A first, option B later
- [ ] Enable the engine in `src/engine/registry.ts`
- [ ] Playground A/B overlay + per-joint distance + FPS for both
- [ ] Record fixtures with both engines; compare pass rates
