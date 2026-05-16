# issue-driven-web-template

> A web starter template built around **Issue-Driven Development (IDD)** — ship a Hello World, then let structured GitHub issues guide every feature forward.

## What's included

- **Hello World** — minimal Astro + Tailwind page, deployable in minutes
- **FeedbackFAB** — floating button that captures JS errors, network failures, and lets users report issues directly to GitHub with full diagnostics pre-filled
- **GitHub Actions + Claude** — AI-powered issue triage, automatic plans, and PR generation on every new issue
- **CI/CD pipeline** — build, test, and deploy on push to `main`
- **Feature flags** — beta/prod environment detection from day 1
- **Issue templates** — structured templates for bugs, features, questions
- **Milestone workflow** — `v1.0` milestone pre-loaded with bootstrap issues

## Philosophy

Most templates give you a blank canvas. This one gives you a **living backlog**.

Every significant piece of functionality starts as a GitHub Issue. The FeedbackFAB lets real users report problems directly from the app. Claude triages, plans, and helps implement. You review and merge.

```
User finds bug → FeedbackFAB → GitHub Issue → Claude plans → PR → Merge → Deploy
```

## Quick start

```bash
# 1. Use this template
gh repo create my-project --template ArtemioPadilla/issue-driven-web-template

# 2. Clone and install
cd my-project
npm install

# 3. Run locally
npm run dev

# 4. Configure secrets (see SETUP.md)
# 5. Push to main → auto-deploy
```

## Stack

- [Astro](https://astro.build) — static site generator
- [Tailwind CSS](https://tailwindcss.com) — utility-first CSS
- [GitHub Actions](https://github.com/features/actions) — CI/CD + Claude integration
- [Firebase Hosting](https://firebase.google.com/products/hosting) — deployment target (swappable)

## Structure

```
├── src/
│   ├── pages/
│   │   └── index.astro          # Hello World page
│   ├── components/
│   │   └── common/
│   │       └── FeedbackFAB.astro  # Issue reporter FAB
│   └── layouts/
│       └── BaseLayout.astro
├── .github/
│   ├── workflows/
│   │   ├── ci.yml               # Build + test on PR
│   │   ├── cd.yml               # Deploy on push to main
│   │   └── claude.yml           # AI issue triage
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.yml
│       ├── feature_request.yml
│       └── question.yml
├── SETUP.md                     # Step-by-step configuration guide
└── ROADMAP.md                   # Pre-loaded issues + milestones
```

## License

MIT
