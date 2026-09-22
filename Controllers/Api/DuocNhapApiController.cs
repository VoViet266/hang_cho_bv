using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Data.Entities;
using HangChoKhamBenh.Web.Models;
using HangChoKhamBenh.Web.Services;

namespace HangChoKhamBenh.Web.Controllers.Api;

[ApiController]
[Route("api/duoc-nhap")]
public class DuocNhapApiController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ILogger<DuocNhapApiController> _logger;
    private readonly IQueueRealtimeBroadcaster _broadcaster;

    public DuocNhapApiController(
        AppDbContext context,
        ILogger<DuocNhapApiController> logger,
        IQueueRealtimeBroadcaster broadcaster)
    {
        _context = context;
        _logger = logger;
        _broadcaster = broadcaster;
    }

    /// <summary>
    /// Tra cứu bằng makh (mã khám) trong bảng chungtu.
    /// - Tìm chứng từ theo makh (hoặc sohd).
    /// - Xác định loại (13 = BHYT, 14 = Dịch vụ) từ khochan trong chungtu.
    /// - Nếu là 14 (Dịch vụ): lấy danh sách đơn thuốc và tính tổng tienvat.
    /// - Tra cứu thông tin bệnh nhân từ dmbenhnhan theo mabn và ngaykcb từ khambenh.
    /// </summary>
    [HttpGet("scan")]
    public async Task<IActionResult> Scan([FromQuery] string? makh, [FromQuery] string? makb)
    {
        var code = (!string.IsNullOrWhiteSpace(makh) ? makh : makb)?.Trim();
        if (string.IsNullOrWhiteSpace(code))
            return Ok(new DuocNhapBarcodeResultDto { Success = false, Message = "Mã khám (makh) không được để trống." });

        try
        {
            // 1. Tra cứu trực tiếp trong bảng chungtu bằng makh hoặc sohd
            var ctList = await _context.ChungTu.AsNoTracking()
                .Where(c => (c.Makh == code || c.Sohd == code) && (c.Xoa == null || c.Xoa == 0))
                .Select(c => new
                {
                    c.Makh,
                    c.Mabn,
                    c.Sohd,
                    c.Maba,
                    c.Khochan,
                    c.Tienvat
                })
                .ToListAsync();

            // Fallback: nếu vẫn chưa thấy, tra psdangky theo makb để lấy mabn rồi tra chungtu
            if (ctList.Count == 0)
            {
                var dk = await _context.PsDangKy.AsNoTracking()
                    .Where(d => d.Makb == code && (d.Xoa == null || d.Xoa == 0))
                    .OrderByDescending(d => d.Ngaydk)
                    .Select(d => new { d.Makb, d.Mabn })
                    .FirstOrDefaultAsync();

                if (dk != null)
                {
                    ctList = await _context.ChungTu.AsNoTracking()
                        .Where(c => c.Mabn == dk.Mabn && (c.Xoa == null || c.Xoa == 0))
                        .Select(c => new
                        {
                            c.Makh,
                            c.Mabn,
                            c.Sohd,
                            c.Maba,
                            c.Khochan,
                            c.Tienvat
                        })
                        .ToListAsync();
                }
            }

            if (ctList.Count == 0)
            {
                return Ok(new DuocNhapBarcodeResultDto
                {
                    Success = false,
                    Message = $"Không tìm thấy chứng từ với mã '{code}'."
                });
            }

            var firstCt = ctList[0];
            var mabn = firstCt.Mabn ?? "";
            var actualMakh = !string.IsNullOrWhiteSpace(firstCt.Makh) ? firstCt.Makh : code;
            var maba = ctList.FirstOrDefault(c => !string.IsNullOrEmpty(c.Maba))?.Maba ?? firstCt.Maba;
            var sohd = firstCt.Sohd;

            // Xác định loại từ khochan trong chungtu (13 = Dịch vụ, 14 = BHYT)
            int loai = 0;
            if (ctList.Any(c => c.Khochan == "13")) loai = 13; // Dịch vụ
            else if (ctList.Any(c => c.Khochan == "14")) loai = 14; // BHYT
            else if (int.TryParse(firstCt.Khochan, out int parsed)) loai = parsed;

            if (loai != 13 && loai != 14)
            {
                return Ok(new DuocNhapBarcodeResultDto
                {
                    Success = false,
                    Message = $"Khochan '{firstCt.Khochan}' trong chứng từ không hỗ trợ (cần 13 hoặc 14)."
                });
            }

            // Tính tổng tiền & danh sách đơn thuốc (cho loại 13 Dịch vụ)
            decimal tongTien = 0;
            var danhSachThuoc = new List<DuocNhapThuocItemDto>();

            if (loai == 13)
            {
                var today = DateTime.Today;
                var allDvList = await _context.ChungTu.AsNoTracking()
                    .Where(c => (c.Khochan == "13" || c.Khochan == "3")
                             && (c.Xoa == null || c.Xoa == 0)
                             && (c.Ngaylap == null || c.Ngaylap >= today)
                             && ((!string.IsNullOrEmpty(actualMakh) && c.Makh == actualMakh) || (!string.IsNullOrEmpty(mabn) && c.Mabn == mabn)))
                    .Select(c => new
                    {
                        c.Makh,
                        c.Mabn,
                        c.Sohd,
                        c.Maba,
                        c.Khochan,
                        c.Tienvat
                    })
                    .ToListAsync();

                var dvItems = allDvList.Count > 0 ? allDvList : ctList.Where(c => c.Khochan == "13" || c.Khochan == "3").ToList();
                if (dvItems.Count == 0) dvItems = ctList;

                var distinctDv = dvItems
                    .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd : Guid.NewGuid().ToString())
                    .Select(g => g.First())
                    .ToList();

                tongTien = distinctDv.Sum(c => c.Tienvat ?? 0);
                danhSachThuoc = distinctDv.Select(c => new DuocNhapThuocItemDto
                {
                    Sohd = c.Sohd,
                    Maba = c.Maba,
                    TienVat = c.Tienvat ?? 0
                }).ToList();
            }
            else
            {
                var bhItems = ctList.Where(c => c.Khochan == "14" || c.Khochan == "1" || c.Khochan == "2").ToList();
                tongTien = bhItems.Count > 0 ? (bhItems[0].Tienvat ?? 0) : (firstCt.Tienvat ?? 0);
            }

            // Tra cứu thông tin bệnh nhân từ DmBenhNhan và KhamBenh
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

                var kb = await _context.KhamBenh.AsNoTracking()
                    .Where(k => (k.Makb == actualMakh || k.Mabn == mabn) && (k.Xoa == null || k.Xoa == 0))
                    .OrderByDescending(k => k.Ngaykcb)
                    .Select(k => new { k.Ngaykcb })
                    .FirstOrDefaultAsync();

                if (kb != null)
                {
                    ngayKcb = kb.Ngaykcb;
                }
            }

            if (ngayKcb == null)
            {
                ngayKcb = DateTime.Now;
            }

            return Ok(new DuocNhapBarcodeResultDto
            {
                Success = true,
                Loai = loai,
                Makh = actualMakh,
                Makb = actualMakh,
                Mabn = mabn,
                HoTen = hoTen,
                NgaySinh = ngaySinh,
                GioiTinh = gioiTinh,
                NgayKcb = ngayKcb,
                Sohd = sohd,
                Maba = maba,
                TienVat = tongTien,
                DanhSachThuoc = danhSachThuoc
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi scan makh={Makh}", code);
            return Ok(new DuocNhapBarcodeResultDto { Success = false, Message = "Lỗi hệ thống khi tra cứu: " + ex.Message });
        }
    }

    /// <summary>
    /// Thêm hoặc cập nhật trạng thái trong hangchoduoc_tmd:
    /// - Khochan lấy trực tiếp từ chungtu (13 = Dịch vụ, 14 = BHYT).
    /// - BHYT: Lần 1 = Thêm (dagiao = 0), Lần 2 = Ẩn (dagiao = 1).
    /// - Dịch vụ: Lần 1 = Thêm (dagiao = 0, Chờ thu), Lần 2 = Thanh toán (dagiao = 1, Đang soạn), Lần 3 = Ẩn tên (dagiao = 2, Đã phát).
    /// </summary>
    [HttpPost("them-hang-cho")]
    public async Task<IActionResult> ThemHangCho([FromBody] DuocNhapThemRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Makb) || string.IsNullOrWhiteSpace(req.Mabn))
            return Ok(new DuocNhapThemResponse { Success = false, Message = "Thiếu makb hoặc mabn." });

        try
        {
            DateTime? ngayKcbUtc = req.NgayKcb.HasValue 
                ? DateTime.SpecifyKind(req.NgayKcb.Value, DateTimeKind.Utc) 
                : null;

            var today = DateTime.UtcNow.Date;

            // Xác định khochan đích: lấy trực tiếp từ chungtu
            int targetKhochan = req.Khochan > 0 ? req.Khochan : (req.Loai > 0 ? req.Loai : 14);

            // Kiểm tra bệnh nhân đã có trong hàng chờ hôm nay chưa
            var existing = await _context.HangChoDuocTmd
                .Where(h => (h.Makb == req.Makb || h.Mabn == req.Mabn)
                         && h.Xoa == 0
                         && (h.Ngaynhap == null || h.Ngaynhap >= today))
                .OrderByDescending(h => h.Ngaynhap)
                .FirstOrDefaultAsync();

            bool isDichVu = (targetKhochan == 13 || targetKhochan == 3 || (existing != null && (existing.Khochan == 13 || existing.Khochan == 3)));

            if (isDichVu)
            {
                // DỊCH VỤ: Lần 1 = Thêm (dagiao = 0), Lần 2 = Thanh toán (dagiao = 1), Lần 3 = Ẩn tên (dagiao = 2)
                if (existing == null)
                {
                    await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        INSERT INTO current.hangchoduoc_tmd (mabn, makb, ngaynhap, ngaygiao, taikhoan, khochan, xoa, ngaykcb, maba, dagiao)
                        VALUES ({req.Mabn}, {req.Makb}, now(), now(), {null}, {targetKhochan}, 0, {ngayKcbUtc}, {req.Maba}, 0)
                    ");

                    _logger.LogInformation("Lần 1 Thêm Dịch vụ: makb={Makb}, khochan={Khochan}", req.Makb, targetKhochan);
                    NotifyDuocQueuesUpdated();
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "them",
                        Dagiao = 0,
                        Khochan = targetKhochan,
                        Message = "Đã thêm vào hàng chờ Dịch vụ (Chờ thu)."
                    });
                }
                else if (existing.Dagiao == 0)
                {
                    // Lần 2: Xác nhận thanh toán -> Đang soạn thuốc
                    await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE current.hangchoduoc_tmd
                        SET dagiao = 1, ngaygiao = now()
                        WHERE (makb = {req.Makb} OR mabn = {req.Mabn}) AND dagiao = 0 AND xoa = 0
                    ");

                    _logger.LogInformation("Lần 2 Thanh toán Dịch vụ: makb={Makb}", req.Makb);
                    NotifyDuocQueuesUpdated();
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "thanh_toan",
                        Dagiao = 1,
                        Khochan = existing.Khochan,
                        IsUpdate = true,
                        Message = "Đã xác nhận thanh toán (Chuyển sang Đang soạn thuốc)."
                    });
                }
                else if (existing.Dagiao == 1)
                {
                    // Lần 3: Đã phát thuốc -> Ẩn tên khỏi TV
                    await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE current.hangchoduoc_tmd
                        SET dagiao = 2, ngaygiao = now()
                        WHERE (makb = {req.Makb} OR mabn = {req.Mabn}) AND dagiao = 1 AND xoa = 0
                    ");

                    _logger.LogInformation("Lần 3 Ẩn tên Dịch vụ (Đã phát): makb={Makb}", req.Makb);
                    NotifyDuocQueuesUpdated();
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "an_ten",
                        Dagiao = 2,
                        Khochan = existing.Khochan,
                        IsUpdate = true,
                    });
                }
                else
                {
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "da_xong",
                        Dagiao = existing.Dagiao,
                        Khochan = existing.Khochan,
                    });
                }
            }
            else
            {
                // BẢO HIỂM (BHYT): Lần 1 = Thêm (dagiao = 0), Lần 2 = Ẩn tên (dagiao = 1)
                if (existing == null)
                {
                    await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        INSERT INTO current.hangchoduoc_tmd (mabn, makb, ngaynhap, ngaygiao, taikhoan, khochan, xoa, ngaykcb, maba, dagiao)
                        VALUES ({req.Mabn}, {req.Makb}, now(), now(), {null}, {targetKhochan}, 0, {ngayKcbUtc}, {req.Maba}, 0)
                    ");

                    _logger.LogInformation("Lần 1 Thêm BHYT: makb={Makb}, khochan={Khochan}", req.Makb, targetKhochan);
                    NotifyDuocQueuesUpdated();
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "them",
                        Dagiao = 0,
                        Khochan = targetKhochan,
                        Message = "Đã thêm vào hàng chờ BHYT."
                    });
                }
                else if (existing.Dagiao == 0)
                {
                    // Lần 2: Đã phát thuốc -> Ẩn tên khỏi TV
                    await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE current.hangchoduoc_tmd
                        SET dagiao = 1, ngaygiao = now()
                        WHERE (makb = {req.Makb} OR mabn = {req.Mabn}) AND dagiao = 0 AND xoa = 0
                    ");

                    _logger.LogInformation("Lần 2 Ẩn tên BHYT (Đã phát): makb={Makb}", req.Makb);
                    NotifyDuocQueuesUpdated();
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "an_ten",
                        Dagiao = 1,
                        Khochan = existing.Khochan,
                        IsUpdate = true,
                    });
                }
                else
                {
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "da_xong",
                        Dagiao = existing.Dagiao,
                        Khochan = existing.Khochan,
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi thêm/cập nhật hàng chờ dược makb={Makb}", req.Makb);
            return Ok(new DuocNhapThemResponse { Success = false, Message = "Lỗi hệ thống: " + ex.Message });
        }
    }

    /// <summary>
    /// Cập nhật trạng thái trực tiếp bằng nút bấm ở ô bên phải (Đã phát / Thanh toán)
    /// </summary>
    [HttpPost("cap-nhat-trang-thai")]
    public async Task<IActionResult> CapNhatTrangThai([FromBody] DuocCapNhatTrangThaiRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Makb) && string.IsNullOrWhiteSpace(req.Mabn))
            return Ok(new { success = false, message = "Thiếu mã khám hoặc mã bệnh nhân." });

        try
        {
            var makb = req.Makb?.Trim() ?? "";
            var mabn = req.Mabn?.Trim() ?? "";
            var today = DateTime.Today.AddDays(-1);

            int rows;
            if (!string.IsNullOrEmpty(makb) && !string.IsNullOrEmpty(mabn))
            {
                rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                    UPDATE current.hangchoduoc_tmd
                    SET dagiao = {req.TargetDagiao}, ngaygiao = now()
                    WHERE (makb = {makb} OR mabn = {mabn})
                      AND xoa = 0
                      AND (ngaynhap IS NULL OR ngaynhap >= {today})
                ");
            }
            else if (!string.IsNullOrEmpty(makb))
            {
                rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                    UPDATE current.hangchoduoc_tmd
                    SET dagiao = {req.TargetDagiao}, ngaygiao = now()
                    WHERE makb = {makb}
                      AND xoa = 0
                      AND (ngaynhap IS NULL OR ngaynhap >= {today})
                ");
            }
            else
            {
                rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                    UPDATE current.hangchoduoc_tmd
                    SET dagiao = {req.TargetDagiao}, ngaygiao = now()
                    WHERE mabn = {mabn}
                      AND xoa = 0
                      AND (ngaynhap IS NULL OR ngaynhap >= {today})
                ");
            }

            _logger.LogInformation("Cập nhật trạng thái makb={Makb}, mabn={Mabn}, targetDagiao={TargetDagiao}, rows={Rows}", makb, mabn, req.TargetDagiao, rows);
            NotifyDuocQueuesUpdated(makb, mabn);
            return Ok(new { success = true, message = "Đã cập nhật trạng thái thành công!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi cập nhật trạng thái cho makb={Makb}", req.Makb);
            return Ok(new { success = false, message = "Lỗi khi cập nhật: " + ex.Message });
        }
    }

    private void NotifyDuocQueuesUpdated(string? makb = null, string? mabn = null)
    {
        if (!string.IsNullOrEmpty(makb)) DuocService.InvalidateCache(makb);
        if (!string.IsNullOrEmpty(mabn)) DuocService.InvalidateCache(mabn);
        _ = _broadcaster.CheckAndBroadcastRoomAsync("duoc", "bhyt", force: true);
        _ = _broadcaster.CheckAndBroadcastRoomAsync("duoc", "dichvu", force: true);
    }

    /// <summary>
    /// Lấy danh sách các đơn thuốc / bệnh nhân chưa giao hôm nay để hiển thị bên ô bên phải
    /// </summary>
    [HttpGet("danh-sach-chua-giao")]
    public async Task<IActionResult> LayDanhSachChuaGiao()
    {
        try
        {
            var today = DateTime.Today;
            var tomorrow = today.AddDays(1);

            // Lấy danh sách hangchoduoc_tmd hôm nay:
            // BHYT (khochan == 14 hoặc 1, 2) chưa giao: dagiao == 0
            // Dịch vụ (khochan == 13 hoặc 3) chưa giao xong: dagiao == 0 hoặc dagiao == 1
            var rawHangCho = await _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today)
                         && (((h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2) && h.Dagiao == 0)
                          || ((h.Khochan == 13 || h.Khochan == 3) && (h.Dagiao == 0 || h.Dagiao == 1))))
                .OrderBy(h => h.Ngaynhap)
                .Select(h => new
                {
                    h.Makb,
                    h.Mabn,
                    h.Khochan,
                    h.Dagiao,
                    h.Ngaynhap
                })
                .ToListAsync();

            // Lấy thông tin dmbenhnhan chỉ cho các mabn trong danh sách (nhanh vượt trội)
            var mabnList = rawHangCho
                .Select(h => h.Mabn)
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .Distinct()
                .ToList();

            var bnDict = new Dictionary<string, (string Holot, string Ten, DateTime? Ngaysinh, decimal? Gioitinh)>();
            if (mabnList.Count > 0)
            {
                var bnRecords = await _context.DmBenhNhan.AsNoTracking()
                    .Where(bn => mabnList.Contains(bn.Mabn))
                    .Select(bn => new { bn.Mabn, bn.Holot, bn.Ten, bn.Ngaysinh, bn.Gioitinh })
                    .ToListAsync();

                foreach (var b in bnRecords)
                {
                    bnDict[b.Mabn] = (b.Holot ?? "", b.Ten ?? "", b.Ngaysinh, b.Gioitinh);
                }
            }

            var rawList = rawHangCho.Select(h =>
            {
                var (holot, ten, ngaysinh, gioitinh) = bnDict.TryGetValue(h.Mabn ?? "", out var bn)
                    ? bn
                    : (string.Empty, string.Empty, (DateTime?)null, (decimal?)null);

                return new
                {
                    h.Makb,
                    h.Mabn,
                    h.Khochan,
                    h.Dagiao,
                    h.Ngaynhap,
                    Holot = holot,
                    Ten = ten,
                    Ngaysinh = ngaysinh,
                    Gioitinh = gioitinh
                };
            }).ToList();

            // Gom nhóm theo bệnh nhân
            var grouped = rawList
                .GroupBy(x => !string.IsNullOrWhiteSpace(x.Makb) ? x.Makb.Trim() : (!string.IsNullOrWhiteSpace(x.Mabn) ? x.Mabn.Trim() : Guid.NewGuid().ToString()))
                .Select(g =>
                {
                    var first = g.OrderBy(x => x.Ngaynhap ?? DateTime.MaxValue).First();
                    return new
                    {
                        first.Makb,
                        first.Mabn,
                        Khochan = g.Max(x => x.Khochan),
                        Dagiao = g.Max(x => x.Dagiao),
                        first.Ngaynhap,
                        first.Holot,
                        first.Ten,
                        first.Ngaysinh,
                        first.Gioitinh
                    };
                })
                .OrderBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                .ToList();

            // Tra cứu tiền cho đơn dịch vụ (khochan == 13 hoặc 3)
            var dvPatients = grouped.Where(g => g.Khochan == 13 || g.Khochan == 3).ToList();
            var dvInfoMap = new Dictionary<string, decimal>();

            if (dvPatients.Count > 0)
            {
                var patientMakhs = dvPatients
                    .Select(g => g.Makb)
                    .Where(k => !string.IsNullOrWhiteSpace(k))
                    .Distinct()
                    .ToList();

                var patientMabnsWithoutMakh = dvPatients
                    .Where(g => string.IsNullOrWhiteSpace(g.Makb))
                    .Select(g => g.Mabn)
                    .Where(m => !string.IsNullOrWhiteSpace(m))
                    .Distinct()
                    .ToList();

                var matchedCt = new List<(string? Sohd, string? Makh, string? Mabn, decimal? Tienvat)>();

                // Dùng trực tiếp Index Scan trên makh (chỉ vài mili-giây, không quét toàn bảng)
                if (patientMakhs.Count > 0)
                {
                    var makhRecords = await _context.ChungTu.AsNoTracking()
                        .Where(c => (c.Xoa == null || c.Xoa == 0)
                                 && (c.Khochan == "13" || c.Khochan == "3")
                                 && patientMakhs.Contains(c.Makh))
                        .Select(c => new { c.Sohd, c.Makh, c.Mabn, c.Tienvat })
                        .ToListAsync();

                    matchedCt.AddRange(makhRecords.Select(c => (c.Sohd, c.Makh, c.Mabn, c.Tienvat)));
                }

                if (patientMabnsWithoutMakh.Count > 0)
                {
                    var mabnRecords = await _context.ChungTu.AsNoTracking()
                        .Where(c => (c.Xoa == null || c.Xoa == 0)
                                 && (c.Khochan == "13" || c.Khochan == "3")
                                 && patientMabnsWithoutMakh.Contains(c.Mabn))
                        .Select(c => new { c.Sohd, c.Makh, c.Mabn, c.Tienvat })
                        .ToListAsync();

                    matchedCt.AddRange(mabnRecords.Select(c => (c.Sohd, c.Makh, c.Mabn, c.Tienvat)));
                }

                foreach (var g in dvPatients)
                {
                    var cts = matchedCt
                        .Where(c => (!string.IsNullOrEmpty(g.Makb) && c.Makh == g.Makb)
                                 || (!string.IsNullOrEmpty(g.Mabn) && c.Mabn == g.Mabn))
                        .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd : Guid.NewGuid().ToString())
                        .Select(cg => cg.First())
                        .ToList();

                    decimal totalTien = cts.Sum(c => c.Tienvat ?? 0);
                    var key = !string.IsNullOrEmpty(g.Makb) ? g.Makb : g.Mabn;
                    dvInfoMap[key] = totalTien;
                }
            }

            var result = grouped.Select(item =>
            {
                var hoTen = $"{item.Holot} {item.Ten}".Trim();
                if (string.IsNullOrEmpty(hoTen))
                {
                    hoTen = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                }

                bool isBhyt = (item.Khochan == 14 || item.Khochan == 1 || item.Khochan == 2);
                var key = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                decimal? soTien = null;
                string soTienStr = string.Empty;

                if (!isBhyt)
                {
                    if (dvInfoMap.TryGetValue(key, out var totalTien))
                    {
                        soTien = totalTien;
                        soTienStr = totalTien > 0 ? $"{totalTien:N0} ₫" : "—";
                    }
                    else
                    {
                        soTienStr = "—";
                    }
                }

                string trangThaiStr;
                if (isBhyt)
                {
                    trangThaiStr = "Chờ phát";
                }
                else
                {
                    trangThaiStr = (item.Dagiao >= 1) ? "Đang soạn thuốc" : "Chờ thu";
                }

                return new DuocChuaGiaoItemDto
                {
                    Makb = item.Makb,
                    Mabn = item.Mabn,
                    HoTen = hoTen,
                    NamSinh = item.Ngaysinh.HasValue ? item.Ngaysinh.Value.ToString("yyyy") : "",
                    GioiTinh = item.Gioitinh == 1 ? "Nam" : (item.Gioitinh == 2 ? "Nữ" : ""),
                    Khochan = item.Khochan,
                    IsBhyt = isBhyt,
                    Dagiao = item.Dagiao,
                    TrangThai = trangThaiStr,
                    SoTien = soTien,
                    SoTienStr = soTienStr,
                    NgayNhapStr = item.Ngaynhap.HasValue ? item.Ngaynhap.Value.ToString("HH:mm") : ""
                };
            }).ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi lấy danh sách chưa giao");
            return Ok(new List<DuocChuaGiaoItemDto>());
        }
    }
}
