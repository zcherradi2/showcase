using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Persona.Tests;

/// <summary>
/// Decision D25: failover is only real if a provider FAILING mid-chain still ends in a
/// reading. These tests make the primary refuse, and make every provider refuse, and
/// assert the product still answers with something a person can read.
/// </summary>
public class FailoverTests(WebApplicationFactoryFixture fixture) : IClassFixture<WebApplicationFactoryFixture>
{
    private HttpClient Client(WebApplicationFactoryFixture f, string primary, string fallbacks = "") =>
        f.Client(primary, throttle: false, fallbacks: fallbacks);

    private static async Task<JsonNode> Body(HttpResponseMessage r) =>
        JsonNode.Parse(await r.Content.ReadAsStringAsync())!;

    [Fact]
    public async Task PrimaryProviderError_FallsOverToTheNextProvider()
    {
        using var broken = new MockLlm { Mode = "refuse" };   // primary: HTTP 500
        using var healthy = new MockLlm();                     // fallback: answers
        using var client = fixture.Client(broken.BaseUrl, throttle: false, fallbacks: $"http://127.0.0.1:{new Uri(healthy.BaseUrl).Port}/v1");

        var (id, token) = await WebApplicationFactoryFixture.LiveDossier(client);
        var body = await Body(await client.SendAsync(WebApplicationFactoryFixture.Owned(
            HttpMethod.Post, $"/api/personas/{id}/analyze", token)));

        Assert.True(body["ok"]!.GetValue<bool>());
        // The point: a 500 from the first provider is not the end of the reading.
        // The healthy provider answers; the label records that it was reached via the
        // chain ("llm-local-fallback"). What matters is that a model answered at all.
        var source = body["analysis"]!["source"]!.GetValue<string>();
        Assert.StartsWith("llm", source);
        Assert.NotEqual("local", source);
        Assert.False(string.IsNullOrWhiteSpace(body["analysis"]!["shadow"]!.GetValue<string>()));
        Assert.NotEmpty(healthy.Requests);   // the fallback was actually used
    }

    [Fact]
    public async Task EveryProviderDown_StillReturnsAReadableReading()
    {
        using var broken = new MockLlm { Mode = "refuse" };
        using var alsoBroken = new MockLlm { Mode = "refuse" };
        using var client = fixture.Client(broken.BaseUrl, throttle: false, fallbacks: $"http://127.0.0.1:{new Uri(alsoBroken.BaseUrl).Port}/v1");

        var (id, token) = await WebApplicationFactoryFixture.LiveDossier(client);
        var body = await Body(await client.SendAsync(WebApplicationFactoryFixture.Owned(
            HttpMethod.Post, $"/api/personas/{id}/analyze", token)));

        Assert.True(body["ok"]!.GetValue<bool>());
        Assert.Equal("local", body["analysis"]!["source"]!.GetValue<string>());
        var shadow = body["analysis"]!["shadow"]!.GetValue<string>();
        Assert.False(string.IsNullOrWhiteSpace(shadow), "a failed model must not mean an empty page");
        Assert.True(shadow.Length > 60, $"the local reading is too thin to ship: {shadow}");
        // and the reason survives, so an operator can see why
        var reason = body["analysisMeta"]?["reason"]?.GetValue<string>() ?? "";
        Assert.Contains("500", reason);
    }
}
