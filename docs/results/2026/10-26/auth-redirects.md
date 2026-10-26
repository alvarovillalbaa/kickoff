# Still / Kickoff Auth redirect configuration

26 October 2026. This records the browser-only Auth configuration step for the owner-approved shared-backend cutover. The intended project is Still, `wosqlzijmyiemueoittw`; the owning cutover receipt is [shared-backend.md](shared-backend.md).

The authorized additive change is to append these exact values if absent, preserving the existing Site URL and every existing redirect entry:

- `https://kickoff-football-seven.vercel.app`
- `https://kickoff-football-seven.vercel.app/`

## Current observation

The supported Chrome browser opened a new task-owned tab at [Still's Auth URL configuration](https://supabase.com/dashboard/project/wosqlzijmyiemueoittw/auth/url-configuration). It redirected to the Supabase dashboard sign-in page.

After the owner reported signing in, the task resumed and navigated to the exact project URL again. The project settings shell appeared briefly, but the subsequent fresh accessibility state returned to `/dashboard/sign-in?returnTo=%2Fproject%2Fwosqlzijmyiemueoittw%2Fauth%2Furl-configuration` before an Auth form was available. A read-only list of Supabase tabs in this connected Chrome browser showed only this sign-in tab.

The current Site URL, redirect allowlist and confirmation setting therefore remain unread by this browser task. No URL setting was edited or saved. No SMTP, email confirmation, phone/provider, billing or project lifecycle setting was touched. The sign-in tab remains available for owner handoff. No credentials, cookies or secret values were exported.

A subsequent owner confirmation was checked by inspecting the current task tab directly, without navigation or reload. Its live accessibility state and URL still showed the dashboard sign-in page; the connected browser again listed only this Supabase tab. The [sign-in screen](auth-dashboard-sign-in.jpg) records that observed state without revealing credential values. Credential field contents were not inspected. Browser connection/tab identifiers were passed to the execution owner to reconcile the session before requesting another sign-in.

## Required completion proof

Once the exact settings page stays authenticated, capture its current Site URL and complete redirect list before editing. Append only missing Kickoff entries above, save, reopen the configuration page, and verify both Kickoff entries plus every original entry and the unchanged Site URL. Do not use an unavailable settings read as evidence of a successful cutover or confirmed-email behavior.
