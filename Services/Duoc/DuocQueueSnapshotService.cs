using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Data.Entities;
using HangChoKhamBenh.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace HangChoKhamBenh.Web.Services;

// A scoped instance belongs to one HTTP request or one polling/broadcast batch.
// Its lazy task shares the reads across pharmacy channels without caching past
// that scope, so payment updates are read again on the next polling cycle.
public sealed class DuocQueueSnapshotService : IDuocQueueSnapshotService
{
    private static readonly List<int> Warehouses = [1, 2, 3, 13, 14];
    private readonly AppDbContext _context;
    private readonly Lazy<Task<DuocQueueSnapshot>> _snapshot;

    public DuocQueueSnapshotService(AppDbContext context)
    {
        _context = context;
        _snapshot = new(LoadCoreAsync, LazyThreadSafetyMode.ExecutionAndPublication);
    }

    public Task<DuocQueueSnapshot> LoadAsync() => _snapshot.Value;

    internal record Patient(string Mabn, string Name, DateTime? BirthDate, decimal? Gender);
    internal record Document(string? Makh, string? Sohd, decimal? Amount, decimal? Printed, decimal? Paid);
    internal record DailyEntry(string Key, int Warehouse);
    private record Payment(decimal Amount, string Invoice, bool Paid);

    private async Task<DuocQueueSnapshot> LoadCoreAsync()
    {
        var today = DateTime.Today;
        var pending = await _context.HangChoDuocTmd.AsNoTracking()
            .Where(h => h.Xoa == 0 && h.An == 0 && h.Dagiao == 0
                && (h.Ngaynhap == null || h.Ngaynhap >= today) && Warehouses.Contains(h.Khochan))
            .ToListAsync();
        var patientIds = pending.Select(h => h.Mabn).Distinct().ToList();
        var patients = patientIds.Count == 0 ? [] : await _context.DmBenhNhan.AsNoTracking()
            .Where(p => p.Mabn != null && patientIds.Contains(p.Mabn))
            .Select(p => new Patient(p.Mabn!, (p.Holot ?? "") + " " + (p.Ten ?? ""), p.Ngaysinh, p.Gioitinh))
            .ToListAsync();
        var examIds = pending.Where(h => h.Khochan is 13 or 3).Select(h => h.Makb).Distinct().ToList();
        var documents = examIds.Count == 0 ? [] : await _context.ChungTu.AsNoTracking()
            .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Ngaylap >= today && c.Ngaylap < today.AddDays(1)
                && (c.Khochan == "13" || c.Khochan == "3") && c.Makh != null && examIds.Contains(c.Makh))
            .Select(c => new Document(c.Makh, c.Sohd, c.Thanhtien, c.Dain, c.Dathu)).ToListAsync();
        var daily = await _context.HangChoDuocTmd.AsNoTracking()
            .Where(h => h.Xoa == 0 && h.An == 0 && h.Ngaynhap >= today && h.Ngaynhap < today.AddDays(1)
                && Warehouses.Contains(h.Khochan))
            .Select(h => new DailyEntry(h.Makb != "" ? h.Makb : h.Mabn, h.Khochan))
            .Distinct().ToListAsync();
        return Build(pending, patients, documents, daily);
    }

    internal static DuocQueueSnapshot Build(List<HangChoDuocTmd> pending, List<Patient> patients,
        List<Document> documents, List<DailyEntry> daily)
    {
        var patientMap = patients.ToDictionary(p => p.Mabn, StringComparer.OrdinalIgnoreCase);
        var payments = documents.GroupBy(d => d.Makh ?? "", StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g =>
            {
                var invoices = g.GroupBy(d => string.IsNullOrWhiteSpace(d.Sohd) ? g.Key : d.Sohd.Trim()).ToList();
                return new Payment(invoices.Sum(i => i.First().Amount ?? 0),
                    g.FirstOrDefault(d => !string.IsNullOrWhiteSpace(d.Sohd))?.Sohd ?? "",
                    invoices.All(i => i.Any(d => (d.Printed ?? 0) != 0 || (d.Paid ?? 0) != 0)));
            }, StringComparer.OrdinalIgnoreCase);
        var groups = pending.GroupBy(h => string.IsNullOrWhiteSpace(h.Makb) ? h.Mabn.Trim() : h.Makb.Trim())
            .OrderByDescending(g => g.Any(h => !string.IsNullOrWhiteSpace(h.Taikhoan)))
            .ThenByDescending(g => g.Any(h => !string.IsNullOrWhiteSpace(h.Taikhoan))
                ? g.Max(h => h.Ngaygiao) : DateTime.MinValue)
            .ThenBy(g => g.Min(h => h.Ngaynhap)).ThenBy(g => g.Key).ToList();

        DuocQueuePageDto Page(string type)
        {
            var items = new List<DuocQueueItemDto>();
            foreach (var group in groups)
            {
                var bhyt = group.Where(h => h.Khochan is 1 or 2 or 14).ToList();
                var dv = group.Where(h => h.Khochan is 3 or 13).ToList();
                if (type == "bhyt" && bhyt.Count == 0 || type == "dichvu" && dv.Count == 0) continue;
                var first = group.OrderBy(h => h.Ngaynhap).ThenBy(h => h.Macho).First();
                payments.TryGetValue(group.Key, out var payment);
                var paid = payment?.Paid ?? dv.Any(h => h.Dathu == true);
                // Unpaid service prescriptions appear at window 5 immediately on admission.
                // Keep the stored call state separate so displaying a window does not advance a scan.
                var window = dv.Count > 0 && !paid
                    ? DuocScanWorkflow.PaymentWindow : LatestWindow(dv.Count > 0 ? dv : bhyt);
                if (!DuocScanWorkflow.IsVisibleOnDisplay(dv.Count > 0, paid, window)) continue;
                patientMap.TryGetValue(first.Mabn, out var patient);
                var collecting = dv.Count > 0 && !paid;
                var both = bhyt.Count > 0 && dv.Count > 0;
                items.Add(new()
                {
                    Stt = items.Count + 1, Makb = first.Makb, Mabn = first.Mabn,
                    TenBenhNhan = PatientName(patient, group.Key),
                    NamSinh = patient?.BirthDate?.ToString("yyyy") ?? "", GioiTinh = Gender(patient?.Gender),
                    Khochan = collecting ? 13 : both ? 0 : dv.Count > 0 ? 13 : 14,
                    HasBhyt = bhyt.Count > 0, HasDichVu = dv.Count > 0, HasBoth = both,
                    IsBhyt = !collecting && bhyt.Count > 0, DaThu = !collecting, Dagiao = 0,
                    LoaiToa = both ? DuocLoaiToaText.BhytVaDichVu : dv.Count > 0 ? DuocLoaiToaText.DichVu : DuocLoaiToaText.Bhyt,
                    TrangThai = collecting ? DuocTrangThaiText.ChoThuTien : DuocTrangThaiText.DangSoanThuoc,
                    OCua = window, Maba = first.Maba, NgayNhap = first.Ngaynhap,
                    NgayNhapStr = first.Ngaynhap?.ToString("HH:mm") ?? "",
                    SoTien = dv.Count > 0 ? payment?.Amount : null,
                    SoTienStr = dv.Count > 0 ? Money(payment?.Amount) : ""
                });
            }
            var total = daily.Where(d => type == "all" || type == "bhyt" && d.Warehouse is 1 or 2 or 14
                || type == "dichvu" && d.Warehouse is 3 or 13).Select(d => d.Key).Distinct().Count();
            return new()
            {
                DuocType = type,
                Title = type == "all" ? "KHOA DƯỢC - HÀNG CHỜ PHÁT THUỐC"
                    : type == "bhyt" ? "KHOA DƯỢC - HÀNG CHỜ PHÁT THUỐC BẢO HIỂM"
                    : "KHOA DƯỢC - HÀNG CHỜ PHÁT THUỐC DỊCH VỤ",
                TotalWaiting = items.Count, TotalToday = Math.Max(total, items.Count),
                WaitingList = items, NextPatientName = items.FirstOrDefault()?.TenBenhNhan ?? ""
            };
        }

        var input = new List<DuocChuaGiaoItemDto>();
        foreach (var group in groups)
        {
            // The input screen handles the normalized pharmacy warehouses.
            var bhyt = group.Where(h => h.Khochan == 14).ToList();
            var dv = group.Where(h => h.Khochan == 13).ToList();
            if (bhyt.Count == 0 && dv.Count == 0) continue;
            var first = group.OrderBy(h => h.Ngaynhap).ThenBy(h => h.Macho).First();
            patientMap.TryGetValue(first.Mabn, out var patient);
            payments.TryGetValue(group.Key, out var payment);
            var paid = payment?.Paid ?? dv.Any(h => h.Dathu == true);
            DuocChuaGiaoItemDto Item(int warehouse, bool hasBhyt, bool hasDv, bool collected, string window)
                => new()
                {
                    Makb = first.Makb, Mabn = first.Mabn, HoTen = PatientName(patient, group.Key),
                    NamSinh = patient?.BirthDate?.ToString("yyyy") ?? "", GioiTinh = Gender(patient?.Gender),
                    Khochan = warehouse, HasBhyt = hasBhyt, HasDichVu = hasDv, HasBoth = hasBhyt && hasDv,
                    IsBhyt = warehouse != 13, Dagiao = 0, DaThu = collected,
                    TrangThai = collected ? DuocTrangThaiText.DangSoanThuoc : DuocTrangThaiText.ChoThuTien,
                    OCua = window, Maba = first.Maba, Sohd = payment?.Invoice ?? "",
                    NgayNhapStr = first.Ngaynhap?.ToString("HH:mm") ?? "",
                    SoTien = hasDv ? payment?.Amount : null, SoTienStr = hasDv ? Money(payment?.Amount) : ""
                };
            if (bhyt.Count > 0 && dv.Count > 0 && paid) input.Add(Item(0, true, true, true, LatestWindow(dv)));
            else
            {
                if (dv.Count > 0) input.Add(Item(13, bhyt.Count > 0, true, paid, LatestWindow(dv)));
                if (bhyt.Count > 0) input.Add(Item(14, true, false, true, LatestWindow(bhyt)));
            }
        }
        return new() { All = Page("all"), Bhyt = Page("bhyt"), DichVu = Page("dichvu"), Input = input };
    }

    private static string LatestWindow(List<HangChoDuocTmd> rows)
        => rows.OrderByDescending(h => h.Ngaygiao).ThenByDescending(h => h.Macho)
            .FirstOrDefault()?.Taikhoan?.Trim() ?? "";
    private static string PatientName(Patient? patient, string fallback)
        => string.IsNullOrWhiteSpace(patient?.Name) ? fallback : patient.Name.Trim();
    private static string Gender(decimal? value) => value == 1 ? "Nam" : value == 2 ? "Nữ" : "";
    private static string Money(decimal? amount) => amount > 0 ? $"{amount:N0} ₫" : "—";
}
