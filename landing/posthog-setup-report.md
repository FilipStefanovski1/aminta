<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the Aminta landing app. Client-side tracking is initialized via `instrumentation-client.ts` (Next.js 15.3+ pattern) with a reverse proxy through `/ingest` to avoid ad-blockers. A shared `lib/posthog-server.ts` singleton powers server-side events in API routes. User identification is called on signup and login so client and server events can be correlated to the same person. Error autocapture is enabled globally via `capture_exceptions: true`.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User successfully creates an account with email and password. | `app/signup/page.tsx` |
| `user_logged_in` | User successfully signs in with email and password. | `app/login/page.tsx` |
| `google_oauth_initiated` | User clicks the Google sign-in button on login or signup. | `app/login/page.tsx`, `app/signup/page.tsx` |
| `password_reset_requested` | User submits a password reset email request. | `app/reset-password/page.tsx` |
| `password_updated` | User successfully sets a new password via the reset flow. | `app/reset-password/page.tsx` |
| `extension_auth_completed` | Extension authentication handoff succeeds and tokens are delivered. | `app/extension-auth/page.tsx` |
| `extension_auth_failed` | Extension authentication handoff fails due to an error or timeout. | `app/extension-auth/page.tsx` |
| `pricing_billing_mode_changed` | User switches between monthly and lifetime billing tabs on the pricing section. | `components/Pricing.tsx` |
| `pricing_cta_clicked` | User clicks a CTA button on the pricing section. | `components/Pricing.tsx` |
| `subscription_activated` | Creem webhook confirms a checkout completion or subscription activation. | `app/api/webhooks/creem/route.ts` |
| `subscription_canceled` | Creem webhook confirms a subscription cancellation. | `app/api/webhooks/creem/route.ts` |
| `subscription_expired` | Creem webhook confirms a subscription has expired and the user is downgraded. | `app/api/webhooks/creem/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://eu.posthog.com/project/219701/dashboard/805449)
- [Daily signups (wizard)](https://eu.posthog.com/project/219701/insights/bIpWG0oH)
- [Subscriptions activated (wizard)](https://eu.posthog.com/project/219701/insights/HKRfrnXG)
- [Signup to extension auth funnel (wizard)](https://eu.posthog.com/project/219701/insights/dTDuJvbK)
- [Extension auth results (wizard)](https://eu.posthog.com/project/219701/insights/pe8meLKC)
- [Subscription churn (wizard)](https://eu.posthog.com/project/219701/insights/XJHeacys)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — a handler that only identifies on fresh login can leave returning sessions on anonymous distinct IDs.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
