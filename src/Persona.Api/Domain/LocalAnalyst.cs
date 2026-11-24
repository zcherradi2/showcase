namespace Persona.Api.Domain;

/// <summary>
/// The local analyst: deterministic narration so the product is complete with no
/// API key, no network and no waiting. The LLM layer writes over this text; it
/// never gets to invent the numbers.
/// </summary>
public static class LocalAnalyst
{
    public static Analysis Read(Portrait portrait, string name, string? tagline)
    {
        var axes = Instrument.AxisIds.Where(a => portrait.Persona[a] is not null).ToList();
        var sorted = axes.OrderByDescending(a => Math.Abs(portrait.Persona[a] ?? 0)).ToList();
        var first = sorted.ElementAtOrDefault(0);
        var second = sorted.ElementAtOrDefault(1);
        var n = portrait.N;

        if (first is null || n < 3 || !portrait.Ready)
        {
            return new Analysis
            {
                Source = "local",
                Pending = true,
                Verdict = "Not enough voices yet",
                Tags = [],
                Persona =
                    $"{name} needs at least three people who are not them. Share the link, and the picture resolves as the votes land.",
                Ego = string.Empty,
                Shadow = string.Empty,
                Experiment = "Send this page to five people from three different rings. The disagreement between them is the point.",
                Question = string.Empty,
            };
        }

        var top = portrait.Findings.FirstOrDefault();
        var mask = portrait.Findings.FirstOrDefault(f => f.Kind == "mask");
        var unseen = portrait.Findings.FirstOrDefault(f => f.Kind == "unseen");
        var split = portrait.Findings.FirstOrDefault(f => f.Kind == "split");
        var blur = portrait.Findings.FirstOrDefault(f => f.Kind == "blur");
        var story = portrait.Findings.FirstOrDefault(f => f.Kind == "story");
        var proof = portrait.Findings.FirstOrDefault(f => f.Kind == "proof");

        var secondAxis = second ?? first;
        var verdict = $"{Strip(Pole(portrait, first))} with a {Strip(Pole(portrait, secondAxis))}";

        var ringList = portrait.Rings
            .OrderByDescending(kv => kv.Value)
            .Select(kv => $"{Label(kv.Key)} ({kv.Value})")
            .ToList();

        var coherence = portrait.Theses.Coherence;
        var agreement = coherence is null
            ? string.Empty
            : coherence >= 70
                ? "The room agrees with itself, which is rare and slightly unnerving."
                : coherence >= 45
                    ? "The room mostly agrees, with a seam running through it."
                    : "The room does not agree with itself. That disagreement is the most interesting data on this page.";

        var personaText = string.Join(" ", new[]
        {
            $"{n} {(n == 1 ? "person" : "people")} placed you at {portrait.Persona[first]} on {Instrument.AxisById[first].Name}, so {Scoring.PoleLine(first, portrait.Persona[first])}.",
            second is not null
                ? $"Underneath that, {Instrument.AxisById[second].Name.ToLowerInvariant()} sits at {portrait.Persona[second]}: {Scoring.PoleLine(second, portrait.Persona[second])}."
                : string.Empty,
            ringList.Count > 0 ? $"Voices came from {string.Join(", ", ringList)}." : string.Empty,
            agreement,
        }.Where(s => !string.IsNullOrEmpty(s)));

        var egoBits = new List<string>();
        if (portrait.Theses.SelfKnowledge is not null)
        {
            var sk = portrait.Theses.SelfKnowledge.Value;
            egoBits.Add(sk >= 70
                ? $"You know how you land: a self-knowledge index of {sk} means your read on yourself is close to the room's."
                : sk >= 45
                    ? $"Your self-knowledge index is {sk}. You are half right about how you land, which is roughly human."
                    : $"Your self-knowledge index is {sk}. The gap between your account of yourself and the room's is the largest object on this page.");
        }
        if (mask is not null) egoBits.Add($"{mask.Title}. {mask.Text}");
        if (unseen is not null) egoBits.Add($"{unseen.Title}. {unseen.Text}");
        if (mask is null && unseen is null && portrait.Theses.MeanAbsGap is not null)
        {
            egoBits.Add($"On average you are {portrait.Theses.MeanAbsGap} points from the consensus, per axis. Nothing dramatic, which itself is worth something.");
        }

        var shadowBits = new List<string>();
        if (split is not null)
            shadowBits.Add($"{split.Title}. {split.Text} The version one ring sees is not being shown to the other, and you are the one choosing.");
        if (story is not null)
            shadowBits.Add($"{story.Title}. {story.Text} Held too hard, an identity becomes a costume you cannot take off in front of the people who knew you before you put it on.");
        if (blur is not null) shadowBits.Add($"{blur.Title}. {blur.Text}");
        if (proof is not null)
            shadowBits.Add($"{proof.Title}. {proof.Text} If you would not do what they think you would do, and you would not do what you think you would do either, the honest answer is that this edge of you is still unformed.");
        if (shadowBits.Count == 0)
        {
            shadowBits.Add(
                "No strong shadow signal yet: your ego and the room are close, and the room agrees with itself. That is either integration, or a very good mask. More voices from the ring you have not invited would tell you which.");
        }

        string experiment;
        if (split is not null)
        {
            var axis = split.Axis!;
            experiment =
                $"For one week, run the experiment against the split: show {Label(split.Lo ?? "the quieter ring")} the {Instrument.AxisById[axis].Name.ToLowerInvariant()} the other ring already gets. One meeting, one message, one night where you do not edit.";
        }
        else if (mask is not null)
        {
            experiment = $"For one week, stop performing {Strip(Scoring.PoleWord(mask.Axis!, portrait.Ego.TryGetValue(mask.Axis!, out var ev) ? ev : null))}. Not to abandon it, to test whether it is load-bearing.";
        }
        else if (unseen is not null)
        {
            experiment = $"For one week, take the credit the room is already giving you on {Instrument.AxisById[unseen.Axis!].Name.ToLowerInvariant()}: say it out loud once, in a room where it is not obvious.";
        }
        else
        {
            experiment = "For one week, ask three people from three different rings the same question: what do I do that you would not expect from me? Write down the answers without defending yourself.";
        }

        var question = split is not null
            ? $"What would {Label(split.Lo ?? "they")} say if you behaved the way {Label(split.Hi ?? "the other ring")} sees you?"
            : $"If the room is right about {Instrument.AxisById[first].Name.ToLowerInvariant()} and you are right about nothing, what changes tomorrow?";

        var tags = sorted
            .Take(3)
            .Select(a => Strip(Pole(portrait, a)))
            .Distinct()
            .ToList();

        return new Analysis
        {
            Source = "local",
            Pending = false,
            Verdict = verdict,
            Tags = tags,
            Persona = personaText,
            Ego = string.Join(" ", egoBits),
            Shadow = string.Join(" ", shadowBits),
            Experiment = experiment,
            Question = question,
            TopFinding = top is null ? null : new FindingRef { Kind = top.Kind, Axis = top.Axis ?? top.Probe },
        };
    }

    private static string Pole(Portrait p, string axis) => Scoring.PoleWord(axis, p.Persona[axis]);

    private static string Strip(string s) => s.StartsWith("mostly ") ? s[7..] : s;

    private static string Label(string ringId) => Instrument.RingById.TryGetValue(ringId, out var r) ? r.Label : ringId;
}
