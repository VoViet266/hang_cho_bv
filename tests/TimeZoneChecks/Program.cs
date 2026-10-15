using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Helpers;
using Microsoft.EntityFrameworkCore;
using Npgsql;

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
    Console.WriteLine($"PASS {message}");
}

// Reproduce a deployment host that starts in UTC, including a cached local zone.
var originalZone = Environment.GetEnvironmentVariable("TZ");
try
{
    Environment.SetEnvironmentVariable("TZ", "UTC");
    TimeZoneInfo.ClearCachedData();
    Check(TimeZoneInfo.Local.GetUtcOffset(DateTime.UtcNow) == TimeSpan.Zero,
        "Test starts with a UTC host timezone");

    DateTimeHelper.ConfigureTimeZone();
    Check(TimeZoneInfo.Local.GetUtcOffset(DateTime.UtcNow) == TimeSpan.FromHours(7),
        "Startup overrides the cached host timezone with Vietnam UTC+7");
    Check(Math.Abs((DateTime.Now - DateTime.UtcNow).TotalHours - 7) < 0.001,
        "DateTime.Now records Vietnam wall-clock time");

    var beforeMidnight = new DateTime(2026, 10, 15, 16, 59, 59, DateTimeKind.Utc);
    var atMidnight = new DateTime(2026, 10, 15, 17, 0, 0, DateTimeKind.Utc);
    Check(beforeMidnight.ToLocalTime() == new DateTime(2026, 10, 15, 23, 59, 59),
        "Daily filters stay on October 15 before Vietnam midnight");
    Check(atMidnight.ToLocalTime() == new DateTime(2026, 10, 16),
        "Daily filters roll over at Vietnam midnight, seven hours before UTC");
    Check(atMidnight.ToLocalTime().ToUniversalTime() == atMidnight,
        "Timezone-aware timestamps preserve their instant without adding seven hours twice");

    foreach (var raw in new[]
    {
        "Host=localhost;Database=queue;Username=test;Password=placeholder",
        "Host=localhost;Database=queue;Username=test;Password=placeholder;Timezone=UTC",
        "postgresql://test:placeholder@localhost:5432/queue?schema=current",
        "postgres://test:placeholder@localhost:5432/queue?schema=current"
    })
    {
        var parsed = new NpgsqlConnectionStringBuilder(
            NpgsqlConnectionFactory.ConvertToNpgsqlConnectionString(raw));
        Check(parsed.Timezone == DateTimeHelper.VietnamTimeZoneId
            && parsed.Host == "localhost" && parsed.Database == "queue"
            && parsed.Username == "test" && parsed.Password == "placeholder",
            "Database sessions use Vietnam timezone while preserving connection settings");
    }

    AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
    var connectionString = NpgsqlConnectionFactory.ConvertToNpgsqlConnectionString(
        "Host=localhost;Database=queue;Username=test;Password=placeholder;Timezone=UTC");
    using var context = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
        .UseNpgsql(connectionString).Options);
    var sql = context.HangChoDuocTmd.Select(h => new
    {
        CallTime = DateTime.Now,
        PaymentTime = h.Ngaythu ?? DateTime.Now,
        CompletionTime = DateTime.Now,
        Today = DateTime.Today
    }).ToQueryString();
    Check(sql.Contains("now()") && sql.Contains("date_trunc('day'"),
        "EF timestamps and day boundaries execute using the configured database session");
    await QueueChecks.RunAsync();
}
finally
{
    Environment.SetEnvironmentVariable("TZ", originalZone);
    TimeZoneInfo.ClearCachedData();
}
