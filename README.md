# Persona — people vote, the analyst decides

A normal test asks you about yourself and hands you a result. Persona does the
reverse: the people around you answer, the numbers are theirs, and the AI's job is
only to say what the distance between their answers and yours might mean.

Three words carry the whole product:

- **Persona** — how the room actually reads you. Weighted by how close each voter is
  to you (inner 1.2, family 1.15, work 1.0, online 0.75, unverified 0.4).
- **Ego** — how you read yourself. You take the same instrument, before you see any
  result, and your answers are never shown to voters.
- **Shadow** — the hypothesis the analyst draws from the gap between the two. Always
  phrased as inference, never as a diagnosis.

## Run it

```powershell
.\tools\dev.ps1              # build + start on http://127.0.0.1:8130
.\tools\dev.ps1 -Stop        # stop
```

First run creates `data/persona.db` (SQLite, EF Core migrations) and seeds one demo
dossier — `http://127.0.0.1:8130/#/p/demo0001`, 26 votes, ready to read.

## Test it

```powershell
.\tools\test.ps1             # xUnit: 45 domain + API tests
.\tools\smoke.ps1            # the whole path over real HTTP (no browser)
node tools\e2e.mjs           # headless Chrome drives the real UI (no npm install)
```

`tools\mock-llm.mjs` is a stand-in OpenAI-compatible router, so the AI path can be
tested with no key, no network and no rate limit:

```powershell
node tools\mock-llm.mjs 3311
$env:PERSONA_LLM_BASE="http://127.0.0.1:3311/v1"
$env:PERSONA_LLM_MODEL="mock/gemini-2.0-flash"
.\tools\dev.ps1
```

## The analyst

Decision D8 — one provider list, tried in order, first one that answers wins:

1. `PERSONA_LLM_BASE` (default `http://localhost:3001/v1`, a local
   [freellmapi](https://github.com/tashfeenahmed/freellmapi) router aggregating 87
   free providers behind one OpenAI-compatible endpoint)
2. `PERSONA_LLM_FALLBACKS` — `url|key, url|key`, tried in order
3. the local analyst — deterministic narration, so the product never shows an empty
   state and a demo never dies because a free tier is exhausted

The model is given a digest (numbers, findings, at most 6 receipts, ~2 KB) and must
answer JSON. It never sees the raw vote table and never invents a number: every
figure in the reading is computed by `Domain/Scoring.cs` first, and a model answer
that does not parse is rejected in favour of the local reading.

## Layout

```
src/Persona.Api/          .NET 9 minimal API + EF Core (SQLite)
  Domain/                 instrument, scoring, local analyst, validation
  Data/                   DbContext, migrations, store
  Api/                    endpoints (the JSON contract the browser uses)
  Services/               LlmAnalyst: provider chain, prompt, JSON validation
public/                   the site: no framework, no build step
shared/model.js           the instrument, imported by the browser
tests/Persona.Tests/      xUnit: domain, API, LLM path against a mock router
tools/                    dev.ps1, test.ps1, smoke.ps1, e2e.mjs, mock-llm.mjs
```

## Decisions on record

Each is one marked spot so it can be changed without rework.

- **D1** .NET 9 + EF Core backend, SQLite file database.
- **D2** The JSON contract the frontend was written against is unchanged.
- **D3** Tests assert the real contract, not an imagined one.
- **D4** A voter is a device (random id in `localStorage`, sent as `x-voter-id`), not
  an IP address; throttling is configurable via `PERSONA_THROTTLE`.
- **D5/D6** The ritual is verified in a real headless browser, not by inspecting code.
- **D7** The LLM layer is tested against a mock router before going live.
- **D8** Free providers first, mock second, local reasoning last (see above).
- **D9** User-facing explanation in French and Spanish with correct accents.
- **D10** Every reading carries `caveat`: the Shadow is a hypothesis, not a diagnosis.

## Languages

User-facing explanation of the Ego / Persona / Shadow reading, in native copy:

- [Français](README.fr.md)
- [Español](README.es.md)
