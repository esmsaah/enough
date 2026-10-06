# Later — ideas parked, out of V1 scope

Per the brief: do not add features outside it. Ideas land here instead.

- (none yet)

## AI follow-ups
- Questions UI for analyst questions (max 3, one screen, chips).
- Monthly re-research of subscription profiles older than 30 days (needs a separate Cloudflare Worker with a Cron trigger; Pages Functions have no cron). Store price history, feed price-increase alerts.
- Opt-in sharing of user corrections (merchant name + category only) back to the D1 cache.
- Rate limit /api/* per IP via Cloudflare rate limiting rule.
