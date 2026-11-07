# Project notes

## Architecture
- React frontend built with Vite. Shared UI lives in `src/components/`, route screens in `src/pages/`, and session/role state in `src/auth/`.
- Supabase Auth handles rider, driver, and administrator accounts. Postgres schema and row-level security are in `supabase/migrations/`; the app uses the browser-safe publishable/anon key only.
- Fare calculation is shared between the browser and the Postgres insert trigger in `lib/pricing.js` and the Supabase migration.
- `/` is rider authentication, `/ride` is authenticated booking, `/driver-login` and `/driver` are driver sign-in/application, and `/ops-058-console` is an unlinked, admin-role-protected route.
- Ride status flow: NEW → ACCEPTED → STARTED → ARRIVED → COMPLETED. Customers may cancel their own NEW or ACCEPTED rides. Database policies and triggers enforce access and transitions.
- Leaflet displays Harrismith using OpenStreetMap tiles. The frontend is mobile-first and uses Font Awesome icons.

## Commands
- `npm run dev` starts the Vite development server.
- `npm run typecheck` checks the TypeScript frontend.
- `npm run build` type-checks and creates the production site in `dist/`.
- `npm run preview` serves the production build.

## Supabase setup
- Run the SQL migration in the Supabase SQL Editor.
- Configure `.env.local` with the project URL and the project's public publishable/anon API key.
- Never expose a Supabase `service_role` or secret key in frontend code.
