# Confidence Gate — Build Spec
**MKM Materials Calculator · Signature × MKM tool suite**
Prepared as the next build task. Diagnostic work complete; this is a build-ready spec.

---

## The principle
The platform must **never emit a take-off it had to guess at.** When the tool's own
extraction signals disagree or a fundamental input is missing, it **pauses before
returning results** and asks the user to confirm the flagged value(s). Clean drawings
flow straight through with no friction; the gate only appears when the tool is genuinely
uncertain — which is exactly when a human should look.

This matches how the industry leaders (Bobyard, Kreo, Togal) handle extraction: AI
extracts, a review/confidence step lets the human confirm before committing. We are
matching best practice, not improvising.

User-facing framing: **"Multi-source check — please confirm."** Honest and technically
accurate: we genuinely run two independent extraction sources (DocAI structured
extraction + separate floor-plan dimension read) that can disagree.

---

## What already exists (found during diagnosis — don't re-derive)
The signals to gate on are all already in the extraction payload (`window._lastData`):

- `floor.length_m` / `floor.width_m` — DocAI's footprint dims (can be `null`).
- `floorplan_dimensions.ground_floor_length_mm` / `_width_mm` — the **separate floor-plan
  read** (the fallback source).
- `floorplan_dimensions_check` — an **array of conflict strings** the extractor already
  emits, e.g. *"floor-plan width (8315) disagrees with DocAI width (7810) — DocAI value
  may be the roof span; floor plan is authoritative."* This is the disagreement signal.
- `confidence.openings` / `confidence.floor_dims` / `confidence.wall_dims` — `"low"` /
  `"medium"` / `"high"` flags per category.
- `openings[]` — the schedule. io-prefixed = internal doors; EO-prefixed = external.
  Plot-24 case: EO openings present, **zero io** → internal doors couldn't be read.

## Already banked (do not rebuild)
**Length fallback (silent, safe path)** — implemented and proven this session, in
`idx_fix.html` at the `buildModel` parse block (~line 901). When DocAI does **not**
supply `floor.length_m` (model defaults to 4.0, so key off `parsed.floor.length_m>0`,
NOT the model field), fall back to `floorplan_dimensions.ground_floor_length_mm`.
Proven: plot 24 length 4.0→9.1, floor area resolves; Middleham unregressed (12/9/3,
own dims untouched). This is the unambiguous case (value missing, no conflict) and
stays **silent** — no gate needed.

---

## Trigger conditions (any one fires the gate)

| # | Condition | Signal | Confirm field shown |
|---|-----------|--------|---------------------|
| 1 | Dimension disagreement | `floorplan_dimensions_check` contains a conflict string | Building length &/or width (pre-filled with floor-plan value; DocAI value shown as the alternative) |
| 2 | Missing fundamental | `floor.length_m` or `floor.width_m` null AND no floor-plan fallback available | Building length / width (empty, user enters) |
| 3 | No internal doors | `openings[]` has EO entries but **zero io** entries | Internal door count (pre-filled with what was found, e.g. 0 or 1) |
| 4 | Low-confidence openings | `confidence.openings === "low"` | Window & external-door count (pre-filled from EO schedule) |

Note: condition 1 supersedes the silent length-fallback for the *width* case — where
DocAI supplied a value but the check flags disagreement, we do **not** silently prefer
the floor plan (that's a heuristic that could misfire); we **gate and ask**. This is the
key design decision from this session: silent fallback only for missing values;
disagreements always surface.

---

## UX flow

```
Upload → Analyse Drawings → [extraction runs]
     │
     ├─ evaluate trigger conditions
     │
     ├─ NONE fire → render results directly (no gate, no friction)
     │
     └─ ANY fire → show "Multi-source check" panel INSTEAD of results:
              - editable field(s) ONLY for the flagged item(s), pre-filled
              - read-only summary of the other key figures (so user gets a
                full sanity view, not just the flagged item in isolation)
              - copy: technical + reassuring (see below)
              → user confirms/corrects
              → model re-runs with confirmed values
              → results render
```

### Copy (technical, reassuring tone)
Panel heading: **"Multi-source extraction check"**
Body: *"Our extraction ran two independent reads of this drawing set and found a
disagreement on the value(s) below. To ensure your take-off is based only on data we're
confident in, please confirm before we generate it."*
Per-field, name what disagreed, e.g.: *"Building width — floor plan reads 8.32m; the
schedule read suggested 7.81m (this can happen when the roof span is mistaken for the
footprint). Confirm the correct footprint width."*

### Design decisions still open (Jerome to confirm)
1. **Scope of confirm panel** — recommendation: flagged items **editable**, plus a
   **read-only summary** of the other key figures so the user gets a full sanity view.
   (Jerome leaning this way.)
2. **£75 billing interaction** — the fee is charged on "Analyse Drawings" (see live UI).
   Decide: does a gated-then-confirmed run count as one £75 lookup? Does a gated-then-
   **abandoned** run get charged? Recommendation: **charge on successful result render,
   not on gate** — so an abandoned gate is free, and one confirmed run = one £75. Keeps
   billing defensible ("you're only billed for take-offs you received").

---

## Build tasks (in order)
1. **Silent length fallback** — already done in `idx_fix.html`; carry into the deployed
   file. (Missing-value path only.)
2. **Trigger evaluation function** — after extraction, before render, return a list of
   fired conditions with their confirm-field specs.
3. **Confidence-gate UI panel** — new interstitial state between analyse and results;
   editable flagged fields + read-only summary; confirm button.
4. **Feed-back + re-run** — confirmed values overwrite the model inputs
   (`floor.L/W`, internal door count, opening count), re-run `buildModel`→`mxiCalc`,
   render.
5. **Billing hook** — charge on result render, not on gate (per decision above).
6. **Apply to all four files** via the standard commit ritual; prove each on Middleham
   (should NOT gate — clean drawing) and plot 24 (SHOULD gate — dimension + io-door
   flags), through the real-path harness before deploy.

## Test cases for verification
- **Middleham** (clean): no gate fires; renders 12/9/3 directly.
- **Plot 24 / Whorlton** (multi-plot, no io schedule, width conflict): gate fires on
  conditions 1 + 3; after confirming length 9.10 / width 8.32 / internal doors 14,
  renders a sane take-off.
- **A drawing with low opening confidence**: gate fires on condition 4.

---

## Housekeeping carried over (not part of this build, but don't lose)
- **SANDBOX_TOTAL_CAP**: hit 50 during the sweep (cumulative all-time cost_log rows,
  not per-session). Bump on Render to finish sweep/testing. **Restore to ~25 before MKM
  handover**, accounting for the cost_log count at that point.
- **Skirting SK_COVER = 1.3**: still Middleham-calibrated only. Validation tracker
  (`mkm-skirting-calibration-tracker.xlsx`) ready to seed from the house-type sweep.
- **Multi-plot / handed drawing sets**: parked as a housebuilder-market roadmap item,
  NOT on the MKM self-build critical path (self-builders bring single-plot drawings).
- **Kreo (UK-based, Auto Count)**: candidate extraction-layer upgrade for schedule-less
  / spatial reading, post-MKM. Trial on own drawings to check UK residential accuracy
  before betting on it. Bobyard ruled out (North America only, seat-based not API).
