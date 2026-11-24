using System.Text.Json.Serialization;

namespace Persona.Api.Domain;

public sealed class SubmissionInput
{
    [JsonPropertyName("cards")] public List<string>? Cards { get; set; }
    [JsonPropertyName("dials")] public Dictionary<string, int>? Dials { get; set; }
    [JsonPropertyName("probes")] public Dictionary<string, int?>? Probes { get; set; }
    [JsonPropertyName("ring")] public string? Ring { get; set; }
    [JsonPropertyName("receipt")] public string? Receipt { get; set; }
    [JsonPropertyName("doorAnswer")] public string? DoorAnswer { get; set; }
}

public sealed class PersonaInput
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("tagline")] public string? Tagline { get; set; }
    [JsonPropertyName("avatar")] public string? Avatar { get; set; }
    [JsonPropertyName("peers")] public List<string>? Peers { get; set; }
    [JsonPropertyName("doorQuestion")] public string? DoorQuestion { get; set; }
    [JsonPropertyName("doorAnswer")] public string? DoorAnswer { get; set; }
}

// The cleaned, storable shape of an answer sheet (voter's or owner's).
public sealed class Submission
{
    public List<string> Cards { get; init; } = [];
    public Dictionary<string, int> Dials { get; init; } = [];
    public Dictionary<string, int> Probes { get; init; } = [];
    public string? Ring { get; init; }
    public string Receipt { get; init; } = string.Empty;
    public string? DoorAnswer { get; init; }
}

public sealed record ValidationResult(bool Ok, List<string> Errors, Submission Clean);

public sealed record PersonaInputResult(
    bool Ok,
    List<string> Errors,
    string Name,
    string Tagline,
    string Avatar,
    List<string> Peers,
    string DoorQuestion,
    string DoorAnswer);

public static class Validator
{
    public static ValidationResult ValidateSubmission(SubmissionInput? raw, bool requireCards = true)
    {
        var errors = new List<string>();

        var cards = new List<string>();
        if (raw?.Cards is not null)
        {
            foreach (var c in raw.Cards)
            {
                if (c is not null && Instrument.CardById.ContainsKey(c) && !cards.Contains(c)) cards.Add(c);
            }
        }
        if (requireCards && cards.Count != 3) errors.Add("pick exactly three cards");
        if (!requireCards && cards.Count > 3) errors.Add("at most three cards");

        var dials = new Dictionary<string, int>();
        foreach (var dial in Instrument.Dials)
        {
            if (raw?.Dials is null || !raw.Dials.TryGetValue(dial.Axis, out var v)) continue;
            if (v < 0 || v > 4)
            {
                errors.Add($"dial {dial.Axis} must be 0..4");
                continue;
            }
            dials[dial.Axis] = v;
        }
        if (dials.Count < 4) errors.Add("answer at least four dials");

        var probes = new Dictionary<string, int>();
        foreach (var probe in Instrument.Probes)
        {
            if (raw?.Probes is null || !raw.Probes.TryGetValue(probe.Id, out var v) || v is null) continue;
            var n = v.Value;
            if (n < 0 || n > 1)
            {
                errors.Add($"probe {probe.Id} must be 0 or 1");
                continue;
            }
            probes[probe.Id] = n;
        }
        if (probes.Count < 3) errors.Add("answer at least three probes");

        var ring = raw?.Ring is not null && Instrument.VoterRingIds.Contains(raw.Ring) ? raw.Ring : null;
        // An unknown ring is not a default, it is a client bug: "outer" is assigned by
        // the server when the door question fails, never claimed by a voter.
        if (raw?.Ring is not null && !string.IsNullOrWhiteSpace(raw.Ring) && ring is null)
        {
            errors.Add($"unknown ring {raw.Ring}");
        }

        return new ValidationResult(
            errors.Count == 0,
            errors,
            new Submission
            {
                Cards = cards,
                Dials = dials,
                Probes = probes,
                Ring = ring,
                Receipt = Instrument.Clean(raw?.Receipt, Instrument.ReceiptMax),
                DoorAnswer = raw?.DoorAnswer,
            });
    }

    public static PersonaInputResult ValidatePersonaInput(PersonaInput? raw)
    {
        var errors = new List<string>();
        var name = Instrument.Clean(raw?.Name, Instrument.NameMax);
        var tagline = Instrument.Clean(raw?.Tagline, Instrument.TaglineMax);
        var avatar = Instrument.Clean(raw?.Avatar, 8);
        if (avatar.Length == 0) avatar = "◐";
        if (name.Length < 2) errors.Add("name must be at least two characters");

        var peers = new List<string>();
        foreach (var p in (raw?.Peers ?? []).Take(Instrument.PeerMax))
        {
            var label = Instrument.Clean(p, Instrument.PeerLabelMax);
            if (label.Length > 0 && !peers.Contains(label)) peers.Add(label);
        }

        var doorQuestion = Instrument.Clean(raw?.DoorQuestion, 120);
        var doorAnswer = Instrument.Clean(raw?.DoorAnswer, 60);
        var useDoor = doorQuestion.Length > 6 && doorAnswer.Length > 0;

        return new PersonaInputResult(
            errors.Count == 0,
            errors,
            name,
            tagline,
            avatar,
            peers,
            useDoor ? doorQuestion : string.Empty,
            useDoor ? doorAnswer : string.Empty);
    }
}
