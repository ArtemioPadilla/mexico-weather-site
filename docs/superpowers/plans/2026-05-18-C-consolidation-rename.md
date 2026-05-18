# Plan C — Consolidation + rename migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). This is an ops/migration plan across TWO repos with strict ordering — TDD does not apply to most steps; each task ends with explicit verification. **Run ONLY after Plans A and B are merged & deployed.** Several steps are irreversible/outward-facing (repo rename, archive, public URL change) — do them in order and verify before proceeding.

**Goal:** Port the SMN scraper into the site repo as an hourly scheduled Action (build-time CA feed as fallback), free the `mexico-weather` GitHub name, rename `mexico-weather-site` → `mexico-weather` (URL → `artemiop.com/mexico-weather/`), re-path everything, and redirect old links.

**Architecture:** `rss.xml.ts` becomes a chooser (fresh committed scrape → else build-time CA fallback). Repo rename cascades base path/SW/CNAME/parent-repo SW+nav; parent user-site hosts query-preserving redirect stubs for old URLs.

**Tech Stack:** Astro 6 static, GitHub Actions, Python+Playwright (CI-only), the parent `ArtemioPadilla.github.io` repo.

---

## Repos & key facts
- Site repo: `mexico-weather-site` → will become `mexico-weather`. Base `/mexico-weather-site` → `/mexico-weather`. Custom domain apex `artemiop.com` is owned by the **user site** `ArtemioPadilla.github.io`.
- Old repo `mexico-weather`: Python `smn_rss.py` (Playwright) + hourly cron, serves `artemiop.com/mexico-weather/` (Pages from `docs/`). **Owns the target name + URL.**
- GitHub cannot have two repos named `mexico-weather`; **archiving does NOT free the name — a rename does.**

---

### Task C1: Port the SMN scraper as a scheduled Action (fallback preserved)

**Files (site repo):** Create `scripts/smn-rss/smn_rss.py`, `scripts/smn-rss/requirements.txt`, `.github/workflows/smn-rss.yml`; Modify `src/pages/rss.xml.ts`; data artifact `src/data/smn-feed.xml`.

- [ ] **Step 1:** Copy `smn_rss.py` + `requirements.txt` from
`/Users/artemiopadilla/Documents/repos/GitHub/personal/mexico-weather` into
`scripts/smn-rss/`. Read `smn_rss.py` and adjust ONLY its output path so it
writes the RSS XML to `src/data/smn-feed.xml` (relative to repo root) and
prints the item count. Keep its scraping logic and source attribution.

- [ ] **Step 2:** Create `.github/workflows/smn-rss.yml`:

```yaml
name: SMN RSS (scheduled scrape)
on:
  schedule:
    - cron: '17 * * * *'   # hourly, offset to avoid the top-of-hour rush
  workflow_dispatch:
permissions:
  contents: write
concurrency:
  group: smn-rss
  cancel-in-progress: false
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with: { python-version: '3.12' }
      - run: pip install -r scripts/smn-rss/requirements.txt
      - run: python -m playwright install --with-deps chromium
      - run: python scripts/smn-rss/smn_rss.py
      - name: Commit feed if changed
        run: |
          if ! git diff --quiet -- src/data/smn-feed.xml; then
            git config user.name  'github-actions[bot]'
            git config user.email 'github-actions[bot]@users.noreply.github.com'
            git add src/data/smn-feed.xml
            git commit -m "chore: refresh SMN RSS feed [skip ci-lint]"
            git push
          else
            echo "No change."
          fi
```

(The push to the default branch triggers the existing CD deploy.)

- [ ] **Step 3:** Modify `src/pages/rss.xml.ts` so the endpoint chooses its
source: at build, read `src/data/smn-feed.xml` (via `node:fs` /
`import.meta.glob` — use a build-time read; the file is in-repo). If it
exists AND its embedded `<lastBuildDate>` (or file mtime) is within ~3 h,
serve that XML verbatim (valid RSS 2.0 already). Otherwise fall back to the
existing build-time CA Open-Meteo-derived generation (PR #43 logic, unchanged).
The endpoint stays the sole producer of `/rss.xml` (no `public/rss.xml`).
Keep the robust try/catch: any failure → the CA fallback → still valid feed,
build never breaks.

- [ ] **Step 4:** Add a tiny initial `src/data/smn-feed.xml` (a minimal valid
RSS 2.0 doc with the SMN fallback item) so the first build before the first
scheduled run still has a deterministic source; the scheduled Action
overwrites it hourly.

- [ ] **Step 5: Verify** `npm ci && npm run check && npm run build`; inspect
`dist/rss.xml` is valid RSS 2.0 from the committed feed; temporarily rename
`src/data/smn-feed.xml` and rebuild to prove the CA fallback still produces a
valid feed; restore. `npm test` (no regressions). Lint 0 errors. Commit (one
PR "feat: scheduled SMN scrape with build-time CA fallback"). Manually
`workflow_dispatch` the new workflow once after merge and confirm
`src/data/smn-feed.xml` updates and `/rss.xml` reflects scraped data.

---

### Task C2: Free the name (old repo) — **irreversible; do after C1 merged**

- [ ] **Step 1:** In the old repo
`/Users/artemiopadilla/Documents/repos/GitHub/personal/mexico-weather`:
replace `README.md` with a deprecation notice pointing to the consolidated
repo/site (`https://artemiop.com/mexico-weather/`), commit, push.

- [ ] **Step 2:** Disable its Pages/scheduled workflow (delete or disable the
`.github/workflows/*` cron that commits `docs/rss.xml`) so it stops updating
and stops serving — commit, push.

- [ ] **Step 3:** Rename the old GitHub repo to free the name:

Run: `gh repo rename mexico-weather-legacy --repo ArtemioPadilla/mexico-weather --yes`
Expected: repo is now `ArtemioPadilla/mexico-weather-legacy` (GitHub keeps a redirect for the old slug).

- [ ] **Step 4:** Archive it:

Run: `gh repo archive ArtemioPadilla/mexico-weather-legacy --yes`
Expected: archived (read-only). Verify the name `mexico-weather` is now free:
`gh repo view ArtemioPadilla/mexico-weather --json name 2>&1` → should error/not found.

---

### Task C3: Rename the site repo + re-path everything — **irreversible; coordinated**

- [ ] **Step 1:** Rename the site repo:

Run: `gh repo rename mexico-weather --repo ArtemioPadilla/mexico-weather-site --yes`
Then update the local remote in the site working copy:
`git remote set-url origin https://github.com/ArtemioPadilla/mexico-weather.git`
(GitHub auto-redirects the old slug, but set it explicitly.)

- [ ] **Step 2 (site repo, branch `fix/rename-base-path`):** `astro.config.mjs`
→ `base: '/mexico-weather'`. Remove `public/CNAME` (`git rm public/CNAME`) —
the apex belongs to the user site; the project auto-inherits it.

- [ ] **Step 3:** Service worker re-scope:
  - The own SW must serve at `/mexico-weather/sw.js`: it's `public/sw.js`
    (served at `<base>/sw.js`) so no file move needed — but verify the build
    emits it at `dist/sw.js` served as `/mexico-weather/sw.js`.
  - In `BaseLayout.astro` registration: `scope` derives from `siteBase()`
    (`import.meta.env.BASE_URL` → `/mexico-weather/`) — no literal change if
    it already uses `siteBase()`. **Extend the migration guard:** treat a
    controller whose scriptURL ends `/mexico-weather-site/sw.js` OR is the
    parent `/sw.js` as "other" → the existing one-reload `secid-sw-migrated`
    flow (still ≤1 reload/session). Add a comment documenting the old-scope
    case.

- [ ] **Step 4:** Verify in `dist`: canonical/og:url/sitemap `<loc>`/RSS
channel link all `https://artemiop.com/mexico-weather/...`; footer/privacy/
forecast links use `siteBase()` → `/mexico-weather/...`; `dist/sw.js`
present. `npm run check && npm run lint && npm test && npm run build &&
npm run test:e2e` all green (e2e `baseURL` in `playwright.config.ts` → update
the `/mexico-weather-site/` segment to `/mexico-weather/`). Commit; open PR
"refactor: rebase site at /mexico-weather"; merge; deploy.

- [ ] **Step 5 (parent repo `ArtemioPadilla.github.io`, separate PR, its
conventions):** In the `@vite-pwa/astro` `workbox` config, **add** (do not
remove the existing `/mexico-weather-site/` entries — keep them for the
redirect window):
  - `globIgnores`: add `"**/mexico-weather/**"`
  - `navigateFallbackDenylist`: add `/^\/mexico-weather/` (note this regex
    also matches `/mexico-weather-site` as a prefix — that is fine and keeps
    both carved out; the explicit `/^\/mexico-weather-site/` may be removed
    since `/^\/mexico-weather/` covers it — KEEP both for clarity)
  - `runtimeCaching`: add the two `NetworkOnly` entries for
    `https://artemiop.com/mexico-weather/.*` and
    `https://artemiopadilla.github.io/mexico-weather/.*`
  - `Navigation.astro` `links`: change the entry
    `https://artemiop.com/mexico-weather-site/` →
    `https://artemiop.com/mexico-weather/`.
  `npm run build` (its gate) green; commit per its Conventional Commits;
  PR; merge; deploy.

---

### Task C4: Redirect stubs for old URLs (parent repo)

**Files (parent `ArtemioPadilla.github.io`):** Create
`public/mexico-weather-site/index.html`,
`public/mexico-weather-site/forecast/index.html`,
`public/mexico-weather-site/privacidad/index.html`.

- [ ] **Step 1:** Each stub (same pattern, adjust the target path) — a
zero-dependency redirect that **preserves query + hash** so shared
`/forecast?lat=…` deep links survive:

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Movido — Clima México</title>
  <link rel="canonical" href="https://artemiop.com/mexico-weather/" />
  <meta name="robots" content="noindex" />
  <meta http-equiv="refresh" content="0; url=https://artemiop.com/mexico-weather/" />
  <script>
    location.replace(
      'https://artemiop.com/mexico-weather/' + location.search + location.hash
    );
  </script>
</head>
<body>Esta página se movió a <a href="https://artemiop.com/mexico-weather/">artemiop.com/mexico-weather/</a>.</body>
</html>
```

For `forecast/index.html` set the base target to
`https://artemiop.com/mexico-weather/forecast/` (so `?lat=…` is preserved by
the `location.search` concat); for `privacidad/index.html` →
`https://artemiop.com/mexico-weather/privacidad/`; the root one →
`https://artemiop.com/mexico-weather/`.

- [ ] **Step 2:** These live under the parent SW's retained
`/mexico-weather-site/` carve-out (Task C3 Step 5 kept it) → served from
network, not shadowed. Build the parent (`npm run build`), confirm
`dist/mexico-weather-site/index.html` etc. exist. Commit per parent
conventions; PR; merge; deploy.

---

### Task C5: Live verification (browser + curl)

- [ ] `https://artemiop.com/mexico-weather/` serves the site (200; weather
cards load; theme + favorites work).
- [ ] `https://artemiop.com/mexico-weather-site/` redirects to
`…/mexico-weather/`; `…/mexico-weather-site/forecast/?lat=19.43&lng=-99.13&name=CDMX`
redirects to `…/mexico-weather/forecast/?lat=19.43&lng=-99.13&name=CDMX`
(query preserved).
- [ ] In the browser: the own SW controls `/mexico-weather/` pages
(`navigator.serviceWorker.controller.scriptURL` ends `/mexico-weather/sw.js`),
no stale-fetch blip; the old-scope migration reload fires at most once.
- [ ] `curl` `…/mexico-weather/sitemap.xml`, `…/rss.xml`, page `<link rel=canonical>`
all show `/mexico-weather/`; `/rss.xml` shows scraped SMN data (after a
`workflow_dispatch` of `smn-rss.yml`), CA fallback proven.
- [ ] Parent site nav "Clima México" points to `…/mexico-weather/`.
- [ ] Old repo is `mexico-weather-legacy`, archived; `mexico-weather` is the
renamed site repo.

---

## Self-review
- **Spec coverage:** C1 scraper-as-Action + single-source `/rss.xml` w/ CA
fallback + initial feed ✓; C2 free-name (rename old → legacy, archive,
deprecation README, stop its cron) ✓; C3 rename site + base path + CNAME
removal + SW re-scope/old-scope migration + parent SW carve-out + nav ✓; C4
query-preserving redirect stubs in parent ✓; C5 live verification ✓. No gaps.
- **Placeholders:** none — exact `gh`/git commands, full YAML, full redirect
HTML, explicit file paths. The `smn_rss.py` step says read+adjust only the
output path (concrete, not vague).
- **Consistency:** base `/mexico-weather` used uniformly; SW guard reuses the
existing `secid-sw-migrated` key from the deployed isolation SW; `siteBase()`
remains the single base-path source so canonical/sitemap/RSS auto-derive;
parent-repo carve-out mirrors the existing `/mexico-weather-site/` block.

## Execution: run STRICTLY after A & B are merged+deployed. Order C1→C2→C3→C4→C5; each task its own PR(s) (site repo and parent repo separately, each repo's conventions); verify before the next. C2/C3 are irreversible — confirm C1 merged and the scraper works before freeing the name.
