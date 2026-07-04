# Opening Schedule Builder + Confidence Gate — Build Spec (v2)
**MKM Materials Calculator · Signature × MKM tool suite**
Supersedes the earlier confidence-gate-only spec. Diagnostic work complete; build-ready.

---

## The vision (gold standard)
Turn the tool's biggest weakness — drawings with no clean opening schedule — into a
guided-completion strength. Instead of blocking or guessing when opening data is
incomplete, the tool:

> **"Here's the opening schedule we built from your drawings. Here's what's missing.
> Add the dimensions and we'll generate your take-off."**

It assembles every window/door it can find into a structured schedule, detects the gaps
(openings present on the plan but lacking dimensions), and lets the user complete them —
then computes from a **complete, user-verified** schedule. This delivers a complete
window/door schedule as an output artefact (valuable in its own right) AND guarantees the
tool never computes structural quantities from a dimension it had to invent.

### Core principle (non-negotiable)
**The tool never creates a dimensioned element without its dimensions.** Counts of
standard-sized items (internal doors) may change freely; anything carrying per-item
dimensions (windows, external doors — which drive lintels, cills, heads, cavity closers)
requires its size before it contributes to any quantity. An empty dimension cell IS the
prompt; a row with missing dimensions produces no structural quantities until filled.

This subsumes the earlier "confidence gate": the gate's confirm step *is* the schedule's
gap-fill step. There is no separate confirm dialog for openings — there is the schedule
table with gaps highlighted.

---

## ⚠️ DATA PROVENANCE — READ FIRST (this is the make-or-break)
This feature's entire job is correctly reading opening data, so it MUST be built and
tested against **pristine live payloads**, not reconstructions.

**Do NOT trust the saved `testdata-*.json` files from the prior session as source of
truth.** They are:
- `testdata-plot24-whorlton.json` — a hand-TRIMMED reconstruction (fields dropped, the
  `floorplan_dimensions` block was removed then re-added during earlier testing). Shape is
  approximate, not byte-for-byte what the live server returns.
- `testdata-middleham.json` — an OLDER/reconstructed capture (dumps `house: ?` and 22
  openings; the real current Middleham has `house_type: MIDDLEHAM` and a stable ~14-opening
  set post temperature-fix). Directionally right, not pristine.

These are **fallback only** — enough to get moving if re-capture is impossible.

**Gold-standard test fixtures — capture at the START of the build session:**
1. Bump `SANDBOX_TOTAL_CAP` on Render first (was at 50 — blocked). Set 75–100 for testing.
2. For each test drawing: run it live on the sandbox → open console (F12) →
   `copy(JSON.stringify(window._lastData))` → paste the pristine payload into the chat.
3. Capture **3–4 drawings spanning the full range**, so the builder is proven against
   genuine variety, not two points:
   - **Full clean schedule** (e.g. Middleham) — should produce a complete schedule, no gaps.
   - **Schedule-less / multi-plot** (e.g. plot 24 / Whorlton) — many gaps to fill; the
     hard case the feature exists for.
   - **Partial** (some openings dimensioned, some not) — the in-between case.
   - Optional 4th for extra coverage.
4. These pristine captures are the fixtures the schedule-builder is built and proven
   against, via the real-path harness (below), before any deploy.

Rationale: the door-count fix only needed labels+types, so reconstructed data sufficed.
The schedule-builder needs the FULL payload shape — every field, confidence sub-flags,
raw_entities, floorplan_dimensions_check strings, the exact structure of window vs door vs
bifold, and critically **what a missing-dimension opening looks like in the payload.**
Build against the wrong shape → fails on the first real drawing → debugging provenance
instead of logic. Don't repeat that.

---

## What the payload already provides (found during diagnosis — don't re-derive)
From `window._lastData`:
- `openings[]` — each: `label` (EO 001 / io 03 …), `type` (door/window/bifold),
  `width_m`, `height_m`, `qty`. Width/height may be present or absent.
  - **io-prefixed = internal door; EO-prefixed = external opening.** (Classifier
    `wdIsExternal` is correct and proven — do not touch it.)
- `floorplan_dimensions` — separate floor-plan read: `ground_floor_length_mm/_width_mm`,
  `first_floor_*`. The dimension fallback source.
- `floorplan_dimensions_check` — array of conflict strings, e.g. *"floor-plan width (8315)
  disagrees with DocAI width (7810) — DocAI value may be the roof span; floor plan is
  authoritative."*
- `confidence.openings` / `.floor_dims` / `.wall_dims` — "low"/"medium"/"high".
- `extra.door_count` / `extra.window_count` — extractor's own tallies (cross-check vs
  `openings[]` length to detect a count/detail mismatch).
- `extra.rooms[]` — room list with floor + type (useful for locating/naming openings).

## Already banked (carry in, don't rebuild)
**Length fallback (silent, safe)** — in `idx_fix.html` (≈ line 901, buildModel parse).
When DocAI does NOT supply `floor.length_m` (model defaults to 4.0 — key off
`parsed.floor.length_m>0`, NOT the model field), fall back to
`floorplan_dimensions.ground_floor_length_mm`. Proven: plot 24 length 4.0→9.1, floor area
resolves; Middleham unregressed (12/9/3). Unambiguous missing-value case → stays silent.
NOTE: currently only in the branch-sandbox file; apply to all four during this build.

---

## Feature design

### 1. Build the schedule
From `openings[]`, assemble a table: **ref · type · location · width · height · status**.
- `location` from label suffix / nearest room.
- `status` = **complete** (has width+height) or **needs dimensions** (missing either).

### 2. Detect gaps
- **Missing dimensions:** any opening row lacking width or height → "needs dimensions".
- **Count mismatch:** `extra.door_count` / `window_count` (or plan-marker count if
  available) > rows actually captured → "N openings on the plan not in the schedule".
  (Ceiling: reliable plan-marker counting is the spatial-vision limit — see below. Degrade
  gracefully: present what was found + let the user add missing rows WITH dimensions.)

### 3. Present the schedule (this replaces the old confirm dialog)
Interstitial between "Analyse" and results:
- **Complete rows:** read-only.
- **Incomplete rows:** editable width/height cells, highlighted.
- **Add-opening control:** adds a row but REQUIRES type + width + height before it counts
  (honours the core principle — no dimensionless windows).
- Copy (technical, reassuring): *"We built this opening schedule from your drawings. A few
  openings are on the plan but we couldn't read their sizes — please add the dimensions
  below so your take-off is based only on confirmed data."*

### 4. Editability rules (the safety line — from the plot-24 / window discussion)
| Field | Editable? | Why |
|-------|-----------|-----|
| Building length / width (scalar) | Yes | Single value; already handled by fallback/gate |
| Internal door count | Yes (standard-sized) | Adds standard lining/handle/hinge — no hidden dims. **But** prompt for type of any ADDED door: standard / bathroom (privacy set) / fire (FD30 + closer + seals) |
| Window / external door | **Count NOT editable as a bare number** | Each carries width×height driving lintels/cills/heads. To add one, user MUST supply dimensions via the schedule row. No guessing. |
| Existing opening dimensions | Yes (fills the gap) | This is the whole point |

### 5. Compute
Only when every row is **complete** does the tool compute. Incomplete rows produce no
structural quantities. Confirmed schedule → `buildModel`→`mxiCalc` → results.

### 6. Also emit the schedule as an output
The completed schedule is itself a deliverable — show/exportable alongside the take-off.
Some self-builders want the schedule regardless.

---

## Non-opening gate behaviour (fundamentals)
Openings go through the schedule-builder. The other fundamentals keep simple gate/fallback:
- **Length/width missing** → silent floor-plan fallback (already banked).
- **Length/width DISAGREEMENT** (`floorplan_dimensions_check` flags it) → do NOT silently
  pick one; surface a compact confirm ("floor plan reads X, schedule read Y — confirm
  footprint"). Editable scalar.
- Everything unflagged → flows straight through.

Layout: **hybrid** — flagged/editable items are the hero; a **compact read-only strip** of
key fundamentals (GIFA, storeys, L×W, wall type) sits beneath for a 2-second sanity glance.
Slick where it can be, safe where it must be. If the strip proves cluttered in build, it's
trivial to collapse to flag-only.

---

## Billing decision (SETTLED)
**Charge the £75 on successful result render, NOT on "Analyse Drawings".**
- Gated/schedule-incomplete then confirmed → one £75 (they got a take-off).
- Gated then abandoned → free (they got nothing).
- Defensible: "you're only billed for take-offs you received." Removes the "charged for
  nothing" complaint. Since billing is on render, the schedule-completion step is free to
  the user — so making it thorough costs them nothing.
Implementation: move the billing hook to fire at result render, after schedule completion.

---

## Scope honesty
- **Buildable now (front-end, no new AI):** assemble schedule from extracted openings,
  detect missing-dimension gaps, editable table with add-row-requires-dimensions, block
  compute on incomplete rows, emit schedule artefact, hybrid fundamentals strip, billing
  on render.
- **The ceiling (extraction quality):** how many openings get auto-found, esp. plan
  markers on schedule-less drawings, is the spatial-vision limit. Feature degrades
  gracefully — perfect detection → few gaps; poor → more gaps for the user to fill — but
  never fails or fabricates.
- **Future upgrade:** better plan-marker detection (e.g. Kreo, UK-based, Auto Count —
  trial on own drawings for UK-residential accuracy before betting; Bobyard ruled out,
  North-America/seat-based) shrinks the gaps. The schedule-builder is the frame; better
  extraction just auto-fills more of it.

---

## Build tasks (in order)
1. **Capture pristine fixtures** (3–4 live payloads spanning full→schedule-less). Bump cap first.
2. **Rebuild the real-path harness** (container resets each session): eval the HTML's
   `<script>` blocks with DOM stubs (document/window/location/navigator/localStorage),
   run `buildModel`→`mxiCalc` against each pristine payload. Approach proven repeatedly this
   project; rebuild from scratch.
3. **Carry in the length fallback** to all four files (currently branch-sandbox only).
4. **Schedule assembly + gap detection** function over `openings[]`.
5. **Schedule-builder UI** (interstitial): complete rows read-only, incomplete editable,
   add-row-requires-dimensions, hybrid fundamentals strip.
6. **Feed-back + compute** only when complete; re-run model with confirmed schedule.
7. **Schedule as output artefact.**
8. **Billing hook → on render.**
9. **Apply to all four files** via commit ritual; prove each against the pristine fixtures
   through the harness BEFORE deploy. Middleham → complete, no gaps, 12/9/3. Plot 24 →
   gaps flagged, completes to a sane take-off after dimensions added.

## Test cases
- **Full clean (Middleham):** schedule complete, no gaps, renders 12/9/3 directly.
- **Schedule-less (plot 24 / Whorlton):** io doors flagged as needing dimensions; length
  via fallback (9.10); width disagreement surfaced; after completion → sane take-off.
- **Partial:** some rows complete, some flagged; only flagged need input.
- **Add-opening:** user adds a window → tool refuses to count it until width+height entered.

---

## Housekeeping carried over (not this build, don't lose)
- **SANDBOX_TOTAL_CAP:** cumulative all-time cost_log rows (not per-session). Hit 50 —
  bump to test. **Restore to ~25 before MKM handover**, accounting for cost_log count then.
- **Skirting SK_COVER = 1.3:** Middleham-calibrated only. Validation tracker
  (`mkm-skirting-calibration-tracker.xlsx`, "Actuals Validation" sheet) ready to seed from
  the house-type sweep. Measure partition area = internal dividing walls only; skirting =
  full room perimeter; external wall = gross-less-openings (Jerome measured ext gross w/o
  openings — that column reads ~10-15% low by construction, treat as magnitude check).
- **Multi-plot / handed drawing sets:** parked as housebuilder-market roadmap, NOT on the
  MKM self-build critical path (self-builders bring single-plot drawings).
- **Repo:** github.com/Jerome2339/signature-qs-proxy — 4 HTML files + server, v7.19, main.
  Both Render environments on server 7.18.3. Netlify `mkmsandbox` auto-deploys branch-
  sandbox from repo (served via netlify.toml redirect / index.html). Resume ritual: start
  by reading raw files from GitHub main; end with "park it" → Claude prepares + verifies +
  gives commit message → Jerome commits (Claude cannot push).
- **Version banner:** bump the visible build tag when this ships (e.g. 7.20) so deployed =
  expected is verifiable at a glance.
