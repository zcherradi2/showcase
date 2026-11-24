using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Persona.Api.Api;
using Persona.Api.Data;
using Persona.Api.Seeding;
using Persona.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Optional, git-ignored config: persona.config.json next to the solution.
// Decision D19: never in test mode. That file holds a real provider key and a real
// provider list, and letting it into the test host made "the model is down" pass
// because the developer's fallback happened to be running. Tests get their own config.
var isTest = !string.IsNullOrEmpty(builder.Configuration["PERSONA_TEST"])
             || !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PERSONA_TEST"));
if (!isTest)
{
    builder.Configuration.AddJsonFile(Path.Combine(RepoPaths.Root, "persona.config.json"), optional: true, reloadOnChange: true);
}

var dataDir = builder.Configuration["PERSONA_DATA_DIR"]
              ?? Environment.GetEnvironmentVariable("PERSONA_DATA_DIR")
              ?? Path.Combine(RepoPaths.Root, "data");
Directory.CreateDirectory(dataDir);

var dbPath = Path.Combine(dataDir, "persona.db");
builder.Services.AddDbContext<PersonaDbContext>(options => options.UseSqlite($"Data Source={dbPath}"));
builder.Services.AddScoped<PersonaStore>();
builder.Services.AddHttpClient("llm");
builder.Services.AddSingleton<LlmAnalyst>();
// Decision D20: one limiter per host (see Throttle.cs).
builder.Services.AddSingleton<Persona.Api.Api.Throttle>();

if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PERSONA_TEST"))
    && string.IsNullOrEmpty(builder.Configuration["PERSONA_TEST"])
    && string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_URLS"))
    && string.IsNullOrEmpty(builder.Configuration["urls"]))
{
    var port = Environment.GetEnvironmentVariable("PORT") ?? "8130";
    builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
}

// Decision D17: Kestrel refuses oversized requests before they are parsed, and the app
// layer repeats the check so the same limit holds behind any host (TestServer, a
// reverse proxy, a future container). Declared once, used by both.
const long MaxBodyBytes = 256 * 1024;

builder.WebHost.ConfigureKestrel(k =>
{
    k.Limits.MaxRequestBodySize = MaxBodyBytes;
    k.Limits.MaxRequestLineSize = 8 * 1024;
    k.Limits.MaxRequestHeadersTotalSize = 32 * 1024;
    k.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(15);
    k.Limits.KeepAliveTimeout = TimeSpan.FromSeconds(60);
});

var app = builder.Build();

// Decision D17: the same body cap, enforced in the app so it holds under any host.
// Kestrel's limit above is the second line of defence for streamed bodies.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.ContentLength is > MaxBodyBytes)
    {
        ctx.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
        await ctx.Response.WriteAsJsonAsync(new { error = "body too large" });
        return;
    }
    await next();
});

// Everyone behind a proxy: keep the forwarded address, we only hash it.
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor,
});

// Decision D17: security headers on every response. The frontend has no inline event
// handlers, so scripts are locked to 'self'; styles stay inline because the views are
// built from style attributes. frame-ancestors 'none' kills clickjacking of the share
// page, which is the one thing here a stranger could be tricked into clicking.
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["x-content-type-options"] = "nosniff";
    h["referrer-policy"] = "same-origin";
    h["x-frame-options"] = "DENY";
    h["cross-origin-opener-policy"] = "same-origin";
    h["cross-origin-resource-policy"] = "same-origin";
    h["permissions-policy"] = "camera=(), microphone=(), geolocation=(), interest-cohort=()";
    h["content-security-policy"] =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; " +
        "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
    if (ctx.Request.IsHttps) h["strict-transport-security"] = "max-age=31536000; includeSubDomains";
    await next();
});

// The frontend is plain files. No build step, no bundler, no node_modules.
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(RepoPaths.Public),
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers.CacheControl = ctx.File.Name.EndsWith(".html") ? "no-cache" : "public,max-age=60";
    },
});

// The browser imports the same instrument the server scores.
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(RepoPaths.Shared),
    RequestPath = "/shared",
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public,max-age=60",
});

app.MapPersonaApi();

// Anything that is not a file or an API call is the single-page app.
app.MapFallback(async ctx =>
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.StatusCode = 404;
        await ctx.Response.WriteAsJsonAsync(new { error = "not found" });
        return;
    }
    ctx.Response.ContentType = "text/html; charset=utf-8";
    ctx.Response.Headers.CacheControl = "no-cache";
    await ctx.Response.SendFileAsync(Path.Combine(RepoPaths.Public, "index.html"));
});

// Decision D9: EF Core migrations are the schema authority. A dev database that
// predates the current model is rebuilt once from scratch instead of crashing every
// request; migrations keep the real (kept) schema path honest and testable.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PersonaDbContext>();
    try
    {
        await db.Database.MigrateAsync();
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning("schema out of date ({Message}); rebuilding the local database", ex.Message);
        await db.Database.EnsureDeletedAsync();
        await db.Database.MigrateAsync();
    }
    var store = scope.ServiceProvider.GetRequiredService<PersonaStore>();
    await DemoSeeder.EnsureAsync(db, store);
}

app.Logger.LogInformation("Persona on {Urls} · data {Data}", string.Join(",", app.Urls), dbPath);
var cfg = app.Services.GetRequiredService<LlmAnalyst>().Config();
app.Logger.LogInformation("analyst: base={Base} model={Model} key={Key}", cfg.BaseUrl, cfg.Model, string.IsNullOrEmpty(cfg.ApiKey) ? "none" : "set");

app.Run();

/// <summary>The test host needs a public entry point (top-level statements are internal).</summary>
public partial class Program;

/// <summary>Locates public/ and shared/ relative to the built assembly, so the API
/// can be run from bin/, from the project folder, or from the solution root.</summary>
public static class RepoPaths
{
    public static readonly string Root = FindRoot();

    public static readonly string Public = Environment.GetEnvironmentVariable("PERSONA_PUBLIC_DIR")
        ?? Path.Combine(Root, "public");

    public static readonly string Shared = Path.Combine(Root, "shared");

    private static string FindRoot()
    {
        var candidates = new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() };
        foreach (var start in candidates)
        {
            var dir = new DirectoryInfo(start);
            while (dir is not null)
            {
                if (File.Exists(Path.Combine(dir.FullName, "public", "index.html")))
                    return dir.FullName;
                dir = dir.Parent;
            }
        }
        return Directory.GetCurrentDirectory();
    }
}
