using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Persona.Api.Data;
using Persona.Api.Domain;

namespace Persona.Api.Seeding;

/// <summary>
/// A demo portrait that is already alive when the app opens: one Ego, 26 votes
/// across four rings, a real gap, a real split, receipts with a pulse.
/// Deterministic, so screenshots and tests stay stable.
/// </summary>
public static class DemoSeeder
{
    public const string DemoId = "demo0001";

    // Deterministic noise: same seed, same portrait, forever.
    private sealed class Rng(int seed)
    {
        private uint _state = (uint)seed;

        public double Next()
        {
            _state ^= _state << 13;
            _state ^= _state >> 17;
            _state ^= _state << 5;
            return (_state % 10_000) / 10_000.0;
        }

        public int Int(int min, int maxExclusive) => min + (int)(Next() * (maxExclusive - min));
    }

    private static readonly string[] Receipts =
    [
        "Said the thing nobody else would say, then stayed to help clean up.",
        "Called on my birthday for eleven years straight.",
        "Made me laugh in a hospital corridor.",
        "I have seen them take a hit for someone else and never mention it.",
        "Sends the plan at 2am instead of the comfort. Annoying, correct.",
        "Will disagree with you in front of the boss and still get you promoted.",
        "Disappears for a month, comes back like nothing happened.",
        "The only person who tells me when I am being dumb, kindly.",
        "Quiet in the room, loud in the work.",
        "Runs late, but the thing they bring is always worth the wait.",
        "Remembers the small thing you mentioned once.",
        "Works all night and then calls me lazy. We are both right.",
        "Never asks for help and gives it constantly.",
        "Half of what they said at dinner turned out to be true.",
        "The calmest person I know in a crisis, and the most anxious at brunch.",
        "Turns everything into a system, including friendship.",
        "Listens like they are taking notes.",
        "Made a decision for me once. It was the right one. I never told them.",
        "Funny here, serious there. I stopped trying to reconcile it.",
        "Will show up at the airport at 5am without being asked.",
        "Could have said nothing. Said it anyway.",
        "Keeps the receipt for every promise.",
        "Two people I know describe them completely differently.",
        "Makes you feel like the smart one, then outworks you.",
        "Took the blame for a call that was mine.",
        "Still texts in full sentences.",
    ];

    private static readonly Dictionary<string, string[]> RingCards = new()
    {
        ["inner"] = ["hearth", "harbor", "blade", "mirror"],
        ["family"] = ["anchor", "hearth", "stone", "grid"],
        ["work"] = ["engine", "grid", "wall", "veil"],
        ["online"] = ["spark", "mirror", "drift", "blade"],
        ["outer"] = ["wall", "engine", "drift", "veil"],
    };

    // Per-ring dial centroids. The split between inner and work is the point of the demo.
    private static readonly Dictionary<string, Dictionary<string, int>> RingProfile = new()
    {
        ["inner"] = new() { ["warmth"] = 4, ["order"] = 3, ["candor"] = 4, ["drive"] = 3, ["play"] = 4, ["nerve"] = 3 },
        ["family"] = new() { ["warmth"] = 3, ["order"] = 3, ["candor"] = 4, ["drive"] = 4, ["play"] = 2, ["nerve"] = 2 },
        ["work"] = new() { ["warmth"] = 2, ["order"] = 4, ["candor"] = 0, ["drive"] = 4, ["play"] = 0, ["nerve"] = 4 },
        ["online"] = new() { ["warmth"] = 3, ["order"] = 2, ["candor"] = 3, ["drive"] = 3, ["play"] = 3, ["nerve"] = 3 },
        ["outer"] = new() { ["warmth"] = 2, ["order"] = 2, ["candor"] = 1, ["drive"] = 2, ["play"] = 2, ["nerve"] = 2 },
    };

    private static readonly Dictionary<string, int> RingCounts = new()
    {
        ["inner"] = 5,
        ["family"] = 4,
        ["work"] = 9,
        ["online"] = 6,
        ["outer"] = 2,
    };

    public static async Task EnsureAsync(PersonaDbContext db, PersonaStore store)
    {
        var existing = await db.Personas.AsNoTracking().AnyAsync(p => p.Id == DemoId);
        if (existing) return;

        var input = Validator.ValidatePersonaInput(new PersonaInput
        {
            Name = "Ziko",
            Tagline = "builds at night, automates what bores him",
            Avatar = "◐",
            Peers = ["inner", "family", "work", "online"],
            DoorQuestion = "Where did we eat the night the power went out?",
            DoorAnswer = "on the roof",
        });

        var token = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();

        var persona = new PersonaEntity
        {
            Id = DemoId,
            Name = input.Name,
            Tagline = input.Tagline,
            Avatar = input.Avatar,
            PeersJson = JsonSerializer.Serialize(input.Peers, Json.Options),
            DoorQuestion = input.DoorQuestion,
            DoorAnswerHash = PersonaStore.Hash(Instrument.NormalizeAnswer(input.DoorAnswer)),
            OwnerHash = PersonaStore.Hash(token),
            CreatedAt = DateTime.UtcNow.AddDays(-23),
            IsDemo = true,
        };
        db.Personas.Add(persona);

        // The owner's own answers: claims candor and drive hard, under-claims warmth.
        var egoSubmission = Validator.ValidateSubmission(new SubmissionInput
        {
            Cards = ["blade", "engine", "grid"],
            Dials = new() { ["warmth"] = 2, ["order"] = 4, ["candor"] = 4, ["drive"] = 4, ["play"] = 2, ["nerve"] = 3 },
            Probes = new() { ["p2am"] = 1, ["proom"] = 0, ["pchange"] = 1, ["poffer"] = 0 },
        }).Clean;

        var egoScores = Scoring.ScoreSubmission(egoSubmission);
        db.Egos.Add(new EgoEntity
        {
            PersonaId = DemoId,
            CardsJson = JsonSerializer.Serialize(egoSubmission.Cards, Json.Options),
            DialsJson = JsonSerializer.Serialize(egoSubmission.Dials, Json.Options),
            ProbesJson = JsonSerializer.Serialize(egoSubmission.Probes, Json.Options),
            ScoresJson = JsonSerializer.Serialize(egoScores.Axes, Json.Options),
            CreatedAt = DateTime.UtcNow.AddDays(-22),
        });

        var rng = new Rng(20261124);
        var receiptIndex = 0;
        var dayOffset = -21;

        foreach (var (ring, count) in RingCounts)
        {
            var profile = RingProfile[ring];
            for (var i = 0; i < count; i++)
            {
                var dials = new Dictionary<string, int>();
                foreach (var dial in Instrument.Dials)
                {
                    var centre = profile[dial.Axis];
                    var noise = rng.Next() < 0.28 ? rng.Int(-1, 2) : 0;
                    dials[dial.Axis] = Math.Clamp(centre + noise, 0, 4);
                }

                var deck = RingCards[ring];
                var cards = new List<string> { deck[0] };
                if (rng.Next() < 0.55) cards.Add(deck[1]);
                if (rng.Next() < 0.3) cards.Add(deck[2]);
                if (rng.Next() < 0.12) cards.Add(deck[3]);
                cards = cards.Distinct().Take(3).ToList();
                if (cards.Count < 3) cards.Add(deck[1]);
                if (cards.Count < 3) cards.Add(deck[2]);
                cards = cards.Distinct().Take(3).ToList();

                var probes = new Dictionary<string, int?>
                {
                    ["p2am"] = ring is "inner" or "family" ? 0 : 1,
                    ["proom"] = ring is "inner" or "family" ? 0 : (rng.Next() < 0.5 ? 0 : 1),
                    ["pchange"] = ring is "work" ? 1 : 0,
                    ["poffer"] = rng.Next() < 0.6 ? 1 : 0,
                };

                var submission = Validator.ValidateSubmission(new SubmissionInput
                {
                    Cards = cards,
                    Dials = dials,
                    Probes = probes,
                    Ring = ring,
                    Receipt = Receipts[receiptIndex++ % Receipts.Length],
                }).Clean;

                var scored = Scoring.ScoreSubmission(submission);

                db.Votes.Add(new VoteEntity
                {
                    PersonaId = DemoId,
                    Ring = ring,
                    CardsJson = JsonSerializer.Serialize(submission.Cards, Json.Options),
                    DialsJson = JsonSerializer.Serialize(submission.Dials, Json.Options),
                    ProbesJson = JsonSerializer.Serialize(submission.Probes, Json.Options),
                    ScoresJson = JsonSerializer.Serialize(scored.Axes, Json.Options),
                    Receipt = submission.Receipt,
                    DoorPassed = ring != "outer",
                    VoterHash = PersonaStore.Hash($"demo-{ring}-{i}")[..16],
                    CreatedAt = DateTime.UtcNow.AddDays(dayOffset++).AddHours(rng.Int(0, 12)),
                });
            }
        }

        persona.Revision = RingCounts.Values.Sum();
        await db.SaveChangesAsync();
    }
}
