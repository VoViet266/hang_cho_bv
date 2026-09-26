using System.Diagnostics;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Hubs;
using HangChoKhamBenh.Web.Services;
using Microsoft.EntityFrameworkCore;
using Serilog;

AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

var builder = WebApplication.CreateBuilder(args);

// Cấu hình Serilog: Lọc sạch log SQL thô của DB, làm nổi bật cấu trúc SignalR và ứng dụng
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    // Lọc bỏ toàn bộ câu lệnh SQL thô của EF Core (tránh spam 45.000 dòng log DB)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", Serilog.Events.LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore", Serilog.Events.LogEventLevel.Warning)
    // Lọc bỏ log chẩn đoán nội bộ của ASP.NET
    .MinimumLevel.Override("Microsoft.AspNetCore.Hosting.Diagnostics", Serilog.Events.LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore.Routing", Serilog.Events.LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore.Mvc", Serilog.Events.LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore.StaticFiles", Serilog.Events.LogEventLevel.Warning)
    // Bật log SignalR rõ ràng, chuẩn cấu trúc
    .MinimumLevel.Override("Microsoft.AspNetCore.SignalR", Serilog.Events.LogEventLevel.Information)
    .MinimumLevel.Override("Microsoft.AspNetCore.Http.Connections", Serilog.Events.LogEventLevel.Information)
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
    .WriteTo.File(
        path: Path.Combine("logs", "hangcho-.log"),
        rollingInterval: RollingInterval.Day,
        flushToDiskInterval: TimeSpan.FromSeconds(1),
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
    .CreateLogger();

builder.Host.UseSerilog();

// Add services
builder.Services.AddControllersWithViews();
builder.Services.AddSignalR();
builder.Services.AddHttpClient("TTS");

// Data & Business Services
var rawDbConn = builder.Configuration.GetConnectionString("DefaultConnection") 
              ?? builder.Configuration["DATABASE_URL"] 
              ?? string.Empty;
var npgsqlConnString = NpgsqlConnectionFactory.ConvertToNpgsqlConnectionString(rawDbConn);

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseNpgsql(npgsqlConnString);
});
builder.Services.AddSingleton<IDbConnectionFactory, NpgsqlConnectionFactory>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IClinicService, ClinicService>();
builder.Services.AddScoped<ICdhaService, CdhaService>();
builder.Services.AddScoped<IDuocService, DuocService>();
builder.Services.AddScoped<IDuocNhapService, DuocNhapService>();
builder.Services.AddSingleton<ITtsService, TtsService>();

// Realtime & Background Services
builder.Services.AddSingleton<IActiveRoomTracker, ActiveRoomTracker>();
builder.Services.AddSingleton<IQueueRealtimeBroadcaster, QueueRealtimeBroadcaster>();
builder.Services.AddHostedService<QueuePollingBackgroundService>();

var app = builder.Build();

// Static files (phục vụ trước middleware log để tránh spam log)
app.UseStaticFiles();

// Request logging middleware (tương tự app.js trong Express)
app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? "";
    var isStatic = path.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ||
                   path.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) ||
                   path.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase) ||
                   path.EndsWith(".ico", StringComparison.OrdinalIgnoreCase) ||
                   path.EndsWith(".js", StringComparison.OrdinalIgnoreCase) ||
                   path.EndsWith(".css", StringComparison.OrdinalIgnoreCase) ||
                   path.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase);

    if (context.Request.Method == "HEAD" && (path == "/" || path == "/health"))
    {
        context.Response.StatusCode = StatusCodes.Status200OK;
        return;
    }

    if (context.Request.Method == "HEAD" || isStatic || path == "/favicon.ico")
    {
        await next();
        return;
    }

    var sw = Stopwatch.StartNew();
    var clientIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    if (context.Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded))
    {
        var first = forwarded.ToString().Split(',')[0].Trim();
        if (!string.IsNullOrEmpty(first)) clientIp = first;
    }
    clientIp = clientIp.Replace("::ffff:", "");
    if (clientIp == "::1") clientIp = "127.0.0.1";

    await next();

    sw.Stop();
    var ms = sw.Elapsed.TotalMilliseconds;
    Log.Information("[{ClientIp}] HTTP {Method} {Path} responded {StatusCode} in {Elapsed:F4} ms",
        clientIp, context.Request.Method, path, context.Response.StatusCode, ms);
});

app.UseRouting();

// Health check endpoint
app.MapMethods("/health", ["GET", "HEAD"], () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Map SignalR Hub
app.MapHub<QueueHub>("/queueHub");

// Map Controllers
app.MapControllers();

// Fallback short-url handler cho /1, /2, /A1, v.v.
app.MapFallbackToController("HandleShortUrl", "View");

var port = Environment.GetEnvironmentVariable("PORT") ?? builder.Configuration["PORT"] ?? "5000";
if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
    app.Urls.Add($"http://0.0.0.0:{port}");
}

Log.Information("HangChoKhamBenh .NET Server running on port {Port}", port);

app.Run();
