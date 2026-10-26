# Shared-backend public browser checks

26 October 2026. The publication owner executed these focused Chrome checks on [Kickoff production](https://kickoff-football-seven.vercel.app/) under the owner's consolidation-check approval. This receipt is written from that operator's observed results. The checked functional client revision was `7b301cb`; subsequent documentation revision `e164e9e` did not change client behavior.

| Check | Observed result |
| --- | --- |
| Public catalogue | Loading resolved to **0 partidos** and the empty-state heading beginning “El primer partido”. The page showed no network-error state. |
| Account dialog | **Entrar** opened the shared-account dialog headed “Tu cuenta Kickoff y Still”. Its copy explained that an existing Still account can be used. No sign-up, sign-in or email request was submitted. |
| Desktop width | Browser inner width 1440 px; document width 1425 px. No horizontal overflow. |
| Narrow mobile width | Browser inner width 390 px; document width 375 px. No horizontal overflow. |

The browser viewport override was reset after the checks. These observations establish the public empty-catalogue rendering and shared-account presentation. Populated catalogue filtering, bookings, authenticated sessions, email delivery, MCP transport and simultaneous-client behavior were not exercised in this browser check.

The separate 28-group PostgreSQL acceptance and provider/cutover state belong to [the shared-backend receipt](shared-backend.md). That receipt owns the served-bundle target verification and retirement evidence; browser rendering alone does not establish provider retirement or SMTP readiness. Still's guest-page regression check is recorded in [its owning repository](https://github.com/alvarovillalbaa/still-markdown/blob/main/docs/results/2026-10-26-shared-browser.md).
