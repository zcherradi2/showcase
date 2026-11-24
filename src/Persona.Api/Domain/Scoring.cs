using System.Text.Json.Serialization;

namespace Persona.Api.Domain;

public sealed record ScoredAxes(Dictionary<string, double?> Axes, int Answered);

public sealed class VoteData
{
    public string Id { get; init; } = string.Empty;
    public string Ring { get; init; } = "work";
    public List<string> Cards { get; init; } = [];
    public Dictionary<string, int> Dials { get; init; } = [];
    public Dictionary<string, int> Probes { get; init; } = [];
    public Dictionary<string, double?> Scores { get; init; } = [];
    public string Receipt { get; init; } = string.Empty;
    public bool DoorPassed { get; init; } = true;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed class EgoData
{
    public List<string> Cards { get; init; } = [];
    public Dictionary<string, int> Dials { get; init; } = [];
    public Dictionary<string, int> Probes { get; init; } = [];
    public Dictionary<string, double?> Scores { get; init; } = [];
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed class TopCard
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int Count { get; set; }
    public double Pct { get; set; }
}

public sealed class CardRef
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
}

public sealed class ProbeStat
{
    public int[] Counts { get; set; } = [0, 0];
    public int Answered { get; set; }
    public int? Mine { get; set; }
    public int? Majority { get; set; }
    public bool? Agree { get; set; }
    public double Share { get; set; }
}

public sealed class Receipt
{
    public string Text { get; set; } = string.Empty;
    public string Ring { get; set; } = string.Empty;
    public DateTime? At { get; set; }
}

public sealed class TimelinePoint
{
    public DateTime? At { get; set; }
    public int N { get; set; }
    public Dictionary<string, double?> Axes { get; set; } = [];
}

public sealed class Finding
{
    public string Kind { get; set; } = string.Empty;
    public string? Axis { get; set; }
    public string? Probe { get; set; }
    public double? Strength { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string? Hi { get; set; }
    public string? Lo { get; set; }
}

public sealed class Theses
{
    public double? SelfKnowledge { get; set; }
    public double? Coherence { get; set; }
    public double? MeanAbsGap { get; set; }
    public double? MeanDisp { get; set; }
    public Dictionary<string, object?>? Loudest { get; set; }
    public List<string> VerdictSeeds { get; set; } = [];
}

public sealed class Portrait
{
    public int N { get; set; }
    public Dictionary<string, int> Rings { get; set; } = [];
    public List<string> Peers { get; set; } = [];
    public bool DoorEnabled { get; set; }
    public Dictionary<string, double?> Ego { get; set; } = [];
    public List<CardRef> EgoCards { get; set; } = [];
    public DateTime? EgoAt { get; set; }
    public Dictionary<string, double?> Persona { get; set; } = [];
    public Dictionary<string, double?> Gap { get; set; } = [];
    public Dictionary<string, double?> Dispersion { get; set; } = [];
    public Dictionary<string, int> Coverage { get; set; } = [];
    public Dictionary<string, Dictionary<string, double?>> RingMeans { get; set; } = [];
    public Dictionary<string, double?> RingSpread { get; set; } = [];
    public List<TopCard> TopCards { get; set; } = [];
    public Dictionary<string, ProbeStat> Probes { get; set; } = [];
    public List<Receipt> Receipts { get; set; } = [];
    public List<TimelinePoint> Timeline { get; set; } = [];
    public Theses Theses { get; set; } = new();
    public List<Finding> Findings { get; set; } = [];
    public bool Ready { get; set; }
}

public sealed class Analysis
{
    /// <summary>Decision D10: one sentence, always shipped with a reading.</summary>
    public const string CaveatText = "The Shadow is a hypothesis drawn from a gap in the numbers, not a diagnosis.";

    public string Source { get; set; } = "local";
    public bool Pending { get; set; }
    public string Verdict { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = [];
    public string Persona { get; set; } = string.Empty;
    public string Ego { get; set; } = string.Empty;
    public string Shadow { get; set; } = string.Empty;
    public string Experiment { get; set; } = string.Empty;
    public string Question { get; set; } = string.Empty;
    public string? Model { get; set; }
    public string? Reason { get; set; }

    /// <summary>Decision D10: the Shadow is always framed as inference, in the payload
    /// itself, so no client can render it as a fact about the person.</summary>
    public string Caveat { get; set; } = CaveatText;
    public FindingRef? TopFinding { get; set; }
    public DateTime? GeneratedAt { get; set; }

    // The store keeps the whole reading as JSON; the payload is what the UI renders.
    public string ToJson() => System.Text.Json.JsonSerializer.Serialize(this, Json.Options);
    public static Analysis? FromJson(string? json) =>
        string.IsNullOrWhiteSpace(json) ? null : System.Text.Json.JsonSerializer.Deserialize<Analysis>(json, Json.Options);
}

public sealed class FindingRef
{
    public string Kind { get; set; } = string.Empty;
    public string? Axis { get; set; }
}

public static class Json
{
    public static readonly System.Text.Json.JsonSerializerOptions Options = new(System.Text.Json.JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        WriteIndented = false,
    };
}

/// <summary>
/// Deterministic maths. Nothing here talks to a network: the same answers always
/// produce the same portrait, which is what makes the AI layer auditable.
/// </summary>
public static class Scoring
{
    private static double Round(double v, int digits = 0)
    {
        var f = Math.Pow(10, digits);
        return Math.Round(v * f, MidpointRounding.AwayFromZero) / f;
    }

    private static double Clamp(double v, double lo, double hi) => Math.Min(hi, Math.Max(lo, v));

    private static double? Mean(IEnumerable<double> values)
    {
        var list = values.ToList();
        return list.Count == 0 ? null : list.Average();
    }

    public static ScoredAxes ScoreSubmission(Submission sub)
    {
        var parts = Instrument.AxisIds.ToDictionary(id => id, _ => (Sum: 0.0, Weight: 0.0));

        foreach (var dial in Instrument.Dials)
        {
            if (!sub.Dials.TryGetValue(dial.Axis, out var stop)) continue;
            var p = parts[dial.Axis];
            parts[dial.Axis] = (p.Sum + Instrument.DialToScore(stop) * Instrument.DialWeight, p.Weight + Instrument.DialWeight);
        }

        foreach (var probe in Instrument.Probes)
        {
            if (!sub.Probes.TryGetValue(probe.Id, out var choice)) continue;
            if (choice < 0 || choice >= probe.Options.Count) continue;
            foreach (var (axis, value) in probe.Options[choice].Deltas)
            {
                if (!parts.TryGetValue(axis, out var p)) continue;
                parts[axis] = (p.Sum + value * Instrument.ProbeWeight, p.Weight + Instrument.ProbeWeight);
            }
        }

        foreach (var cardId in sub.Cards)
        {
            if (!Instrument.CardById.TryGetValue(cardId, out var card)) continue;
            foreach (var (axis, value) in card.Deltas)
            {
                if (!parts.TryGetValue(axis, out var p)) continue;
                parts[axis] = (p.Sum + value * Instrument.CardWeight, p.Weight + Instrument.CardWeight);
            }
        }

        var axes = new Dictionary<string, double?>();
        var answered = 0;
        foreach (var (id, p) in parts)
        {
            if (p.Weight > 0)
            {
                axes[id] = Round(Clamp(p.Sum / p.Weight, -100, 100));
                answered++;
            }
            else
            {
                axes[id] = null;
            }
        }
        return new ScoredAxes(axes, answered);
    }

    private static (double? Mean, double? Sd, int N) WeightedStats(IEnumerable<(double? Value, double Weight)> values)
    {
        var list = values.Where(v => v.Value is not null).ToList();
        if (list.Count == 0) return (null, null, 0);
        var totalW = list.Sum(v => v.Weight);
        if (totalW == 0) return (null, null, 0);
        var m = list.Sum(v => v.Value!.Value * v.Weight) / totalW;
        var variance = list.Sum(v => v.Weight * Math.Pow(v.Value!.Value - m, 2)) / totalW;
        return (Round(m), Round(Math.Sqrt(variance)), list.Count);
    }

    public static string PoleWord(string axisId, double? value)
    {
        if (!Instrument.AxisById.TryGetValue(axisId, out var axis) || value is null) return "Unread";
        var v = value.Value;
        if (v >= 45) return axis.Pos;
        if (v <= -45) return axis.Neg;
        if (v >= 12) return $"mostly {axis.Pos}";
        if (v <= -12) return $"mostly {axis.Neg}";
        return $"{axis.Neg}/{axis.Pos} split";
    }

    public static string PoleLine(string axisId, double? value)
    {
        if (!Instrument.AxisById.TryGetValue(axisId, out var axis) || value is null) return string.Empty;
        return value >= 0 ? axis.PosLine : axis.NegLine;
    }

    private static string StripMostly(string s) => s.StartsWith("mostly ") ? s[7..] : s;

    public static Portrait BuildPortrait(EgoData? ego, IReadOnlyList<VoteData> votes, List<string>? peers = null, bool doorEnabled = false)
    {
        var validVotes = votes.Where(v => v.Scores.Count > 0).ToList();
        var weighted = validVotes
            .Select(v => (Vote: v, Weight: (Instrument.RingById.TryGetValue(v.Ring, out var r) ? r.Weight : 0.5)))
            .ToList();

        var persona = new Dictionary<string, double?>();
        var dispersion = new Dictionary<string, double?>();
        var coverage = new Dictionary<string, int>();
        var egoAxes = ego?.Scores ?? [];

        foreach (var axisId in Instrument.AxisIds)
        {
            var stats = WeightedStats(weighted.Select(v => (
                Value: v.Vote.Scores.TryGetValue(axisId, out var s) ? s : null,
                Weight: v.Weight)));
            persona[axisId] = stats.Mean;
            dispersion[axisId] = stats.Sd;
            coverage[axisId] = stats.N;
        }

        var gap = new Dictionary<string, double?>();
        foreach (var axisId in Instrument.AxisIds)
        {
            var e = egoAxes.TryGetValue(axisId, out var ev) ? ev : null;
            gap[axisId] = e is null || persona[axisId] is null ? null : Round(e.Value - persona[axisId]!.Value);
        }

        var ringMeans = new Dictionary<string, Dictionary<string, double?>>();
        var ringCounts = new Dictionary<string, int>();
        foreach (var ring in Instrument.RingIds)
        {
            var inRing = weighted.Where(v => v.Vote.Ring == ring).ToList();
            if (inRing.Count > 0) ringCounts[ring] = inRing.Count;
            if (inRing.Count == 0) continue;
            var means = new Dictionary<string, double?>();
            foreach (var axisId in Instrument.AxisIds)
            {
                var stats = WeightedStats(inRing.Select(v => (
                    Value: v.Vote.Scores.TryGetValue(axisId, out var s) ? s : null,
                    Weight: v.Weight)));
                means[axisId] = stats.Mean;
            }
            ringMeans[ring] = means;
        }

        var ringSpread = new Dictionary<string, double?>();
        foreach (var axisId in Instrument.AxisIds)
        {
            var vals = Instrument.RingIds
                .Where(r => ringCounts.GetValueOrDefault(r) >= 2 && ringMeans.TryGetValue(r, out var m) && m[axisId] is not null)
                .Select(r => ringMeans[r][axisId]!.Value)
                .ToList();
            ringSpread[axisId] = vals.Count >= 2 ? Round(vals.Max() - vals.Min()) : null;
        }

        var cardCounts = new Dictionary<string, int>();
        foreach (var v in validVotes)
            foreach (var c in v.Cards)
                cardCounts[c] = cardCounts.GetValueOrDefault(c) + 1;

        var topCards = cardCounts
            .OrderByDescending(kv => kv.Value)
            .Take(5)
            .Select(kv => new TopCard
            {
                Id = kv.Key,
                Title = Instrument.CardById.TryGetValue(kv.Key, out var c) ? c.Title : kv.Key,
                Count = kv.Value,
                Pct = validVotes.Count > 0 ? Round(kv.Value * 100.0 / validVotes.Count) : 0,
            })
            .ToList();

        var myCards = (ego?.Cards ?? [])
            .Select(id => new CardRef { Id = id, Title = Instrument.CardById.TryGetValue(id, out var c) ? c.Title : id })
            .ToList();

        var probeStats = new Dictionary<string, ProbeStat>();
        foreach (var probe in Instrument.Probes)
        {
            var counts = new[] { 0, 0 };
            var answered = 0;
            foreach (var v in validVotes)
            {
                if (!v.Probes.TryGetValue(probe.Id, out var choice)) continue;
                if (choice is 0 or 1)
                {
                    counts[choice]++;
                    answered++;
                }
            }
            int? mine = ego is not null && ego.Probes.TryGetValue(probe.Id, out var mv) && (mv is 0 or 1) ? mv : null;
            int? majority = answered > 0 ? (counts[0] >= counts[1] ? 0 : 1) : null;
            probeStats[probe.Id] = new ProbeStat
            {
                Counts = counts,
                Answered = answered,
                Mine = mine,
                Majority = majority,
                Agree = mine is null || majority is null ? null : mine == majority,
                Share = answered > 0 ? Round(counts[majority!.Value] * 100.0 / answered) : 0,
            };
        }

        var gaps = Instrument.AxisIds.Select(a => gap[a]).Where(g => g is not null).Select(g => Math.Abs(g!.Value)).ToList();
        var disps = Instrument.AxisIds.Select(a => dispersion[a]).Where(d => d is not null).Select(d => d!.Value).ToList();
        double? meanAbsGap = gaps.Count > 0 ? gaps.Average() : null;
        double? meanDisp = disps.Count > 0 ? disps.Average() : null;
        double? selfKnowledge = meanAbsGap is null ? null : Clamp(Math.Round(100 - meanAbsGap.Value * 1.15 - (meanDisp ?? 0) * 0.12), 0, 100);
        double? coherence = meanDisp is null ? null : Clamp(Math.Round(100 - meanDisp.Value * 1.1), 0, 100);

        var findings = BuildFindings(persona, egoAxes, gap, dispersion, coverage, ringSpread, ringMeans, ringCounts, probeStats, topCards, myCards);

        var receipts = validVotes
            .Where(v => !string.IsNullOrWhiteSpace(v.Receipt))
            .OrderByDescending(v => v.CreatedAt)
            .Take(40)
            .Select(v => new Receipt { Text = v.Receipt.Trim().Length > 160 ? v.Receipt.Trim()[..160] : v.Receipt.Trim(), Ring = v.Ring, At = v.CreatedAt })
            .ToList();

        var timeline = BuildTimeline(validVotes, ego is not null ? Instrument.Dials.Select(d => d.Axis).ToArray() : []);

        var sorted = Instrument.AxisIds
            .Where(a => persona[a] is not null)
            .Select(a => new { Axis = a, Value = persona[a]!.Value, Gap = gap[a], Sd = dispersion[a] })
            .ToList();

        var loudest = sorted.OrderByDescending(s => Math.Abs(s.Value)).FirstOrDefault();

        return new Portrait
        {
            N = validVotes.Count,
            Rings = ringCounts,
            Peers = peers ?? [],
            DoorEnabled = doorEnabled,
            Ego = egoAxes,
            EgoCards = myCards,
            EgoAt = ego?.CreatedAt,
            Persona = persona,
            Gap = gap,
            Dispersion = dispersion,
            Coverage = coverage,
            RingMeans = ringMeans,
            RingSpread = ringSpread,
            TopCards = topCards,
            Probes = probeStats,
            Receipts = receipts,
            Timeline = timeline,
            Theses = new Theses
            {
                SelfKnowledge = selfKnowledge,
                Coherence = coherence,
                MeanAbsGap = meanAbsGap is null ? null : Round(meanAbsGap.Value),
                MeanDisp = meanDisp is null ? null : Round(meanDisp.Value),
                Loudest = loudest is null ? null : new Dictionary<string, object?> { ["axis"] = loudest.Axis, ["value"] = loudest.Value },
                VerdictSeeds = sorted.OrderByDescending(s => Math.Abs(s.Value)).Take(4).Select(s => PoleWord(s.Axis, s.Value)).ToList(),
            },
            Findings = findings,
            Ready = validVotes.Count >= 3 && ego is not null && egoAxes.Count > 0,
        };
    }

    private static List<Finding> BuildFindings(
        Dictionary<string, double?> persona,
        Dictionary<string, double?> ego,
        Dictionary<string, double?> gap,
        Dictionary<string, double?> dispersion,
        Dictionary<string, int> coverage,
        Dictionary<string, double?> ringSpread,
        Dictionary<string, Dictionary<string, double?>> ringMeans,
        Dictionary<string, int> ringCounts,
        Dictionary<string, ProbeStat> probeStats,
        List<TopCard> topCards,
        List<CardRef> myCards)
    {
        var outList = new List<Finding>();
        var axes = Instrument.AxisIds.Where(a => persona.GetValueOrDefault(a) is not null).ToList();

        var over = axes
            .Where(a => gap.GetValueOrDefault(a) is >= 15)
            .OrderByDescending(a => gap.GetValueOrDefault(a))
            .ToList();
        if (over.Count > 0)
        {
            var axis = over[0];
            outList.Add(new Finding
            {
                Kind = "mask",
                Axis = axis,
                Strength = gap[axis],
                Title = $"You cast yourself as {StripMostly(PoleWord(axis, ego.GetValueOrDefault(axis)))}. They do not.",
                Text = $"You place yourself at {ego.GetValueOrDefault(axis)} on {Instrument.AxisById[axis].Name}; the room puts you at {persona[axis]}.",
            });
        }

        var under = axes
            .Where(a => gap.GetValueOrDefault(a) is <= -15)
            .OrderBy(a => gap.GetValueOrDefault(a))
            .ToList();
        if (under.Count > 0)
        {
            var axis = under[0];
            outList.Add(new Finding
            {
                Kind = "unseen",
                Axis = axis,
                Strength = gap[axis],
                Title = $"They see more {StripMostly(PoleWord(axis, persona[axis]))} in you than you do",
                Text = $"The room reads you at {persona[axis]} on {Instrument.AxisById[axis].Name}; you gave yourself {ego.GetValueOrDefault(axis)}.",
            });
        }

        var splits = axes
            .Where(a => (ringSpread.GetValueOrDefault(a) ?? 0) >= 30 && coverage.GetValueOrDefault(a) >= 4)
            .OrderByDescending(a => ringSpread.GetValueOrDefault(a))
            .ToList();
        if (splits.Count > 0)
        {
            var axis = splits[0];
            var rings = Instrument.RingIds
                .Where(r => ringMeans.TryGetValue(r, out var m) && m[axis] is not null && ringCounts.GetValueOrDefault(r) >= 2)
                .ToList();
            if (rings.Count >= 2)
            {
                var hi = rings.OrderByDescending(r => ringMeans[r][axis]).First();
                var lo = rings.OrderBy(r => ringMeans[r][axis]).First();
                outList.Add(new Finding
                {
                    Kind = "split",
                    Axis = axis,
                    Strength = ringSpread[axis],
                    Hi = hi,
                    Lo = lo,
                    Title = $"Two people hold two different versions of your {Instrument.AxisById[axis].Name.ToLowerInvariant()}",
                    Text = $"{Label(hi)} read you at {ringMeans[hi][axis]} and {Label(lo)} at {ringMeans[lo][axis]}. Both are voting honestly.",
                });
            }
        }

        var storyAxis = axes
            .Where(a => Math.Abs(ego.GetValueOrDefault(a) ?? 0) >= 65 && Math.Abs(persona.GetValueOrDefault(a) ?? 0) <= 35)
            .OrderByDescending(a => Math.Abs(ego.GetValueOrDefault(a) ?? 0))
            .FirstOrDefault();
        if (storyAxis is not null)
        {
            outList.Add(new Finding
            {
                Kind = "story",
                Axis = storyAxis,
                Strength = Math.Abs(ego[storyAxis] ?? 0),
                Title = $"The {StripMostly(PoleWord(storyAxis, ego[storyAxis]))} identity is yours alone so far",
                Text = $"You rate your {Instrument.AxisById[storyAxis].Name.ToLowerInvariant()} at {ego[storyAxis]}. Outside your own head it reads as {persona[storyAxis]}, which is to say: unproven, not untrue.",
            });
        }

        var blurAxis = axes
            .Where(a => (dispersion.GetValueOrDefault(a) ?? 0) >= 26 && Math.Abs(gap.GetValueOrDefault(a) ?? 0) <= 10)
            .OrderByDescending(a => dispersion.GetValueOrDefault(a))
            .FirstOrDefault();
        if (blurAxis is not null)
        {
            outList.Add(new Finding
            {
                Kind = "blur",
                Axis = blurAxis,
                Strength = dispersion[blurAxis],
                Title = $"{Instrument.AxisById[blurAxis].Name} is the axis where you are nobody's constant",
                Text = $"Votes on {Instrument.AxisById[blurAxis].Name.ToLowerInvariant()} scatter by {dispersion[blurAxis]} points. You are whatever the room needs, and possibly not choosing.",
            });
        }

        var disagreement = probeStats
            .Where(kv => kv.Value.Agree == false && kv.Value.Share >= 55)
            .OrderByDescending(kv => kv.Value.Share)
            .FirstOrDefault();
        if (disagreement.Key is not null)
        {
            var probe = Instrument.ProbeById[disagreement.Key];
            outList.Add(new Finding
            {
                Kind = "proof",
                Probe = disagreement.Key,
                Strength = disagreement.Value.Share,
                Title = "You predict yourself wrong on a forced choice",
                Text = $"{disagreement.Value.Share}% of the room chose “{probe.Options[disagreement.Value.Majority!.Value].Label}”. You chose “{probe.Options[disagreement.Value.Mine!.Value].Label}”.",
            });
        }

        var myIds = myCards.Select(c => c.Id).ToHashSet();
        var overlap = topCards.Where(c => myIds.Contains(c.Id)).ToList();
        if (topCards.Count > 0 && myCards.Count > 0 && overlap.Count == 0)
        {
            outList.Add(new Finding
            {
                Kind = "deck",
                Strength = topCards[0].Pct,
                Title = "Nobody handed you the card you handed yourself",
                Text = $"The room keeps reaching for {string.Join(" and ", topCards.Take(2).Select(c => c.Title))}. You picked {string.Join(" and ", myCards.Select(c => c.Title))}.",
            });
        }

        return outList.OrderByDescending(f => f.Strength ?? 0).ToList();
    }

    private static string Label(string ringId) => Instrument.RingById.TryGetValue(ringId, out var r) ? r.Label : ringId;

    private static List<TimelinePoint> BuildTimeline(List<VoteData> votes, string[] gate)
    {
        var sorted = votes.OrderBy(v => v.CreatedAt).ToList();
        if (sorted.Count > 60) sorted = sorted.Skip(sorted.Count - 60).ToList();
        if (sorted.Count == 0) return [];

        var points = new List<TimelinePoint>();
        for (var i = 0; i < sorted.Count; i++)
        {
            var slice = sorted.Take(i + 1).ToList();
            var axes = new Dictionary<string, double?>();
            foreach (var axis in gate)
            {
                var vals = slice.Select(v => v.Scores.TryGetValue(axis, out var s) ? s : null).Where(v => v is not null).Select(v => v!.Value).ToList();
                axes[axis] = vals.Count > 0 ? Round(vals.Average()) : null;
            }
            points.Add(new TimelinePoint { At = sorted[i].CreatedAt, N = i + 1, Axes = axes });
        }

        if (points.Count <= 24) return points;
        var stride = (int)Math.Ceiling(points.Count / 24.0);
        return points.Where((_, i) => i % stride == 0 || i == points.Count - 1).ToList();
    }

    public static object DigestForAI(Portrait portrait, string? name, string? tagline)
    {
        Dictionary<string, double?> CleanDict(IEnumerable<KeyValuePair<string, double?>> source) =>
            source.Where(kv => kv.Value is not null).ToDictionary(kv => kv.Key, kv => kv.Value);

        return new
        {
            name,
            tagline,
            version = 1,
            votes = portrait.N,
            rings = portrait.Rings,
            selfKnowledge = portrait.Theses.SelfKnowledge,
            coherence = portrait.Theses.Coherence,
            axes = Instrument.AxisIds
                .Where(a => portrait.Persona[a] is not null)
                .Select(a => new
                {
                    axis = a,
                    name = Instrument.AxisById[a].Name,
                    ego = portrait.Ego.TryGetValue(a, out var e) ? e : null,
                    persona = portrait.Persona[a],
                    gap = portrait.Gap[a],
                    dispersion = portrait.Dispersion[a],
                    byRing = CleanDict(Instrument.RingIds.ToDictionary(
                        r => r,
                        r => portrait.RingMeans.TryGetValue(r, out var m) ? m[a] : null)),
                }),
            egoCards = portrait.EgoCards.Select(c => c.Title),
            crowdCards = portrait.TopCards.Select(c => $"{c.Title} {c.Pct}%"),
            probes = portrait.Probes.Select(kv => new
            {
                probe = kv.Key,
                ego = kv.Value.Mine,
                crowdMajority = kv.Value.Majority,
                crowdShare = kv.Value.Share,
                agree = kv.Value.Agree,
            }),
            findings = portrait.Findings.Select(f => new { kind = f.Kind, axis = f.Axis ?? f.Probe, strength = f.Strength }),
            // Decision D18: what reaches the model is capped, not just "the last 1 000
            // votes". Twelve lines, 200 characters each, is what a reading can use; more
            // is token cost and injection surface with no extra signal.
            receipts = portrait.Receipts.Take(12).Select(r => r.Text.Length > 200 ? r.Text[..200] : r.Text),
        };
    }
}
