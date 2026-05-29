# Roadmap — Clima México

Status: **living document** · Last reviewed: 2026-05-28

This is the single entry point for "what's done, what's next, and why."
It reconciles the two older planning docs against what actually shipped,
back-fills the epic/story structure that until now lived only in commit
messages, and breaks the remaining work into a prioritized
**epic → story → task** backlog (see "Backlog" below).

## How to read this

| Doc | Role |
|-----|------|
| **ROADMAP.md** (this file) | Source of truth for status + priorities. Start here. |
| [PLAN_SUPERIORITY.md](./PLAN_SUPERIORITY.md) | Detailed feature ideas vs zoom.earth (2026-05-24). **~65% shipped** — see reconciliation below. Treat as an idea backlog, not current status. |
| [PLAN_UX_PARITY.md](./PLAN_UX_PARITY.md) | 14 map-polish gaps vs zoom.earth (2026-05-24). **P0–P2 mostly shipped** as the P-series PRs. The P0.1 root-cause analysis is superseded — see "Map first paint" below. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Map plugin-registry design. Tracks as issue [#136](https://github.com/ArtemioPadilla/mexico-weather/issues/136). |

Hard product constraints (do not regress): **no tracking, no cookies, no
accounts, no API keys, no backend.** The service worker has **no fetch
handler** by design (`public/sw.js` is a scope-claimer only). These are the
competitive angle, not limitations.

## Status at a glance

- **Shipped:** 9 epics (E1–E9), the interactive map (8 base layers, 17
  overlays), and full functional parity with zoom.earth.
- **Open backlog:** 5 epics (E10–E14), 19 stories. Next up: **E10** (map
  first paint, P0) gated on a foreground-repro check, then **E11** (mobile).
- **Health:** 438 unit tests + 103 e2e green on `main`; Core Web Vitals
  baseline established (Story 8.2). Known data-pipeline fix (#288) confirmed
  live in production.

---

## Shipped epics (the "sprint" work)

Nine epics shipped across Sprints 2–5. The `Story X.Y` tags below are the
key to the numbering used in commit subjects (it had no index before).

| Epic | Stories shipped |
|------|-----------------|
| **E1 · Alerts & severe weather** | 1.1 national alert ribbon · 1.2 per-state SMN tint overlay · 1.3 `/huracanes` active-systems index |
| **E2 · Home & personalization** | 2.1 "Mostrar mi clima" geolocation CTA · 2.2 reverse-geocode hint to curated landing · 2.3 highlight most-checked favorite |
| **E3 · Forecast richness** | 3.1 AQI panel · 3.2 climate-anomaly badge · 3.3 marine panel · 3.4 daylight curve · 3.5 wind-direction arrow · 3.6 freshness indicator |
| **E4 · Navigation & discovery** | 4.1 catalog dropdown nav · 4.2 client-side search filter on category indexes |
| **E5 · Sharing & comparison** | 5.1 side-by-side city compare (`/compara`) · 5.2 Web Share button on every landing |
| **E6 · Internationalization** | 6.1 + 6.2 English/Spanish toggle · 6.3 per-page hreflang |
| **E7 · PWA, mobile & print** | 7.1 mobile UX audit + tap-target fixes · 7.2 iOS install bottom-sheet · 7.3 clean print stylesheet |
| **E8 · Quality & performance** | 8.1 a11y audit refresh · 8.2 Core Web Vitals baseline |
| **E9 · Activity-aware forecast** | 9.1 outdoor-planner mode toggle |

Plus the interactive map itself (zoom.earth-parity layers, overlays,
timeline, model toggle, measurement tools) shipped via the weather-maps
slice plans and the P-series UX PRs.

### Map capability inventory (in `src/lib/map/`)

- **Base layers**: basemap (CARTO Dark/OSM), radar, satellite (GIBS),
  temperature, humidity, pressure, wind (WebGL particles), sunlight.
- **Overlays** (17): aqi, borders, city-values, clouds, fires, graticule,
  hist-storms, lakes, marine, night-lights, night-line, quakes,
  radar-coverage, smn-state-tint, tropical-storms, volcanoes, webcams.
- **Sources**: open-meteo, rainviewer, nasa-gibs, nhc.

This already exceeds zoom.earth's overlay count. The gap is **polish and
correctness**, not feature count.

---

## Reconciliation: what the old plans still have open

`PLAN_SUPERIORITY.md` was written before most of it shipped. Honest status:

| Plan item | Real status |
|-----------|-------------|
| 1.1 Field resolution → 768 pts | ✅ Shipped (32×24 grid, chunked fetch in #281) |
| 1.1 C WebGL field renderer | ❌ Not done — still canvas bilinear raster |
| 1.2 Cold-load basemap | ⚠️ Worked around, not fixed — see "Map first paint" |
| 1.3 GeoColor satellite + cloud overlay | ◑ Partial — GIBS + separate clouds overlay exist; combined "Precipitación" mode not built |
| 1.4 A PWA install | ✅ Shipped (7.2) |
| 1.5 PRO tier | ⛔ Won't do (privacy-first angle) |
| 2.1 Multi-metric hover tooltip | ❌ Not done |
| 2.2 Sub-options on radar/sun/satellite | ◑ Partial — model toggle shipped; per-layer sub-options uneven |
| 2.3 Dynamic theme + color-blind palettes | ◑ Color-blind mode exists; auto-by-hour not done |
| 2.4 Unique MX overlays (SMN, sismos, AQ, marine) | ✅ Shipped (smn-state-tint, quakes, aqi, marine) |
| 3.1 AI natural queries | ✅ Shipped (`/pregunta` NL router) |
| 3.2 Storm tracker w/ history | ✅ Shipped (hist-storms + `/huracanes`) |
| 3.3 Temporal before/after compare | ❌ Not done |
| 3.4 Multi-model disagreement view | ◑ Model toggle shipped; disagreement view not built |
| 3.5 Personal alerts (web push) | ❌ Not done (needs care re: no-backend constraint) |
| 3.6 Climate anomaly viz | ◑ Per-location badge shipped; full-field anomaly ramp not built |
| 3.7 Webcam integration | ✅ Shipped (webcams overlay) |
| 3.8 Beach + lake conditions | ✅ Shipped (`/playa` + lakes overlay) |

---

## Backlog — epics → stories → tasks

The forward work, broken into the same scheme as the shipped epics.
Numbering continues from E9 / Story 9.x.

**Conventions**
- **Epic** = a theme spanning multiple PRs. **Story** = one user-facing
  increment, ~1 PR, tagged `Story N.M` (use the tag in the commit subject,
  as Sprints 2–5 did). **Task** = a concrete dev step, one checkbox.
- Status: `[ ]` todo · `[~]` in progress · `[x]` done. Priority: **P0**
  correctness → **P1** daily-driver UX → **P2** architecture → **P3**
  differentiation → **P4** icebox.
- A story is "done" when every task is checked **and** its acceptance
  criteria pass. Keep estimates honest; they're planning aids, not commitments.

---

### E10 · Map first paint & render reliability — **P0**

> Outcome: the map paints on load without any interaction, in every embed,
> including background/prerender contexts. Retires the longest-running bug
> class in the project (#124).

Context: [#124](https://github.com/ArtemioPadilla/mexico-weather/issues/124)
("cold-load blank canvas") absorbed 6 PRs (#111, #112, #117, #118, #122,
#123) of resize/rAF/jumpTo nudges and was closed with a *workaround*. The
signature — tiles loaded, WebGL context alive, canvas sized, blank until a
click forces `triggerRepaint` — is the classic **rAF-never-fires** symptom.
PR #289 fixed the `/mapa` boot scheduling (rAF→setTimeout); first paint of
the embeds is the remainder.

**Story 10.1 — Confirm the failure reproduces in a foreground load** · est ½d
- [ ] Load `/forecast?lat=19.43&lng=-99.13&...` cold (cleared SW/cache) in a
      genuinely **foregrounded** window on a real device + desktop Chrome.
- [ ] Record `document.visibilityState` at boot and whether canvas paints
      pre-interaction.
- [ ] Decision gate: if it only fails when hidden/backgrounded, **demote
      this epic to P2** (background-tab correctness only) and note it here.
- Acceptance: a written repro (or "cannot reproduce in foreground") with the
  visibilityState evidence, recorded in #124.

**Story 10.2 — First paint without interaction** · est ½d · *blocked by 10.1*
- [ ] In `src/lib/interactive-map.ts`, after `map.once('load')` call
      `map.triggerRepaint()` unconditionally (don't rely on a frame the
      browser may never schedule).
- [ ] Replace any rAF-gated first-paint/resize nudge with a `setTimeout(…,0)`
      path in `src/components/InteractiveMap.astro` (the lazy
      IntersectionObserver embed path still uses rAF-adjacent timing).
- [ ] Remove the 6-step deferred-nudge stack (#122) once the above holds —
      it was compensating for the wrong primitive.
- [ ] Evaluate forcing eager import of maplibre-gl on `/mapa` only (drop the
      dynamic-import latency variable; keep lazy for embeds).
- Acceptance: reload `#view=23.6,-102.5,5z&layer=temperature` 10× — field
  paints ≤3s each, zero clicks. Same for the `/forecast` embed.

**Story 10.3 — Lock the regression** · est ¼d
- [ ] Playwright test asserting the map canvas has non-zero painted pixels
      **without any interaction** (sample `getImageData`, assert variance).
- [ ] If the harness can background the page, add a hidden-context variant.
- [x] Document the visibilityState/rAF gotcha (done — "Process notes" below
      + memory `verify-foreground-before-render-bugs`).
- Acceptance: the new test fails on `main` pre-10.2 and passes after.

---

### E11 · Mobile UX — **P1**

> Outcome: the site is fully navigable and operable on a 360–414px phone.
> All three findings below are real on foreground mobile (audit 2026-05-27).

**Story 11.1 — Mobile navigation** · est 1d · **highest user impact**
- [ ] Add a hamburger button (visible `< sm`) to `src/layouts/BaseLayout.astro`;
      the catalog dropdown (`#catalog-dropdown`) + "Pregunta" link are
      currently `hidden sm:block` / `hidden sm:inline-block` with no fallback.
- [ ] Drawer/sheet listing Inicio, Ciudades, Playas, Estados, Volcanes,
      Pregunta + theme/lang toggles.
- [ ] A11y: focus trap, `Esc` to close, `aria-expanded`/`aria-controls`,
      restore focus to the toggle on close.
- [ ] e2e: at 360px, every top-level destination is reachable.
- Acceptance: no top-level route is unreachable below 640px.

**Story 11.2 — Tap targets ≥44px** · est ½d
- [ ] Header nav links → min-height 44px (currently 28px).
- [ ] Map timeline controls `#tl-prev/play/next` + day-skip (currently
      19–20px) → 44px hit area (visual size can stay small via padding).
- [ ] Model toggle buttons `.mw-model-btn` (currently 19px) → 44px hit area.
- [ ] Confirm `e2e/mobile-audit.spec.ts` enforces this and un-skip if needed.
- Acceptance: `mobile-audit.spec.ts` tap-target assertions pass with no
  per-element exemptions beyond the documented `sr-only` one.

**Story 11.3 — `/mapa` chrome on mobile** · est 1d
- [ ] Surface opacity slider (`#opacitywrap`), overlay menu (Superposiciones),
      model toggle, and measure/snapshot tools on mobile — all currently
      `hidden sm:*` in `src/components/InteractiveMap.astro`.
- [ ] Pattern: a single bottom-sheet "Controles" trigger that expands the
      rail contents, rather than unhiding everything (screen real estate).
- Acceptance: a mobile user can change opacity, toggle an overlay, and switch
  model without resizing to desktop.

---

### E12 · Map plugin-registry migration (#136) — **P2**

> Outcome: retire the ~2,200-LOC `interactive-map.ts` monolith; one file per
> feature. Incremental and revertible — each story is one PR.
> Note: the F9 "new features" (isobars, tropical, fires, GIBS) already exist
> as overlays; only the *refactor* remains. Sequence after E10/E11 so the map
> surface is stable. Done so far: F1 registry, F2 utils, F4 sun plugin (#285).

**Story 12.1 — F3 data-source extraction** · est 1d
- [ ] Move Open-Meteo / RainViewer / RV-manifest fetchers into
      `src/lib/map/sources/` behind the `DataSource` interface (open-meteo +
      rainviewer files already exist — finish wiring callers through them).
- Acceptance: `interactive-map.ts` imports no raw fetch URLs; sources are
  unit-tested.

**Story 12.2 — F5 base-layer migration (a–f)** · est 3–4d
- [ ] F5a basemap · [ ] F5b temperature (+ sub-options) · [ ] F5c humidity ·
      [ ] F5d pressure · [ ] F5e wind (WebGL) · [ ] F5f radar + satellite —
      each migrated to the `BaseLayer` plugin interface, flag-gated, behind
      the registry (mirror the F4 sun-plugin pattern).
- Acceptance: each layer renders identically pre/post migration; e2e green.

**Story 12.3 — F6 overlay migration** · est 2d
- [ ] Register the 17 existing overlays through the registry; drop their
      bespoke wiring in the monolith.
- Acceptance: overlay toggles + keyboard shortcuts read from the registry.

**Story 12.4 — F7 state-driven UI** · est 2d
- [ ] Replace imperative DOM mutation with subscriptions to the map store;
      rail/timeline/shortcuts/hash all enumerate the registry.
- Acceptance: adding a layer/overlay requires no edits to UI wiring — it
  appears in the rail/menu/shortcuts purely by registering.

**Story 12.5 — F8 retire the monolith** · est ½d
- [ ] Delete legacy `interactive-map.ts`; keep `index.ts` façade.
- Acceptance: bundle size drops; `rg 'interactive-map'` shows only the façade.

---

### E13 · Differentiators — **P3**

> Outcome: move from parity to lead. Highest-ROI un-shipped ideas from
> `PLAN_SUPERIORITY`.

**Story 13.1 — Multi-metric hover tooltip** · est 1wk
- [ ] Extend the existing `#mapTooltip` to show temp + humidity + wind at the
      cursor in one read (currently single-metric).
- [ ] Directional wind arrow (rotate a glyph by bearing) in the tooltip.
- [ ] Sticky-on-touch: tap-to-pin on mobile, since there's no hover.
- Acceptance: hovering anywhere on the field shows all three metrics for that
  point; touch devices can pin/unpin; no extra network calls (reuse the
  already-loaded grids).

**Story 13.2 — Combined "Precipitación" mode** · est 1wk
- [ ] Add a single mode toggle that activates GIBS GeoColor satellite +
      clouds overlay + radar together (GeoColor already in `nasa-gibs.ts`).
- [ ] Tune z-order + opacity so all three read at once.
- [ ] Hash/URL state so the combined mode is shareable.
- Acceptance: one click yields the zoom.earth-equivalent "precipitation"
  picture; deep-link restores it.

**Story 13.3 — Multi-model disagreement view** · est 1wk
- [ ] Surface per-model fields (ICON/GFS/ECMWF/GEM) via Open-Meteo `models=`
      — the model toggle data path already exists.
- [ ] Compute + render a spread/disagreement field (e.g. inter-model stdev)
      as a confidence overlay.
- [ ] Legend explaining "low confidence = models diverge here".
- Acceptance: a user can see where the forecast is uncertain, not just the
  best-match value.

**Story 13.4 — WebGL field renderer** · est 1wk
- [ ] Replace the canvas bilinear raster with a fragment shader sampling the
      grid as a texture (target the existing `weather-raster` path).
- [ ] Match current color ramps exactly (regression-test against snapshots).
- [ ] Verify on Safari + Firefox iOS before shipping; feature-flag fallback
      to canvas if WebGL2 unavailable.
- Acceptance: field quality ≥ current at all zooms; render time drops;
  no visual regression in the field-grid snapshots.

**Story 13.5 — Temporal before/after compare** · est 1wk
- [ ] Split-screen / swipe slider rendering the same view at two timestamps
      ("hace 24h vs ahora").
- [ ] Drive both panes from one timeline + view state.
- Acceptance: a user can swipe between two times of the same layer/region.

**Story 13.6 — Full-field climate anomaly ramp** · est 2wk
- [ ] Preprocess an ERA5/baseline grid (reuse the `climate-baseline`
      workflow output) into a field the map can sample.
- [ ] Anomaly color ramp over the field (the per-location badge shipped as
      Story 3.2; this is the spatial version).
- [ ] Toggle + legend ("+5°C vs mayo histórico").
- Acceptance: anomaly layer renders over MX; values reconcile with the
  per-location badge at sampled points.

---

### E14 · Icebox — **P4** (validation-gated or out of scope)

- **Story 14.1 — Personal web-push alerts.** Needs a no-backend design; SW
  periodic background sync is unreliable. Spike feasibility before committing.
- **Story 14.2 — Native app wrappers** (Capacitor / RN). Validate demand
  first; App/Play accounts cost money + ongoing maintenance.
- **PRO tier / accounts** — ⛔ won't do; privacy-first is the competitive angle.

---

## Execution order

1. **E10** map first paint (P0) — start with the 10.1 foreground-repro gate.
2. **E11** mobile nav + tap targets (P1) — real daily-driver impact.
3. **E13.1–13.3** the three high-ROI differentiators.
4. **E12** plugin-registry sweep (P2) once the map surface is stable.
5. **E13.4–13.6** depth; **E14** only after validation.

---

## Success metrics

How we'll know the open work paid off (folds in `PLAN_SUPERIORITY`'s metrics):

- **E10 (first paint):** field paints ≤3s on cold load with **zero clicks**,
  10/10 reloads, on a real foreground device. The Playwright pixel-variance
  test (10.3) stays green.
- **E11 (mobile):** every top-level route reachable < 640px; `mobile-audit`
  tap-target assertions pass with no per-element exemptions; `/mapa` opacity +
  overlay + model controls operable on a phone.
- **E13 (differentiate):** in a blind side-by-side vs zoom.earth, ≥60% prefer
  our UX after E13.1–13.3; cold-load first paint < 500ms once 13.4 lands.
- **Always-on guardrails:** unit + e2e suites green; no regression in the
  field-grid snapshots; the five hard product constraints intact.

---

## Process notes (learned this cycle)

- **Verify foreground vs background before diagnosing render bugs.** Several
  "broken in production" map findings were artifacts of automation tabs
  running `document.hidden === true`, where `requestAnimationFrame` never
  fires. Check `document.visibilityState` in the inspecting browser first.
- **Snapshot workflows must `git add` before `git diff`.** Six data-snapshot
  Actions silently never committed their output because `git diff --quiet`
  treats untracked files as "no change" (fixed #288). Any new snapshot
  workflow must stage first, then `git diff --staged --quiet`.
- **`textContent`-based audits over-report.** Hidden (`display:none`) sibling
  states get captured, producing false "two states shown at once" findings.
  Check computed `display` before filing.
