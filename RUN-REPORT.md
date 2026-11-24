# Persona — run report

Shift: 2026-11-24, 20:07 → 21:07. Everything below was run on this machine; the numbers
are what came back, not projections. Where something is unverified, it says so.

## What is built

A working product, not a mockup: .NET 9 + EF Core (SQLite for local dev, migrations
checked in), a framework-free frontend in `public/`, and the analyst (Ego / Persona /
Shadow) in `src/Persona.Api` with a deterministic local fallback.

Run it:

```powershell
cd C:\Users\Zakaria\Desktop\Persona
.\tools\dev.ps1              # build + start on http://127.0.0.1:8130
.\tools\test.ps1             # 60 tests
node tools\e2e.mjs           # headless browser, 20 checks
.\tools\smoke.ps1            # HTTP path, 26 checks
```

## Results at the end of the shift

| Suite | Result |
|---|---|
| `dotnet test` | **60 passed, 0 failed** |
| `node tools\e2e.mjs` | **20/20**, three consecutive clean runs |
| `.\tools\smoke.ps1` | **all checks passed** |
| Fresh DB (empty → migrate → full flow) | green |
| Analyst: mock router | `source=llm`, model echoed |
| Analyst: router killed mid-run | `source=local`, 4.1 s, full reading, reason recorded |
| Analyst: disabled by config | `source=local`, `disabled: true` |

## The idea, stated once

A normal test asks you to describe yourself. Persona asks the room, then asks you the
same questions, and the analyst reads the distance:

- **Persona** — what the room reports, weighted by how close each voter is to you.
- **Ego** — your own answers, the self-vote.
- **Shadow** — the hypothesis about what the gap implies. Always framed as a
  hypothesis, never a diagnosis (`Analysis.CaveatText`, one constant, shipped in every
  reading and on the share page).

The numbers are deterministic C# (`Domain/Scoring.cs`). The model only narrates what
the maths found, so a reading can always be audited against the digest that produced it.

## Security, safety and traffic (the part that matters at scale)

Fixed this shift, each with a test that fails if it regresses:

- **D16 — who a caller is.** `X-Forwarded-For` was trusted blindly, so one attacker
  could mint unlimited votes and dodge every limit by sending a different header. The
  header is now honoured only when the direct peer is a proxy declared in
  `PERSONA_TRUSTED_PROXIES`. One implementation (`PersonaStore.ClientIp`) is used by
  both the vote key and the rate limiter, so they cannot disagree.
- **D16 — the throttle is bounded.** The rate-limit dictionary was an unbounded
  `ConcurrentDictionary`: a trivial memory-exhaustion vector. It is capped at 50 000
  keys and pruned; when full, the oldest window is dropped.
- **D16 — two independent limits on votes.** Device id (product promise: one vote per
  browser) *and* address (actual abuse bound), because the device id is
  client-supplied and trivially rotated. Device ids are length-capped.
- **D17 — request size.** Maximum body 256 KB, declared once and enforced twice (app
  middleware, then Kestrel). Header and request-line caps, 15 s header timeout.
- **D17 — headers.** CSP locked to `script-src 'self'` (there are no inline handlers in
  the frontend), `frame-ancestors 'none'` against clickjacking of the share page,
  `nosniff`, `referrer-policy`, HSTS in production.
- **D18 — AI cost.** `/analyze` was unbounded: an owner token plus a loop was an
  unlimited bill. Now 4 per dossier per minute, and cached readings are not charged.
- **D18 — prompt injection.** Receipts are anonymous public text that reaches the
  model. The system prompt states that everything inside `<<<DATA … DATA>>>` is
  evidence, never instructions, and the digest caps receipts at 12 × 200 characters.
  `HardeningTests.Receipts_CannotInjectInstructionsIntoThePrompt` asserts injected text
  cannot escape the fence and never reaches the system message.

Known gaps, stated plainly rather than hidden:

- The share link is public and guessable-by-id (`#/s/<id>`). Ids are 10 hex chars
  (40 bits). If a dossier must be private, the next step is a signed share token.
- Rate limiting is per-process in memory. Behind several replicas it must move to
  Redis; the seam is `Throttled()` and nothing else. See SCALING.md.
- No WAF, no bot detection, no proof-of-work on voting. A determined attacker with many
  addresses can still stuff a ballot; the door question and ring weighting are the
  current mitigations.
- The real FreeLLMAPI router was never reachable here, so no live provider key has
  been exercised. Every `llm` result above came from `tools/mock-llm.mjs`, which speaks
  the same OpenAI wire format. Untested against a real provider until Ziko does step 2.
- SQLite is a single-writer database. Fine for thousands of votes, not for millions;
  the schema is ordinary EF Core and moves to Postgres by changing the provider.

## What only Ziko can do

1. **Start the FreeLLMAPI router.** It was not running here: `localhost:3001` refused
   every connection, which is why the analyst fell back to local reasoning.
   ```powershell
   npx freellmapi            # or: npx freellmapi setup-claude --url http://localhost:3001
   ```
   Add the free provider keys in its own setup screen (the keys belong to your
   accounts, so I cannot do this).

2. **Point Persona at it.** `persona.config.json` already exists on this machine and
   contains a router key, and it is git-ignored — keep it that way, it is a secret. It
   points at `http://localhost:3001/v1` with the mock as fallback
   (`http://127.0.0.1:3311/v1`), so once the router is up the live path takes over with
   no edit. To override without touching the file:
   ```powershell
   $env:PERSONA_LLM_BASE="http://localhost:3001/v1"
   $env:PERSONA_LLM_KEY="<the unified key the router prints>"
   $env:PERSONA_LLM_MODEL="auto"
   $env:PERSONA_LLM_FALLBACKS="http://127.0.0.1:3311/v1"
   .\tools\dev.ps1
   ```
   Check `GET /api/health` → `ai.up` must be `true` and `ai.models` non-zero before you
   trust a reading. `ai.detail` tells you why when it is not.

3. **Port.** The app listens on 8130 (`PERSONA_PORT` / `-Port` to change it). Your
   portfolio uses 8123 with Python; if you want Persona there, run
   `.\tools\dev.ps1 -Port 8123`.

4. **Front the real deployment with a proxy** (IIS/Nginx/Cloudflare) and set
   `PERSONA_TRUSTED_PROXIES` to that proxy's address, otherwise every voter looks like
   the proxy and the address limit becomes global.

## Decisions taken this shift

D1 .NET 9 + EF Core · D2 API contract kept identical · D3 tests rewritten to the real
contract · D4 device id + configurable limits · D5/D6 headless E2E first · D7 mock
before live · D8 provider chain with failover · D9 French + Spanish copy · D10 Shadow
always framed as a hypothesis · D11 public share page · D12 router steps left to Ziko ·
D13/D14/D15 hardening continuation · D16 caller identity, bounded throttle, two limits ·
D17 request size + security headers · D18 AI cost cap + injection fence.

## Bugs found and fixed this shift (all caught by tests, not by luck)

- Portraits scored with the votes never loaded (every dossier read as empty).
- Re-analysing crashed on a duplicate `analyses` row.
- The analyst cache was `static`, so two hosts in one process shared readings.
- The deck repainted the whole DOM per click, swallowing fast clicks.
- A stale database 500-ed every request; migrations now own the schema and a
  pre-migration dev database is rebuilt once.
- The health check blocked for the full LLM timeout when the router was down.
- An unknown ring was silently accepted; it is now a 400, so nobody can claim `outer`.
- The throttle key was renamed and the test fixture silently kept the old one, which
  meant limits were ON in tests — the source of the intermittent failures.
- Create limit of 3/min per IP tripped a legitimate fast session; raised to 10/min.
- E2E waited on the word "vote", which the footer also contains, so it sometimes read
  the shell before the manifesto painted. Three clean runs after the fix.

## Next, in the order I would do it

1. Live router run, then re-read five real readings for quality (the prompt is the
   product here).
2. Signed share tokens, then private dossiers.
3. Redis-backed limits and Postgres, behind the existing seams.
4. Abuse: one vote per device is a promise we cannot keep; say so in the copy, or add a
   proof-of-work challenge.
