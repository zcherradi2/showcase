namespace Persona.Api.Domain;

/// <summary>
/// Decision D11: the public share page. This function is the whole contract for what
/// a stranger may see, so there is exactly one place to audit. It carries the room's
/// side of the dossier (Persona) and only the part of the reading that describes the
/// room. It never carries the Ego, the Gap, the Shadow, self-knowledge or coherence:
/// those belong to the subject alone.
/// </summary>
public static class PublicView
{
    public static object Build(string id, string name, string? tagline, string avatar, DateTime createdAt, Portrait p, Analysis reading) => new
    {
        id,
        name,
        tagline,
        avatar,
        createdAt,
        share = true,
        ready = p.Ready,
        portrait = new
        {
            n = p.N,
            persona = p.Persona,
            rings = p.Rings,
            ringMeans = p.RingMeans,
            ringSpread = p.RingSpread,
            spread = p.Dispersion,
            axes = Instrument.Axes.Select(a => new { id = a.Id, name = a.Name, pos = a.Pos, neg = a.Neg }).ToList(),
        },
        cards = p.TopCards.Select(c => new { c.Id, c.Title, c.Count, c.Pct }).ToList(),
        probes = Instrument.Probes.Select(pr =>
        {
            var stat = p.Probes.TryGetValue(pr.Id, out var s) ? s : new ProbeStat();
            var total = Math.Max(1, stat.Counts.Sum());
            return new
            {
                id = pr.Id,
                setup = pr.Setup,
                options = pr.Options.Select(o => o.Label).ToList(),
                shares = stat.Counts.Select(c => (int)Math.Round(c * 100.0 / total)).ToList(),
                answered = stat.Answered,
            };
        }).ToList(),
        receipts = p.Receipts.Select(r => new { r.Text, r.Ring, r.At }).ToList(),
        analysis = new
        {
            source = reading.Source,
            model = reading.Model,
            verdict = reading.Verdict,
            tags = reading.Tags,
            persona = reading.Persona,
            caveat = Analysis.CaveatText,
            generatedAt = reading.GeneratedAt,
        },
    };
}