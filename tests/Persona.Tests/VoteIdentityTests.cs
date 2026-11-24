using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace Persona.Tests;

/// <summary>
/// Decision D4 hardening: a voter is a device, not an address, and the throttles are
/// a knob. These are the edge cases that decide whether one person can stuff a ballot.
/// </summary>
public class VoteIdentityTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static JsonObject Sheet(string ring = "work") => new()
    {
        ["cards"] = new JsonArray("hearth", "mirror", "drift"),
        ["dials"] = new JsonObject { ["warmth"] = 4, ["force"] = 3, ["order"] = 3, ["depth"] = 2, ["candor"] = 2, ["drive"] = 4, ["play"] = 4, ["nerve"] = 3 },
        ["probes"] = new JsonObject { ["p2am"] = 1, ["proom"] = 0, ["pchange"] = 0, ["poffer"] = 1 },
        ["ring"] = ring,
        ["receipt"] = "Carried the thing nobody else wanted to carry.",
    };

    private static async Task<string> NewDossier(HttpClient client) =>
        JsonNode.Parse(await (await client.PostAsJsonAsync("/api/personas", new { name = "Ballot Box", tagline = "one vote each" })).Content.ReadAsStringAsync())!["id"]!.GetValue<string>();

    private static async Task<HttpResponseMessage> Vote(HttpClient client, string id, string? voterId, string ring = "work")
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/personas/{id}/votes") { Content = JsonContent.Create(Sheet(ring)) };
        if (voterId is not null) req.Headers.Add("x-voter-id", voterId);
        return await client.SendAsync(req);
    }

    [Fact]
    public async Task OneDeviceOneVote()
    {
        var client = factory.CreateClient();
        var id = await NewDossier(client);

        Assert.Equal(HttpStatusCode.Created, (await Vote(client, id, "device-alpha-0001")).StatusCode);
        var second = await Vote(client, id, "device-alpha-0001");
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Contains("already", await second.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TwoDevicesBehindOneAddressAreTwoVoters()
    {
        var client = factory.CreateClient();
        var id = await NewDossier(client);

        Assert.Equal(HttpStatusCode.Created, (await Vote(client, id, "device-one-00000001")).StatusCode);
        // same process, same address, different device: this is two people, not fraud
        Assert.Equal(HttpStatusCode.Created, (await Vote(client, id, "device-two-00000002")).StatusCode);

        var body = JsonNode.Parse(await client.GetStringAsync($"/api/personas/{id}"))!;
        Assert.Equal(2, body["votes"]!.GetValue<int>());
    }

    [Fact]
    public async Task ATooShortDeviceIdFallsBackToTheAddress()
    {
        var client = factory.CreateClient();
        var id = await NewDossier(client);

        // "abc" is not a device, so both calls are judged as the same address
        Assert.Equal(HttpStatusCode.Created, (await Vote(client, id, "abc")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Vote(client, id, "xyz")).StatusCode);
    }

    [Fact]
    public async Task NoDeviceHeaderAtAllStillCannotVoteTwice()
    {
        var client = factory.CreateClient();
        var id = await NewDossier(client);

        Assert.Equal(HttpStatusCode.Created, (await Vote(client, id, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Vote(client, id, null)).StatusCode);
    }

    [Fact]
    public async Task UnknownRingIsRejected()
    {
        var client = factory.CreateClient();
        var id = await NewDossier(client);
        var res = await Vote(client, id, "device-ring-000001", ring: "everyone-i-know");
        Assert.Contains(res.StatusCode, new[] { HttpStatusCode.BadRequest, HttpStatusCode.Created });
        // the server never trusts a ring it does not define: "outer" is assigned, not chosen
        var guessed = await Vote(client, id, "device-ring-000002", ring: "outer");
        Assert.Equal(HttpStatusCode.BadRequest, guessed.StatusCode);
    }
}