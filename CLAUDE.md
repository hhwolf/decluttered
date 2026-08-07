# Decluttered

## Deploy Configuration (configured by /setup-deploy)
- Platform: vercel
- Production URL: https://decluttered-livid.vercel.app
- Deploy workflow: manual via `vercel deploy --prod --yes` (project not connected to git; CLI uploads the working directory)
- Deploy status command: `vercel inspect <deployment-url>`
- Merge method: squash
- Project type: web app (Vite + React SPA, static output in dist/)
- Post-deploy health check: https://decluttered-livid.vercel.app

### Custom deploy hooks
- Pre-merge: `npm test && npm run build`
- Deploy trigger: `vercel deploy --prod --yes`
- Deploy status: `vercel ls decluttered`
- Health check: `curl -sf https://decluttered-livid.vercel.app`

Notes: Vercel project `decluttered` under the `asteria-79792469` (Asteria) team
scope, user hhwolf. Non-interactive deploys need `--scope asteria-79792469`.
Deployment-specific `*-asteria-79792469.vercel.app` URLs sit behind Vercel SSO
protection; the public production domain is `decluttered-livid.vercel.app`.
