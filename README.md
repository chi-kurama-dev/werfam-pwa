# weRfam — Private family location-sharing PWA

**Version 0.5.0 / Vite + React + Supabase + Leaflet/OpenStreetMap**

Uses the actual uploaded weRfam artwork, Poppins font, responsive rounded-rectangle panels, and the brand's navy/cyan/orange/coral palette.

## Features in this build

- Parent sign-up / sign-in with email + password and a permanent server-recorded parent role.
- Parent creates their family circle and invitations using 16-character codes (14-day enrollment expiry, single-use pairing). Previously generated 12-character codes still work.
- Child signs in using **only the code** on their own phone. On first pairing, a managed child account is created and the required child profile must be completed before opening the map. The same code supports later sign-in from the paired browser only.
- Parent dashboard, responsive private family map, family list, pending invitations, account/privacy settings.
- Optional parent GPS sharing: parent can turn sharing on and off, and linked children see the parent's active coordinates in their family map. Parent/child and child/child overlapping markers separate without changing GPS positions.
- When any member publishes GPS, previous map locations for the other family members are preserved.
- Parent-only **Remove Child** button under My Family. Removal revokes that child's family membership, pairing code, shared GPS, and their messages in this family's chat. Their separate Auth identity remains isolated.
- Private **family group chat** for linked members, built with Supabase Realtime and a visible-only polling fallback. The chat displays the latest 100 messages.
- **10 emergency message templates** for family chat, plus **10 child quick messages** (one-tap sends). Emergency sends DO NOT contact emergency services or generate push notifications.
- Child location panel with no in-app Stop Sharing action, automatic GPS resumption when permission is already granted and the PWA is active, and an explicit Allow GPS action if permission has not yet been granted. Device/OS permissions and sign-out still control tracking.
- `watchPosition()` with ~5-second minimum publish spacing when the browser supplies new positions. No fabricated coordinates: stale/paused positions labelled.
- Supabase Realtime updates with a 12-second visibility-aware polling fallback.
- Family-scoped access: parents can view their linked children's latest GPS; code-paired children may view other linked members' latest *enabled* GPS through a device-verified read-only database function. Unrelated families cannot be queried.
- No location movement history. Location updates stop when the app is inactive/closed, GPS permission is revoked, or the account signs out. The app cannot force background tracking.
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
3. Run migrations `supabase/001_werfam.sql` through `supabase/006_parent_optin_gps.sql` in numeric order **only on a new empty project**, then deploy `supabase/functions/child-code-login` with the `verify_jwt=false` setting in `supabase/config.toml`. **The official weRfam database already has these migrations and the child sign-in function; do not run them again there.**
4. In Supabase Auth settings, enable email/password and ideally **confirm email** for parent accounts. When confirming emails, add your localhost and deployed production URLs to the allowed redirect URLs.
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
3. On a separate phone, select **Child code**, enter the parent's code, and complete the child profile. No child email or password entry is necessary.
4. On the child's paired phone, open **Live Map > Allow GPS**, grant *precise* location permission, and keep the PWA active.
5. Parent A can see the child's latest coordinates on the family map. Stale updates are shown as **last known**.
6. With the child profile active, open **Chat**, tap a child quick template and send a typed message. Confirm the parent receives it, then send an emergency template and verify that it is clearly marked as an emergency. These messages are for the family only, not emergency responders.
7. As the parent, open **My Family** and choose Remove on a test child. Confirm the removal dialog, then verify the child loses access to the family, chat, pairing code, and GPS. Also verify that unrelated Parent B cannot view Parent A's family messages through the authenticated API.

## Deploy with GitHub + Vercel

1. Create a private GitHub repository, and push project files (except `.env`).
2. Import the GitHub repo into Vercel. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
3. In Vercel Project > Environment Variables set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production and Preview.
4. Deploy, then add `https://your-deployment.vercel.app` as an Auth allowed redirect / Site URL in Supabase.
5. Test the *deployed HTTPS URL* on two separate phones, and inspect Supabase RLS policies before inviting real children.

## Constraints and safety

- **Not an always-on tracker.** There is no child-facing in-app stop toggle, but phone users can still revoke OS location permission, sign out, or close the app. Browser and OS background throttling (especially on iOS) means GPS cannot be guaranteed after the app is locked, suspended or closed. For reliable all-day background location, build a native iOS/Android companion using platform background-location permissions.
- Browser GPS needs HTTPS and explicit permission; users can deny or revoke it.
- The 10 emergency templates send **ordinary in-app family-chat messages only**. There are no push/SMS notifications, location attachments, delivery guarantees, emergency-service calls, or SOS escalation. Do not use the chat as a safety-critical emergency-response system.
- GPS accuracy, transmission frequency and anti-spoofing are not guaranteed. Never imply the child is at an exact location based on a last-known fix.
- Child invitation codes are possession-based. First pairing and subsequent code-only sign-in are tied to a local browser installation secret. This cannot cryptographically prove that parent and child are on physically separate handsets or prevent cloning a compromised browser session. Clearing browser data or changing phones currently requires parent-assisted recovery/re-enrollment. Stronger guardian verification and device attestation are advisable before public launch.
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
    001_werfam.sql            initial schema and RLS
    002_child_code_pairing.sql code-only child pairing migration
    003_child_family_lookup.sql device-bound family lookup
    004_child_family_snapshot.sql device-bound linked members and enabled GPS snapshot
    005_family_chat_and_child_removal.sql family chat, RLS and parent removal
    006_parent_optin_gps.sql optional parent GPS sharing and child visibility
    config.toml               Edge Function config
    functions/child-code-login/index.ts  code-only sign-in server
  .env.example
  index.html
  package.json
  vercel.json
  vite.config.js
```
