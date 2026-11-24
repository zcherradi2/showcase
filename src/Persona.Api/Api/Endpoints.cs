using Persona.Api.Data;
using Persona.Api.Domain;
using Persona.Api.Services;

namespace Persona.Api.Api;

public static class Endpoints
{
    /// <summary>
    /// Decision D16: one implementation, in PersonaStore.ClientIp, so the vote key and
    /// the rate limiter can never disagree about who a caller is.
    /// </summary>
    public static string ClientIp(HttpContext ctx, IConfiguration config) => PersonaStore.ClientIp(ctx, config);

    private static string OwnerToken(HttpContext ctx) => ctx.Request.Headers["x-owner-token"].ToString();

    public static void MapPersonaApi(this WebApplication app)
    {
        var limits = app.Configuration;
        // Decision D20: one limiter per host, injected. No static state, so two hosts in
        // one process never share a budget.
        var throttle = app.Services.GetRequiredService<Throttle>();
        app.MapGet("/api/health", async (PersonaStore store, LlmAnalyst llm, CancellationToken ct) =>
        {
            var ai = llm.HealthAsync();
            return Results.Ok(new
            {
                ok = true,
                version = Instrument.Version,
                ai = new
                {
                    configured = ai.Configured,
                    baseUrl = ai.BaseUrl,
                    model = ai.Model,
                    up = ai.Up,
                    detail = ai.Detail,
                    disabled = ai.Disabled,
                    models = ai.Models,
                },
                personas = await store.CountAsync(ct),
                demo = await store.FindDemoIdAsync(ct),
            });
        });

        app.MapGet("/api/demo", async (PersonaStore store, CancellationToken ct) =>
        {
            var id = await store.FindDemoIdAsync(ct);
            return id is null ? Results.NotFound(new { error = "no demo portrait seeded" }) : Results.Ok(new { id });
        });

        app.MapPost("/api/personas", async (HttpContext ctx, PersonaStore store, PersonaInput? body, CancellationToken ct) =>
        {
            var ip = ClientIp(ctx, limits);
            if (throttle.Over("create:" + ip, 3, 10)) return Results.Json(new { error = "slow down" }, statusCode: 429);
            var result = Validator.ValidatePersonaInput(body);
            if (!result.Ok) return Results.BadRequest(new { error = result.Errors[0], errors = result.Errors });

            var created = await store.CreateAsync(result, ct: ct);
            return Results.Json(new
            {
                id = created.Persona.Id,
                token = created.Token,
                shareUrl = $"/#/v/{created.Persona.Id}",
                reportUrl = $"/#/p/{created.Persona.Id}",
            }, statusCode: 201);
        });

        app.MapGet("/api/personas/{id}", async (string id, PersonaStore store, CancellationToken ct) =>
        {
            var persona = await store.FindAsync(id, ct);
            return persona is null
                ? Results.NotFound(new { error = "no such persona" })
                : Results.Ok(PersonaStore.ToPublic(persona));
        });

        app.MapPost("/api/personas/{id}/ego", async (string id, HttpContext ctx, PersonaStore store, SubmissionInput? body, CancellationToken ct) =>
        {
            var persona = await store.FindWithVotesAsync(id, ct);
            if (persona is null) return Results.NotFound(new { error = "no such persona" });
            if (!PersonaStore.OwnerOf(persona, OwnerToken(ctx))) return Results.Json(new { error = "owner token required" }, statusCode: 403);

            var result = Validator.ValidateSubmission(body);
            if (!result.Ok) return Results.BadRequest(new { error = result.Errors[0], errors = result.Errors });

            var scored = Scoring.ScoreSubmission(result.Clean);
            await store.SaveEgoAsync(persona, result.Clean, scored.Axes, ct);
            return Results.Ok(new { ok = true, ego = scored.Axes, answered = scored.Answered });
        });

        app.MapGet("/api/personas/{id}/ego", async (string id, HttpContext ctx, PersonaStore store, CancellationToken ct) =>
        {
            var persona = await store.FindWithVotesAsync(id, ct);
            if (persona is null) return Results.NotFound(new { error = "no such persona" });
            if (!PersonaStore.OwnerOf(persona, OwnerToken(ctx))) return Results.Json(new { error = "owner token required" }, statusCode: 403);
            return Results.Ok(PersonaStore.ToEgo(persona.Ego));
        });

        app.MapPost("/api/personas/{id}/votes", async (string id, HttpContext ctx, PersonaStore store, SubmissionInput? body, CancellationToken ct) =>
        {
            var voterKey = PersonaStore.VoterKey(ctx, limits);
            var ip = ClientIp(ctx, limits);
            // Decision D16: two independent layers. The device id gives the product its
            // "one vote per browser" promise; the address is what actually bounds abuse,
            // because the device id is client-supplied and trivially rotated.
            if (throttle.Over(voterKey, 1, 40)) return Results.Json(new { error = "slow down" }, statusCode: 429);
            if (throttle.Over("ipvote:" + ip, 1, 30)) return Results.Json(new { error = "slow down" }, statusCode: 429);

            var persona = await store.FindWithVotesAsync(id, ct);
            if (persona is null) return Results.NotFound(new { error = "no such persona" });
            if (persona.Votes.Count >= Instrument.MaxVotesPerPersona)
                return Results.Json(new { error = "this portrait is closed" }, statusCode: 409);

            var input = body ?? new SubmissionInput();

            var doorPassed = true;
            if (!string.IsNullOrEmpty(persona.DoorQuestion))
            {
                doorPassed = !string.IsNullOrEmpty(input.DoorAnswer)
                             && PersonaStore.Hash(Instrument.NormalizeAnswer(input.DoorAnswer)) == persona.DoorAnswerHash;
            }

            var result = Validator.ValidateSubmission(input);
            if (!result.Ok) return Results.BadRequest(new { error = result.Errors[0], errors = result.Errors });

            if (PersonaStore.AlreadyVoted(persona, voterKey))
                return Results.Json(new { error = "this device already voted", alreadyVoted = true }, statusCode: 409);

            var scored = Scoring.ScoreSubmission(result.Clean);
            var vote = await store.AddVoteAsync(persona, result.Clean, scored.Axes, doorPassed, voterKey, ct);

            return Results.Json(new
            {
                ok = true,
                voteId = vote.Id,
                ring = vote.Ring,
                doorPassed,
                count = persona.Votes.Count + 1,
            }, statusCode: 201);
        });

        app.MapGet("/api/personas/{id}/portrait", async (string id, HttpContext ctx, PersonaStore store, LlmAnalyst llm, CancellationToken ct) =>
        {
            var persona = await store.FindWithVotesAsync(id, ct);
            if (persona is null) return Results.NotFound(new { error = "no such persona" });

            var votes = persona.Votes.Select(PersonaStore.ToVote).ToList();
            var ego = PersonaStore.ToEgo(persona.Ego);
            var portrait = Scoring.BuildPortrait(ego, votes, PersonaStore.Peers(persona), !string.IsNullOrEmpty(persona.DoorQuestion));

            var stored = PersonaStore.StoredAnalysis(persona);
            var analysis = stored ?? LocalAnalyst.Read(portrait, persona.Name, persona.Tagline);
            var cfg = llm.Config();

            // Decision D11: the share link is public and carries only the room's side.
            if (string.Equals(ctx.Request.Query["view"], "share", StringComparison.OrdinalIgnoreCase))
            {
                return Results.Ok(PublicView.Build(persona.Id, persona.Name, persona.Tagline, persona.Avatar, persona.CreatedAt, portrait, analysis));
            }

            if (!PersonaStore.OwnerOf(persona, OwnerToken(ctx)))
            {
                // A stranger gets the shape, never the reading.
                return Results.Ok(new
                {
                    id = persona.Id,
                    name = persona.Name,
                    avatar = persona.Avatar,
                    tagline = persona.Tagline,
                    votes = portrait.N,
                    rings = portrait.Rings,
                    ready = portrait.Ready,
                    locked = true,
                });
            }

            return Results.Ok(new
            {
                id = persona.Id,
                name = persona.Name,
                tagline = persona.Tagline,
                avatar = persona.Avatar,
                peers = PersonaStore.Peers(persona),
                createdAt = persona.CreatedAt,
                doorEnabled = !string.IsNullOrEmpty(persona.DoorQuestion),
                portrait,
                analysis,
                analysisMeta = new
                {
                    source = stored?.Source ?? analysis.Source,
                    model = stored?.Model ?? analysis.Model,
                    generatedAt = stored?.GeneratedAt,
                    ai = cfg.Disabled ? "off" : "auto",
                },
            });
        });

        app.MapPost("/api/personas/{id}/analyze", async (string id, HttpContext ctx, PersonaStore store, LlmAnalyst llm, CancellationToken ct) =>
        {
            var persona = await store.FindWithVotesAsync(id, ct);
            if (persona is null) return Results.NotFound(new { error = "no such persona" });
            if (!PersonaStore.OwnerOf(persona, OwnerToken(ctx)))
                return Results.Json(new { error = "owner token required" }, statusCode: 403);

            // Decision D18: every reading costs tokens. An owner clicking the button is
            // fine; a loop is not. A cached reading is served without being charged.
            if (PersonaStore.StoredAnalysis(persona) is null && throttle.Over("analyze:" + id, 1, 4))
                return Results.Json(new { error = "the analyst needs a minute" }, statusCode: 429);

            var votes = persona.Votes.Select(PersonaStore.ToVote).ToList();
            var ego = PersonaStore.ToEgo(persona.Ego);
            var portrait = Scoring.BuildPortrait(ego, votes, PersonaStore.Peers(persona), !string.IsNullOrEmpty(persona.DoorQuestion));
            var local = LocalAnalyst.Read(portrait, persona.Name, persona.Tagline);

            if (!portrait.Ready)
            {
                return Results.Ok(new { ok = true, analysis = local, analysisMeta = new { source = "local", pending = true } });
            }

            var (ok, analysis, reason) = await llm.NarrateAsync(portrait, persona.Name, persona.Tagline, ct);
            if (!ok || analysis is null)
            {
                local.Reason = reason;
                local.GeneratedAt = DateTime.UtcNow;
                await store.SetAnalysisAsync(persona, local, ct);
                return Results.Ok(new
                {
                    ok = true,
                    analysis = local,
                    analysisMeta = new { source = "local", reason, generatedAt = local.GeneratedAt },
                });
            }

            analysis.GeneratedAt = DateTime.UtcNow;
            await store.SetAnalysisAsync(persona, analysis, ct);
            return Results.Ok(new
            {
                ok = true,
                analysis,
                analysisMeta = new { source = "llm", model = analysis.Model, generatedAt = analysis.GeneratedAt },
            });
        });

        app.MapGet("/api/personas/{id}/digest", async (string id, HttpContext ctx, PersonaStore store, CancellationToken ct) =>
        {
            var persona = await store.FindWithVotesAsync(id, ct);
            if (persona is null) return Results.NotFound(new { error = "no such persona" });
            if (!PersonaStore.OwnerOf(persona, OwnerToken(ctx)))
                return Results.Json(new { error = "owner token required" }, statusCode: 403);

            var votes = persona.Votes.Select(PersonaStore.ToVote).ToList();
            var ego = PersonaStore.ToEgo(persona.Ego);
            var portrait = Scoring.BuildPortrait(ego, votes, PersonaStore.Peers(persona), !string.IsNullOrEmpty(persona.DoorQuestion));
            return Results.Ok(Scoring.DigestForAI(portrait, persona.Name, persona.Tagline));
        });

        app.MapGet("/api/instrument", () => Results.Ok(new
        {
            version = Instrument.Version,
            axes = Instrument.Axes,
            dials = Instrument.Dials,
            probes = Instrument.Probes,
            cards = Instrument.Cards,
            rings = Instrument.Rings,
            weights = new { dial = Instrument.DialWeight, probe = Instrument.ProbeWeight, card = Instrument.CardWeight },
        }));
    }
}
