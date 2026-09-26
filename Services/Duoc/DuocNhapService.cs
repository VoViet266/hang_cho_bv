using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Data.Entities;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{

    public class DuocNhapService : IDuocNhapService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<DuocNhapService> _logger;

        public DuocNhapService(AppDbContext context, ILogger<DuocNhapService> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// Tra cứu thông tin bệnh nhân và chứng từ đơn thuốc đa tầng:
        /// chungtu -> khambenh -> psdangky -> dmbenhnhan.
        /// Tự động nhận diện Toa BHYT và Toa Dịch Vụ.
        /// </summary>
        public async Task<DuocNhapBarcodeResultDto> ScanAsync(string? makh, string? makb)
        {
            var rawCode = (!string.IsNullOrWhiteSpace(makh) ? makh : makb)?.Trim();
            if (string.IsNullOrWhiteSpace(rawCode))
                return new DuocNhapBarcodeResultDto { Success = false, Message = "Vui lòng nhập mã khám (makh) hoặc mã bệnh nhân." };

            var code = rawCode.Replace("\r", "").Replace("\n", "").Replace("\t", "").Trim();

            try
            {
                var today = DateTime.Today;
                var tomorrow = today.AddDays(1);

                string actualMakh = code;
                string mabn = "";
                string maba = "";
                string sohd = "";
                int loai = 14;
                decimal tongTien = 0;

                // 1. Tra cứu theo Makh trong chungtu (chỉ lấy đơn thuốc trong ngày hôm nay)
                var ctList = await _context.ChungTu.AsNoTracking()
                    .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Makh == code && c.Ngaylap >= today && c.Ngaylap < tomorrow)
                    .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                    .ToListAsync();

                // 2. Tra cứu theo Makb trong khambenh
                if (ctList.Count == 0)
                {
                    var kb = await _context.KhamBenh.AsNoTracking()
                        .Where(k => (k.Xoa == null || k.Xoa == 0) && k.Makb == code && (k.Ngaykcb == null || (k.Ngaykcb >= today && k.Ngaykcb < tomorrow)))
                        .OrderByDescending(k => k.Ngaykcb)
                        .Select(k => new { k.Makb, k.Mabn, k.Ngaykcb })
                        .FirstOrDefaultAsync();

                    if (kb != null)
                    {
                        actualMakh = kb.Makb;
                        mabn = kb.Mabn;

                        if (!string.IsNullOrEmpty(actualMakh))
                        {
                            ctList = await _context.ChungTu.AsNoTracking()
                                .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Makh == actualMakh && c.Ngaylap >= today && c.Ngaylap < tomorrow)
                                .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                                .ToListAsync();
                        }
                        if (ctList.Count == 0 && !string.IsNullOrEmpty(mabn))
                        {
                            ctList = await _context.ChungTu.AsNoTracking()
                                .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Mabn == mabn && c.Ngaylap >= today && c.Ngaylap < tomorrow)
                                .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                                .ToListAsync();
                        }
                    }
                }

                // 3. Tra cứu theo Mabn trong chungtu (chỉ lấy đơn thuốc trong ngày hôm nay)
                if (ctList.Count == 0)
                {
                    ctList = await _context.ChungTu.AsNoTracking()
                        .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Mabn == code && c.Ngaylap >= today && c.Ngaylap < tomorrow)
                        .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                        .ToListAsync();
                }

                // 4. Tra cứu theo Sohd trong chungtu (chỉ lấy đơn thuốc trong ngày hôm nay)
                if (ctList.Count == 0)
                {
                    ctList = await _context.ChungTu.AsNoTracking()
                        .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Sohd == code && c.Ngaylap >= today && c.Ngaylap < tomorrow)
                        .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                        .ToListAsync();
                }

                // 5. Tra cứu psdangky theo Makb
                if (ctList.Count == 0 && string.IsNullOrEmpty(mabn))
                {
                    var dk = await _context.PsDangKy.AsNoTracking()
                        .Where(d => (d.Xoa == null || d.Xoa == 0) && d.Makb == code && (d.Ngaydk == null || (d.Ngaydk >= today && d.Ngaydk < tomorrow)))
                        .OrderByDescending(d => d.Ngaydk)
                        .Select(d => new { d.Makb, d.Mabn })
                        .FirstOrDefaultAsync();

                    if (dk != null)
                    {
                        actualMakh = dk.Makb;
                        mabn = dk.Mabn;

                        if (!string.IsNullOrEmpty(mabn))
                        {
                            ctList = await _context.ChungTu.AsNoTracking()
                                .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Mabn == mabn && c.Ngaylap >= today && c.Ngaylap < tomorrow)
                                .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                                .ToListAsync();
                        }
                    }
                }

                // 6. Nếu không tìm thấy chứng từ đơn thuốc trong ngày hôm nay -> Dừng và thông báo
                if (ctList.Count == 0)
                {
                    return new DuocNhapBarcodeResultDto
                    {
                        Success = false,
                        Message = $"Không tìm thấy đơn thuốc hôm nay với mã '{code}'."
                    };
                }

                mabn = ctList.FirstOrDefault(c => !string.IsNullOrEmpty(c.Mabn))?.Mabn ?? mabn;

                // 7. Nạp thêm tất cả chứng từ trong ngày hôm nay của bệnh nhân
                if (!string.IsNullOrEmpty(mabn))
                {
                    var allPatientCt = await _context.ChungTu.AsNoTracking()
                        .Where(c => (c.Xoa == null || c.Xoa == 0)
                                 && c.Mabn == mabn
                                 && c.Ngaylap >= today
                                 && c.Ngaylap < tomorrow)
                        .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                        .ToListAsync();

                    if (allPatientCt.Count > 0)
                    {
                        var existingKeys = ctList.Select(c => $"{c.Makh}_{c.Sohd}_{c.Khochan}").ToHashSet(StringComparer.OrdinalIgnoreCase);
                        foreach (var item in allPatientCt)
                        {
                            var k = $"{item.Makh}_{item.Sohd}_{item.Khochan}";
                            if (!existingKeys.Contains(k))
                            {
                                ctList.Add(item);
                                existingKeys.Add(k);
                            }
                        }
                    }
                }

                var firstCt = ctList[0];
                if (string.IsNullOrEmpty(mabn)) mabn = firstCt.Mabn ?? "";
                if (string.IsNullOrEmpty(actualMakh) || actualMakh == code)
                {
                    actualMakh = !string.IsNullOrWhiteSpace(firstCt.Makh) ? firstCt.Makh : code;
                }
                maba = ctList.FirstOrDefault(c => !string.IsNullOrEmpty(c.Maba))?.Maba ?? firstCt.Maba ?? "";
                sohd = firstCt.Sohd ?? "";

                // 8. Tra cứu thông tin bệnh nhân
                string hoTen = "";
                string ngaySinh = "";
                string gioiTinh = "";
                DateTime? ngayKcb = null;

                if (!string.IsNullOrWhiteSpace(mabn))
                {
                    var bn = await _context.DmBenhNhan.AsNoTracking()
                        .Where(b => b.Mabn == mabn)
                        .Select(b => new { b.Holot, b.Ten, b.Ngaysinh, b.Gioitinh })
                        .FirstOrDefaultAsync();

                    if (bn != null)
                    {
                        hoTen = $"{bn.Holot} {bn.Ten}".Trim();
                        ngaySinh = bn.Ngaysinh.HasValue ? bn.Ngaysinh.Value.ToString("dd/MM/yyyy") : "";
                        gioiTinh = bn.Gioitinh switch { 1 => "Nam", 2 => "Nữ", _ => "" };
                    }

                    if (!string.IsNullOrEmpty(actualMakh))
                    {
                        var kb = await _context.KhamBenh.AsNoTracking()
                            .Where(k => k.Makb == actualMakh && (k.Xoa == null || k.Xoa == 0))
                            .OrderByDescending(k => k.Ngaykcb)
                            .Select(k => (DateTime?)k.Ngaykcb)
                            .FirstOrDefaultAsync();
                        ngayKcb = kb;
                    }
                    if (ngayKcb == null)
                    {
                        var kb = await _context.KhamBenh.AsNoTracking()
                            .Where(k => k.Mabn == mabn && (k.Xoa == null || k.Xoa == 0))
                            .OrderByDescending(k => k.Ngaykcb)
                            .Select(k => k.Ngaykcb)
                            .FirstOrDefaultAsync();
                        ngayKcb = kb;
                    }
                }

                if (string.IsNullOrEmpty(hoTen))
                {
                    hoTen = !string.IsNullOrEmpty(actualMakh) ? actualMakh : mabn;
                }

                if (ngayKcb == null)
                {
                    ngayKcb = DateTime.Now;
                }

                // 9. Phân loại độc lập Toa BHYT và Toa Dịch Vụ
                bool hasDv = false;
                bool hasBhyt = false;
                string sohdBhyt = "";
                string mabaBhyt = "";
                string sohdDv = "";
                string mabaDv = "";

                if (ctList.Count > 0)
                {
                    var dvItems = ctList.Where(c => c.Khochan != null && (c.Khochan.Trim() == "13" || c.Khochan.Trim() == "3")).ToList();
                    var bhytItems = ctList.Where(c => c.Khochan != null && (c.Khochan.Trim() == "14" || c.Khochan.Trim() == "1" || c.Khochan.Trim() == "2")).ToList();

                    hasDv = dvItems.Count > 0;
                    hasBhyt = bhytItems.Count > 0;

                    if (!hasDv && !hasBhyt)
                    {
                        hasBhyt = true;
                    }

                    if (hasBhyt && bhytItems.Count > 0)
                    {
                        sohdBhyt = bhytItems.FirstOrDefault(c => !string.IsNullOrEmpty(c.Sohd))?.Sohd ?? "";
                        mabaBhyt = bhytItems.FirstOrDefault(c => !string.IsNullOrEmpty(c.Maba))?.Maba ?? "";
                    }

                    if (hasDv)
                    {
                        var distinctDv = dvItems
                            .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : (c.Makh ?? string.Empty))
                            .Select(g => g.First())
                            .ToList();

                        tongTien = distinctDv.Sum(c => c.Thanhtien ?? 0);
                        sohdDv = dvItems.FirstOrDefault(c => !string.IsNullOrEmpty(c.Sohd))?.Sohd ?? "";
                        mabaDv = dvItems.FirstOrDefault(c => !string.IsNullOrEmpty(c.Maba))?.Maba ?? "";
                    }

                    maba = !string.IsNullOrEmpty(mabaBhyt) ? mabaBhyt : mabaDv;
                    sohd = !string.IsNullOrEmpty(sohdBhyt) ? sohdBhyt : sohdDv;
                    loai = (hasBhyt && hasDv) ? 0 : (hasDv ? 13 : 14);
                }
                else
                {
                    hasBhyt = true;
                    hasDv = false;
                    loai = 14;
                }

                return new DuocNhapBarcodeResultDto
                {
                    Success = true,
                    Loai = loai,
                    HasBhyt = hasBhyt,
                    HasDichVu = hasDv,
                    Makh = actualMakh,
                    Makb = actualMakh,
                    Mabn = mabn,
                    HoTen = hoTen,
                    NgaySinh = ngaySinh,
                    GioiTinh = gioiTinh,
                    NgayKcb = ngayKcb,
                    Sohd = sohd,
                    Maba = maba,
                    SohdBhyt = sohdBhyt,
                    MabaBhyt = mabaBhyt,
                    SohdDv = sohdDv,
                    MabaDv = mabaDv,
                    Thanhtien = tongTien
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi scan code={Code}", code);
                return new DuocNhapBarcodeResultDto { Success = false, Message = "Lỗi hệ thống khi tra cứu: " + ex.Message };
            }
        }

        /// <summary>
        /// Thêm hoặc cập nhật trạng thái trong hangchoduoc_tmd:
        /// - Toa BHYT: Vào hàng chờ BHYT (khochan = 14, dathu = true, dagiao = 0).
        /// - Toa Dịch vụ: Vào hàng chờ Dịch vụ (khochan = 13, dathu = isPaid, dagiao = 0).
        /// </summary>
        public async Task<DuocNhapThemResponse> ThemHangChoAsync(DuocNhapThemRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";

            if (string.IsNullOrWhiteSpace(makb) && string.IsNullOrWhiteSpace(mabn))
                return new DuocNhapThemResponse { Success = false, Message = "Thiếu mã khám hoặc mã bệnh nhân." };

            if (string.IsNullOrEmpty(makb)) makb = mabn;
            if (string.IsNullOrEmpty(mabn)) mabn = makb;

            try
            {
                DateTime? ngayKcbVal = req.NgayKcb ?? DateTime.Now;
                var today = DateTime.Today;
                var tomorrow = today.AddDays(1);

                bool shouldAddBhyt = (req.HasBhyt == true) || (req.Khochan == 14) || (req.Loai == 14) || (req.Loai == 0);
                bool shouldAddDichVu = (req.HasDichVu == true) || (req.Khochan == 13) || (req.Khochan == 3) || (req.Loai == 13) || (req.Loai == 0);

                if (!shouldAddBhyt && !shouldAddDichVu)
                {
                    shouldAddBhyt = true;
                }

                List<string> addedMessages = new();

                // 1. XỬ LÝ TOA BHYT (khochan = 14, dathu = true)
                if (shouldAddBhyt)
                {
                    HangChoDuocTmd? existingBhyt = null;
                    if (!string.IsNullOrEmpty(makb))
                    {
                        existingBhyt = await _context.HangChoDuocTmd
                            .Where(h => h.Makb == makb && h.Khochan == 14 && h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today))
                            .OrderByDescending(h => h.Ngaynhap)
                            .FirstOrDefaultAsync();
                    }
                    if (existingBhyt == null && !string.IsNullOrEmpty(mabn))
                    {
                        existingBhyt = await _context.HangChoDuocTmd
                            .Where(h => h.Mabn == mabn && h.Khochan == 14 && h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today))
                            .OrderByDescending(h => h.Ngaynhap)
                            .FirstOrDefaultAsync();
                    }

                    if (existingBhyt == null)
                    {
                        await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        INSERT INTO current.hangchoduoc_tmd (mabn, makb, ngaynhap, ngaygiao, taikhoan, khochan, xoa, ngaykcb, maba, dagiao, dathu)
                        VALUES ({mabn}, {makb}, now(), now(), {req.OCua}, 14, 0, {ngayKcbVal}, {req.Maba}, 0, true)
                    ");
                        addedMessages.Add("Toa BHYT -> Chờ phát");
                    }
                    else if (existingBhyt.Dagiao == 1 || existingBhyt.Dagiao == 3)
                    {
                        await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE current.hangchoduoc_tmd
                        SET dagiao = 0, ngaygiao = now(), ngaynhap = now(), taikhoan = COALESCE({req.OCua}, taikhoan), xoa = 0
                        WHERE ((makb = {makb} AND makb <> '') OR (mabn = {mabn} AND mabn <> '')) AND khochan = 14
                    ");
                        addedMessages.Add("Kích hoạt lại BHYT -> Chờ phát");
                    }
                    else
                    {
                        await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE current.hangchoduoc_tmd
                        SET ngaygiao = now(), ngaynhap = now(), taikhoan = COALESCE({req.OCua}, taikhoan), xoa = 0
                        WHERE ((makb = {makb} AND makb <> '') OR (mabn = {mabn} AND mabn <> '')) AND khochan = 14
                    ");
                        addedMessages.Add("BHYT (Đã có trong hàng chờ)");
                    }
                }

                // 2. XỬ LÝ TOA DỊCH VỤ (khochan = 13, dathu = isPaid)
                if (shouldAddDichVu)
                {
                    bool isPaid = false;
                    if (!string.IsNullOrEmpty(makb))
                    {
                        isPaid = await _context.ChungTu.AsNoTracking()
                            .AnyAsync(c => (c.Xoa == null || c.Xoa == 0)
                                        && (c.Khochan == "13" || c.Khochan == "3")
                                        && c.Makh == makb
                                        && ((c.Dain ?? 0) != 0 || (c.Dathu ?? 0) != 0)
                                        && c.Ngaylap >= today && c.Ngaylap < tomorrow);
                    }
                    if (!isPaid && !string.IsNullOrEmpty(mabn))
                    {
                        isPaid = await _context.ChungTu.AsNoTracking()
                            .AnyAsync(c => (c.Xoa == null || c.Xoa == 0)
                                        && (c.Khochan == "13" || c.Khochan == "3")
                                        && c.Mabn == mabn
                                        && ((c.Dain ?? 0) != 0 || (c.Dathu ?? 0) != 0)
                                        && c.Ngaylap >= today && c.Ngaylap < tomorrow);
                    }

                    HangChoDuocTmd? existingDv = null;
                    if (!string.IsNullOrEmpty(makb))
                    {
                        existingDv = await _context.HangChoDuocTmd
                            .Where(h => h.Makb == makb && (h.Khochan == 13 || h.Khochan == 3) && h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today))
                            .OrderByDescending(h => h.Ngaynhap)
                            .FirstOrDefaultAsync();
                    }
                    if (existingDv == null && !string.IsNullOrEmpty(mabn))
                    {
                        existingDv = await _context.HangChoDuocTmd
                            .Where(h => h.Mabn == mabn && (h.Khochan == 13 || h.Khochan == 3) && h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today))
                            .OrderByDescending(h => h.Ngaynhap)
                            .FirstOrDefaultAsync();
                    }

                    if (existingDv == null)
                    {
                        await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        INSERT INTO current.hangchoduoc_tmd (mabn, makb, ngaynhap, ngaygiao, taikhoan, khochan, xoa, ngaykcb, maba, dagiao, dathu)
                        VALUES ({mabn}, {makb}, now(), now(), {req.OCua}, 13, 0, {ngayKcbVal}, {req.Maba}, 0, {isPaid})
                    ");
                        addedMessages.Add(isPaid ? "Toa Dịch vụ -> Chờ phát" : "Toa Dịch vụ -> Chưa thu");
                    }
                    else if (existingDv.Dagiao == 1 || existingDv.Dagiao == 3)
                    {
                        await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE current.hangchoduoc_tmd
                        SET dagiao = 0, ngaygiao = now(), ngaynhap = now(), taikhoan = COALESCE({req.OCua}, taikhoan), dathu = {isPaid}, xoa = 0
                        WHERE ((makb = {makb} AND makb <> '') OR (mabn = {mabn} AND mabn <> '')) AND (khochan = 13 OR khochan = 3)
                    ");
                        addedMessages.Add(isPaid ? "Kích hoạt lại Dịch vụ -> Chờ phát" : "Kích hoạt lại Dịch vụ -> Chưa thu");
                    }
                    else
                    {
                        await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE current.hangchoduoc_tmd
                        SET ngaygiao = now(), ngaynhap = now(), taikhoan = COALESCE({req.OCua}, taikhoan), dathu = {isPaid}, xoa = 0
                        WHERE ((makb = {makb} AND makb <> '') OR (mabn = {mabn} AND mabn <> '')) AND (khochan = 13 OR khochan = 3)
                    ");
                        addedMessages.Add(isPaid ? "Dịch vụ (Chờ phát)" : "Dịch vụ (Chưa thu)");
                    }
                }

                string msg = addedMessages.Count > 0
                    ? $"Đã tiếp nhận: {string.Join(", ", addedMessages)}."
                    : "Đã cập nhật hàng chờ thành công.";

                return new DuocNhapThemResponse
                {
                    Success = true,
                    Action = "them",
                    Dagiao = 0,
                    Khochan = (shouldAddBhyt && shouldAddDichVu) ? 0 : (shouldAddDichVu ? 13 : 14),
                    OCua = req.OCua,
                    Message = msg
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi thêm/cập nhật hàng chờ dược makb={Makb}, mabn={Mabn}", req.Makb, req.Mabn);
                return new DuocNhapThemResponse { Success = false, Message = "Lỗi hệ thống: " + ex.Message };
            }
        }

        private class ChungTuQueryDto
        {
            public string? Makh { get; set; }
            public string? Mabn { get; set; }
            public string? Sohd { get; set; }
            public string? Maba { get; set; }
            public decimal? Thanhtien { get; set; }
            public decimal? Dain { get; set; }
            public decimal? Dathu { get; set; }
            public string? Khochan { get; set; }
        }

        private async Task<Dictionary<string, (string Holot, string Ten, DateTime? Ngaysinh, decimal? Gioitinh)>> LoadPatientInfoAsync(List<string> mabnList)
        {
            var bnDict = new Dictionary<string, (string Holot, string Ten, DateTime? Ngaysinh, decimal? Gioitinh)>(StringComparer.OrdinalIgnoreCase);
            if (mabnList.Count == 0) return bnDict;

            var bnRecords = await _context.DmBenhNhan.AsNoTracking()
                .Where(bn => bn.Mabn != null && mabnList.Contains(bn.Mabn))
                .Select(bn => new { bn.Mabn, bn.Holot, bn.Ten, bn.Ngaysinh, bn.Gioitinh })
                .ToListAsync();

            foreach (var b in bnRecords)
            {
                if (!string.IsNullOrEmpty(b.Mabn))
                    bnDict[b.Mabn] = (b.Holot ?? "", b.Ten ?? "", b.Ngaysinh, b.Gioitinh);
            }
            return bnDict;
        }

        private async Task<Dictionary<string, (decimal TotalTien, string Sohd, string Maba, bool DaThu)>> LoadChungTuInfoAsync(
            IEnumerable<string?> makhs,
            IEnumerable<string?> mabns)
        {
            var result = new Dictionary<string, (decimal TotalTien, string Sohd, string Maba, bool DaThu)>(StringComparer.OrdinalIgnoreCase);
            var cleanMakhs = makhs.Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            var cleanMabns = mabns.Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            if (cleanMakhs.Count == 0 && cleanMabns.Count == 0) return result;

            var today = DateTime.Today;
            var tomorrow = today.AddDays(1);
            var ctList = await _context.ChungTu.AsNoTracking()
                .Where(c => (c.Xoa == null || c.Xoa == 0)
                         && (c.Khochan == "13" || c.Khochan == "3")
                         && c.Ngaylap >= today && c.Ngaylap < tomorrow
                         && ((c.Makh != null && cleanMakhs.Contains(c.Makh)) || (c.Mabn != null && cleanMabns.Contains(c.Mabn))))
                .Select(c => new ChungTuQueryDto { Makh = c.Makh, Mabn = c.Mabn, Sohd = c.Sohd, Maba = c.Maba, Thanhtien = c.Thanhtien, Dain = c.Dain, Dathu = c.Dathu, Khochan = c.Khochan })
                .ToListAsync();

            var allKeys = cleanMakhs.Concat(cleanMabns).Distinct(StringComparer.OrdinalIgnoreCase);
            foreach (var key in allKeys)
            {
                var matched = ctList.Where(c => (!string.IsNullOrEmpty(c.Makh) && string.Equals(c.Makh.Trim(), key, StringComparison.OrdinalIgnoreCase))
                                             || (!string.IsNullOrEmpty(c.Mabn) && string.Equals(c.Mabn.Trim(), key, StringComparison.OrdinalIgnoreCase)))
                                    .ToList();
                if (matched.Count == 0) continue;

                var distinctBySohd = matched
                    .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : (c.Makh ?? string.Empty))
                    .Select(g => g.First())
                    .ToList();

                decimal totalTien = distinctBySohd.Sum(c => c.Thanhtien ?? 0);
                var firstWithSohd = matched.FirstOrDefault(c => !string.IsNullOrEmpty(c.Sohd));
                string sohd = firstWithSohd?.Sohd ?? matched[0].Sohd ?? "";
                string maba = matched.FirstOrDefault(c => !string.IsNullOrEmpty(c.Maba))?.Maba ?? matched[0].Maba ?? "";
                bool daThu = distinctBySohd.Any(c => (c.Dain ?? 0) != 0 || (c.Dathu ?? 0) != 0);

                result[key] = (totalTien, sohd, maba, daThu);
            }
            return result;
        }

        /// <summary>
        /// Lấy danh sách chưa giao cho quầy dược:
        /// - Khi bệnh nhân có CẢ 2 TOA (BHYT + Dịch Vụ):
        ///   + Toa BHYT: Luôn xuất hiện ngay trong Cột 2 (Chờ phát thuốc).
        ///   + Toa Dịch Vụ: Nếu chưa đóng tiền -> Xuất hiện trong Cột 1 (Chưa thu tiền).
        ///                  Nếu đã đóng tiền -> Tự động gom chung vào Cột 2 (Chờ phát thuốc).
        /// </summary>
        public async Task<List<DuocChuaGiaoItemDto>> LayDanhSachChuaGiaoAsync()
        {
            var today = DateTime.Today;

            var rawHangCho = await _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today)
                         && h.Dagiao == 0
                         && (h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2 || h.Khochan == 13 || h.Khochan == 3))
                .OrderBy(h => h.Ngaynhap)
                .ThenBy(h => h.Makb)
                .ThenBy(h => h.Mabn)
                .Select(h => new
                {
                    h.Makb,
                    h.Mabn,
                    h.Khochan,
                    h.Dagiao,
                    h.Dathu,
                    h.Maba,
                    h.Ngaynhap,
                    h.Ngaygiao,
                    h.Taikhoan
                })
                .ToListAsync();

            var mabnList = rawHangCho
                .Select(h => h.Mabn)
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var bnDict = await LoadPatientInfoAsync(mabnList);

            // Gom nhóm theo Bệnh nhân để xác định trạng thái tổng thể (có BHYT, có DV hay có cả 2)
            var patientGroups = rawHangCho
                .GroupBy(x => !string.IsNullOrWhiteSpace(x.Makb) ? x.Makb.Trim() : (!string.IsNullOrWhiteSpace(x.Mabn) ? x.Mabn.Trim() : string.Empty))
                .Select(g =>
                {
                    var first = g.OrderBy(x => x.Ngaynhap ?? DateTime.MaxValue).First();
                    var (holot, ten, ngaysinh, gioitinh) = bnDict.TryGetValue(first.Mabn ?? "", out var bn)
                        ? bn
                        : (string.Empty, string.Empty, (DateTime?)null, (decimal?)null);

                    var assignedOcua = g.OrderByDescending(x => !string.IsNullOrEmpty(x.Taikhoan)).Select(x => x.Taikhoan).FirstOrDefault() ?? "";
                    var assignedMaba = g.OrderByDescending(x => !string.IsNullOrEmpty(x.Maba)).Select(x => x.Maba).FirstOrDefault() ?? "";
                    var latestNgayGiao = g.Max(x => x.Ngaygiao);

                    bool hasBhyt = g.Any(x => x.Khochan == 14 || x.Khochan == 1 || x.Khochan == 2);
                    bool hasDv = g.Any(x => x.Khochan == 13 || x.Khochan == 3);
                    bool hasBoth = hasBhyt && hasDv;
                    bool dvDathuInDb = g.Where(x => x.Khochan == 13 || x.Khochan == 3).Any(x => x.Dathu == true);

                    return new
                    {
                        first.Makb,
                        first.Mabn,
                        HasBhyt = hasBhyt,
                        HasDichVu = hasDv,
                        HasBoth = hasBoth,
                        Dagiao = g.Max(x => x.Dagiao),
                        Dathu = dvDathuInDb,
                        Taikhoan = assignedOcua,
                        Maba = assignedMaba,
                        first.Ngaynhap,
                        Ngaygiao = latestNgayGiao,
                        Holot = holot,
                        Ten = ten,
                        Ngaysinh = ngaysinh,
                        Gioitinh = gioitinh
                    };
                })
                .OrderByDescending(x => !string.IsNullOrWhiteSpace(x.Taikhoan))
                .ThenByDescending(x => !string.IsNullOrWhiteSpace(x.Taikhoan) ? x.Ngaygiao : DateTime.MinValue)
                .ThenBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                .ThenBy(x => x.Makb)
                .ThenBy(x => x.Mabn)
                .ToList();

            var dvPatients = patientGroups.Where(g => g.HasDichVu).ToList();
            var dvMakhs = dvPatients.Select(g => g.Makb).Where(m => !string.IsNullOrWhiteSpace(m));
            var dvMabns = dvPatients.Select(g => g.Mabn).Where(m => !string.IsNullOrWhiteSpace(m));
            var infoMap = await LoadChungTuInfoAsync(dvMakhs, dvMabns);

            var result = new List<DuocChuaGiaoItemDto>();

            foreach (var item in patientGroups)
            {
                var hoTen = $"{item.Holot} {item.Ten}".Trim();
                if (string.IsNullOrEmpty(hoTen))
                {
                    hoTen = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                }

                var gMakb = item.Makb?.Trim() ?? "";
                var gMabn = item.Mabn?.Trim() ?? "";

                decimal? soTien = null;
                string soTienStr = string.Empty;
                string sohdStr = string.Empty;
                string mabaStr = item.Maba ?? "";
                bool isDvPaid = false;

                if (item.HasDichVu)
                {
                    if ((!string.IsNullOrEmpty(gMakb) && infoMap.TryGetValue(gMakb, out var info)) ||
                        (!string.IsNullOrEmpty(gMabn) && infoMap.TryGetValue(gMabn, out info)))
                    {
                        sohdStr = info.Sohd ?? "";
                        if (!string.IsNullOrEmpty(info.Maba)) mabaStr = info.Maba;
                        soTien = info.TotalTien;
                        soTienStr = info.TotalTien > 0 ? $"{info.TotalTien:N0} ₫" : "—";
                        isDvPaid = info.DaThu;
                    }
                    else
                    {
                        soTienStr = "—";
                        isDvPaid = item.Dathu;
                    }
                }

                var namSinhStr = item.Ngaysinh.HasValue ? item.Ngaysinh.Value.ToString("yyyy") : "";
                var gioiTinhStr = item.Gioitinh == 1 ? "Nam" : (item.Gioitinh == 2 ? "Nữ" : "");
                var ngayNhapStr = item.Ngaynhap.HasValue ? item.Ngaynhap.Value.ToString("HH:mm") : "";

                // Xử lý các kịch bản:
                if (item.HasBoth)
                {
                    if (!isDvPaid)
                    {
                        // 1. Toa DV chưa thu tiền: Hiển thị ở Cột 1 (Chưa thu tiền)
                        result.Add(new DuocChuaGiaoItemDto
                        {
                            Makb = item.Makb ?? "",
                            Mabn = item.Mabn ?? "",
                            HoTen = hoTen ?? "",
                            NamSinh = namSinhStr,
                            GioiTinh = gioiTinhStr,
                            Khochan = 13,
                            HasBhyt = true,
                            HasDichVu = true,
                            HasBoth = true,
                            IsBhyt = false,
                            Dagiao = item.Dagiao,
                            DaThu = false,
                            TrangThai = "Chờ thu",
                            SoTien = soTien,
                            SoTienStr = soTienStr,
                            Sohd = sohdStr,
                            Maba = mabaStr,
                            NgayNhapStr = ngayNhapStr,
                            OCua = item.Taikhoan ?? ""
                        });

                        // 2. Toa BHYT: Hiển thị qua thẳng Cột 2 (Chờ phát thuốc / Chờ giao)
                        result.Add(new DuocChuaGiaoItemDto
                        {
                            Makb = item.Makb ?? "",
                            Mabn = item.Mabn ?? "",
                            HoTen = hoTen ?? "",
                            NamSinh = namSinhStr,
                            GioiTinh = gioiTinhStr,
                            Khochan = 14,
                            HasBhyt = true,
                            HasDichVu = true,
                            HasBoth = true,
                            IsBhyt = true,
                            Dagiao = item.Dagiao,
                            DaThu = true,
                            TrangThai = "Đang soạn",
                            SoTien = null,
                            SoTienStr = "",
                            Sohd = sohdStr,
                            Maba = mabaStr,
                            NgayNhapStr = ngayNhapStr,
                            OCua = item.Taikhoan ?? ""
                        });
                    }
                    else
                    {
                        // Khi Toa DV đã thanh toán: Gom lại thành 1 thẻ duy nhất ở Cột 2 (Chờ phát thuốc)
                        result.Add(new DuocChuaGiaoItemDto
                        {
                            Makb = item.Makb ?? "",
                            Mabn = item.Mabn ?? "",
                            HoTen = hoTen ?? "",
                            NamSinh = namSinhStr,
                            GioiTinh = gioiTinhStr,
                            Khochan = 0,
                            HasBhyt = true,
                            HasDichVu = true,
                            HasBoth = true,
                            IsBhyt = true,
                            Dagiao = item.Dagiao,
                            DaThu = true,
                            TrangThai = "Đang soạn",
                            SoTien = soTien,
                            SoTienStr = soTienStr,
                            Sohd = sohdStr,
                            Maba = mabaStr,
                            NgayNhapStr = ngayNhapStr,
                            OCua = item.Taikhoan ?? ""
                        });
                    }
                }
                else if (item.HasBhyt)
                {
                    // Chỉ có BHYT -> Cột 2 (Chờ phát thuốc)
                    result.Add(new DuocChuaGiaoItemDto
                    {
                        Makb = item.Makb ?? "",
                        Mabn = item.Mabn ?? "",
                        HoTen = hoTen ?? "",
                        NamSinh = namSinhStr,
                        GioiTinh = gioiTinhStr,
                        Khochan = 14,
                        HasBhyt = true,
                        HasDichVu = false,
                        HasBoth = false,
                        IsBhyt = true,
                        Dagiao = item.Dagiao,
                        DaThu = true,
                        TrangThai = "Đang soạn",
                        SoTien = null,
                        SoTienStr = "",
                        Sohd = sohdStr,
                        Maba = mabaStr,
                        NgayNhapStr = ngayNhapStr,
                        OCua = item.Taikhoan ?? ""
                    });
                }
                else
                {
                    // Chỉ có Dịch Vụ -> Nếu chưa đóng tiền vào Cột 1, đóng rồi vào Cột 2
                    result.Add(new DuocChuaGiaoItemDto
                    {
                        Makb = item.Makb ?? "",
                        Mabn = item.Mabn ?? "",
                        HoTen = hoTen ?? "",
                        NamSinh = namSinhStr,
                        GioiTinh = gioiTinhStr,
                        Khochan = 13,
                        HasBhyt = false,
                        HasDichVu = true,
                        HasBoth = false,
                        IsBhyt = false,
                        Dagiao = item.Dagiao,
                        DaThu = isDvPaid,
                        TrangThai = isDvPaid ? "Đang soạn" : "Chờ thu",
                        SoTien = soTien,
                        SoTienStr = soTienStr,
                        Sohd = sohdStr,
                        Maba = mabaStr,
                        NgayNhapStr = ngayNhapStr,
                        OCua = item.Taikhoan ?? ""
                    });
                }
            }

            return result;
        }

        /// <summary>
        /// Lấy danh sách lịch sử phát thuốc hôm nay
        /// </summary>
        public async Task<List<DuocDaGiaoItemDto>> LayDanhSachDaGiaoAsync()
        {
            var today = DateTime.Today;

            var rawDaGiao = await _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today)
                         && h.Dagiao >= 1
                         && (h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2 || h.Khochan == 13 || h.Khochan == 3))
                .OrderByDescending(h => h.Ngaygiao)
                .Select(h => new
                {
                    h.Makb,
                    h.Mabn,
                    h.Khochan,
                    h.Dagiao,
                    h.Ngaygiao,
                    h.Taikhoan
                })
                .Take(80)
                .ToListAsync();

            var mabnList = rawDaGiao
                .Select(h => h.Mabn)
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var bnDict = await LoadPatientInfoAsync(mabnList);

            var grouped = rawDaGiao
                .GroupBy(x => !string.IsNullOrWhiteSpace(x.Makb) ? x.Makb.Trim() : (!string.IsNullOrWhiteSpace(x.Mabn) ? x.Mabn.Trim() : string.Empty))
                .Select(g =>
                {
                    var first = g.First();
                    var (holot, ten, ngaysinh, gioitinh) = bnDict.TryGetValue(first.Mabn ?? "", out var bn)
                        ? bn
                        : (string.Empty, string.Empty, (DateTime?)null, (decimal?)null);

                    bool hasBhyt = g.Any(x => x.Khochan == 14 || x.Khochan == 1 || x.Khochan == 2);
                    bool hasDv = g.Any(x => x.Khochan == 13 || x.Khochan == 3);
                    bool hasBoth = hasBhyt && hasDv;

                    return new
                    {
                        first.Makb,
                        first.Mabn,
                        Khochan = hasBoth ? 0 : (hasDv ? 13 : 14),
                        HasBhyt = hasBhyt,
                        HasDichVu = hasDv,
                        HasBoth = hasBoth,
                        Dagiao = g.Max(x => x.Dagiao),
                        Ngaygiao = first.Ngaygiao,
                        Taikhoan = g.OrderByDescending(x => !string.IsNullOrEmpty(x.Taikhoan)).Select(x => x.Taikhoan).FirstOrDefault() ?? "",
                        Holot = holot,
                        Ten = ten,
                        Ngaysinh = ngaysinh,
                        Gioitinh = gioitinh
                    };
                })
                .OrderByDescending(x => x.Ngaygiao)
                .ToList();

            var dvGrouped = grouped.Where(g => g.HasDichVu).ToList();
            var dvMakhs = dvGrouped.Select(g => g.Makb).Where(m => !string.IsNullOrWhiteSpace(m));
            var dvMabns = dvGrouped.Select(g => g.Mabn).Where(m => !string.IsNullOrWhiteSpace(m));
            var daGiaoInfoMap = await LoadChungTuInfoAsync(dvMakhs, dvMabns);

            return grouped.Select(item =>
            {
                var hoTen = $"{item.Holot} {item.Ten}".Trim();
                if (string.IsNullOrEmpty(hoTen))
                {
                    hoTen = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                }

                bool isBhyt = item.Khochan == 14 || item.Khochan == 1 || item.Khochan == 2;
                var key = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                string sohdStr = "";
                string mabaStr = "";
                string soTienStr = "";

                if (!string.IsNullOrEmpty(key) && daGiaoInfoMap.TryGetValue(key, out var dgInfo))
                {
                    sohdStr = dgInfo.Sohd;
                    mabaStr = dgInfo.Maba;
                    soTienStr = dgInfo.TotalTien > 0 ? $"{dgInfo.TotalTien:N0} ₫" : "";
                }

                return new DuocDaGiaoItemDto
                {
                    Makb = item.Makb ?? "",
                    Mabn = item.Mabn ?? "",
                    HoTen = hoTen ?? "",
                    NamSinh = item.Ngaysinh.HasValue ? item.Ngaysinh.Value.ToString("yyyy") : "",
                    GioiTinh = item.Gioitinh == 1 ? "Nam" : (item.Gioitinh == 2 ? "Nữ" : ""),
                    Khochan = item.Khochan,
                    HasBhyt = item.HasBhyt,
                    HasDichVu = item.HasDichVu,
                    HasBoth = item.HasBoth,
                    IsBhyt = isBhyt,
                    Dagiao = item.Dagiao,
                    SoTienStr = soTienStr,
                    Sohd = sohdStr,
                    Maba = mabaStr,
                    NgayGiaoStr = item.Ngaygiao.ToString("HH:mm"),
                    OCua = item.Taikhoan ?? ""
                };
            }).ToList();
        }

        /// <summary>
        /// Lấy danh sách khách không mua thuốc hôm nay
        /// </summary>
        public async Task<List<DuocChuaGiaoItemDto>> LayDanhSachKhongMuaAsync()
        {
            var today = DateTime.Today;

            var rawKhongMua = await _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today || h.Ngaygiao >= today)
                         && h.Dagiao == 3)
                .OrderByDescending(h => h.Ngaygiao)
                .Select(h => new
                {
                    h.Makb,
                    h.Mabn,
                    h.Khochan,
                    h.Dagiao,
                    h.Ngaygiao,
                    h.Ngaynhap,
                    h.Taikhoan
                })
                .Take(80)
                .ToListAsync();

            var mabnList = rawKhongMua
                .Select(h => h.Mabn)
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var bnDict = await LoadPatientInfoAsync(mabnList);

            var grouped = rawKhongMua
                .GroupBy(x => !string.IsNullOrWhiteSpace(x.Makb) ? x.Makb.Trim() : (!string.IsNullOrWhiteSpace(x.Mabn) ? x.Mabn.Trim() : string.Empty))
                .Select(g =>
                {
                    var first = g.First();
                    var (holot, ten, ngaysinh, gioitinh) = bnDict.TryGetValue(first.Mabn ?? "", out var bn)
                        ? bn
                        : (string.Empty, string.Empty, (DateTime?)null, (decimal?)null);

                    bool hasBhyt = g.Any(x => x.Khochan == 14 || x.Khochan == 1 || x.Khochan == 2);
                    bool hasDv = g.Any(x => x.Khochan == 13 || x.Khochan == 3);
                    bool hasBoth = hasBhyt && hasDv;

                    return new
                    {
                        first.Makb,
                        first.Mabn,
                        Khochan = hasBoth ? 0 : (hasDv ? 13 : 14),
                        HasBhyt = hasBhyt,
                        HasDichVu = hasDv,
                        HasBoth = hasBoth,
                        Dagiao = g.Max(x => x.Dagiao),
                        Ngaygiao = first.Ngaygiao,
                        Ngaynhap = first.Ngaynhap,
                        Taikhoan = g.OrderByDescending(x => !string.IsNullOrEmpty(x.Taikhoan)).Select(x => x.Taikhoan).FirstOrDefault() ?? "",
                        Holot = holot,
                        Ten = ten,
                        Ngaysinh = ngaysinh,
                        Gioitinh = gioitinh
                    };
                })
                .OrderByDescending(x => x.Ngaygiao)
                .ToList();

            var allMakhs = grouped.Select(g => g.Makb).Where(m => !string.IsNullOrWhiteSpace(m));
            var allMabns = grouped.Select(g => g.Mabn).Where(m => !string.IsNullOrWhiteSpace(m));
            var kmInfoMap = await LoadChungTuInfoAsync(allMakhs, allMabns);

            return grouped.Select(item =>
            {
                var hoTen = $"{item.Holot} {item.Ten}".Trim();
                if (string.IsNullOrEmpty(hoTen))
                {
                    hoTen = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                }

                var key = (!string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn) ?? "";
                decimal? soTien = null;
                string soTienStr = string.Empty;
                string sohdStr = string.Empty;
                string mabaStr = string.Empty;

                if (!string.IsNullOrEmpty(key) && kmInfoMap.TryGetValue(key, out var kmInfo))
                {
                    soTien = kmInfo.TotalTien;
                    soTienStr = kmInfo.TotalTien > 0 ? $"{kmInfo.TotalTien:N0} ₫" : "—";
                    sohdStr = kmInfo.Sohd;
                    mabaStr = kmInfo.Maba;
                }
                else
                {
                    soTienStr = "—";
                }

                return new DuocChuaGiaoItemDto
                {
                    Makb = item.Makb ?? "",
                    Mabn = item.Mabn ?? "",
                    HoTen = hoTen ?? "",
                    NamSinh = item.Ngaysinh.HasValue ? item.Ngaysinh.Value.ToString("yyyy") : "",
                    GioiTinh = item.Gioitinh == 1 ? "Nam" : (item.Gioitinh == 2 ? "Nữ" : ""),
                    Khochan = item.Khochan,
                    HasBhyt = item.HasBhyt,
                    HasDichVu = item.HasDichVu,
                    HasBoth = item.HasBoth,
                    IsBhyt = false,
                    Dagiao = item.Dagiao,
                    TrangThai = "Không mua",
                    SoTien = soTien,
                    SoTienStr = soTienStr,
                    Sohd = sohdStr,
                    Maba = mabaStr,
                    NgayNhapStr = item.Ngaygiao.ToString("HH:mm"),
                    OCua = item.Taikhoan ?? ""
                };
            }).ToList();
        }

        public async Task<bool> CapNhatTrangThaiAsync(DuocCapNhatTrangThaiRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            if (string.IsNullOrEmpty(makb) && string.IsNullOrEmpty(mabn)) return false;

            var oCua = req.OCua?.Trim();
            var today = DateTime.Today;

            int rows;
            if (req.Khochan == 14 || req.Khochan == 1 || req.Khochan == 2)
            {
                rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                    UPDATE current.hangchoduoc_tmd
                    SET dagiao = {req.TargetDagiao}, ngaygiao = now(), taikhoan = COALESCE({oCua}, taikhoan)
                    WHERE (({makb} <> '' AND makb = {makb}) OR ({mabn} <> '' AND mabn = {mabn}))
                      AND (khochan = 14 OR khochan = 1 OR khochan = 2)
                      AND xoa = 0
                      AND (ngaynhap IS NULL OR ngaynhap >= {today})
                ");
            }
            else if (req.Khochan == 13 || req.Khochan == 3)
            {
                rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                    UPDATE current.hangchoduoc_tmd
                    SET dagiao = {req.TargetDagiao}, ngaygiao = now(), taikhoan = COALESCE({oCua}, taikhoan)
                    WHERE (({makb} <> '' AND makb = {makb}) OR ({mabn} <> '' AND mabn = {mabn}))
                      AND (khochan = 13 OR khochan = 3)
                      AND xoa = 0
                      AND (ngaynhap IS NULL OR ngaynhap >= {today})
                ");
            }
            else
            {
                rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                    UPDATE current.hangchoduoc_tmd
                    SET dagiao = {req.TargetDagiao}, ngaygiao = now(), taikhoan = COALESCE({oCua}, taikhoan)
                    WHERE (({makb} <> '' AND makb = {makb}) OR ({mabn} <> '' AND mabn = {mabn}))
                      AND xoa = 0
                      AND (ngaynhap IS NULL OR ngaynhap >= {today})
                ");
            }

            return rows > 0;
        }

        public async Task<(bool Success, string HoTen, string NamSinh, string OCua)> ChiDinhOCuaAsync(DuocCapNhatTrangThaiRequest req)
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            if (string.IsNullOrEmpty(makb) && string.IsNullOrEmpty(mabn))
                return (false, "", "", "");

            var oCua = req.OCua?.Trim() ?? "";
            var today = DateTime.Today;

            var rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
            UPDATE current.hangchoduoc_tmd
            SET taikhoan = {oCua}, ngaygiao = now()
            WHERE (({makb} <> '' AND makb = {makb}) OR ({mabn} <> '' AND mabn = {mabn}))
              AND xoa = 0
              AND (ngaynhap IS NULL OR ngaynhap >= {today})
        ");

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

        public async Task<bool> HoanTacAsync(string makb, string mabn)
        {
            var cleanMakb = makb.Trim();
            var cleanMabn = mabn.Trim();
            if (string.IsNullOrEmpty(cleanMakb) && string.IsNullOrEmpty(cleanMabn)) return false;

            var today = DateTime.Today;
            var rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
            UPDATE current.hangchoduoc_tmd
            SET dagiao = 0, ngaygiao = now(), ngaynhap = now()
            WHERE (({cleanMakb} <> '' AND makb = {cleanMakb}) OR ({cleanMabn} <> '' AND mabn = {cleanMabn}))
              AND xoa = 0
              AND (ngaynhap IS NULL OR ngaynhap >= {today} OR ngaygiao >= {today})
        ");

            return rows > 0;
        }

        public async Task<bool> KhongMuaAsync(string makb, string mabn)
        {
            var cleanMakb = makb.Trim();
            var cleanMabn = mabn.Trim();
            if (string.IsNullOrEmpty(cleanMakb) && string.IsNullOrEmpty(cleanMabn)) return false;

            var today = DateTime.Today;
            var hasDv = await _context.HangChoDuocTmd.AsNoTracking()
                .AnyAsync(h => ((!string.IsNullOrEmpty(cleanMakb) && h.Makb == cleanMakb) || (!string.IsNullOrEmpty(cleanMabn) && h.Mabn == cleanMabn))
                            && (h.Khochan == 13 || h.Khochan == 3)
                            && h.Xoa == 0
                            && (h.Ngaynhap == null || h.Ngaynhap >= today));

            int rows;
            if (hasDv)
            {
                rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE current.hangchoduoc_tmd
                SET dagiao = 3, ngaygiao = now()
                WHERE (({cleanMakb} <> '' AND makb = {cleanMakb}) OR ({cleanMabn} <> '' AND mabn = {cleanMabn}))
                  AND (khochan = 13 OR khochan = 3)
                  AND xoa = 0
                  AND (ngaynhap IS NULL OR ngaynhap >= {today})
            ");
            }
            else
            {
                rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE current.hangchoduoc_tmd
                SET dagiao = 3, ngaygiao = now()
                WHERE (({cleanMakb} <> '' AND makb = {cleanMakb}) OR ({cleanMabn} <> '' AND mabn = {cleanMabn}))
                  AND xoa = 0
                  AND (ngaynhap IS NULL OR ngaynhap >= {today})
            ");
            }

            return rows > 0;
        }
    }
}

