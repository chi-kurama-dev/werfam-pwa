# weRfam — Canonical production deployment

**Source of truth:** [chi-kurama-dev/werfam-pwa](https://github.com/chi-kurama-dev/werfam-pwa), branch `main`.

**Production URL:** https://werfam-pwa-bay.vercel.app/

**Vercel team:** `chiomegadeveloper-4636`.

**Vercel project ID:** `prj_FRIt0cP4FeEmIiQqY10N4GpTzwKW`.

## Release contract

1. Make and review app changes in this repository.
2. Commit changes to this repository's `main` branch.
3. GitHub Actions [Deploy weRfam Production](.github/workflows/deploy-production.yml) checks out **that exact commit**, pulls production configuration, builds the source, and deploys to the existing Vercel project.
4. Verify the production deployment and report the deployed commit SHA.

Do not directly edit or commit the alternative `chiomegadeveloper-svg/werfam-pwa` repository. Do not treat a manual Vercel source upload as a substitute for a source commit. This project should use GitHub Actions as the deployment trigger while its Vercel workspace has a different GitHub account linked.

## One-time setup needed to activate automation

1. Create a **Vercel personal access token** under the account authorized for the `chiomegadeveloper-4636` team, and grant the token access to this workspace. Use Vercel account settings > Tokens. Choose an appropriate lifetime and renew it before expiry.
2. In **GitHub > chi-kurama-dev/werfam-pwa > Settings > Secrets and variables > Actions**, create the repository secret named **`VERCEL_TOKEN`**. Paste the token **only** into the GitHub secret field. Never commit, publish, email, or paste it into chat.
3. Open **GitHub > Actions > Deploy weRfam Production > Run workflow**, with branch `main`. Confirm the build succeeds and https://werfam-pwa-bay.vercel.app/ reflects the commit.
4. In Vercel **Project > Settings > Git**, disconnect the old Git repository if Vercel shows `chiomegadeveloper-svg/werfam-pwa` as the connected source. This prevents conflicting automatic deployments from the wrong repository. Do **not** delete the existing Vercel project or domain.
5. Confirm the Vercel Production environment has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pointing to the existing **weRfam** Supabase project. Rebuild after changing environment variables.

The workflow intentionally fails with a clear message if the `VERCEL_TOKEN` secret is missing; this prevents reporting a nonexistent production deployment as successful.

## Security

- Vercel project/team identifiers are not secrets and may be committed.
- `VERCEL_TOKEN`, Supabase service role keys, `sb_secret_*` keys, and database credentials must never be committed.
- Only Supabase **publishable** credentials may appear as `VITE_*` frontend configuration. Supabase Row Level Security must remain enabled.
