using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Persona.Tests;

/// <summary>
/// End-to-end over HTTP against the real pipeline: open a dossier, let the room vote
/// (each voter is its own device), let the subject answer the same instrument, then
/// read Persona + Ego + the reading. No mocks, no network, real SQLite file.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public string DataDir { get; } = Path.Combine(Path.GetTempPath(), "persona-tests-" + Guid.NewGuid().ToString("n"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Directory.CreateDirectory(DataDir);
        builder.UseEnvironment("Production");
        builder.UseSetting("PERSONA_TEST", "1");
        builder.UseSetting("PERSONA_DATA_DIR", DataDir);
        builder.UseSetting("PERSONA_RATE_LIMIT", "off");
        builder.UseSetting("PERSONA_LLM_DISABLED", "true"); // the tests never touch the network
    }

    public Task InitializeAsync() => Task.CompletedTask;

    public new async Task DisposeAsync()
    {
        try { Directory.Delete(DataDir, recursive: true); } catch { /* best effort */ }
        await base.DisposeAsync();
    }
}

public class ApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static async Task<JsonNode> ReadJson(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, $"HTTP {(int)res.StatusCode}: {text}");
        return JsonNode.Parse(text)!;
    }

    private static JsonObject GoodVote(string ring = "work", string receipt = "Rewrote my CV at 1am without being asked.", bool warm = false) => new()
    {
        ["cards"] = new JsonArray(warm ? "hearth" : "wall", warm ? "spark" : "grid", warm ? "drift" : "blade"),
        ["dials"] = new JsonObject
        {
            ["warmth"] = warm ? 4 : 0,
            ["order"] = warm ? 1 : 4,
            ["candor"] = warm ? 2 : 4,
            ["drive"] = 2,
            ["play"] = warm ? 4 : 0,
            ["nerve"] = warm ? 2 : 1,
        },
        ["probes"] = new JsonObject { ["p2am"] = warm ? 0 : 1, ["proom"] = warm ? 1 : 0, ["pchange"] = warm ? 0 : 1, ["poffer"] = 1 },
        ["ring"] = ring,
        ["receipt"] = receipt,
    };

    private static HttpRequestMessage Owned(HttpMethod method, string path, string token)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add("x-owner-token", token);
        return request;
    }

    private static async Task<JsonNode> Create(HttpClient client, object body)
    {
        var res = await client.PostAsJsonAsync("/api/personas", body);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return await ReadJson(res);
    }

    private static HttpContent AsVote(JsonObject vote, string device)
    {
        vote["device"] = device; // ignored by the model, used only to label the request below
        return JsonContent.Create(vote);
    }

    private async Task Vote(HttpClient client, string id, string device, JsonObject sheet)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/votes")
        {
            Content = JsonContent.Create(sheet),
        };
        request.Headers.Add("x-voter-id", device);
        var res = await client.SendAsync(request);
        Assert.True(res.StatusCode == HttpStatusCode.Created, $"vote by {device} failed: {res.StatusCode} {await res.Content.ReadAsStringAsync()}");
    }

    [Fact]
    public async Task Health_ReportsTheInstrumentVersion()
    {
        var json = await ReadJson(await factory.CreateClient().GetAsync("/api/health"));
        Assert.True(json["ok"]!.GetValue<bool>());
        Assert.Equal(Persona.Api.Domain.Instrument.Version, json["version"]!.GetValue<string>());
    }

    [Fact]
    public async Task FullPath_VotesEgoPortraitReading()
    {
        var client = factory.CreateClient();
        var created = await Create(client, new { name = "Ziko", tagline = "ships at 2am", avatar = "◐", peers = new[] { "Sara", "Yassine" } });
        var id = created["id"]!.GetValue<string>();
        var token = created["token"]!.GetValue<string>();
        Assert.Equal($"/#/v/{id}", created["shareUrl"]!.GetValue<string>());
        Assert.False(string.IsNullOrWhiteSpace(token));

        // the room votes: five cold, one warm from the close circle
        for (var i = 0; i < 5; i++) await Vote(client, id, $"device-cold-{i}", GoodVote(receipt: $"cold {i}"));
        await Vote(client, id, "device-warm-1", GoodVote(ring: "inner", receipt: "warm one", warm: true));

        // the subject answers the same instrument: this is the Ego
        var egoSheet = GoodVote(warm: true);
        egoSheet.Remove("receipt");
        var ego = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/ego")
        {
            Content = JsonContent.Create(egoSheet),
            Headers = { { "x-owner-token", token } },
        });
        Assert.Equal(HttpStatusCode.OK, ego.StatusCode);

        // the owner-only portrait: Persona (data) + Ego (claim) + the reading
        var report = await ReadJson(await client.SendAsync(Owned(HttpMethod.Get, $"/api/personas/{id}/portrait", token)));
        var portrait = report["portrait"]!;
        Assert.Equal(6, portrait["n"]!.GetValue<int>());
        Assert.True(portrait["ready"]!.GetValue<bool>());

        var personaWarmth = portrait["persona"]!["warmth"]!.GetValue<double>();
        var egoWarmth = portrait["ego"]!["warmth"]!.GetValue<double>();
        Assert.True(egoWarmth > personaWarmth, "he thinks he is warmer than the room does");
        Assert.Equal(0, portrait["gap"]!.AsObject().Count(kv => kv.Key.Length == 0));

        var analysis = report["analysis"]!;
        Assert.Equal("local", analysis["source"]!.GetValue<string>());
        Assert.False(string.IsNullOrWhiteSpace(analysis["shadow"]!.GetValue<string>()));
        Assert.False(string.IsNullOrWhiteSpace(analysis["verdict"]!.GetValue<string>()));
        Assert.Equal(3, analysis["tags"]!.AsArray().Count);

        // a stranger never sees any of that
        var publicView = await ReadJson(await client.GetAsync($"/api/personas/{id}"));
        Assert.Equal("Ziko", publicView["name"]!.GetValue<string>());
        Assert.Equal(6, publicView["votes"]!.GetValue<int>());
        Assert.True(publicView["hasEgo"]!.GetValue<bool>());
        Assert.Null(publicView["persona"]);
        Assert.Null(publicView["analysis"]);
        Assert.Equal(6, publicView["receipts"]!.AsArray().Count);
    }

    [Fact]
    public async Task Portrait_IsForbiddenWithoutTheOwnerToken()
    {
        var client = factory.CreateClient();
        var created = await Create(client, new { name = "Private Person" });
        var id = created["id"]!.GetValue<string>();

        // The portrait endpoint answers strangers with the locked shape, not a 403...
        var locked = await ReadJson(await client.GetAsync($"/api/personas/{id}/portrait"));
        Assert.True(locked["locked"]!.GetValue<bool>());
        Assert.Null(locked["portrait"]);
        Assert.Null(locked["analysis"]);

        var wrongToken = await ReadJson(await client.SendAsync(Owned(HttpMethod.Get, $"/api/personas/{id}/portrait", "not-the-token")));
        Assert.True(wrongToken["locked"]!.GetValue<bool>());

        // ...while the endpoints that write or reveal a reading stay owner-only.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(Owned(HttpMethod.Post, $"/api/personas/{id}/analyze", "not-the-token"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(Owned(HttpMethod.Get, $"/api/personas/{id}/digest", "not-the-token"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(Owned(HttpMethod.Get, $"/api/personas/{id}/ego", "not-the-token"))).StatusCode);
    }

    [Fact]
    public async Task StrangerGetsTheShapeButNotTheReading()
    {
        var client = factory.CreateClient();
        var created = await Create(client, new { name = "Shape Only" });
        var id = created["id"]!.GetValue<string>();
        await Vote(client, id, "device-shape-1", GoodVote());

        var view = await ReadJson(await client.GetAsync($"/api/personas/{id}/portrait"));
        Assert.True(view["locked"]!.GetValue<bool>());
        Assert.Equal(1, view["votes"]!.GetValue<int>());
        Assert.Null(view["portrait"]);
        Assert.Null(view["analysis"]);
    }

    [Fact]
    public async Task OneDeviceCountsOnce()
    {
        var client = factory.CreateClient();
        var created = await Create(client, new { name = "One Vote Only" });
        var id = created["id"]!.GetValue<string>();

        await Vote(client, id, "device-single", GoodVote());

        var again = new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/votes") { Content = JsonContent.Create(GoodVote()) };
        again.Headers.Add("x-voter-id", "device-single");
        var res = await client.SendAsync(again);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

        var view = await ReadJson(await client.GetAsync($"/api/personas/{id}"));
        Assert.Equal(1, view["votes"]!.GetValue<int>());
    }

    [Fact]
    public async Task BadVote_IsRejectedWithReasons()
    {
        var client = factory.CreateClient();
        var created = await Create(client, new { name = "Validation Target" });
        var id = created["id"]!.GetValue<string>();

        var res = await client.PostAsJsonAsync($"/api/personas/{id}/votes", new { cards = new[] { "wall" } });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var body = JsonNode.Parse(await res.Content.ReadAsStringAsync())!;
        var errors = string.Join(" | ", body["errors"]!.AsArray().Select(n => n!.GetValue<string>()));
        Assert.Contains("dials", errors);
        Assert.Contains("cards", errors);

        var missing = await client.PostAsJsonAsync("/api/personas/doesnotexist/votes", GoodVote());
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task NameIsRequired()
    {
        var res = await factory.CreateClient().PostAsJsonAsync("/api/personas", new { name = "" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task DoorQuestion_LetsStrangersInButWeighsThemLess()
    {
        var client = factory.CreateClient();
        var created = await Create(client, new
        {
            name = "Doorman",
            doorQuestion = "Which street did we grow up on?",
            doorAnswer = "Rue des Écoles",
        });
        var id = created["id"]!.GetValue<string>();
        var token = created["token"]!.GetValue<string>();

        var publicView = await ReadJson(await client.GetAsync($"/api/personas/{id}"));
        Assert.Equal("Which street did we grow up on?", publicView["doorQuestion"]!.GetValue<string>());

        var wrong = GoodVote();
        wrong["doorAnswer"] = "nowhere";
        await Vote(client, id, "device-stranger", wrong);

        var right = GoodVote();
        right["doorAnswer"] = " rue des ecoles! "; // case, accents, spaces and punctuation forgiven
        await Vote(client, id, "device-known", right);

        var report = await ReadJson(await client.SendAsync(Owned(HttpMethod.Get, $"/api/personas/{id}/portrait", token)));
        Assert.Equal(1, report["portrait"]!["rings"]!["outer"]!.GetValue<int>());
        Assert.Equal(1, report["portrait"]!["rings"]!["work"]!.GetValue<int>());
        Assert.True(report["portrait"]!["doorEnabled"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Digest_IsOwnerOnlyAndSmall()
    {
        var client = factory.CreateClient();
        var created = await Create(client, new { name = "Digest Subject" });
        var id = created["id"]!.GetValue<string>();
        var token = created["token"]!.GetValue<string>();
        for (var i = 0; i < 4; i++) await Vote(client, id, $"device-digest-{i}", GoodVote());

        var digest = await ReadJson(await client.SendAsync(Owned(HttpMethod.Get, $"/api/personas/{id}/digest", token)));
        // The digest is exactly what the model is allowed to see: numbers and findings,
        // never the raw receipts of the whole room.
        Assert.Equal(8, digest["axes"]!.AsArray().Count);
        Assert.NotNull(digest["findings"]);
        Assert.Equal(4, digest["probes"]!.AsArray().Count);
        Assert.True(digest["votes"]!.GetValue<int>() >= 4);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/personas/{id}/digest")).StatusCode);
    }

    [Fact]
    public async Task Analyze_FallsBackToTheLocalReadingWithAReason()
    {
        var client = factory.CreateClient();
        var created = await Create(client, new { name = "Offline Analyst" });
        var id = created["id"]!.GetValue<string>();
        var token = created["token"]!.GetValue<string>();
        for (var i = 0; i < 3; i++) await Vote(client, id, $"device-an-{i}", GoodVote());
        var egoSheet = GoodVote(warm: true);
        egoSheet.Remove("receipt");
        await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/ego")
        {
            Content = JsonContent.Create(egoSheet),
            Headers = { { "x-owner-token", token } },
        });

        var body = await ReadJson(await client.SendAsync(Owned(HttpMethod.Post, $"/api/personas/{id}/analyze", token)));
        Assert.Equal("local", body["analysisMeta"]!["source"]!.GetValue<string>());
        Assert.Equal("disabled", body["analysisMeta"]!["reason"]!.GetValue<string>());
        Assert.False(string.IsNullOrWhiteSpace(body["analysis"]!["shadow"]!.GetValue<string>()));

        // the reading is stored: the portrait endpoint now serves it back
        var report = await ReadJson(await client.SendAsync(Owned(HttpMethod.Get, $"/api/personas/{id}/portrait", token)));
        Assert.Equal("local", report["analysis"]!["source"]!.GetValue<string>());
    }

    [Fact]
    public async Task SeededDemoIsReadable()
    {
        var client = factory.CreateClient();
        var demo = await ReadJson(await client.GetAsync("/api/demo"));
        var id = demo["id"]!.GetValue<string>();
        var view = await ReadJson(await client.GetAsync($"/api/personas/{id}"));
        Assert.False(string.IsNullOrWhiteSpace(view["name"]!.GetValue<string>()));
        Assert.True(view["votes"]!.GetValue<int>() >= 20);
        Assert.True(view["hasEgo"]!.GetValue<bool>());
    }

    [Fact]
    public async Task FrontendAndSharedModelAreServed()
    {
        var client = factory.CreateClient();
        var index = await client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, index.StatusCode);
        Assert.Contains("Persona", await index.Content.ReadAsStringAsync());

        var model = await client.GetAsync("/shared/model.js");
        Assert.Equal(HttpStatusCode.OK, model.StatusCode);
        Assert.Contains("export const AXES", await model.Content.ReadAsStringAsync());

        var css = await client.GetAsync("/css/style.css");
        Assert.Equal(HttpStatusCode.OK, css.StatusCode);

        var app = await client.GetAsync("/js/app.js");
        Assert.Equal(HttpStatusCode.OK, app.StatusCode);

        // deep links fall through to the single page app
        var deep = await client.GetAsync("/p/anything");
        Assert.Equal(HttpStatusCode.OK, deep.StatusCode);

        // unknown API paths are JSON 404, never the HTML shell
        var api404 = await client.GetAsync("/api/nope");
        Assert.Equal(HttpStatusCode.NotFound, api404.StatusCode);
    }

    [Fact]
    public async Task InstrumentEndpointMatchesTheSharedModel()
    {
        var client = factory.CreateClient();
        var json = await ReadJson(await client.GetAsync("/api/instrument"));
        Assert.Equal(8, json["axes"]!.AsArray().Count);
        Assert.Equal(6, json["dials"]!.AsArray().Count);
        Assert.Equal(14, json["cards"]!.AsArray().Count);
    }
}
