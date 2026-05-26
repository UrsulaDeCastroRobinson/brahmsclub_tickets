# Brahms Club Tickets

## Brahms performance data refresh

- Deploy/build refresh: `npm run build` now runs `npm run scrape:brahms` before `next build`, so deployed builds include freshly generated `public/data/brahms-performances.json`.
- Daily refresh: `.github/workflows/brahms-data-refresh.yml` runs every day at 06:00 UTC (and can be run manually) to regenerate and commit `public/data/brahms-performances.json`.
- Vercel deployment: if Vercel is connected to GitHub, the workflow commit to `main` triggers a new deploy automatically.  
  Optional: add `VERCEL_DEPLOY_HOOK_URL` as a repository secret to also trigger a Vercel deploy hook directly from the workflow.
