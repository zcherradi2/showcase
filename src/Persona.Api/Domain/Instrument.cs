namespace Persona.Api.Domain;

// The instrument. One source of truth in the backend; the browser renders from
// shared/model.js, and Persona.Tests asserts the two agree (see InstrumentParityTests).

public sealed record Axis(
    string Id,
    string Name,
    string Neg,
    string Pos,
    string Prompt,
    string NegLine,
    string PosLine);

public sealed record Dial(string Axis, string Low, string High, string Prompt);

public sealed record ProbeOption(string Label, IReadOnlyDictionary<string, double> Deltas);

public sealed record Probe(string Id, string Setup, IReadOnlyList<ProbeOption> Options);

public sealed record Card(string Id, string Title, string Line, IReadOnlyDictionary<string, double> Deltas);

public sealed record Ring(string Id, string Label, string Blurb, double Weight);

public static class Instrument
{
    public const string Version = "1.0.0";

    public const double DialWeight = 1;
    public const double ProbeWeight = 1;
    public const double CardWeight = 0.5;

    public const int ReceiptMax = 160;
    public const int MaxVotesPerPersona = 5000;
    public const int NameMax = 60;
    public const int TaglineMax = 140;
    public const int PeerMax = 8;
    public const int PeerLabelMax = 24;

    public static readonly IReadOnlyList<Axis> Axes =
    [
        new("warmth", "Warmth", "Glacier", "Hearth", "Their default temperature with another human being.",
            "reads as cool, self-contained, slow to give anything away",
            "reads as open, enveloping, the person others drift toward"),
        new("force", "Force", "Feather", "Hammer", "How they move an opinion, a plan or a person.",
            "persuades by yielding, by listening, by making it feel like your idea",
            "persuades by weight, by saying it once and meaning it"),
        new("order", "Order", "Drift", "Grid", "How they hold their life together.",
            "works from the mess, improvises the schedule, arrives on instinct",
            "builds systems, keeps the promise, knows where the thing is"),
        new("depth", "Depth", "Surface", "Abyss", "How far beneath the small talk they live.",
            "quick, light, allergic to the heavy conversation",
            "goes three layers down when everyone else stays on the surface"),
        new("candor", "Candor", "Veil", "Blade", "What actually comes out of their mouth.",
            "edits, softens, keeps a version of the truth in reserve",
            "names the thing in the room, including when it costs them"),
        new("drive", "Drive", "Anchor", "Engine", "What they do with inertia.",
            "moves slowly, protects their energy, lets the current do the work",
            "moves first and keeps moving after the point of exhaustion"),
        new("play", "Play", "Stone", "Spark", "How they treat a room.",
            "takes things seriously, which some people find safe and others find heavy",
            "lowers the temperature of any room, jokes as a form of intelligence"),
        new("nerve", "Nerve", "Harbor", "Cliff", "Where they stand when standing costs them something.",
            "secures the ground first, and is right more often than they look",
            "jumps before the calculation is finished, then makes the fall work"),
    ];

    public static readonly string[] AxisIds = Axes.Select(a => a.Id).ToArray();

    public static readonly IReadOnlyDictionary<string, Axis> AxisById =
        Axes.ToDictionary(a => a.Id);

    public static readonly IReadOnlyList<Dial> Dials =
    [
        new("warmth", "Glacier", "Hearth", "You walk into a room of strangers. They read you as…"),
        new("order", "Drift", "Grid", "Their life, from the outside, looks…"),
        new("candor", "Veil", "Blade", "When the truth is uncomfortable, they…"),
        new("drive", "Anchor", "Engine", "Between two choices, they wait. This is…"),
        new("play", "Stone", "Spark", "In a group, the jokes come from them…"),
        new("nerve", "Harbor", "Cliff", "Risk, to them, is…"),
    ];

    public static readonly double[] DialStops = [-100, -50, 0, 50, 100];

    public static double DialToScore(int stop) => stop >= 0 && stop < DialStops.Length ? DialStops[stop] : 0;

    public static int ScoreToStop(double score)
    {
        var best = 2;
        var bestDist = double.MaxValue;
        for (var i = 0; i < DialStops.Length; i++)
        {
            var d = Math.Abs(DialStops[i] - score);
            if (d < bestDist)
            {
                bestDist = d;
                best = i;
            }
        }
        return best;
    }

    public static readonly IReadOnlyList<Probe> Probes =
    [
        new("p2am", "A friend's life falls apart at 2am and they call.",
        [
            new("Pick up on the first ring and stay on the line until sunrise.",
                new Dictionary<string, double> { ["warmth"] = 45, ["depth"] = 30, ["force"] = -20 }),
            new("Send the plan: three steps, the numbers, the name of a good lawyer.",
                new Dictionary<string, double> { ["force"] = 40, ["order"] = 25, ["warmth"] = -25, ["depth"] = 10 }),
        ]),
        new("proom", "Someone in the room says something that is politely, quietly wrong.",
        [
            new("Say it out loud, there, in front of everyone.",
                new Dictionary<string, double> { ["candor"] = 45, ["nerve"] = 25, ["warmth"] = -15 }),
            new("Say nothing, then outwork the room until the point is moot.",
                new Dictionary<string, double> { ["candor"] = -30, ["drive"] = 35, ["nerve"] = 10 }),
        ]),
        new("pchange", "The plan collapses forty minutes before it matters.",
        [
            new("Improvise, and enjoy it more than the original plan.",
                new Dictionary<string, double> { ["play"] = 40, ["order"] = -40, ["nerve"] = 25 }),
            new("Rebuild it in ten minutes, smaller, and land it.",
                new Dictionary<string, double> { ["order"] = 40, ["drive"] = 20, ["play"] = -15 }),
        ]),
        new("poffer", "They are offered the thing they actually want, with no safety net under it.",
        [
            new("Take it today and tell everyone after.",
                new Dictionary<string, double> { ["nerve"] = 45, ["drive"] = 30, ["order"] = -15 }),
            new("Negotiate a net first, then take it.",
                new Dictionary<string, double> { ["order"] = 30, ["nerve"] = -20, ["depth"] = 20 }),
        ]),
    ];

    public static readonly IReadOnlyDictionary<string, Probe> ProbeById = Probes.ToDictionary(p => p.Id);

    public static readonly IReadOnlyList<Card> Cards =
    [
        new("wall", "The Wall", "Unbothered. Unmoved. Reading the room from behind glass.",
            new Dictionary<string, double> { ["warmth"] = -35, ["force"] = 20 }),
        new("hearth", "The Hearth", "Keeps everyone in the room warm, then forgets to feed themselves.",
            new Dictionary<string, double> { ["warmth"] = 35, ["play"] = 10 }),
        new("blade", "The Blade", "Tells you the thing nobody else in your life will say.",
            new Dictionary<string, double> { ["candor"] = 40, ["nerve"] = 15 }),
        new("veil", "The Veil", "You have known them for years and still do not quite know.",
            new Dictionary<string, double> { ["candor"] = -35, ["depth"] = 25 }),
        new("grid", "The Grid", "Everything has a place, and the place has a reason.",
            new Dictionary<string, double> { ["order"] = 40, ["drive"] = 10 }),
        new("drift", "The Drift", "Comfortable in the mess. Suspicious of anyone too organised.",
            new Dictionary<string, double> { ["order"] = -35, ["play"] = 20 }),
        new("engine", "The Engine", "Keeps moving even when nobody is watching and the goal has moved.",
            new Dictionary<string, double> { ["drive"] = 40, ["play"] = -10 }),
        new("anchor", "The Anchor", "Does not move for the current, the trend or the panic.",
            new Dictionary<string, double> { ["drive"] = -30, ["warmth"] = 10, ["order"] = 15 }),
        new("spark", "The Spark", "Makes the room lighter by two degrees in ten seconds.",
            new Dictionary<string, double> { ["play"] = 40, ["warmth"] = 15 }),
        new("stone", "The Stone", "Takes nothing lightly, including your jokes.",
            new Dictionary<string, double> { ["play"] = -35, ["force"] = 15 }),
        new("cliff", "The Cliff", "Jumps first. Builds the story afterwards.",
            new Dictionary<string, double> { ["nerve"] = 40, ["order"] = -15 }),
        new("harbor", "The Harbor", "Where people dock when they are not okay.",
            new Dictionary<string, double> { ["nerve"] = -30, ["warmth"] = 20, ["depth"] = 10 }),
        new("abyss", "The Abyss", "Too deep for small talk, and uninterested in faking it.",
            new Dictionary<string, double> { ["depth"] = 40, ["play"] = -15 }),
        new("mirror", "The Mirror", "Reads the room before entering it, then hands it back to itself.",
            new Dictionary<string, double> { ["depth"] = 30, ["warmth"] = 15, ["candor"] = 10 }),
    ];

    public static readonly IReadOnlyDictionary<string, Card> CardById = Cards.ToDictionary(c => c.Id);

    public static readonly IReadOnlyList<Ring> Rings =
    [
        new("inner", "Close circle", "They have seen you at your worst.", 1.2),
        new("family", "Family", "They met you before you built anything.", 1.15),
        new("work", "Work", "They know the professional mask.", 1.0),
        new("online", "Online", "They know the edited version.", 0.75),
        new("outer", "Unverified", "Answered the prompt, failed the door question.", 0.4),
    ];

    public static readonly IReadOnlyDictionary<string, Ring> RingById = Rings.ToDictionary(r => r.Id);

    public static readonly string[] RingIds = Rings.Select(r => r.Id).ToArray();

    // Rings a voter may choose. "outer" is assigned by the server, never picked.
    public static readonly string[] VoterRingIds = ["inner", "family", "work", "online"];

    private static readonly string[] ReceiptPrompts =
    [
        "One thing you will still remember about them in ten years.",
        "The sentence you would use to describe them to a stranger.",
        "What they do that nobody thanks them for.",
        "The moment that made you decide what you think of them.",
    ];

    public static string ReceiptPrompt(string id)
    {
        var h = 0;
        foreach (var ch in id ?? string.Empty) h = (h * 31 + ch) % 9973;
        return ReceiptPrompts[h % ReceiptPrompts.Length];
    }

    public static string NormalizeAnswer(string? s)
    {
        var lowered = (s ?? string.Empty).ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD);
        var sb = new System.Text.StringBuilder(lowered.Length);
        foreach (var ch in lowered)
        {
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) == System.Globalization.UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(ch) && ch < 128) sb.Append(ch);
        }
        return sb.ToString();
    }

    public static string Clean(string? s, int max)
    {
        if (string.IsNullOrEmpty(s)) return string.Empty;
        var sb = new System.Text.StringBuilder(s.Length);
        foreach (var ch in s)
        {
            sb.Append(char.IsControl(ch) ? ' ' : ch);
        }
        var collapsed = System.Text.RegularExpressions.Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
        return collapsed.Length <= max ? collapsed : collapsed[..max];
    }
}
