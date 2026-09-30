using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Data.Entities;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{

    public class DuocNhapService(AppDbContext context, ILogger<DuocNhapService> logger) : IDuocNhapService
    {
        private readonly AppDbContext _context = context;
        private readonly ILogger<DuocNhapService> _logger = logger;

        // ===== Constants =====
        private static readonly string[] KhoDv   = ["13"];
        private static readonly string[] KhoBhyt = ["14"];
        private static readonly int[] HcBhyt = [14];
        private static readonly int[] HcDv   = [13];
        private static readonly int[] HcAll  = [14, 13];

        // ===== Inner types =====
        private record CtRow(string? Makh, string? Mabn, string? Sohd, string? Khochan, decimal? Thanhtien);
        private record HangChoRow(string? Makb, string? Mabn, int Khochan, decimal Dagiao, bool? Dathu,
                                  string? Maba, DateTime? Ngaynhap, DateTime? Ngaygiao, string? Taikhoan);
        private record PatientInfo(string Mabn, string Holot, string Ten, DateTime? Ngaysinh, decimal? Gioitinh);
        private record CtInfo(decimal TotalTien, string Sohd, bool DaThu);
        private record PatientGroup(
            string? Makb, string? Mabn, bool HasBhyt, bool HasDv, decimal Dagiao, bool DvDathu,
            string Taikhoan, string OcuaBhyt, string OcuaDv, string Maba,
            DateTime? Ngaynhap, DateTime? Ngaygiao, string HoTen, DateTime? Ngaysinh, decimal? Gioitinh)
        {
            public bool HasBoth    => HasBhyt && HasDv;
            public int  Khochan    => HasBoth ? 0 : HasDv ? 13 : 14;
            public string NamSinh  => Ngaysinh?.ToString("yyyy") ?? "";
            public string GioiTinhStr => Gioitinh == 1 ? "Nam" : Gioitinh == 2 ? "Nữ" : "";
        }
        private enum HangChoState { Moi, KichHoat, DaCo }

        // ===== Static helpers =====
        private static string Money(decimal v, string empty) => v > 0 ? $"{v:N0} ₫" : empty;
        private static string FirstNonEmpty(IEnumerable<string?> items)
            => items.FirstOrDefault(s => !string.IsNullOrEmpty(s)) ?? "";

        // ===== Query helpers =====
        private IQueryable<ChungTu> TodayCt(DateTime today)
            => _context.ChungTu.AsNoTracking()
                .Where(c => (c.Xoa == null || c.Xoa == 0)
                         && c.Ngaylap >= today && c.Ngaylap < today.AddDays(1));

        private IQueryable<HangChoDuocTmd> HangChoQuery()
            => _context.HangChoDuocTmd.AsNoTracking().Where(h => h.Xoa == 0);

        private static Task<List<HangChoRow>> ToRowsAsync(IQueryable<HangChoDuocTmd> q)
            => q.Select(h => new HangChoRow(h.Makb, h.Mabn, h.Khochan, h.Dagiao, h.Dathu,
                                            h.Maba, h.Ngaynhap, h.Ngaygiao, h.Taikhoan))
                .ToListAsync();

        // Tạo filter SQL WHERE khớp makb/mabn cho ngày hôm nay
        private static string KhoFilter(int? khochan) => khochan switch
        {
            14 => "AND khochan = 14",
            13 => "AND khochan = 13",
            _  => ""
        };

        public async Task<DuocNhapBarcodeResultDto> ScanAsync(string? makh, string? makb = null)
        {
            var code = (!string.IsNullOrWhiteSpace(makh) ? makh : makb)
                ?.Replace("\r", "").Replace("\n", "").Replace("\t", "").Trim();

            if (string.IsNullOrEmpty(code))
                return new() { Success = false, Message = "Vui lòng nhập mã khám (makh) hoặc mã bệnh nhân." };

            try
            {
                var today = DateTime.Today;

                var ctList = await TodayCt(today)
                    .Where(c => c.Makh == code || c.Mabn == code || c.Sohd == code)
                    .Select(c => new CtRow(c.Makh, c.Mabn, c.Sohd, c.Khochan, c.Thanhtien))
                    .ToListAsync();

                if (ctList.Count == 0)
                    return new() { Success = false, Message = $"Không tìm thấy đơn thuốc hôm nay với mã '{code}'." };

                // Gộp tất cả đơn hôm nay của bệnh nhân
                var mabn = ctList.FirstOrDefault(c => !string.IsNullOrEmpty(c.Mabn))?.Mabn ?? "";
                if (!string.IsNullOrEmpty(mabn))
                {
                    var all = await TodayCt(today)
                        .Where(c => c.Mabn == mabn)
                        .Select(c => new CtRow(c.Makh, c.Mabn, c.Sohd, c.Khochan, c.Thanhtien))
                        .ToListAsync();
                    ctList = [.. ctList.Concat(all)
                        .DistinctBy(c => $"{c.Makh}_{c.Sohd}_{c.Khochan}", StringComparer.OrdinalIgnoreCase)];
                }

                var actualMakh = ctList.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c.Makh))?.Makh;

                // Thông tin bệnh nhân
                string hoTen = "", ngaySinh = "", gioiTinh = "";
                DateTime? ngayKcb = null;

                if (mabn != "")
                {
                    var bn = await _context.DmBenhNhan.AsNoTracking()
                        .Where(b => b.Mabn == mabn)
                        .Select(b => new { b.Holot, b.Ten, b.Ngaysinh, b.Gioitinh })
                        .FirstOrDefaultAsync();

                    if (bn != null)
                    {
                        hoTen    = $"{bn.Holot} {bn.Ten}".Trim();
                        ngaySinh = bn.Ngaysinh?.ToString("dd/MM/yyyy") ?? "";
                        gioiTinh = bn.Gioitinh switch { 1 => "Nam", 2 => "Nữ", _ => "" };
                    }

                    ngayKcb = await _context.KhamBenh.AsNoTracking()
                        .Where(k => (k.Xoa == null || k.Xoa == 0) && (k.Makb == actualMakh || k.Mabn == mabn))
                        .OrderByDescending(k => k.Makb == actualMakh).ThenByDescending(k => k.Ngaykcb)
                        .Select(k => k.Ngaykcb)
                        .FirstOrDefaultAsync();
                }

                if (string.IsNullOrEmpty(hoTen)) hoTen = actualMakh!;
                ngayKcb ??= DateTime.Now;

                var dvItems   = ctList.Where(c => KhoDv.Contains(c.Khochan?.Trim())).ToList();
                var bhytItems = ctList.Where(c => KhoBhyt.Contains(c.Khochan?.Trim())).ToList();
                ///để phân biệt xem có đơn BHYT không
                var hasBhyt = bhytItems.Count > 0;
                ///để phân biệt xem có đơn DV không
                var hasDv   = dvItems.Count > 0;

                static string First(IEnumerable<CtRow> items, Func<CtRow, string?> sel)
                    => items.Select(sel).FirstOrDefault(s => !string.IsNullOrEmpty(s)) ?? "";

                var sohdBhyt = First(bhytItems, c => c.Sohd);
                var sohdDv   = First(dvItems,   c => c.Sohd);
                var tongTien = dvItems
                    .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : (c.Makh ?? ""))
                    .Sum(g => g.First().Thanhtien ?? 0);

                return new DuocNhapBarcodeResultDto
                {
                    Success = true,
                    Loai = hasBhyt && hasDv ? 0 : hasDv ? 13 : 14,
                    HasBhyt = hasBhyt, HasDichVu = hasDv,
                    Makh = actualMakh, Makb = actualMakh, Mabn = mabn,
                    HoTen = hoTen, NgaySinh = ngaySinh, GioiTinh = gioiTinh,
                    NgayKcb = ngayKcb,
                    Sohd = sohdBhyt != "" ? sohdBhyt : sohdDv,
                    SohdBhyt = sohdBhyt, SohdDv = sohdDv,
                    Thanhtien = tongTien
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi scan code={Code}", code);
                return new() { Success = false, Message = "Lỗi hệ thống khi tra cứu: " + ex.Message };
            }
        }

        // ===== UpsertHangChoAsync =====
        /// <summary>Thêm mới / kích hoạt lại / làm mới 1 dòng hàng chờ dược</summary>
        private async Task<HangChoState> UpsertHangChoAsync(
            string makb, string mabn, DuocNhapThemRequest req, DateTime? ngayKcb, DateTime today,
            int khoInsert, int[] khoMatch, bool dathu, bool updateDathu)
        {
            var existing = await _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => (h.Makb == makb || h.Mabn == mabn)
                         && khoMatch.Contains(h.Khochan) && h.Xoa == 0
                         && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today))
                .OrderByDescending(h => h.Makb == makb).ThenByDescending(h => h.Ngaynhap)
                .Select(h => new { h.Dagiao })
                .FirstOrDefaultAsync();

            if (existing == null)
            {
                await _context.Database.ExecuteSqlInterpolatedAsync($@"
                    INSERT INTO current.hangchoduoc_tmd
                        (mabn, makb, ngaynhap, ngaygiao, taikhoan, khochan, xoa, ngaykcb, maba, dagiao, dathu)
                    VALUES
                        ({mabn}, {makb}, now(), now(), {req.OCua}, {khoInsert}, 0, {ngayKcb}, {req.Maba}, 0, {dathu})");
                return HangChoState.Moi;
            }

            bool kichHoat = existing.Dagiao == 1 || existing.Dagiao == 3;
            await _context.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE current.hangchoduoc_tmd
                SET dagiao   = CASE WHEN {kichHoat} THEN 1 ELSE 0 END,
                    ngaygiao = now(), ngaynhap = now(),
                    taikhoan = COALESCE({req.OCua}, taikhoan),
                    dathu    = CASE WHEN {updateDathu} THEN {dathu} ELSE dathu END,
                    xoa      = 0
                WHERE (makb = {makb} OR mabn = {mabn}) AND khochan = ANY({khoMatch})");

            return kichHoat ? HangChoState.KichHoat : HangChoState.DaCo;
        }

        // ===== ThemHangChoAsync =====
        public async Task<DuocNhapThemResponse> ThemHangChoAsync(DuocNhapThemRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            if (makb == "" && mabn == "")
                return new() { Success = false, Message = "Thiếu mã khám hoặc mã bệnh nhân." };

            if (makb == "") makb = mabn;
            if (mabn == "") mabn = makb;

            try
            {
                var ngayKcb = req.NgayKcb ?? DateTime.Now;
                var today   = DateTime.Today;
                bool addBhyt = req.HasBhyt == true;
                bool addDv   = req.HasDichVu == true;
                var messages = new List<string>();

                if (addBhyt)
                {
                    var st = await UpsertHangChoAsync(makb, mabn, req, ngayKcb, today,
                        khoInsert: 14, khoMatch: [14], dathu: true, updateDathu: false);
                    messages.Add(st switch
                    {
                        HangChoState.Moi      => "Toa BHYT -> Chờ phát",
                        HangChoState.KichHoat => "Kích hoạt lại BHYT -> Chờ phát",
                        _                     => "BHYT (Đã có trong hàng chờ)"
                    });
                }

                if (addDv)
                {
                    bool isPaid = await _context.ChungTu.AsNoTracking()
                        .AnyAsync(c => (c.Xoa == null || c.Xoa == 0)
                                    && KhoDv.Contains(c.Khochan ?? "")
                                    && (c.Makh == makb || c.Mabn == mabn)
                                    && ((c.Dain ?? 0) != 0 || (c.Dathu ?? 0) != 0)
                                    && c.Ngaylap >= today && c.Ngaylap < today.AddDays(1));

                    var st = await UpsertHangChoAsync(makb, mabn, req, ngayKcb, today,
                        khoInsert: 13, khoMatch: [13, 3], dathu: isPaid, updateDathu: true);

                    var tt = isPaid ? "Chờ phát" : "Chưa thu";
                    messages.Add(st switch
                    {
                        HangChoState.Moi      => $"Toa Dịch vụ -> {tt}",
                        HangChoState.KichHoat => $"Kích hoạt lại Dịch vụ -> {tt}",
                        _                     => $"Dịch vụ ({tt})"
                    });
                }

                return new DuocNhapThemResponse
                {
                    Success = true, Action = "them", Dagiao = 0,
                    Khochan = addBhyt && addDv ? 0 : addDv ? 13 : 14,
                    OCua = req.OCua,
                    Message = $"Đã tiếp nhận: {string.Join(", ", messages)}."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi thêm/cập nhật hàng chờ dược makb={Makb}, mabn={Mabn}", req.Makb, req.Mabn);
                return new() { Success = false, Message = "Lỗi hệ thống: " + ex.Message };
            }
        }

        // ===== Data loading helpers =====
        private async Task<Dictionary<string, PatientInfo>> LoadPatientInfoAsync(IEnumerable<string?> mabns)
        {
            var dict = new Dictionary<string, PatientInfo>(StringComparer.OrdinalIgnoreCase);
            var ids = mabns.Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!)
                           .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (ids.Count == 0) return dict;

            var list = await _context.DmBenhNhan.AsNoTracking()
                .Where(b => b.Mabn != null && ids.Contains(b.Mabn))
                .Select(b => new PatientInfo(b.Mabn!, b.Holot ?? "", b.Ten ?? "", b.Ngaysinh, b.Gioitinh))
                .ToListAsync();

            foreach (var p in list) dict[p.Mabn] = p;
            return dict;
        }

        private async Task<Dictionary<string, CtInfo>> LoadChungTuInfoAsync(IEnumerable<PatientGroup> groups)
        {
            var result = new Dictionary<string, CtInfo>(StringComparer.OrdinalIgnoreCase);

            static List<string> Clean(IEnumerable<string?> xs) => xs
                .Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            var makhs = Clean(groups.Select(g => g.Makb));
            var mabns = Clean(groups.Select(g => g.Mabn));
            if (makhs.Count == 0 && mabns.Count == 0) return result;

            var today = DateTime.Today;
            var ctList = await _context.ChungTu.AsNoTracking()
                .Where(c => (c.Xoa == null || c.Xoa == 0)
                         && KhoDv.Contains(c.Khochan ?? "")
                         && c.Ngaylap >= today && c.Ngaylap < today.AddDays(1)
                         && ((c.Makh != null && makhs.Contains(c.Makh))
                          || (c.Mabn != null && mabns.Contains(c.Mabn))))
                .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Thanhtien, c.Dain, c.Dathu })
                .ToListAsync();

            static bool Eq(string? a, string key)
                => !string.IsNullOrEmpty(a) && string.Equals(a.Trim(), key, StringComparison.OrdinalIgnoreCase);

            foreach (var key in makhs.Concat(mabns).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var matched = ctList.Where(c => Eq(c.Makh, key) || Eq(c.Mabn, key)).ToList();
                if (matched.Count == 0) continue;

                var distinct = matched
                    .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : (c.Makh ?? ""))
                    .Select(g => g.First()).ToList();

                result[key] = new CtInfo(
                    TotalTien: distinct.Sum(c => c.Thanhtien ?? 0),
                    Sohd: FirstNonEmpty(matched.Select(c => c.Sohd)) is { Length: > 0 } s ? s : matched[0].Sohd ?? "",
                    DaThu: distinct.Any(c => (c.Dain ?? 0) != 0 || (c.Dathu ?? 0) != 0));
            }
            return result;
        }

        private static CtInfo? FindInfo(Dictionary<string, CtInfo> map, PatientGroup g)
        {
            foreach (var k in new[] { g.Makb, g.Mabn })
            {
                var key = k?.Trim();
                if (!string.IsNullOrEmpty(key) && map.TryGetValue(key, out var info)) return info;
            }
            return null;
        }

        /// <summary>Gom các dòng hàng chờ theo bệnh nhân và gắn thông tin</summary>
        private async Task<List<PatientGroup>> BuildGroupsAsync(List<HangChoRow> rows)
        {
            var bnDict = await LoadPatientInfoAsync(rows.Select(r => r.Mabn));

            return rows
                .GroupBy(r => !string.IsNullOrWhiteSpace(r.Makb) ? r.Makb.Trim() : r.Mabn?.Trim() ?? "")
                .Select(g =>
                {
                    var first = g.First();
                    bnDict.TryGetValue(first.Mabn ?? "", out var bn);
                    var name = $"{bn?.Holot} {bn?.Ten}".Trim();
                    var bhyt = g.Where(x => HcBhyt.Contains(x.Khochan)).ToList();
                    var dv   = g.Where(x => HcDv.Contains(x.Khochan)).ToList();

                    return new PatientGroup(
                        Makb: first.Makb, Mabn: first.Mabn,
                        HasBhyt: bhyt.Count > 0, HasDv: dv.Count > 0,
                        Dagiao: g.Max(x => x.Dagiao),
                        DvDathu: dv.Any(x => x.Dathu == true),
                        Taikhoan: FirstNonEmpty(g.Select(x => x.Taikhoan)),
                        OcuaBhyt: bhyt.FirstOrDefault()?.Taikhoan ?? "",
                        OcuaDv:   dv.FirstOrDefault()?.Taikhoan ?? "",
                        Maba: FirstNonEmpty(g.Select(x => x.Maba)),
                        Ngaynhap: first.Ngaynhap,
                        Ngaygiao: g.Max(x => x.Ngaygiao),
                        HoTen: name != "" ? name : (first.Makb ?? first.Mabn ?? ""),
                        Ngaysinh: bn?.Ngaysinh, Gioitinh: bn?.Gioitinh);
                })
                .ToList();
        }

        // ===== 1. Danh sách chưa giao =====
        public async Task<List<DuocChuaGiaoItemDto>> LayDanhSachChuaGiaoAsync()
        {
            var today = DateTime.Today;
            var rows = await ToRowsAsync(HangChoQuery()
                .Where(h => (h.Ngaynhap == null || h.Ngaynhap >= today) && h.Dagiao == 0 && HcAll.Contains(h.Khochan))
                .OrderBy(h => h.Ngaynhap).ThenBy(h => h.Makb).ThenBy(h => h.Mabn));

            var groups = (await BuildGroupsAsync(rows))
                .OrderByDescending(x => !string.IsNullOrWhiteSpace(x.Taikhoan))
                .ThenByDescending(x => !string.IsNullOrWhiteSpace(x.Taikhoan) ? x.Ngaygiao ?? DateTime.MinValue : DateTime.MinValue)
                .ThenBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                .ThenBy(x => x.Makb).ThenBy(x => x.Mabn)
                .ToList();

            var infoMap = await LoadChungTuInfoAsync(groups.Where(g => g.HasDv));
            var result  = new List<DuocChuaGiaoItemDto>();

            foreach (var g in groups)
            {
                var info = g.HasDv ? FindInfo(infoMap, g) : null;
                var sohd      = info?.Sohd ?? "";
                var soTien    = info?.TotalTien;
                var soTienStr = g.HasDv ? Money(info?.TotalTien ?? 0, "—") : "";
                var dvPaid    = info?.DaThu ?? g.DvDathu;

                DuocChuaGiaoItemDto Item(int kho, bool hasBhyt, bool hasDv, bool daThu, decimal? tien, string tienStr, string oCua)
                    => new()
                    {
                        Makb = g.Makb ?? "", Mabn = g.Mabn ?? "",
                        HoTen = g.HoTen, NamSinh = g.NamSinh, GioiTinh = g.GioiTinhStr,
                        Khochan = kho, HasBhyt = hasBhyt, HasDichVu = hasDv,
                        HasBoth = hasBhyt && hasDv, IsBhyt = kho != 13,
                        Dagiao = g.Dagiao, DaThu = daThu,
                        TrangThai = daThu ? "Đang soạn" : "Chờ thu",
                        SoTien = tien, SoTienStr = tienStr, Sohd = sohd,
                        Maba = g.Maba, NgayNhapStr = g.Ngaynhap?.ToString("HH:mm") ?? "", OCua = oCua
                    };

                if (g.HasBoth)
                {
                    if (!dvPaid)
                    {
                        result.Add(Item(13, true, true,  false, soTien, soTienStr, g.OcuaDv));
                        result.Add(Item(14, true, false, true,  null,   "",         g.OcuaBhyt));
                    }
                    else
                    {
                        var oCua = g.OcuaBhyt != "" ? g.OcuaBhyt : g.OcuaDv;
                        result.Add(Item(0, true, true, true, soTien, soTienStr, oCua));
                    }
                }
                else if (g.HasBhyt)
                    result.Add(Item(14, true, false, true, null, "", g.OcuaBhyt));
                else
                    result.Add(Item(13, false, true, dvPaid, soTien, soTienStr, g.OcuaDv));
            }

            return result;
        }

        // ===== 2. Lịch sử phát thuốc hôm nay =====
        public async Task<List<DuocDaGiaoItemDto>> LayDanhSachDaGiaoAsync()
        {
            var today = DateTime.Today;
            var rows = await ToRowsAsync(HangChoQuery()
                .Where(h => (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today)
                         && h.Dagiao >= 1 && HcAll.Contains(h.Khochan))
                .OrderByDescending(h => h.Ngaygiao).Take(80));

            var groups  = (await BuildGroupsAsync(rows)).OrderByDescending(x => x.Ngaygiao).ToList();
            var infoMap = await LoadChungTuInfoAsync(groups.Where(g => g.HasDv));

            return groups.Select(g =>
            {
                var info = FindInfo(infoMap, g);
                return new DuocDaGiaoItemDto
                {
                    Makb = g.Makb ?? "", Mabn = g.Mabn ?? "",
                    HoTen = g.HoTen, NamSinh = g.NamSinh, GioiTinh = g.GioiTinhStr,
                    Khochan = g.Khochan, HasBhyt = g.HasBhyt, HasDichVu = g.HasDv,
                    HasBoth = g.HasBoth, IsBhyt = g.Khochan == 14, Dagiao = g.Dagiao,
                    SoTienStr = info != null ? Money(info.TotalTien, "") : "",
                    Sohd = info?.Sohd ?? "", Maba = "",
                    NgayGiaoStr = g.Ngaygiao?.ToString("HH:mm") ?? "", OCua = g.Taikhoan
                };
            }).ToList();
        }

        // ===== 3. Khách không mua thuốc =====
        public async Task<List<DuocChuaGiaoItemDto>> LayDanhSachKhongMuaAsync()
        {
            var today = DateTime.Today;
            var rows = await ToRowsAsync(HangChoQuery()
                .Where(h => (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today) && h.Dagiao == 3)
                .OrderByDescending(h => h.Ngaygiao).Take(80));

            var groups  = (await BuildGroupsAsync(rows)).OrderByDescending(x => x.Ngaygiao).ToList();
            var infoMap = await LoadChungTuInfoAsync(groups);

            return [.. groups.Select(g =>
            {
                var info = FindInfo(infoMap, g);
                return new DuocChuaGiaoItemDto
                {
                    Makb = g.Makb ?? "", Mabn = g.Mabn ?? "",
                    HoTen = g.HoTen, NamSinh = g.NamSinh, GioiTinh = g.GioiTinhStr,
                    Khochan = g.Khochan, HasBhyt = g.HasBhyt, HasDichVu = g.HasDv,
                    HasBoth = g.HasBoth, IsBhyt = false, Dagiao = g.Dagiao,
                    TrangThai = "Không mua",
                    SoTien = info?.TotalTien,
                    SoTienStr = info != null ? Money(info.TotalTien, "—") : "—",
                    Sohd = info?.Sohd ?? "", Maba = "",
                    NgayNhapStr = g.Ngaygiao?.ToString("HH:mm") ?? "", OCua = g.Taikhoan
                };
            })];
        }

        // ===== CapNhatTrangThaiAsync =====
        public async Task<bool> CapNhatTrangThaiAsync(DuocCapNhatTrangThaiRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            if (string.IsNullOrEmpty(makb) && string.IsNullOrEmpty(mabn)) return false;

            var oCua  = req.OCua?.Trim();
            var today = DateTime.Today;
            var khoSql = KhoFilter(req.Khochan);

            var rows = await _context.Database.ExecuteSqlRawAsync($@"
                UPDATE current.hangchoduoc_tmd
                SET dagiao = @p0, ngaygiao = now(), taikhoan = COALESCE(@p1, taikhoan)
                WHERE ((@p2 <> '' AND makb = @p2) OR (@p3 <> '' AND mabn = @p3))
                  {khoSql}
                  AND xoa = 0
                  AND (ngaynhap IS NULL OR ngaynhap >= @p4)",
                req.TargetDagiao, oCua, makb, mabn, today);

            return rows > 0;
        }

        // ===== ChiDinhOCuaAsync =====
        public async Task<(bool Success, string HoTen, string NamSinh, string OCua)> ChiDinhOCuaAsync(DuocCapNhatTrangThaiRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            if (string.IsNullOrEmpty(makb) && string.IsNullOrEmpty(mabn)) return (false, "", "", "");

            var oCua   = req.OCua?.Trim() ?? "";
            var today  = DateTime.Today;
            var khoSql = KhoFilter(req.Khochan);

            var rows = await _context.Database.ExecuteSqlRawAsync($@"
                UPDATE current.hangchoduoc_tmd
                SET taikhoan = @p0, ngaygiao = now()
                WHERE ((@p1 <> '' AND makb = @p1) OR (@p2 <> '' AND mabn = @p2))
                  {khoSql}
                  AND xoa = 0
                  AND (ngaynhap IS NULL OR ngaynhap >= @p3)",
                oCua, makb, mabn, today);

            var hoTen   = req.HoTen?.Trim() ?? "";
            var namSinh = req.NamSinh?.Trim() ?? "";

            if ((string.IsNullOrEmpty(hoTen) || string.IsNullOrEmpty(namSinh)) && !string.IsNullOrEmpty(mabn))
            {
                var bn = await _context.DmBenhNhan.AsNoTracking()
                    .Where(b => b.Mabn == mabn)
                    .Select(b => new { b.Holot, b.Ten, b.Ngaysinh })
                    .FirstOrDefaultAsync();
                if (bn != null)
                {
                    if (string.IsNullOrEmpty(hoTen)) hoTen = $"{bn.Holot} {bn.Ten}".Trim();
                    if (string.IsNullOrEmpty(namSinh) && bn.Ngaysinh.HasValue) namSinh = bn.Ngaysinh.Value.ToString("yyyy");
                }
            }

            return (rows > 0, hoTen, namSinh, oCua);
        }

        // ===== HoanTacAsync =====
        public async Task<bool> HoanTacAsync(string makb, string mabn)
        {
            var cleanMakb = makb.Trim();
            var cleanMabn = mabn.Trim();
            if (string.IsNullOrEmpty(cleanMakb) && string.IsNullOrEmpty(cleanMabn)) return false;

            var today = DateTime.Today;
            var rows = await _context.Database.ExecuteSqlRawAsync(@"
                UPDATE current.hangchoduoc_tmd
                SET dagiao = 0, ngaygiao = now(), ngaynhap = now()
                WHERE ((@p0 <> '' AND makb = @p0) OR (@p1 <> '' AND mabn = @p1))
                  AND xoa = 0
                  AND (ngaynhap IS NULL OR ngaynhap >= @p2 OR ngaygiao >= @p2)",
                cleanMakb, cleanMabn, today);

            return rows > 0;
        }

        // ===== KhongMuaAsync =====
        public async Task<bool> KhongMuaAsync(string makb, string mabn)
        {
            var cleanMakb = makb.Trim();
            var cleanMabn = mabn.Trim();
            if (string.IsNullOrEmpty(cleanMakb) && string.IsNullOrEmpty(cleanMabn)) return false;

            var today = DateTime.Today;
            var hasDv = await _context.HangChoDuocTmd.AsNoTracking()
                .AnyAsync(h => ((!string.IsNullOrEmpty(cleanMakb) && h.Makb == cleanMakb)
                             || (!string.IsNullOrEmpty(cleanMabn) && h.Mabn == cleanMabn))
                            && (h.Khochan == 13 || h.Khochan == 3)
                            && h.Xoa == 0
                            && (h.Ngaynhap == null || h.Ngaynhap >= today));

            int rows;
            if (hasDv)
            {
                rows = await _context.Database.ExecuteSqlAsync($@"
                    UPDATE current.hangchoduoc_tmd
                    SET dagiao = 3, ngaygiao = now()
                    WHERE (({cleanMakb} <> '' AND makb = {cleanMakb}) OR ({cleanMabn} <> '' AND mabn = {cleanMabn}))
                      AND (khochan = 13 OR khochan = 3)
                      AND xoa = 0
                      AND (ngaynhap IS NULL OR ngaynhap >= {today})");
            }
            else
            {
                rows = await _context.Database.ExecuteSqlAsync($@"
                    UPDATE current.hangchoduoc_tmd
                    SET dagiao = 3, ngaygiao = now()
                    WHERE (({cleanMakb} <> '' AND makb = {cleanMakb}) OR ({cleanMabn} <> '' AND mabn = {cleanMabn}))
                      AND xoa = 0
                      AND (ngaynhap IS NULL OR ngaynhap >= {today})");
            }

            return rows > 0;
        }
    }
}
