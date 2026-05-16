# Setup Guide

## 1. Use this template

```bash
gh repo create my-project --template ArtemioPadilla/issue-driven-web-template --public
cd my-project
npm install
```

## 2. Configure GitHub Secrets

Go to your repo → Settings → Secrets and variables → Actions:

| Secret | Where to get it |
|--------|----------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |

That's the only required secret for the AI triage to work.

## 3. Configure deployment

Edit `.github/workflows/cd.yml` and replace the deploy step with your provider:

**Firebase Hosting:**
```yaml
- uses: FirebaseExtended/action-hosting-deploy@v0
  with:
    repoToken: ${{ secrets.GITHUB_TOKEN }}
    firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    projectId: your-project-id
```

**Vercel:**
```yaml
- uses: amondnet/vercel-action@v25
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

**Netlify:**
```yaml
- uses: nwtgck/actions-netlify@v3
  with:
    publish-dir: './dist'
    production-branch: main
    github-token: ${{ secrets.GITHUB_TOKEN }}
    deploy-message: "Deploy from GitHub Actions"
  env:
    NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
    NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

## 4. Update FeedbackFAB repo slug

In `src/components/common/FeedbackFAB.astro`, confirm the `repoSlug` matches your repo:

```typescript
const repoSlug = 'your-username/your-repo';
```

## 5. Customize the Hello World page

Edit `src/pages/index.astro` and `src/layouts/BaseLayout.astro` to match your project.

## 6. Open your first real issue

With everything set up, open an issue in GitHub. Claude will triage it automatically within ~30 seconds.

## Environment variables

Add these to `.env` for local development:

```env
PUBLIC_BUILD_SHA=local
PUBLIC_VERSION=dev
```
