# weRfam — Private family location-sharing PWA

**Version 0.1.0 / Vite + React + Supabase + Leaflet/OpenStreetMap**

Uses the actual uploaded weRfam artwork, Poppins font, responsive rounded-rectangle panels, and the brand's navy/cyan/orange/coral palette.

## Features in this build

- Parent sign-up / sign-in with email + password and a permanent server-recorded parent role.
- Parent creates their family circle and invitations for son/daughter accounts (12-character, one-time, 14-day codes).
- Each child registers their **own** email/password account using the invitation code (or accepts after sign-in).
- Parent dashboard, responsive private family map, family list, pending invitations, account/privacy settings.
- Explicit child-controlled start/stop GPS sharing via browser permission prompt.
- `watchPosition()` with ~5-second minimum publish spacing when the browser supplies new positions. No fabricated coordinates: stale/paused positions labelled.
- Supabase Realtime updates with a 12-second visibility-aware polling fallback.
- Strict Row Level Security: parents can only read the current GPS of children actually linked to their family; children can see only their own GPS.
- No location movement history; clearing location on stop.
- Installable PWA manifest, app icons and minimal service worker for static shell assets (NOT family data or map tile caching).
- Clearly labeled sample-data *interface preview* if Supabase is not configured.

## Local setup (VS Code)

1. Unzip this directory, then run:

   ```bash
   npm install
   cp .env.example .env
   npm run dev
   ```

2. Create a **new** Supabase project at https://supabase.com.
3. Run `supabase/001_werfam.sql` in that project's SQL Editor **before** registering any users.
4. In Supabase Auth settings, enable email/password and ideally **confirm email**. When confirming emails, add your localhost and deployed production URLs to the allowed redirect URLs.
5. From Supabase > Project Settings > API, fill `.env` with:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PROJECT_PUBLISHABLE_KEY
   ```

   Use only the **publishable/anon** key, never the `service_role`, `sb_secret_*`, or database password in any `VITE_` variable.
6. Restart Vite after editing `.env`.

## Real device test

1. Register Parent A, then create their family circle.
2. Open **My Family > Enroll child**. Enter the child's name and relationship. Copy the newly created one-time invite code.
3. On a second phone or browser profile, create a **child** account using that code and confirm email as needed.
4. On the child's device, open **Live Map > Start sharing**, grant *precise* location permission, and keep the PWA active.
5. Parent A can see the child's latest coordinates on the family map. Stale updates are shown as **last known**.
6. Press **Stop sharing** on the child's device. The database clears the last coordinates.
7. Verify that unrelated Parent B cannot view Parent A's family through Supabase's anon-authenticated API.

## Deploy with GitHub + Vercel

1. Create a private GitHub repository, and push project files (except `.env`).
2. Import the GitHub repo into Vercel. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
3. In Vercel Project > Environment Variables set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production and Preview.
4. Deploy, then add `https://your-deployment.vercel.app` as an Auth allowed redirect / Site URL in Supabase.
5. Test the *deployed HTTPS URL* on two separate phones, and inspect Supabase RLS policies before inviting real children.

## Constraints and safety

- **Not an always-on tracker.** Browser and OS background throttling (especially on iOS) means GPS cannot be guaranteed after the app is locked, suspended or closed. For reliable all-day background location, build a native iOS/Android companion using platform background-location permissions.
- Browser GPS needs HTTPS and explicit permission; users can deny or revoke it.
- No push notifications or SOS are implemented. Do not use this as an emergency-response or safety-critical service.
- GPS accuracy, transmission frequency and anti-spoofing are not guaranteed. Never imply the child is at an exact location based on a last-known fix.
- Secure invitation codes are possession-based: share them only with their intended recipient. Stronger parental approval / identity confirmation and audit logging are advisable for public launch.
- Consider Philippine Data Privacy Act, informed consent, children's age and guardianship rules, and appropriate retention/erasure policies before public release.
- OSM tile servers are free only on a **best effort, fair-use** basis; do not bulk fetch. For significant scale, use an approved tile provider. Keep visible © OpenStreetMap attribution.
- Vercel Hobby is restricted to personal/noncommercial use. Supabase free plan and Vercel have usage limits. **$0 is feasible for a small prototype, not an unrestricted guarantee for production.**
- Supabase free-tier 500MB database and realtime quotas may constrain frequent large-scale location sharing. Adaptive battery/network-aware publication should be introduced for production.
- User/client direct write access to tables is revoked; location updates and family linking use protected SQL RPCs. The server cannot cryptographically prove a handset's GPS value is genuine.

## Folder structure

```
weRfam/
  public/
    icons/ ... app icons
    logo-wordmark.webp
    logo-emblem.webp
    manifest.webmanifest
    sw.js
  src/
    App.jsx         UI, auth and GPS logic
    main.jsx
    supabase.js
    styles.css
  supabase/
    001_werfam.sql  tables, RLS, RPC and realtime
  .env.example
  index.html
  package.json
  vercel.json
  vite.config.js
```
