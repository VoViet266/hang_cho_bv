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
        private static readonly string[] KhoDv = ["13"];
        private static readonly string[] KhoBhyt = ["14"];
        private static readonly int[] HcBhyt = [14];
        private static readonly int[] HcDv = [13];
        private static readonly int[] HcAll = [14, 13];

        // ===== Inner types =====
        private record CtRow(string? Makh, string? Mabn, string? Sohd, string? Khochan, decimal? Thanhtien, DateTime? Ngaylap);
        private record HangChoRow(string? Makb, string? Mabn, int Khochan, decimal Dagiao, bool? Dathu,
                                  string? Maba, DateTime? Ngaynhap, DateTime? Ngaygiao, string? Taikhoan);
        private record PatientInfo(string Mabn, string Holot, string Ten, DateTime? Ngaysinh, decimal? Gioitinh);
        private record CtInfo(decimal TotalTien, string Sohd, bool DaThu);
        private record PatientGroup(
            string? Makb, string? Mabn, bool HasBhyt, bool HasDv, decimal Dagiao, bool DvDathu,
            string Taikhoan, string OcuaBhyt, string OcuaDv, string Maba,
            DateTime? Ngaynhap, DateTime? Ngaygiao, string HoTen, DateTime? Ngaysinh, decimal? Gioitinh)
        {
            public bool HasBoth => HasBhyt && HasDv;
            public int Khochan => HasBoth ? 0 : HasDv ? 13 : 14;
            public string NamSinh => Ngaysinh?.ToString("yyyy") ?? "";
            public string GioiTinhStr => Gioitinh == 1 ? "Nam" : Gioitinh == 2 ? "Nữ" : "";
        }

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
            => _context.HangChoDuocTmd.AsNoTracking().Where(h => h.Xoa == 0 && h.An == 0);

        private static Task<List<HangChoRow>> ToRowsAsync(IQueryable<HangChoDuocTmd> q)
            => q.Select(h => new HangChoRow(h.Makb, h.Mabn, h.Khochan, h.Dagiao, h.Dathu,
                                            h.Maba, h.Ngaynhap, h.Ngaygiao, h.Taikhoan))
                .ToListAsync();

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
                    .Where(c => (c.Makh == code || c.Mabn == code || c.Sohd == code)
                             && (c.Khochan == "13" || c.Khochan == "14"))
                    .Select(c => new CtRow(c.Makh, c.Mabn, c.Sohd, c.Khochan, c.Thanhtien, c.Ngaylap))
                    .ToListAsync();

                if (ctList.Count == 0)
                    return new() { Success = false, Message = $"Không tìm thấy đơn thuốc hôm nay với mã '{code}'." };

                // Mỗi mã khám là một lượt nhận thuốc. Mã bệnh nhân chỉ dùng để tìm
                // lượt khám mới nhất, không gộp các toa đã phát ở lượt khám khác.
                var selected = ctList
                    .Where(c => c.Makh == code || c.Sohd == code)
                    .OrderByDescending(c => c.Makh == code)
                    .ThenByDescending(c => c.Ngaylap)
                    .FirstOrDefault()
                    ?? ctList.OrderByDescending(c => c.Ngaylap).ThenByDescending(c => c.Makh).First();
                var actualMakh = selected.Makh?.Trim();
                if (string.IsNullOrEmpty(actualMakh))
                    return new() { Success = false, Message = "Chứng từ không có mã khám; không thể xác định lượt nhận thuốc." };

                ctList = await TodayCt(today)
                    .Where(c => c.Makh == actualMakh && (c.Khochan == "13" || c.Khochan == "14"))
                    .Select(c => new CtRow(c.Makh, c.Mabn, c.Sohd, c.Khochan, c.Thanhtien, c.Ngaylap))
                    .ToListAsync();
                ctList = [.. ctList.DistinctBy(c => $"{c.Makh}_{c.Sohd}_{c.Khochan}", StringComparer.OrdinalIgnoreCase)];
                var mabn = ctList.FirstOrDefault(c => !string.IsNullOrEmpty(c.Mabn))?.Mabn ?? "";

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
                        hoTen = $"{bn.Holot} {bn.Ten}".Trim();
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

                var dvItems = ctList.Where(c => KhoDv.Contains(c.Khochan?.Trim())).ToList();
                var bhytItems = ctList.Where(c => KhoBhyt.Contains(c.Khochan?.Trim())).ToList();
                ///để phân biệt xem có đơn BHYT không
                var hasBhyt = bhytItems.Count > 0;
                ///để phân biệt xem có đơn DV không
                var hasDv = dvItems.Count > 0;

                static string First(IEnumerable<CtRow> items, Func<CtRow, string?> sel)
                    => items.Select(sel).FirstOrDefault(s => !string.IsNullOrEmpty(s)) ?? "";

                var sohdBhyt = First(bhytItems, c => c.Sohd);
                var sohdDv = First(dvItems, c => c.Sohd);
                var tongTien = dvItems
                    .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : (c.Makh ?? ""))
                    .Sum(g => g.First().Thanhtien ?? 0);

                return new DuocNhapBarcodeResultDto
                {
                    Success = true,
                    Loai = hasBhyt && hasDv ? 0 : hasDv ? 13 : 14,
                    HasBhyt = hasBhyt,
                    HasDichVu = hasDv,
                    Makh = actualMakh,
                    Makb = actualMakh,
                    Mabn = mabn,
                    HoTen = hoTen,
                    NgaySinh = ngaySinh,
                    GioiTinh = gioiTinh,
                    NgayKcb = ngayKcb,
                    Sohd = sohdBhyt != "" ? sohdBhyt : sohdDv,
                    SohdBhyt = sohdBhyt,
                    SohdDv = sohdDv,
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
        private enum QueueUpsertResult { Added, Waiting, Completed }

        /// <summary>Tiếp nhận toa của đúng lượt khám và giữ nguyên lượt đã xử lý.</summary>
        private async Task<QueueUpsertResult> UpsertHangChoAsync(
            string makb, string mabn, DuocNhapThemRequest req, DateTime? ngayKcb,
            int khoInsert, int[] khoMatch, bool dathu, bool updateDathu)
        {
            var existing = await _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Makb == makb && h.Mabn == mabn && khoMatch.Contains(h.Khochan))
                .Select(h => new { h.Dagiao, h.Khochan })
                .FirstOrDefaultAsync();

            var now = DateTime.Now;
            var oCuaStr = req.OCua?.Trim();

            if (existing == null)
            {
                await _context.HangChoDuocTmd.AddAsync(new HangChoDuocTmd
                {
                    Mabn = mabn,
                    Makb = makb,
                    Ngaynhap = now,
                    Ngaygiao = now,
                    Taikhoan = req.OCua,
                    Khochan = khoInsert,
                    Xoa = 0,
                    Ngaykcb = ngayKcb,
                    Maba = req.Maba,
                    Dagiao = (decimal)DuocTrangThaiGiao.ChoPhat,
                    Dathu = dathu,
                    An = 0
                });
                await _context.SaveChangesAsync();
                return QueueUpsertResult.Added;
            }

            if (existing.Dagiao != (decimal)DuocTrangThaiGiao.ChoPhat)
                return QueueUpsertResult.Completed;

            var updateQuery = _context.HangChoDuocTmd
                .Where(h => h.Makb == makb && h.Mabn == mabn && h.Khochan == existing.Khochan
                         && h.Dagiao == (decimal)DuocTrangThaiGiao.ChoPhat);

            await updateQuery.ExecuteUpdateAsync(setter => setter
                .SetProperty(h => h.Taikhoan, h => !string.IsNullOrEmpty(oCuaStr) ? oCuaStr : h.Taikhoan)
                .SetProperty(h => h.Dathu, h => updateDathu ? dathu : h.Dathu)
            );
            return QueueUpsertResult.Waiting;
        }

        // ===== ThemHangChoAsync =====
        public async Task<DuocNhapThemResponse> ThemHangChoAsync(DuocNhapThemRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            if (makb == "")
                return new() { Success = false, Message = "Thiếu mã khám để xác định lượt nhận thuốc." };

            try
            {
                var today = DateTime.Today;
                // Xác nhận lại theo chứng từ thay vì tin các cờ từ trình duyệt.
                var scan = await ScanAsync(makb);
                if (!scan.Success || scan.Makb != makb || (mabn != "" && scan.Mabn != mabn))
                    return new() { Success = false, Message = scan.Success ? "Mã khám và mã bệnh nhân không khớp." : scan.Message };
                mabn = scan.Mabn ?? "";
                if (mabn == "")
                    return new() { Success = false, Message = "Chứng từ không có mã bệnh nhân." };

                var ngayKcb = scan.NgayKcb ?? DateTime.Now;
                bool addBhyt = scan.HasBhyt;
                bool addDv = scan.HasDichVu;
                var results = new List<QueueUpsertResult>();
                await using var transaction = await _context.Database.BeginTransactionAsync();

                if (addBhyt)
                {
                    results.Add(await UpsertHangChoAsync(makb, mabn, req, ngayKcb,
                        khoInsert: 14, khoMatch: [14], dathu: true, updateDathu: false));
                }

                if (addDv)
                {
                    var dvDocs = await _context.ChungTu.AsNoTracking()
                        .Where(c => (c.Xoa == null || c.Xoa == 0)
                                 && KhoDv.Contains(c.Khochan ?? "") && c.Makh == makb
                                 && c.Ngaylap >= today && c.Ngaylap < today.AddDays(1))
                        .Select(c => new { c.Sohd, c.Dain, c.Dathu })
                        .ToListAsync();
                    bool isPaid = dvDocs.Count > 0 && dvDocs
                        .GroupBy(c => string.IsNullOrWhiteSpace(c.Sohd) ? makb : c.Sohd.Trim())
                        .All(g => g.Any(c => (c.Dain ?? 0) != 0 || (c.Dathu ?? 0) != 0));

                    results.Add(await UpsertHangChoAsync(makb, mabn, req, ngayKcb,
                        khoInsert: 13, khoMatch: [13, 3], dathu: isPaid, updateDathu: true));
                }

                if (results.Count == 0)
                    return new() { Success = false, Message = "Lượt khám này không có toa thuốc BHYT hoặc dịch vụ." };

                var action = results.Contains(QueueUpsertResult.Added) ? "them"
                    : results.Contains(QueueUpsertResult.Waiting) ? "da-co-trong-hang-cho" : "da-xu-ly";
                await transaction.CommitAsync();

                return new DuocNhapThemResponse
                {
                    Success = true,
                    Action = action,
                    Dagiao = 0,
                    Khochan = addBhyt && addDv ? 0 : addDv ? 13 : 14,
                    OCua = req.OCua,
                    Message = action switch
                    {
                        "them" => "Đã tiếp nhận toa của lượt khám này vào hàng chờ.",
                        "da-co-trong-hang-cho" => "Toa của lượt khám này đã có trong hàng chờ.",
                        _ => "Toa của lượt khám này đã được xử lý; không tạo hàng chờ mới."
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi thêm/cập nhật hàng chờ dược makb={Makb}, mabn={Mabn}", req.Makb, req.Mabn);
                return new() { Success = false, Message = "Lỗi hệ thống: " + ex.Message };
            }
        }

        // Quét lại chỉ phát toa còn chờ của đúng lượt khám, đã chọn ô và đã thu tiền nếu là dịch vụ.
        public async Task<DuocBarcodeDispenseResponse> PhatTheoMaQuetAsync(DuocBarcodeDispenseRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            if (makb == "" || mabn == "")
                return new() { Action = "thieu-ma", Message = "Thiếu mã khám hoặc mã bệnh nhân." };

            try
            {
                var today = DateTime.Today;
                var windows = new[] { "1", "2", "3", "4", "5" };
                var pending = await _context.HangChoDuocTmd.AsNoTracking()
                    .Where(h => h.Makb == makb && h.Mabn == mabn && h.Xoa == 0 && h.An == 0
                             && h.Ngaynhap >= today && h.Dagiao == (decimal)DuocTrangThaiGiao.ChoPhat
                             && (h.Khochan == 13 || h.Khochan == 14))
                    .Select(h => new { h.Khochan, h.Taikhoan })
                    .ToListAsync();

                if (pending.Count == 0)
                    return new() { Action = "khong-con-cho", Message = "Lượt khám này không còn toa chờ phát." };

                var assigned = pending.Where(h => windows.Contains(h.Taikhoan?.Trim())).ToList();
                if (assigned.Count == 0)
                    return new() { Action = "chua-chon-o", Message = "Toa đang chờ; hãy chọn ô phát thuốc trước khi quét lại." };

                var dvPaid = false;
                if (assigned.Any(h => h.Khochan == 13))
                {
                    var dvDocs = await _context.ChungTu.AsNoTracking()
                        .Where(c => (c.Xoa == null || c.Xoa == 0)
                                 && KhoDv.Contains(c.Khochan ?? "") && c.Makh == makb
                                 && c.Ngaylap >= today && c.Ngaylap < today.AddDays(1))
                        .Select(c => new { c.Sohd, c.Dain, c.Dathu })
                        .ToListAsync();
                    dvPaid = dvDocs.Count > 0 && dvDocs
                        .GroupBy(c => string.IsNullOrWhiteSpace(c.Sohd) ? makb : c.Sohd.Trim())
                        .All(g => g.Any(c => (c.Dain ?? 0) != 0 || (c.Dathu ?? 0) != 0));
                }

                var eligibleKho = assigned
                    .Where(h => h.Khochan == 14 || (h.Khochan == 13 && dvPaid))
                    .Select(h => h.Khochan).Distinct().ToArray();
                if (eligibleKho.Length == 0)
                    return new() { Action = "chua-thu-tien", Message = "Toa dịch vụ chưa thu đủ tiền; chưa thể xác nhận đã phát." };

                var now = DateTime.Now;
                var updated = await _context.HangChoDuocTmd
                    .Where(h => h.Makb == makb && h.Mabn == mabn && h.Xoa == 0 && h.An == 0
                             && h.Ngaynhap >= today && h.Dagiao == (decimal)DuocTrangThaiGiao.ChoPhat
                             && eligibleKho.Contains(h.Khochan) && h.Taikhoan != null
                             && windows.Contains(h.Taikhoan.Trim()))
                    .ExecuteUpdateAsync(setter => setter
                        .SetProperty(h => h.Dagiao, (decimal)DuocTrangThaiGiao.DaPhat)
                        .SetProperty(h => h.Ngaygiao, now));

                if (updated == 0)
                    return new() { Action = "khong-con-cho", Message = "Toa vừa được xử lý ở nơi khác; danh sách sẽ được cập nhật." };

                return new()
                {
                    Success = true,
                    Action = "da-phat",
                    Message = updated < pending.Count
                        ? "Đã phát toa đủ điều kiện. Toa còn lại vẫn ở hàng chờ."
                        : "Đã xác nhận phát thuốc bằng mã quét."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi phát thuốc bằng mã quét makb={Makb}, mabn={Mabn}", makb, mabn);
                return new() { Action = "loi", Message = "Lỗi hệ thống khi xác nhận phát thuốc." };
            }
        }

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
            if (makhs.Count == 0) return result;

            var today = DateTime.Today;
            var ctList = await _context.ChungTu.AsNoTracking()
                .Where(c => (c.Xoa == null || c.Xoa == 0)
                         && KhoDv.Contains(c.Khochan ?? "")
                         && c.Ngaylap >= today && c.Ngaylap < today.AddDays(1)
                         && c.Makh != null && makhs.Contains(c.Makh))
                .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Thanhtien, c.Dain, c.Dathu })
                .ToListAsync();

            static bool Eq(string? a, string key)
                => !string.IsNullOrEmpty(a) && string.Equals(a.Trim(), key, StringComparison.OrdinalIgnoreCase);

            foreach (var key in makhs)
            {
                var matched = ctList.Where(c => Eq(c.Makh, key)).ToList();
                if (matched.Count == 0) continue;

                var documents = matched
                    .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : (c.Makh ?? ""))
                    .ToList();

                result[key] = new CtInfo(
                    TotalTien: documents.Sum(g => g.First().Thanhtien ?? 0),
                    Sohd: FirstNonEmpty(matched.Select(c => c.Sohd)) is { Length: > 0 } s ? s : matched[0].Sohd ?? "",
                    DaThu: documents.All(g => g.Any(c => (c.Dain ?? 0) != 0 || (c.Dathu ?? 0) != 0)));
            }
            return result;
        }

        private static CtInfo? FindInfo(Dictionary<string, CtInfo> map, PatientGroup g)
        {
            var key = g.Makb?.Trim();
            if (!string.IsNullOrEmpty(key) && map.TryGetValue(key, out var info)) return info;
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
                    var dv = g.Where(x => HcDv.Contains(x.Khochan)).ToList();

                    return new PatientGroup(
                        Makb: first.Makb, Mabn: first.Mabn,
                        HasBhyt: bhyt.Count > 0, HasDv: dv.Count > 0,
                        Dagiao: g.Max(x => x.Dagiao),
                        DvDathu: dv.Any(x => x.Dathu == true),
                        Taikhoan: FirstNonEmpty(g.Select(x => x.Taikhoan)),
                        OcuaBhyt: bhyt.FirstOrDefault()?.Taikhoan ?? "",
                        OcuaDv: dv.FirstOrDefault()?.Taikhoan ?? "",
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
                .Where(h => (h.Ngaynhap == null || h.Ngaynhap >= today) && h.Dagiao == (decimal)DuocTrangThaiGiao.ChoPhat && HcAll.Contains(h.Khochan))
                .OrderBy(h => h.Ngaynhap).ThenBy(h => h.Makb).ThenBy(h => h.Mabn));

            var groups = (await BuildGroupsAsync(rows))
                .OrderByDescending(x => !string.IsNullOrWhiteSpace(x.Taikhoan))
                .ThenByDescending(x => !string.IsNullOrWhiteSpace(x.Taikhoan) ? x.Ngaygiao ?? DateTime.MinValue : DateTime.MinValue)
                .ThenBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                .ThenBy(x => x.Makb).ThenBy(x => x.Mabn)
                .ToList();

            var infoMap = await LoadChungTuInfoAsync(groups.Where(g => g.HasDv));
            var result = new List<DuocChuaGiaoItemDto>();

            foreach (var g in groups)
            {
                var info = g.HasDv ? FindInfo(infoMap, g) : null;
                var sohd = info?.Sohd ?? "";
                var soTien = info?.TotalTien;
                var soTienStr = g.HasDv ? Money(info?.TotalTien ?? 0, "—") : "";
                var dvPaid = info?.DaThu ?? g.DvDathu;

                DuocChuaGiaoItemDto Item(int kho, bool hasBhyt, bool hasDv, bool daThu, decimal? tien, string tienStr, string oCua)
                    => new()
                    {
                        Makb = g.Makb ?? "",
                        Mabn = g.Mabn ?? "",
                        HoTen = g.HoTen,
                        NamSinh = g.NamSinh,
                        GioiTinh = g.GioiTinhStr,
                        Khochan = kho,
                        HasBhyt = hasBhyt,
                        HasDichVu = hasDv,
                        HasBoth = hasBhyt && hasDv,
                        IsBhyt = kho != DuocKhoConstant.DichVu,
                        Dagiao = g.Dagiao,
                        DaThu = daThu,
                        TrangThai = daThu ? DuocTrangThaiText.DangSoanThuoc : DuocTrangThaiText.ChoThuTien,
                        SoTien = tien,
                        SoTienStr = tienStr,
                        Sohd = sohd,
                        Maba = g.Maba,
                        NgayNhapStr = g.Ngaynhap?.ToString("HH:mm") ?? "",
                        OCua = oCua
                    };

                if (g.HasBoth)
                {
                    if (!dvPaid)
                    {
                        result.Add(Item(DuocKhoConstant.DichVu, true, true, false, soTien, soTienStr, g.OcuaDv));
                        result.Add(Item(DuocKhoConstant.Bhyt, true, false, true, null, "", g.OcuaBhyt));
                    }
                    else
                    {
                        var oCua = g.OcuaBhyt != "" ? g.OcuaBhyt : g.OcuaDv;
                        result.Add(Item(DuocKhoConstant.CaHai, true, true, true, soTien, soTienStr, oCua));
                    }
                }
                else if (g.HasBhyt)
                    result.Add(Item(DuocKhoConstant.Bhyt, true, false, true, null, "", g.OcuaBhyt));
                else
                    result.Add(Item(DuocKhoConstant.DichVu, false, true, dvPaid, soTien, soTienStr, g.OcuaDv));
            }

            return result;
        }
        public async Task<List<DuocDaGiaoItemDto>> LayDanhSachDaGiaoAsync()
        {
            var today = DateTime.Today;
            var rows = await ToRowsAsync(HangChoQuery()
                .Where(h => (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today)
                         && h.Dagiao == (decimal)DuocTrangThaiGiao.DaPhat && HcAll.Contains(h.Khochan))
                .OrderByDescending(h => h.Ngaygiao).Take(80));

            var groups = (await BuildGroupsAsync(rows)).OrderByDescending(x => x.Ngaygiao).ToList();
            var infoMap = await LoadChungTuInfoAsync(groups.Where(g => g.HasDv));

            return groups.Select(g =>
            {
                var info = FindInfo(infoMap, g);
                return new DuocDaGiaoItemDto
                {
                    Makb = g.Makb ?? "",
                    Mabn = g.Mabn ?? "",
                    HoTen = g.HoTen,
                    NamSinh = g.NamSinh,
                    GioiTinh = g.GioiTinhStr,
                    Khochan = g.Khochan,
                    HasBhyt = g.HasBhyt,
                    HasDichVu = g.HasDv,
                    HasBoth = g.HasBoth,
                    IsBhyt = g.Khochan == 14,
                    Dagiao = g.Dagiao,
                    SoTienStr = info != null ? Money(info.TotalTien, "") : "",
                    Sohd = info?.Sohd ?? "",
                    Maba = "",
                    NgayGiaoStr = g.Ngaygiao?.ToString("HH:mm") ?? "",
                    OCua = g.Taikhoan
                };
            }).ToList();
        }

        // ===== 3. Khách không mua thuốc =====
        public async Task<List<DuocChuaGiaoItemDto>> LayDanhSachKhongMuaAsync()
        {
            var today = DateTime.Today;
            var rows = await ToRowsAsync(HangChoQuery()
                .Where(h => (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today) && h.Dagiao == (decimal)DuocTrangThaiGiao.KhongMua)
                .OrderByDescending(h => h.Ngaygiao).Take(80));

            var groups = (await BuildGroupsAsync(rows)).OrderByDescending(x => x.Ngaygiao).ToList();
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
                    TrangThai = DuocTrangThaiText.KhongMua,
                    SoTien = info?.TotalTien,
                    SoTienStr = info != null ? Money(info.TotalTien, "—") : "—",
                    Sohd = info?.Sohd ?? "", Maba = "",
                    NgayNhapStr = g.Ngaygiao?.ToString("HH:mm") ?? "", OCua = g.Taikhoan
                };
            })];
        }

        // ===== 4. Danh sách bệnh nhân đã ẩn =====
        public async Task<List<DuocChuaGiaoItemDto>> LayDanhSachDaAnAsync()
        {
            try
            {
                var today = DateTime.Today;
                var rows = await ToRowsAsync(_context.HangChoDuocTmd.AsNoTracking()
                    .Where(h => h.Xoa == 0 && h.An == 1 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today || h.Ngaykcb >= today))
                    .OrderByDescending(h => h.Ngaygiao ?? h.Ngaynhap).Take(100));

                var groups = (await BuildGroupsAsync(rows)).OrderByDescending(x => x.Ngaygiao ?? x.Ngaynhap).ToList();
                var infoMap = await LoadChungTuInfoAsync(groups);

                return [.. groups.Select(g =>
                {
                    var info = FindInfo(infoMap, g);
                    return new DuocChuaGiaoItemDto
                    {
                        Makb = g.Makb ?? "", Mabn = g.Mabn ?? "",
                        HoTen = g.HoTen, NamSinh = g.NamSinh, GioiTinh = g.GioiTinhStr,
                        Khochan = g.Khochan, HasBhyt = g.HasBhyt, HasDichVu = g.HasDv,
                        HasBoth = g.HasBoth, IsBhyt = g.Khochan == DuocKhoConstant.Bhyt, Dagiao = g.Dagiao,
                        TrangThai = DuocTrangThaiText.DaAn,
                        SoTien = info?.TotalTien,
                        SoTienStr = info != null ? Money(info.TotalTien, "—") : "—",
                        Sohd = info?.Sohd ?? "", Maba = "",
                        NgayNhapStr = g.Ngaygiao?.ToString("HH:mm") ?? (g.Ngaynhap?.ToString("HH:mm") ?? ""),
                        OCua = g.Taikhoan
                    };
                })];
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi lấy danh sách đã ẩn");
                return [];
            }
        }

        // ===== CapNhatTrangThaiAsync =====
        public async Task<bool> CapNhatTrangThaiAsync(DuocCapNhatTrangThaiRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            if (string.IsNullOrEmpty(makb)) return false;

            var today = DateTime.Today;
            var oCuaStr = req.OCua?.Trim();

            var query = _context.HangChoDuocTmd
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today));

            query = query.Where(h => h.Makb == makb && (mabn == "" || h.Mabn == mabn)
                                && h.Dagiao == (decimal)DuocTrangThaiGiao.ChoPhat);

            if (req.Khochan is 13 or 14)
            {
                query = query.Where(h => h.Khochan == req.Khochan.Value);
            }

            var rows = await query.ExecuteUpdateAsync(setter => setter
                .SetProperty(h => h.Dagiao, req.TargetDagiao)
                .SetProperty(h => h.Ngaygiao, DateTime.Now)
                .SetProperty(h => h.Taikhoan, h => !string.IsNullOrEmpty(oCuaStr) ? oCuaStr : h.Taikhoan)
            );

            return rows > 0;
        }

        // ===== ChiDinhOCuaAsync =====
        public async Task<(bool Success, string HoTen, string NamSinh, string OCua)> ChiDinhOCuaAsync(DuocCapNhatTrangThaiRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            if (string.IsNullOrEmpty(makb)) return (false, "", "", "");

            var oCua = req.OCua?.Trim() ?? "";
            var today = DateTime.Today;

            var query = _context.HangChoDuocTmd
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today));

            query = query.Where(h => h.Makb == makb && (mabn == "" || h.Mabn == mabn)
                                && h.Dagiao == (decimal)DuocTrangThaiGiao.ChoPhat);

            if (req.Khochan is 13 or 14)
            {
                query = query.Where(h => h.Khochan == req.Khochan.Value);
            }

            var rows = await query.ExecuteUpdateAsync(setter => setter
                .SetProperty(h => h.Taikhoan, oCua)
                .SetProperty(h => h.Ngaygiao, DateTime.Now)
            );

            var hoTen = req.HoTen?.Trim() ?? "";
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
            if (string.IsNullOrEmpty(cleanMakb)) return false;

            var today = DateTime.Today;
            var query = _context.HangChoDuocTmd
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today));

            query = query.Where(h => h.Makb == cleanMakb && (cleanMabn == "" || h.Mabn == cleanMabn)
                                && h.Dagiao != (decimal)DuocTrangThaiGiao.ChoPhat);

            var now = DateTime.Now;
            var rows = await query.ExecuteUpdateAsync(setter => setter
                .SetProperty(h => h.Dagiao, (decimal)DuocTrangThaiGiao.ChoPhat)
                .SetProperty(h => h.An, 0)
                .SetProperty(h => h.Ngaygiao, now)
                .SetProperty(h => h.Ngaynhap, now)
            );

            return rows > 0;
        }

        // ===== KhongMuaAsync =====
        public async Task<bool> KhongMuaAsync(string makb, string mabn)
        {
            var cleanMakb = makb.Trim();
            var cleanMabn = mabn.Trim();
            if (string.IsNullOrEmpty(cleanMakb)) return false;

            var today = DateTime.Today;
            var baseQuery = _context.HangChoDuocTmd
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today));

            baseQuery = baseQuery.Where(h => h.Makb == cleanMakb && (cleanMabn == "" || h.Mabn == cleanMabn)
                                            && h.Dagiao == (decimal)DuocTrangThaiGiao.ChoPhat);

            var targetQuery = baseQuery.Where(h => h.Khochan == 13 || h.Khochan == 3);

            var rows = await targetQuery.ExecuteUpdateAsync(setter => setter
                .SetProperty(h => h.Dagiao, (decimal)DuocTrangThaiGiao.KhongMua)
                .SetProperty(h => h.An, 0)
                .SetProperty(h => h.Ngaygiao, DateTime.Now)
            );

            return rows > 0;
        }

        public async Task<bool> AnAsync(string makb, string mabn)
        {
            var cleanMakb = makb.Trim();
            var cleanMabn = mabn.Trim();
            if (string.IsNullOrEmpty(cleanMakb)) return false;

            var today = DateTime.Today;
            var query = _context.HangChoDuocTmd
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today || h.Ngaykcb >= today));

            query = query.Where(h => h.Makb == cleanMakb && (cleanMabn == "" || h.Mabn == cleanMabn));

            var rows = await query.ExecuteUpdateAsync(setter => setter
                .SetProperty(h => h.An, 1)
                .SetProperty(h => h.Ngaygiao, DateTime.Now)
            );

            return rows > 0;
        }

        public async Task<bool> BoAnAsync(string makb, string mabn)
        {
            var cleanMakb = makb.Trim();
            var cleanMabn = mabn.Trim();
            if (string.IsNullOrEmpty(cleanMakb)) return false;

            var today = DateTime.Today;
            var query = _context.HangChoDuocTmd
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today || h.Ngaykcb >= today));

            query = query.Where(h => h.Makb == cleanMakb && (cleanMabn == "" || h.Mabn == cleanMabn));

            var rows = await query.ExecuteUpdateAsync(setter => setter
                .SetProperty(h => h.An, 0)
                .SetProperty(h => h.Ngaygiao, DateTime.Now)
            );

            return rows > 0;
        }
    }
}
