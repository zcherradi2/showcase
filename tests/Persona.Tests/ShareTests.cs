using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace Persona.Tests;

/// <summary>
/// Decision D11: a share link is public and shows the room's side only. The Ego, the
/// gap and the Shadow stay the subject's business; these tests fail loudly if any of
/// them ever leaks into the public projection.
/// </summary>
public class ShareTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly string[] Forbidden =
        ["ego", "gap", "shadow", "findings", "timeline", "theses", "selfKnowledge", "coherence"];

    private static JsonObject Sheet => new()
    {
        ["cards"] = new JsonArray("hearth", "mirror", "drift"),
        ["dials"] = new JsonObject
        {
            ["warmth"] = 4, ["force"] = 3, ["order"] = 3, ["depth"] = 2,
            ["candor"] = 2, ["drive"] = 4, ["play"] = 4, ["nerve"] = 3,
        },
        ["probes"] = new JsonObject { ["p2am"] = 1, ["proom"] = 0, ["pchange"] = 0, ["poffer"] = 1 },
        ["ring"] = "work",
        ["receipt"] = "Answered a message at 3am and made it sound like a pleasure.",
    };

    // A dossier with four voters and a subject: enough for a ready portrait.
    private async Task<string> Live(HttpClient client)
    {
        var created = JsonNode.Parse(await (await client.PostAsJsonAsync("/api/personas", new { name = "Share Test", tagline = "reads the room" })).Content.ReadAsStringAsync())!;
        var id = created["id"]!.GetValue<string>();
        var token = created["token"]!.GetValue<string>();

        foreach (var (ring, i) in new[] { "inner", "family", "work", "online" }.Select((r, i) => (r, i)))
        {
            var body = Sheet;
            body["ring"] = ring;
            var req = new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/votes")
            {
                Content = JsonContent.Create(body),
            };
            req.Headers.Add("x-voter-id", $"share-device-{i}-xxxx");
            var res = await client.SendAsync(req);
            Assert.True(res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());
        }

        var ego = new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/ego") { Content = JsonContent.Create(Sheet) };
        ego.Headers.Add("x-owner-token", token);
        var egoRes = await client.SendAsync(ego);
        Assert.True(egoRes.IsSuccessStatusCode, await egoRes.Content.ReadAsStringAsync());
        return id;
    }

    [Fact]
    public async Task Share_IsPublicAndCarriesOnlyTheRoomsSide()
    {
        var client = factory.CreateClient();
        var id = await Live(client);

        var res = await client.GetAsync($"/api/personas/{id}/portrait?view=share");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = JsonNode.Parse(await res.Content.ReadAsStringAsync())!;

        Assert.True(body["share"]!.GetValue<bool>());
        Assert.Equal(4, body["portrait"]!["n"]!.GetValue<int>());
        Assert.NotNull(body["portrait"]!["persona"]);
        Assert.NotNull(body["analysis"]!["verdict"]);

        foreach (var key in Forbidden)
        {
            Assert.True(body[key] is null, $"the public payload leaked '{key}'");
            Assert.True(body["portrait"]![key] is null, $"the public portrait leaked '{key}'");
        }
    }

    [Fact]
    public async Task Share_KeepsTheReadingButNotTheShadow()
    {
        var client = factory.CreateClient();
        var id = await Live(client);

        var body = JsonNode.Parse(await client.GetStringAsync($"/api/personas/{id}/portrait?view=share"))!;
        Assert.False(string.IsNullOrWhiteSpace(body["analysis"]!["persona"]!.GetValue<string>()));
        Assert.False(string.IsNullOrWhiteSpace(body["analysis"]!["caveat"]!.GetValue<string>()));
        Assert.True(body["analysis"]!["shadow"] is null, "the shadow must never reach a share link");
    }
}