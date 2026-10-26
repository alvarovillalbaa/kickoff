# Still / Kickoff Auth URL configuration

Completed 26 October 2026 in the owner-approved shared project `wosqlzijmyiemueoittw`. Canonical cutover evidence: [shared-backend.md](shared-backend.md).

The dashboard initially showed the default Site URL `http://localhost:3000` and an empty redirect list. There were no production callback entries to preserve. The approved Auth setup therefore replaced that development placeholder with Still's production origin and added both apps explicitly.

- Site URL: `https://still-markdown.vercel.app`
- Redirect: `https://still-markdown.vercel.app`
- Redirect: `https://still-markdown.vercel.app/`
- Redirect: `https://kickoff-football-seven.vercel.app`
- Redirect: `https://kickoff-football-seven.vercel.app/`

The settings were saved through the visible Supabase dashboard, then the exact project URL was reloaded. A fresh accessibility snapshot verified the persisted Site URL, all four redirect entries and “Total URLs: 4.” [Saved settings capture](auth-urls-saved.jpg). This uses exact production origins, with no preview-domain wildcard.

The published Still health endpoint returned HTTP 200 at source `9a789b4413124fb03015059b31190bde9bfc6b18` and confirmed `emailEnabled:true`, `signupEnabled:true`, `emailConfirmationRequired:true`. Its public configuration reports `emailDeliveryVerified:false` and password recovery disabled. No SMTP, confirmation, phone/provider or billing setting was changed during the URL step. This receipt does not prove email delivery or a successful recovery link.

The initial browser attempts stopped at sign-in; [the observed screen](auth-dashboard-sign-in.jpg) preserves that no-action outcome. The main execution session then used the normal “Continue with GitHub” action, which resumed the owner's existing authorized GitHub session without a new permission grant. No credentials, cookies, browser profiles or session stores were inspected or exported. The earlier sign-in observation is superseded by the saved/reloaded configuration proof above.
