using System.Collections.Concurrent;

namespace Persona.Api.Api;

/// <summary>
/// Decision D20: the rate limiter is a per-host service, not static state. A static
/// dictionary is shared by every host in the process, so one test host (or one tenant)
/// spends another's budget. One instance per application, injected.
///
/// At real scale this single class is the only thing that changes: swap the dictionary
/// for Redis behind TryConsume. Nothing else in the app touches rate limiting.
/// </summary>
public sealed class Throttle(IConfiguration config)
{
    private const int MaxBuckets = 50_000;
    private readonly ConcurrentDictionary<string, (DateTime Start, int Used)> buckets = new();
    private long lastSweepTicks;

    /// <summary>"off" disables limits (tests, local demos). One canonical key, one legacy
    /// alias, so an older config file cannot silently re-enable limits.</summary>
    public bool Off =>
        string.Equals(config["PERSONA_RATE_LIMIT"] ?? config["PERSONA_THROTTLE"], "off", StringComparison.OrdinalIgnoreCase);

    /// <summary>True when the caller has spent its budget for this minute.</summary>
    public bool Over(string key, int cost, int perMinute)
    {
        if (Off) return false;
        var now = DateTime.UtcNow;

        // Sweep expired windows at most once a second, and never let the map grow past
        // the cap: an attacker rotating keys must not be able to buy us out of memory.
        var last = Interlocked.Read(ref lastSweepTicks);
        if ((now.Ticks - last) > TimeSpan.TicksPerSecond && Interlocked.CompareExchange(ref lastSweepTicks, now.Ticks, last) == last)
        {
            foreach (var kv in buckets)
            {
                if ((now - kv.Value.Start).TotalMinutes >= 1) buckets.TryRemove(kv.Key, out _);
            }
            if (buckets.Count > MaxBuckets)
            {
                foreach (var kv in buckets.OrderBy(k => k.Value.Start).Take(buckets.Count - MaxBuckets + 1_000))
                {
                    buckets.TryRemove(kv.Key, out _);
                }
            }
        }

        if (buckets.Count >= MaxBuckets * 2) return true; // overloaded: shed load, do not grow

        var bucket = buckets.GetOrAdd(key, _ => (now, 0));
        if ((now - bucket.Start).TotalMinutes >= 1)
        {
            buckets[key] = (now, cost);
            return false;
        }
        bucket.Used += cost;
        buckets[key] = bucket;
        return bucket.Used > perMinute;
    }
}
