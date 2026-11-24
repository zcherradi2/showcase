using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Persona.Tests;

/// <summary>
/// One test host factory for the whole suite: same configuration path the app uses in
/// production, a throwaway database per client, and the throttling left ON so the
/// limits can be tested instead of assumed.
/// </summary>
public sealed class WebApplicationFactoryFixture : IDisposable
{
    private readonly WebApplicationFactory<Program> factory = new();

    /// <summary>A client with its own database. Null base URL means the analyst is off.</summary>
    public HttpClient Client(string? llmBaseUrl, bool throttle = true) =>
        factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("PERSONA_TEST", "1");
            b.UseSetting("PERSONA_DATA_DIR", Path.Combine(Path.GetTempPath(), "persona-tests", Guid.NewGuid().ToString("n")));
            b.UseSetting("PERSONA_SEED", "0");
            b.UseSetting("PERSONA_LLM_TIMEOUT", "5000");
            b.UseSetting("PERSONA_LLM_FALLBACKS", string.Empty);
            b.UseSetting("PERSONA_RATE_LIMIT", throttle ? "on" : "off");
            if (llmBaseUrl is null)
            {
                b.UseSetting("PERSONA_LLM_DISABLED", "true");
            }
            else
            {
                b.UseSetting("PERSONA_LLM_BASE", llmBaseUrl);
                b.UseSetting("PERSONA_LLM_MODEL", "mock/gemini-2.0-flash");
            }
        }).CreateClient();

    public static Dictionary<string, object> Sheet(bool warm = true, string? receipt = null) => new()
    {
        ["cards"] = new[] { "hearth", "mirror", "drift" },
        ["dials"] = new Dictionary<string, int>
        {
            ["warmth"] = warm ? 4 : 0,
            ["force"] = 3,
            ["order"] = 3,
            ["depth"] = 2,
            ["candor"] = 2,
            ["drive"] = 4,
            ["play"] = warm ? 4 : 1,
            ["nerve"] = 3,
        },
        ["probes"] = new Dictionary<string, int> { ["p2am"] = 0, ["proom"] = 1, ["pchange"] = 0, ["poffer"] = 1 },
        ["receipt"] = receipt ?? "Kept the light on for me at 2am without making it a favour.",
    };

    public static HttpRequestMessage Owned(HttpMethod method, string url, string token)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("x-owner-token", token);
        return req;
    }

    /// <summary>A dossier with an Ego sheet and votes from three rings, ready to be read.</summary>
    public static async Task<(string Id, string Token)> LiveDossier(HttpClient client, string[]? receipts = null)
    {
        var created = Json(await client.PostAsJsonAsync("/api/personas", new { name = "Ziko", tagline = "builds at night" }));
        var id = created["id"]!.GetValue<string>();
        var token = created["token"]!.GetValue<string>();

        var ego = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/ego")
        {
            Content = JsonContent.Create(Sheet(warm: true)),
            Headers = { { "x-owner-token", token } },
        });
        Assert.Equal(HttpStatusCode.OK, ego.StatusCode);

        string[] rings = ["inner", "work", "family"];
        for (var i = 0; i < rings.Length; i++)
        {
            var sheet = Sheet(warm: i == 0, receipt: receipts is null ? null : receipts[i % receipts.Length]);
            sheet["ring"] = rings[i];
            var req = new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/votes") { Content = JsonContent.Create(sheet) };
            req.Headers.Add("x-voter-id", $"device-{i}-aaaaaaaa");
            var res = await client.SendAsync(req);
            Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        }

        return (id, token);
    }

    public static JsonNode Json(HttpResponseMessage res)
    {
        var text = res.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode}: {text}");
        return JsonNode.Parse(text)!;
    }

    public void Dispose() => factory.Dispose();
}