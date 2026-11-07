# 058 Rides

A mobile-first Harrismith ride-booking app built with React, Vite, Leaflet, and Supabase Auth/Postgres. Customer rides, driver applications, and role-protected operations are managed directly through Supabase with row-level security.

## Supabase setup

1. Authenticate and link the Supabase CLI:

   ```sh
   npx supabase login
   npm run db:link
   ```

2. Push the migrations under `supabase/migrations/`. The initial schema creates profiles, drivers, and rides; the finance migration adds saved platform-share settings, immutable booking-time splits, admin-only reporting, and driver-safe earnings summaries:

   ```sh
   npm run db:push
   ```

   Alternatively, paste the migration into the project's Supabase SQL Editor.
3. In **Project Settings → API Keys**, copy the public **publishable** key (or legacy `anon` key). Do not use a `service_role` or secret key in the browser.
4. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_PUBLISHABLE_KEY` to that public key. The project URL is pre-filled. Restart the Vite server after changing environment variables.
5. In **Authentication → URL Configuration**, set the site URL and allowed redirect URLs for your local and production app domains. Enable email confirmation (the app waits for email confirmation if Supabase does not return a session). The local CLI config enables confirmations and uses the Vite localhost URL.
6. This project currently uses Supabase's built-in email sender, which is limited to 2 Auth emails per hour for the project. This is suitable for testing, but may delay or block signups and password-reset emails after the quota is reached. Set the Supabase Auth **Site URL** and redirect allowlist to the actual app origin so confirmation links return to the app. Supabase local development is configured with the same `email_sent = 2` limit in `supabase/config.toml`.
7. To provision an administrator, create a user in **Authentication → Users**, then run this in the SQL Editor after replacing the email:

   ```sql
   update public.user_profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'admin@example.com');
   ```

   Administrator sign-in is deliberately not linked from public pages. The private operations route is `/ops-058-console`; access is still enforced by the Supabase `admin` role and RLS.
8. Deploy the private account-management Edge Function after linking the CLI. Supabase supplies its service-role key server-side; never add that key to the Vite environment:

   ```sh
   npx supabase functions deploy admin-users
   ```

   The function verifies the caller's admin role before listing Auth accounts or suspending/restoring access. Users can update their own name, phone, and password in Account settings.

## Run and build

```sh
npm install
npm run dev
npm run build
npm run preview
```

The app is a static Vite build; Supabase Auth and Postgres provide the backend. The map uses OpenStreetMap tiles and optionally uses device GPS for pickup locations.

## Routes

- `/` — rider sign-in and account creation
- `/ride` — authenticated customer booking and tracking
- `/driver-login` — driver sign-in
- `/driver` — driver application and account creation
- `/ops-058-console` — unlinked, role-protected operations console
- `/account` — signed-in user's profile and password settings

The admin Finance tab stores the fixed platform share in `platform_settings`. The amount is snapshotted for each booking; cancelled and declined rides are marked reversed. Drivers can read only their completed take-home totals and charts: the underlying platform-share columns are not granted to authenticated clients, and only the admin financial RPC returns the split. Driver account name and phone changes are synchronized to both profile records through a restricted database function.
