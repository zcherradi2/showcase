using System.Net;
using System.Text;
using System.Text.Json;
using Xunit;

namespace Persona.Tests;

/// <summary>
/// A stand-in for the FreeLLMAPI router: same OpenAI wire format, no network, no
/// key, no rate limit. It lets the "AI decides" half be tested for real — the
/// request the app sends is parsed, and an answer comes back the way a model's would.
/// </summary>
public sealed class MockLlm : IDisposable
{
    public static readonly Dictionary<string, object> Answer = new()
    {
        ["verdict"] = "The Quiet Operator",
        ["tags"] = new[] { "Engine", "Blade", "Veil" },
        ["persona"] = "The room reads you as the one who fixes things before anyone notices they broke.",
        ["ego"] = "You claim a warmth the room does not report. That is a hope, not a lie.",
        ["shadow"] = "What you hide from yourself is how much the credit matters, while building an identity on not needing it.",
        ["experiment"] = "For seven days, say one sentence out loud when you fix something: \"I handled that.\"",
        ["question"] = "What would you have to admit if the room were right about your candor and wrong about your warmth?",
        ["shadowStrength"] = 0.7,
    };

    private readonly HttpListener listener = new();
    private readonly Thread thread;
    private volatile bool running = true;

    public string BaseUrl { get; }
    public List<string> Requests { get; } = [];
    public string? LastPrompt { get; private set; }
    public string Mode { get; set; } = "ok"; // ok | refuse | garbage

    public MockLlm()
    {
        var port = FreePort();
        BaseUrl = $"http://127.0.0.1:{port}/v1";
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        listener.Start();
        thread = new Thread(Loop) { IsBackground = true };
        thread.Start();
    }

    private static int FreePort()
    {
        using var l = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return port;
    }

    private void Loop()
    {
        while (running)
        {
            HttpListenerContext ctx;
            try
            {
                ctx = listener.GetContext();
            }
            catch
            {
                return;
            }

            _ = Task.Run(() => Handle(ctx));
        }
    }

    private void Handle(HttpListenerContext ctx)
    {
        var path = ctx.Request.Url?.AbsolutePath ?? string.Empty;
        var req = ctx.Request;
        using var reader = new StreamReader(req.InputStream, Encoding.UTF8);
        var body = reader.ReadToEnd();
        lock (Requests) Requests.Add(path);

        string json;
        if (path.EndsWith("/models"))
        {
            json = JsonSerializer.Serialize(new
            {
                @object = "list",
                data = new[] { new { id = "mock/gemini-2.0-flash", @object = "model" } },
            });
        }
        else if (path.EndsWith("/chat/completions") && Mode != "refuse")
        {
            LastPrompt = body;
            var content = Mode == "garbage" ? "this is not json at all" : JsonSerializer.Serialize(Answer);
            json = JsonSerializer.Serialize(new
            {
                id = "chatcmpl-mock",
                @object = "chat.completion",
                model = "mock/gemini-2.0-flash",
                choices = new[] { new { index = 0, message = new { role = "assistant", content }, finish_reason = "stop" } },
                usage = new { prompt_tokens = 900, completion_tokens = 220, total_tokens = 1120 },
            });
        }
        else
        {
            ctx.Response.StatusCode = 500;
            ctx.Response.Close();
            return;
        }

        var bytes = Encoding.UTF8.GetBytes(json);
        ctx.Response.ContentType = "application/json";
        ctx.Response.ContentLength64 = bytes.Length;
        ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
        ctx.Response.OutputStream.Close();
    }

    public void Dispose()
    {
        running = false;
        try
        {
            listener.Stop();
            listener.Close();
        }
        catch
        {
            /* already gone */
        }
    }
}
