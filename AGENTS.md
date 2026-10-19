# Kickoff

Spanish consumer app for real football pitch bookings and match organization.

- React + Vite frontend, Supabase Auth and Postgres with RLS and atomic RPCs.
- No mock centers, fields, matches, users, or bookings in production.
- Frontend uses only the Supabase publishable key; never include secret/service-role keys.
- Preserve ownership checks, invitation authorization, capacity locks, and booking uniqueness.
- Manual edits use apply_patch. Run git diff --check after edits.
- Build with npm run build for deployment. Do not run unrelated suites or install browsers.
- Schema and operational guidance live in supabase/ and docs/.
- Do not recreate the deleted ChatGPT Site. Target GitHub and Vercel only.
