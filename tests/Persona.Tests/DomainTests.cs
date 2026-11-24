using System.Text.Json;
using Persona.Api.Data;
using Persona.Api.Domain;
using Persona.Api.Seeding;
using Xunit;

namespace Persona.Tests;

public class InstrumentTests
{
    [Fact]
    public void Instrument_HasExpectedShape()
    {
        Assert.Equal(8, Instrument.Axes.Count);
        Assert.Equal(6, Instrument.Dials.Count);
        Assert.Equal(4, Instrument.Probes.Count);
        Assert.Equal(14, Instrument.Cards.Count);
        Assert.Equal(5, Instrument.Rings.Count);
        Assert.Equal(4, Instrument.VoterRingIds.Length);
        // "outer" is assigned by the server when the door question fails, never chosen.
        Assert.DoesNotContain("outer", Instrument.VoterRingIds);
    }

    [Fact]
    public void DialStops_AreSymmetric()
    {
        Assert.Equal(new double[] { -100, -50, 0, 50, 100 }, Instrument.DialStops);
        Assert.Equal(-100, Instrument.DialToScore(0));
        Assert.Equal(0, Instrument.DialToScore(2));
        Assert.Equal(0, Instrument.DialToScore(99)); // out of range falls back to neutral
        Assert.Equal(3, Instrument.ScoreToStop(60)); // 60 snaps to the nearest stop, 50
        Assert.Equal(4, Instrument.ScoreToStop(100));
        for (var i = 0; i < Instrument.DialStops.Length; i++)
        {
            Assert.Equal(i, Instrument.ScoreToStop(Instrument.DialToScore(i))); // the dial round-trips
        }
        Assert.Equal(0, Instrument.ScoreToStop(-100));
    }

    [Fact]
    public void NormalizeAnswer_IgnoresPunctuationCaseAndAccents()
    {
        Assert.Equal("casablanca", Instrument.NormalizeAnswer("  Casablanca! "));
        Assert.Equal("sidi", Instrument.NormalizeAnswer("S\u00EDdi"));
        Assert.Equal(Instrument.NormalizeAnswer("Golden Bay"), Instrument.NormalizeAnswer("golden-bay"));
    }

    [Fact]
    public void ReceiptPrompt_IsStablePerVoter()
    {
        Assert.Equal(Instrument.ReceiptPrompt("abc"), Instrument.ReceiptPrompt("abc"));
        Assert.Contains(Instrument.ReceiptPrompt("abc"), new[]
        {
            "One thing you will still remember about them in ten years.",
            "The sentence you would use to describe them to a stranger.",
            "What they do that nobody thanks them for.",
            "The moment that made you decide what you think of them.",
        });
    }
}

public class ValidationTests
{
    private static SubmissionInput GoodVote() => new()
    {
        Cards = ["wall", "blade", "grid"],
        Dials = new Dictionary<string, int>
        {
            ["warmth"] = 1, ["order"] = 4, ["candor"] = 3, ["drive"] = 2, ["play"] = 1, ["nerve"] = 4,
        },
        Probes = new Dictionary<string, int?> { ["p2am"] = 1, ["proom"] = 0, ["pchange"] = 1, ["poffer"] = 0 },
        Ring = "work",
        Receipt = "  They rewrote my whole CV at 1am, unprompted.  ",
    };

    [Fact]
    public void ValidVote_Passes_AndIsCleaned()
    {
        var r = Validator.ValidateSubmission(GoodVote());
        Assert.True(r.Ok, string.Join("; ", r.Errors));
        Assert.Equal(3, r.Clean.Cards.Count);
        Assert.Equal(6, r.Clean.Dials.Count);
        Assert.Equal(4, r.Clean.Probes.Count);
        Assert.Equal("work", r.Clean.Ring);
        Assert.Equal("They rewrote my whole CV at 1am, unprompted.", r.Clean.Receipt);
    }

    [Fact]
    public void UnknownCardsAndRings_AreDiscarded_NotRejected()
    {
        var input = GoodVote();
        input.Cards = ["wall", "blade", "nonsense"];
        input.Ring = "outer"; // the server assigns this, voters cannot pick it
        var r = Validator.ValidateSubmission(input);
        Assert.False(r.Ok);
        Assert.Contains("pick exactly three cards", r.Errors);
        Assert.Null(r.Clean.Ring);
    }

    [Fact]
    public void MissingAnswers_AreReported()
    {
        var r = Validator.ValidateSubmission(new SubmissionInput());
        Assert.False(r.Ok);
        Assert.Contains("answer at least four dials", r.Errors);
        Assert.Contains("answer at least three probes", r.Errors);
        Assert.Contains("pick exactly three cards", r.Errors);
    }

    [Fact]
    public void DialOutOfRange_IsAnError()
    {
        var input = GoodVote();
        input.Dials!["warmth"] = 9;
        var r = Validator.ValidateSubmission(input);
        Assert.False(r.Ok);
        Assert.Contains("dial warmth must be 0..4", r.Errors);
    }

    [Fact]
    public void EgoAllowsFewerCards()
    {
        var input = GoodVote();
        input.Cards = ["wall"];
        input.Receipt = null;
        var r = Validator.ValidateSubmission(input, requireCards: false);
        Assert.True(r.Ok, string.Join("; ", r.Errors));
        Assert.Single(r.Clean.Cards);
    }

    [Fact]
    public void PersonaInput_NeedsAName_AndDefaultsTheAvatar()
    {
        var r = Validator.ValidatePersonaInput(new PersonaInput { Name = "  Ziko ", Tagline = "ships at 2am" });
        Assert.True(r.Ok);
        Assert.Equal("Ziko", r.Name);
        Assert.Equal("ships at 2am", r.Tagline);
        Assert.Equal("\u25D0", r.Avatar);

        var bad = Validator.ValidatePersonaInput(new PersonaInput { Name = "z" });
        Assert.False(bad.Ok);
        Assert.Contains("name must be at least two characters", bad.Errors);
    }

    [Fact]
    public void DoorQuestion_OnlyAppliesWhenBothHalvesExist()
    {
        var withAnswer = Validator.ValidatePersonaInput(new PersonaInput
        {
            Name = "Ziko",
            DoorQuestion = "Which city did we get lost in?",
            DoorAnswer = "Casablanca",
        });
        Assert.Equal("Which city did we get lost in?", withAnswer.DoorQuestion);
        Assert.Equal("Casablanca", withAnswer.DoorAnswer);

        var noAnswer = Validator.ValidatePersonaInput(new PersonaInput
        {
            Name = "Ziko",
            DoorQuestion = "Which city did we get lost in?",
        });
        Assert.Equal(string.Empty, noAnswer.DoorQuestion);
    }

    [Fact]
    public void Receipts_AreCapped()
    {
        var input = GoodVote();
        input.Receipt = new string('x', 400);
        var r = Validator.ValidateSubmission(input);
        Assert.True(r.ReceiptOnlyCappedForTest(), "receipt should be clamped");
    }
}

internal static class ValidationTestExtensions
{
    public static bool ReceiptOnlyCappedForTest(this ValidationResult r) =>
        r.Clean.Receipt.Length > 0 && r.Clean.Receipt.Length <= Instrument.ReceiptMax;
}

public class ScoringTests
{
    private static Submission Sheet(Dictionary<string, int> dials, Dictionary<string, int> probes, params string[] cards) => new()
    {
        Cards = cards.ToList(),
        Dials = dials,
        Probes = probes,
    };

    private static Submission WarmSheet() => Sheet(
        new() { ["warmth"] = 4, ["order"] = 1, ["candor"] = 2, ["drive"] = 2, ["play"] = 4, ["nerve"] = 2 },
        new() { ["p2am"] = 0, ["proom"] = 1, ["pchange"] = 0, ["poffer"] = 1 },
        "hearth", "spark", "drift");

    private static Submission ColdSheet() => Sheet(
        new() { ["warmth"] = 0, ["order"] = 4, ["candor"] = 4, ["drive"] = 4, ["play"] = 0, ["nerve"] = 1 },
        new() { ["p2am"] = 1, ["proom"] = 0, ["pchange"] = 1, ["poffer"] = 1 },
        "wall", "grid", "blade");

    private static VoteData Vote(Submission sheet, string ring = "work", string receipt = "", bool doorPassed = true, DateTime? at = null) => new()
    {
        Id = Guid.NewGuid().ToString("n"),
        Ring = ring,
        Cards = sheet.Cards,
        Dials = sheet.Dials,
        Probes = sheet.Probes,
        Scores = Scoring.ScoreSubmission(sheet).Axes,
        Receipt = receipt,
        DoorPassed = doorPassed,
        CreatedAt = at ?? DateTime.UtcNow,
    };

    [Fact]
    public void ScoreSubmission_PutsAGoodVoterOnTheRightPole()
    {
        var warm = Scoring.ScoreSubmission(WarmSheet()).Axes;
        var cold = Scoring.ScoreSubmission(ColdSheet()).Axes;
        Assert.True(warm["warmth"] > 40, $"warmth should be high, was {warm["warmth"]}");
        Assert.True(cold["warmth"] < -40, $"cold warmth should be low, was {cold["warmth"]}");
        Assert.True(cold["order"] > warm["order"]);
        Assert.True(warm["play"] > cold["play"]);
    }

    [Fact]
    public void ScoresStayInsideTheScale()
    {
        var everything = Sheet(
            Instrument.Dials.ToDictionary(d => d.Axis, _ => 4),
            Instrument.Probes.ToDictionary(p => p.Id, _ => 0),
            "wall", "hearth", "grid");
        foreach (var (axis, value) in Scoring.ScoreSubmission(everything).Axes)
        {
            Assert.NotNull(value);
            Assert.InRange(value!.Value, -100, 100);
        }
    }

    [Fact]
    public void EmptyVotesGiveANullPersona_NotZero()
    {
        var portrait = Scoring.BuildPortrait(null, []);
        Assert.Equal(0, portrait.N);
        Assert.False(portrait.Ready);
        Assert.All(portrait.Persona.Values, v => Assert.Null(v));
    }

    [Fact]
    public void PersonaIsTheRingWeightedMeanOfVotes()
    {
        var warm = Vote(WarmSheet(), "inner");
        var cold = Vote(ColdSheet(), "work");
        var portrait = Scoring.BuildPortrait(null, [warm, cold]);

        // inner (1.2) votes warmer than work (1.0), so the mean must sit nearer warm than cold.
        var w = warm.Scores["warmth"]!.Value;
        var c = cold.Scores["warmth"]!.Value;
        var expected = Math.Round((w * 1.2 + c * 1.0) / 2.2, 0, MidpointRounding.AwayFromZero);
        Assert.Equal(expected, portrait.Persona["warmth"]!.Value, 0);
        Assert.Equal(2, portrait.N);
        Assert.True(portrait.Rings["inner"] == 1);
        Assert.True(portrait.Rings["work"] == 1);
    }

    [Fact]
    public void FailedDoorVotesAreKeptButWeighedDown()
    {
        // A vote that never got past the door is stored in "outer" (weight 0.4), so it
        // counts as a voice but cannot drag the persona as hard as an inner-circle one.
        var inner = Vote(ColdSheet(), "inner");
        var outer = Vote(WarmSheet(), "outer");
        var mixed = Scoring.BuildPortrait(null, [inner, outer]);
        var onlyOuter = Scoring.BuildPortrait(null, [Vote(WarmSheet(), "outer"), Vote(WarmSheet(), "outer")]);

        Assert.Equal(1, mixed.Rings["inner"]);
        Assert.Equal(1, mixed.Rings["outer"]);
        Assert.True(onlyOuter.Persona["warmth"] > mixed.Persona["warmth"],
            "one cold inner voice should pull warmth down more than two warm strangers pull it up");
        Assert.True(Instrument.RingById["inner"].Weight > Instrument.RingById["outer"].Weight);
    }

    [Fact]
    public void GapIsEgoMinusPersona()
    {
        var egoSheet = WarmSheet();
        var ego = new EgoData { Cards = egoSheet.Cards, Dials = egoSheet.Dials, Probes = egoSheet.Probes, Scores = Scoring.ScoreSubmission(egoSheet).Axes };
        var votes = Enumerable.Range(0, 5).Select(i => Vote(ColdSheet(), "work", $"receipt {i}")).ToList();
        var portrait = Scoring.BuildPortrait(ego, votes);

        var egoWarmth = ego.Scores["warmth"]!.Value;
        var personaWarmth = portrait.Persona["warmth"]!.Value;
        Assert.Equal(Math.Round(egoWarmth - personaWarmth, 0, MidpointRounding.AwayFromZero), portrait.Gap["warmth"]!.Value, 0);
        Assert.True(portrait.Gap["warmth"] > 40); // I think I am kind, they do not
        Assert.True(portrait.Ready);
    }

    [Fact]
    public void SelfKnowledgeDropsWhenTheGapGrows()
    {
        var egoSheet = WarmSheet();
        var ego = new EgoData { Dials = egoSheet.Dials, Probes = egoSheet.Probes, Cards = egoSheet.Cards, Scores = Scoring.ScoreSubmission(egoSheet).Axes };
        var aligned = Scoring.BuildPortrait(ego, Enumerable.Range(0, 4).Select(_ => Vote(WarmSheet(), "inner")).ToList());
        var misread = Scoring.BuildPortrait(ego, Enumerable.Range(0, 4).Select(_ => Vote(ColdSheet(), "inner")).ToList());
        Assert.NotNull(aligned.Theses.SelfKnowledge);
        Assert.NotNull(misread.Theses.SelfKnowledge);
        Assert.True(aligned.Theses.SelfKnowledge > misread.Theses.SelfKnowledge);
    }

    [Fact]
    public void SplitRoomShowsUpAsDispersion()
    {
        var votes = new[]
        {
            Vote(WarmSheet(), "inner"), Vote(WarmSheet(), "inner"),
            Vote(ColdSheet(), "work"), Vote(ColdSheet(), "work"),
        };
        var portrait = Scoring.BuildPortrait(null, votes);
        Assert.NotNull(portrait.Dispersion["warmth"]);
        Assert.True(portrait.Dispersion["warmth"] > 30);
        Assert.Contains(portrait.Findings, f => f.Kind == "split" || f.Kind == "dispersion");
    }

    [Fact]
    public void ProbeStatsCompareMineToTheMajority()
    {
        var egoSheet = WarmSheet();
        var ego = new EgoData { Dials = egoSheet.Dials, Probes = egoSheet.Probes, Cards = egoSheet.Cards, Scores = Scoring.ScoreSubmission(egoSheet).Axes };
        var votes = Enumerable.Range(0, 3).Select(_ => Vote(ColdSheet(), "work")).ToList();
        var portrait = Scoring.BuildPortrait(ego, votes);

        var probe = portrait.Probes["p2am"];
        Assert.Equal(3, probe.Counts.Sum()); // three voters; the Ego is Mine, not a count
        Assert.True(probe.Answered > 0);
        Assert.Equal(egoSheet.Probes["p2am"], probe.Mine);
        Assert.NotNull(probe.Agree);
        Assert.False(probe.Agree); // I say I drop everything, they say I send a plan
    }

    [Fact]
    public void TimelineAccumulatesByDay()
    {
        var day1 = new DateTime(2026, 1, 1, 10, 0, 0, DateTimeKind.Utc);
        var votes = new[]
        {
            Vote(WarmSheet(), "work", at: day1),
            Vote(WarmSheet(), "work", at: day1.AddDays(1)),
            Vote(ColdSheet(), "work", at: day1.AddDays(1)),
        };
        var portrait = Scoring.BuildPortrait(null, votes);
        Assert.Equal(3, portrait.Timeline.Count);
        Assert.Equal(new[] { 1, 2, 3 }, portrait.Timeline.Select(p => p.N).ToArray());
        Assert.True(portrait.Timeline[0].At <= portrait.Timeline[2].At);
    }

    [Fact]
    public void ReceiptsAreReturnedNewestFirst()
    {
        var votes = new[]
        {
            Vote(WarmSheet(), "inner", "older", at: DateTime.UtcNow.AddDays(-2)),
            Vote(ColdSheet(), "work", "newer", at: DateTime.UtcNow),
        };
        var portrait = Scoring.BuildPortrait(null, votes);
        Assert.Equal("newer", portrait.Receipts[0].Text);
    }

    [Fact]
    public void TopCardsCountTheCrowd()
    {
        var votes = new[]
        {
            Vote(WarmSheet(), "work"), Vote(WarmSheet(), "work"), Vote(ColdSheet(), "work"),
        };
        var portrait = Scoring.BuildPortrait(null, votes);
        Assert.Equal("hearth", portrait.TopCards[0].Id);
        Assert.Equal(2, portrait.TopCards[0].Count);
        Assert.False(portrait.TopCards[0].IsEmpty());
    }

    [Fact]
    public void DigestForAIIsCompactAndCarriesTheNumbers()
    {
        var egoSheet = WarmSheet();
        var ego = new EgoData { Dials = egoSheet.Dials, Probes = egoSheet.Probes, Cards = egoSheet.Cards, Scores = Scoring.ScoreSubmission(egoSheet).Axes };
        var portrait = Scoring.BuildPortrait(ego, Enumerable.Range(0, 6).Select(i => Vote(ColdSheet(), "work", $"r{i}")).ToList());
        var digest = Scoring.DigestForAI(portrait, "Ziko", "ships at 2am");
        var json = JsonSerializer.Serialize(digest, Json.Options);
        Assert.InRange(json.Length, 400, 4000); // small enough to be cheap, big enough to be specific
        Assert.Contains("persona", json);
        Assert.Contains("ego", json);
        Assert.Contains("findings", json);
    }

    [Fact]
    public void LocalAnalystAlwaysProducesAFullReading()
    {
        var egoSheet = WarmSheet();
        var ego = new EgoData { Dials = egoSheet.Dials, Probes = egoSheet.Probes, Cards = egoSheet.Cards, Scores = Scoring.ScoreSubmission(egoSheet).Axes };
        var portrait = Scoring.BuildPortrait(ego, Enumerable.Range(0, 6).Select(i => Vote(ColdSheet(), "work", $"r{i}")).ToList());
        var analysis = LocalAnalyst.Read(portrait, "Ziko", "ships at 2am");
        Assert.Equal("local", analysis.Source);
        Assert.False(string.IsNullOrWhiteSpace(analysis.Verdict));
        Assert.Equal(3, analysis.Tags.Count);
        Assert.False(string.IsNullOrWhiteSpace(analysis.Shadow));
        Assert.False(string.IsNullOrWhiteSpace(analysis.Experiment));
        Assert.False(string.IsNullOrWhiteSpace(analysis.Question));
        Assert.DoesNotContain("disorder", analysis.Shadow, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AnalysisSurvivesAJsonRoundTrip()
    {
        var original = new Analysis { Verdict = "The Reluctant Anchor", Shadow = "You do not look away. That is not the same as being brave.", GeneratedAt = DateTime.UtcNow };
        var back = Analysis.FromJson(original.ToJson());
        Assert.NotNull(back);
        Assert.Equal("The Reluctant Anchor", back!.Verdict);
        Assert.NotNull(back.GeneratedAt);
        Assert.Null(Analysis.FromJson(null));
    }
}

internal static class TopCardTestExtensions
{
    public static bool IsEmpty(this TopCard c) => c.Count == 0 && c.Pct == 0;
}
