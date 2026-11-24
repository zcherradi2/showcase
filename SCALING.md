# Scaling Persona

What breaks first, and the exact seam to change. Written for the point where the site
has real traffic, not for a demo.

## 1. Rate limiting (first bottleneck, easiest fix)

Today: `Endpoints.Throttled()` keeps a fixed-window counter per key in a
`ConcurrentDictionary`, capped at 50 000 keys. Correct and bounded on one machine.

At several replicas each instance counts separately, so the effective limit is
`limit × replicas`. Replace the body of `Throttled()` with Redis:

```
INCR key:<bucket>   and   EXPIRE <bucket> 60
```

Nothing else changes: every caller already goes through that one function.

## 2. Database (second bottleneck)

Today: SQLite, one writer. Reads scale fine; concurrent vote writes serialise.

- The schema is ordinary EF Core (`Data/Migrations`), so switching provider means
  changing `UseSqlite` to `UseNpgsql` and regenerating the migration.
- Votes are append-only, which makes them cheap to partition by persona id.
- `personas.Revision` is bumped per vote, so cached portraits invalidate correctly.

## 3. Reads of a popular dossier (third)

Every portrait request recomputes `BuildPortrait` from all votes. A viral dossier is
thousands of votes recomputed per page view.

- Cache the portrait per `(personaId, revision)` in memory or Redis; the revision
  already exists for exactly this.
- The public share page can be rendered once per revision and served statically.

## 4. The analyst (cost, not load)

Every reading is a real model call. Today: 4 per dossier per minute, cached by digest
hash. At scale, move to a queue: analyse on demand, store the result, never call the
model on the request path. The digest hash is the natural idempotency key.

## 5. Static files

`public/` is served by ASP.NET with a 60 s cache. In production put a CDN in front and
version the filenames; nothing in the app needs to change.

## 6. What must not scale up with traffic

- The throttle dictionary: capped on purpose.
- The analyst cache: keyed by digest, so it grows with distinct dossiers, not requests.
  Bound it (LRU) when it matters.
- Receipts reaching the model: 12 × 200 characters, fixed.
