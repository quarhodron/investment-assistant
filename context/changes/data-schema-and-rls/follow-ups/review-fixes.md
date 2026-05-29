# Review follow-ups — data-schema-and-rls

Findings from `reviews/impl-review.md` deferred to a later slice rather than fixed in place.

## F3 — user_settings auto-create on signup

- **Source**: impl-review F3 (WARNING / Reliability)
- **Deferred to**: F-02 (or earlier, if a downstream slice needs `user_settings` before F-02 lands)
- **Problem**: `user_settings` is 1:1 with `auth.users` (PK = user_id) but nothing creates the row on signup. Concurrent first-write requests race on the PK and one returns `23505 unique_violation`.
- **Recommended fix**: Add a follow-up migration with `AFTER INSERT ON auth.users` trigger that runs `INSERT INTO user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING`. Pair with a one-off back-fill `INSERT … SELECT … ON CONFLICT DO NOTHING` for any existing dev users.
- **Alternative**: Document upsert-only writes (`INSERT … ON CONFLICT (user_id) DO UPDATE`) as a hard project rule; weaker because it relies on every future caller's discipline.
