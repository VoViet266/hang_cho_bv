using System.Data;
using System.Data.Common;
using System.Reflection;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Data.Entities;
using HangChoKhamBenh.Web.Models;
using HangChoKhamBenh.Web.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;

internal static class QueueChecks
{
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
        Console.WriteLine($"PASS {message}");
    }

    public static async Task RunAsync()
    {
        var first = Entry("FIRST", "3", 8);
        var recent = Entry("RECENT", "3", 9);
        var uncalled = Entry("UNCALLED", null, 12);
        // A new admission or payment detection cannot displace someone just called.
        recent.Ngaythu = DateTime.Today.AddHours(15);
        Check(Snapshot(first, uncalled, recent).All.WaitingList.Select(i => i.Makb)
            .SequenceEqual(["FIRST", "RECENT", "UNCALLED"]),
            "Display shows the earlier scan/call first; uncalled admissions stay behind calls");
        first.Ngaytao = DateTime.Today.AddHours(10);
        Check(Snapshot(first, recent, uncalled).All.WaitingList[0].Makb == "RECENT",
            "Calling again uses the new call time without jumping ahead of earlier calls");
        var mixed = Entry("RECENT", null, 16);
        mixed.Khochan = 14;
        Check(Snapshot(recent, first, mixed).All.WaitingList[0].Makb == "RECENT",
            "An uncalled row of a mixed prescription does not change its call priority");
        var waitingEarly = Entry("EARLY", null, 7);
        Check(Snapshot(uncalled, waitingEarly).All.WaitingList[0].Makb == "EARLY",
            "Uncalled service prescriptions retain admission order");
        var tiedFirst = Entry("TIED-FIRST", "3", 11);
        var tiedSecond = Entry("TIED-SECOND", "3", 11);
        tiedFirst.Macho = 1;
        tiedSecond.Macho = 2;
        Check(Snapshot(tiedSecond, tiedFirst).All.WaitingList[0].Makb == "TIED-FIRST",
            "Matching call timestamps preserve the earlier entry first");

        var commands = new FakeCommands();
        using var context = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=unused;Username=unused")
            .AddInterceptors(new SuppressConnection(), commands).Options);
        var service = new DuocNhapService(context, NullLogger<DuocNhapService>.Instance,
            new DuocQueueSnapshotService(context));
        var result = await service.RecallAsync(new() { Makb = "EXAM", Mabn = "PATIENT", Khochan = 14, OCua = "3" });
        Check(result.Success, "Recall succeeds against an insurance prescription already called to window 3");
        Check(commands.LastSet.Contains("ngaytao") && !commands.LastSet.Contains("dagiao")
            && !commands.LastSet.Contains("ngaygiao") && !commands.LastSet.Contains("ngaythu"),
            "Recall persists call time without changing dispensing, delivery or payment state");
        Check(await service.AnAsync("EXAM", "PATIENT") && !commands.LastSet.Contains("ngay"),
            "Hiding preserves every lifecycle timestamp");
        Check(await service.BoAnAsync("EXAM", "PATIENT") && !commands.LastSet.Contains("ngay"),
            "Restoring visibility preserves every lifecycle timestamp");
        Check(await service.HoanTacAsync("EXAM", "PATIENT") && commands.LastSet.Contains("ngaytao = NULL")
            && commands.LastSet.Contains("ngaygiao = NULL") && commands.LastSet.Contains("ngayhoanthanh = NULL")
            && !commands.LastSet.Contains("ngaynhap") && !commands.LastSet.Contains("ngaythu"),
            "Undo clears call/delivery/completion while preserving admission and payment times");
        Check(await service.KhongMuaAsync("EXAM", "PATIENT") && commands.LastSet.Contains("ngayhoanthanh")
            && commands.LastSet.Contains("ngaygiao = NULL") && !commands.LastSet.Contains("ngaytao"),
            "Declining service closes processing without recording a delivery or a new call");
        Check(await service.CapNhatTrangThaiAsync(new() { Makb = "EXAM", Mabn = "PATIENT", Khochan = 14, TargetDagiao = 1 })
            && commands.LastSet.Contains("ngaygiao") && commands.LastSet.Contains("ngayhoanthanh"),
            "Dispensing records delivery and completion timestamps");
        var call = await service.ChiDinhOCuaAsync(new() { Makb = "EXAM", Mabn = "PATIENT", Khochan = 14, OCua = "3", HoTen = "Test", NamSinh = "2000" });
        Check(call.Success && commands.LastSet.Contains("ngaytao") && !commands.LastSet.Contains("ngaygiao"),
            "Assigning a pickup window records a call without recording delivery");

        var admissionCommands = new FakeCommands { NoExisting = true };
        using var admissionContext = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=unused;Username=unused")
            .AddInterceptors(new SuppressConnection(), admissionCommands, new SuppressSave()).Options);
        var admissionService = new DuocNhapService(admissionContext, NullLogger<DuocNhapService>.Instance,
            new DuocQueueSnapshotService(admissionContext));
        var admission = (Task)typeof(DuocNhapService).GetMethod("UpsertHangChoAsync", BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(admissionService, ["EXAM", "PATIENT", new DuocNhapThemRequest(), DateTime.Today, 13, new List<int> { 13 }, true, true])!;
        await admission;
        var admitted = admissionContext.ChangeTracker.Entries<HangChoDuocTmd>().Single().Entity;
        Check(admitted.Ngaynhap != null && admitted.Ngaythu != null && admitted.Ngaytao == null
            && admitted.Ngaygiao == null && admitted.Ngayhoanthanh == null
            && admissionContext.Model.FindEntityType(typeof(HangChoDuocTmd))!.FindProperty(nameof(HangChoDuocTmd.Ngaytao))!
                .ValueGenerated == Microsoft.EntityFrameworkCore.Metadata.ValueGenerated.Never,
            "Admission records intake/payment but explicitly leaves call/delivery/completion empty");
    }

    private static HangChoDuocTmd Entry(string exam, string? window, int hour) => new()
    {
        Makb = exam, Mabn = exam, Khochan = window == "3" ? 14 : 13,
        Ngaynhap = DateTime.Today.AddHours(hour), Ngaytao = DateTime.Today.AddHours(hour),
        Taikhoan = window
    };

    private static DuocQueueSnapshot Snapshot(params HangChoDuocTmd[] entries)
    {
        var type = typeof(DuocQueueSnapshotService);
        object EmptyRows(string name) => Activator.CreateInstance(typeof(List<>)
            .MakeGenericType(type.GetNestedType(name, BindingFlags.NonPublic)!))!;
        return (DuocQueueSnapshot)type.GetMethod("Build", BindingFlags.Static | BindingFlags.NonPublic)!
            .Invoke(null, [entries.ToList(), EmptyRows("Patient"), EmptyRows("Document"), EmptyRows("DailyEntry")])!;
    }

    // Exercise EF's real SQL translation without a network connection or database writes.
    private sealed class SuppressConnection : DbConnectionInterceptor
    {
        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection,
            ConnectionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default)
            => ValueTask.FromResult(InterceptionResult.Suppress());
    }

    private sealed class SuppressSave : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
            => ValueTask.FromResult(InterceptionResult<int>.SuppressWithResult(1));
    }

    private sealed class FakeCommands : DbCommandInterceptor
    {
        public string LastSet { get; private set; } = "";
        public bool NoExisting { get; init; }

        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            LastSet = command.CommandText.Split("SET ")[1].Split("\nWHERE")[0];
            return ValueTask.FromResult(InterceptionResult<int>.SuppressWithResult(1));
        }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            var table = new DataTable();
            if (command.CommandText.Contains("hangchoduoc_tmd"))
            {
                table.Columns.Add("khochan", typeof(int));
                table.Columns.Add("taikhoan", typeof(string));
                if (!NoExisting) table.Rows.Add(14, "3");
            }
            else if (command.CommandText.Contains("dmbenhnhan"))
            {
                table.Columns.Add("mabn", typeof(string));
                table.Columns.Add("holot", typeof(string));
                table.Columns.Add("ten", typeof(string));
                table.Columns.Add("ngaysinh", typeof(DateTime));
                table.Columns.Add("gioitinh", typeof(decimal));
                table.Rows.Add("PATIENT", "Test", "Patient", new DateTime(2000, 1, 1), 1m);
            }
            else throw new InvalidOperationException("Unexpected database read: " + command.CommandText);
            return ValueTask.FromResult(InterceptionResult<DbDataReader>.SuppressWithResult(table.CreateDataReader()));
        }
    }
}
