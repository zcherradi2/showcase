# Persona — people vote, the analyst decides

A normal personality test asks you to describe yourself, then sells the description
back to you. Persona inverts it.

People who know you answer the same instrument, and their answers become your
**Persona** — the version of you that actually walks around in the world. You answer
it too, before you see a single vote, and that is your **Ego**, the story you tell
about yourself. The distance between the two is where the **Shadow** shows up: the
part neither account covers, inferred by an analyst and never presented as fact.

Deterministic C# does all the maths. The model only narrates, so every reading can be
traced back to the numbers that produced it.

## Run it

```powershell
.\tools\dev.ps1            # build + serve on http://127.0.0.1:8130
.\tools\test.ps1           # 62 tests
node tools\e2e.mjs         # 20 headless browser checks
```

Needs .NET 9. No npm, no build step, no node_modules: the frontend is plain ES modules.

## What is in here

| Path | What it is |
|---|---|
| `src/Persona.Api` | .NET 9 minimal API, EF Core + SQLite, migrations, the scoring engine |
| `shared/model.js` | the instrument itself: axes, cards, probes, rings — one source of truth |
| `public/` | the site: landing, the voting ritual, the private portrait, the public share page |
| `tests/Persona.Tests` | 62 tests: scoring against hand-computed values, access, rate limits, prompt injection, provider failover |
| `tools/` | dev server, test runner, headless E2E, mock LLM router, screenshot + pixel measuring |

## Two more documents

- **[RUN-REPORT.md](RUN-REPORT.md)** — what was built, what was verified, how, and what is still unproven.
- **[SCALING.md](SCALING.md)** — what breaks first under real traffic and the exact seam to change for each.
- [README-full.md](README-full.md) — the long architecture notes and the design decisions.

Reading in French: **[README.fr.md](README.fr.md)** · in Spanish: **[README.es.md](README.es.md)**

The portfolio that used to live here is kept in
[portfolio-README-archive.md](portfolio-README-archive.md).

## Licence

Not chosen yet — treat it as all rights reserved until a `LICENSE` file appears.
