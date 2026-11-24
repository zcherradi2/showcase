using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Persona.Tests;

/// <summary>
/// The regression that matters: a whole dossier — votes, the Ego sheet, the persona
/// maths, then the model's reading and the shadow — over HTTP, against a stand-in
/// for the FreeLLMAPI router. If the analyst layer breaks, this is the test that says so.
/// </summary>
public class LlmAnalysisTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> factory;

    public LlmAnalysisTests(WebApplicationFactory<Program> factory) => this.factory = factory;

    private static HttpClient Client(WebApplicationFactory<Program> factory, string baseUrl, string mode = "ok") =>
        factory.WithWebHostBuilder(b => b
            .UseSetting("PERSONA_TEST", "1")
            .UseSetting("PERSONA_DATA_DIR", Path.Combine(Path.GetTempPath(), "persona-tests", Guid.NewGuid().ToString("n")))
            .UseSetting("PERSONA_LLM_BASE", baseUrl)
            .UseSetting("PERSONA_LLM_FALLBACKS", string.Empty)
            .UseSetting("PERSONA_LLM_MODEL", "mock/gemini-2.0-flash")
            .UseSetting("PERSONA_LLM_TIMEOUT", "5000")
            .UseSetting("PERSONA_RATE_LIMIT", "off")
            .UseSetting("PERSONA_SEED", "0")).CreateClient();

    private static Dictionary<string, object> Sheet(bool warm = true, bool fillProbes = true) => new()
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
        ["probes"] = fillProbes
            ? new Dictionary<string, int> { ["p2am"] = 0, ["proom"] = 1, ["pchange"] = 0, ["poffer"] = 1 }
            : new Dictionary<string, int>(),
        ["receipt"] = "Kept the light on for me at 2am without making it a favour.",
    };

    private static Dictionary<string, object> WithRing(Dictionary<string, object> sheet, string ring)
    {
        sheet["ring"] = ring;
        return sheet;
    }

    private static HttpRequestMessage Owned(HttpMethod method, string url, string token)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("x-owner-token", token);
        return req;
    }

    private static async Task<JsonNode> Json(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode}: {text}");
        return JsonNode.Parse(text)!;
    }

    /// <summary>Creates a dossier, fills the Ego sheet, and casts three votes from
    /// three devices in three rings. Everything a reading needs.</summary>
    private static async Task<(string Id, string Token)> LiveDossier(HttpClient client)
    {
        var create = await client.PostAsJsonAsync("/api/personas", new { name = "Ziko", tagline = "builds at night" });
        var created = await Json(create);
        var id = created["id"]!.GetValue<string>();
        var token = created["token"]!.GetValue<string>();

        var ego = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/ego")
        {
            Content = JsonContent.Create(Sheet(warm: true)),
            Headers = { { "x-owner-token", token } },
        });
        Assert.Equal(HttpStatusCode.OK, ego.StatusCode);

        var rings = new[] { "inner", "work", "family" };
        for (var i = 0; i < rings.Length; i++)
        {
            var req = new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/votes")
            {
                Content = JsonContent.Create(WithRing(Sheet(warm: i == 0), rings[i])),
            };
            req.Headers.Add("x-voter-id", $"device-{i}-aaaaaaaa");
            var vote = await client.SendAsync(req);
            Assert.Equal(HttpStatusCode.Created, vote.StatusCode);
        }

        return (id, token);
    }

    [Fact]
    public async Task Analyze_AsksTheModelAndStoresItsShadow()
    {
        using var llm = new MockLlm();
        using var client = Client(factory, llm.BaseUrl);
        var (id, token) = await LiveDossier(client);

        var res = await client.SendAsync(Owned(HttpMethod.Post, $"/api/personas/{id}/analyze", token));
        var body = await Json(res);

        Assert.True(body["ok"]!.GetValue<bool>());
        Assert.Equal("llm", body["analysis"]!["source"]!.GetValue<string>());
        Assert.Contains("credit matters", body["analysis"]!["shadow"]!.GetValue<string>());
        Assert.Equal("The Quiet Operator", body["analysis"]!["verdict"]!.GetValue<string>());
        Assert.Single(llm.Requests.Where(p => p.EndsWith("/chat/completions")));

        // the model is given the numbers and the receipts, never the raw device ids
        var prompt = llm.LastPrompt!;
        Assert.Contains("shadow", prompt, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("selfKnowledge", prompt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("device-0-aaaaaaaa", prompt);

        // the reading is persisted and shows up on the portrait afterwards
        var portrait = await Json(await client.SendAsync(Owned(HttpMethod.Get, $"/api/personas/{id}/portrait", token)));
        Assert.Equal("llm", portrait["analysis"]!["source"]!.GetValue<string>());
        Assert.Equal("The Quiet Operator", portrait["analysis"]!["verdict"]!.GetValue<string>());
    }

    [Fact]
    public async Task Analyze_TwiceReplacesTheReadingInsteadOfAddingOne()
    {
        // regression: a second analysis used to fail with
        // "UNIQUE constraint failed: analyses.PersonaId" (500 on the second click)
        using var llm = new MockLlm();
        using var client = Client(factory, llm.BaseUrl);
        var (id, token) = await LiveDossier(client);

        var first = await client.SendAsync(Owned(HttpMethod.Post, $"/api/personas/{id}/analyze", token));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.SendAsync(Owned(HttpMethod.Post, $"/api/personas/{id}/analyze", token));
        var body = await Json(second);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal("llm", body["analysis"]!["source"]!.GetValue<string>());
    }

    [Fact]
    public async Task Analyze_FallsBackToTheLocalReadingWhenTheModelIsDown()
    {
        // nothing listening on this port: the product must still answer
        using var client = Client(factory, "http://127.0.0.1:9/v1");
        var (id, token) = await LiveDossier(client);

        var body = await Json(await client.SendAsync(Owned(HttpMethod.Post, $"/api/personas/{id}/analyze", token)));
        Assert.True(body["ok"]!.GetValue<bool>());
        Assert.Equal("local", body["analysis"]!["source"]!.GetValue<string>());
        Assert.False(string.IsNullOrWhiteSpace(body["analysis"]!["shadow"]!.GetValue<string>()));
        Assert.False(string.IsNullOrWhiteSpace(body["reason"]?.GetValue<string>() ?? "why not"));
    }

    [Fact]
    public async Task Analyze_RejectsAModelAnswerThatIsNotJson()
    {
        using var llm = new MockLlm { Mode = "garbage" };
        using var client = Client(factory, llm.BaseUrl);
        var (id, token) = await LiveDossier(client);

        var body = await Json(await client.SendAsync(Owned(HttpMethod.Post, $"/api/personas/{id}/analyze", token)));
        Assert.Equal("local", body["analysis"]!["source"]!.GetValue<string>());
    }

    [Fact]
    public async Task Analyze_IsOwnerOnly()
    {
        using var llm = new MockLlm();
        using var client = Client(factory, llm.BaseUrl);
        var (id, _) = await LiveDossier(client);

        var stranger = await client.PostAsync($"/api/personas/{id}/analyze", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Forbidden, stranger.StatusCode);
        Assert.Empty(llm.Requests);
    }
}
