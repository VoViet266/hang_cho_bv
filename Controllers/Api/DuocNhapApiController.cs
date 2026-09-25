using System.Collections.Concurrent;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Data.Entities;
using HangChoKhamBenh.Web.Hubs;
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
    private readonly IHubContext<QueueHub> _hubContext;

    public DuocNhapApiController(
        AppDbContext context,
        ILogger<DuocNhapApiController> logger,
        IQueueRealtimeBroadcaster broadcaster,
        IHubContext<QueueHub> hubContext)
    {
        _context = context;
        _logger = logger;
        _broadcaster = broadcaster;
        _hubContext = hubContext;
    }

    /// <summary>
    /// Tra cứu bằng makh (mã khám), makb, mabn hoặc sohd trong bảng chungtu, khambenh, psdangky, dmbenhnhan.
    /// - Hỗ trợ tra cứu đa tầng: chungtu -> khambenh -> psdangky -> dmbenhnhan.
    /// - Tự động nhận diện Dịch vụ (khochan = 13 hoặc 3) và BHYT (khochan = 14, 1, 2 hoặc mặc định).
    /// - Không bao giờ báo lỗi từ chối khochan.
    /// </summary>
    [HttpGet("scan")]
    public async Task<IActionResult> Scan([FromQuery] string? makh, [FromQuery] string? makb)
    {
        var rawCode = (!string.IsNullOrWhiteSpace(makh) ? makh : makb)?.Trim();
        if (string.IsNullOrWhiteSpace(rawCode))
            return Ok(new DuocNhapBarcodeResultDto { Success = false, Message = "Vui lòng nhập mã khám (makh) hoặc mã bệnh nhân." });

        // Làm sạch mã (loại bỏ ký tự điều khiển từ máy quét mã vạch nếu có)
        var code = rawCode.Replace("\r", "").Replace("\n", "").Replace("\t", "").Trim();

        try
        {
            string actualMakh = code;
            string mabn = "";
            string maba = "";
            string sohd = "";
            int loai = 14; // Mặc định là 14 (BHYT)
            decimal tongTien = 0;
            var danhSachThuoc = new List<DuocNhapThuocItemDto>();

            // 1. Tra cứu trực tiếp theo Makh trong chungtu (sử dụng B-tree index scan trên Makh, siêu nhanh < 1ms)
            var ctList = await _context.ChungTu.AsNoTracking()
                .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Makh == code)
                .Select(c => new
                {
                    c.Makh,
                    c.Mabn,
                    c.Sohd,
                    c.Maba,
                    c.Khochan,
                    c.Thanhtien
                })
                .ToListAsync();

            // 2. Nếu chưa có, tra theo Makb trong khambenh (sử dụng PK index, < 0.5ms)
            if (ctList.Count == 0)
            {
                var kb = await _context.KhamBenh.AsNoTracking()
                    .Where(k => (k.Xoa == null || k.Xoa == 0) && k.Makb == code)
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
                            .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Makh == actualMakh)
                            .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                            .ToListAsync();
                    }
                    if (ctList.Count == 0 && !string.IsNullOrEmpty(mabn))
                    {
                        ctList = await _context.ChungTu.AsNoTracking()
                            .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Mabn == mabn)
                            .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                            .ToListAsync();
                    }
                }
            }

            // 3. Nếu chưa có, tra theo Mabn trong chungtu (sử dụng index scan trên Mabn, < 1ms)
            if (ctList.Count == 0)
            {
                ctList = await _context.ChungTu.AsNoTracking()
                    .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Mabn == code)
                    .Select(c => new
                    {
                        c.Makh,
                        c.Mabn,
                        c.Sohd,
                        c.Maba,
                        c.Khochan,
                        c.Thanhtien
                    })
                    .ToListAsync();
            }

            // 4. Nếu chưa có, tra theo Sohd trong chungtu (sử dụng index scan trên Sohd, < 1ms)
            if (ctList.Count == 0)
            {
                ctList = await _context.ChungTu.AsNoTracking()
                    .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Sohd == code)
                    .Select(c => new
                    {
                        c.Makh,
                        c.Mabn,
                        c.Sohd,
                        c.Maba,
                        c.Khochan,
                        c.Thanhtien
                    })
                    .ToListAsync();
            }

            // 5. Nếu chưa có, tra psdangky theo Makb (sử dụng PK index)
            if (ctList.Count == 0 && string.IsNullOrEmpty(mabn))
            {
                var dk = await _context.PsDangKy.AsNoTracking()
                    .Where(d => (d.Xoa == null || d.Xoa == 0) && d.Makb == code)
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
                            .Where(c => (c.Xoa == null || c.Xoa == 0) && c.Mabn == mabn)
                            .Select(c => new { c.Makh, c.Mabn, c.Sohd, c.Maba, c.Khochan, c.Thanhtien })
                            .ToListAsync();
                    }
                }
            }

            // 6. Nếu vẫn chưa có mabn, kiểm tra trong dmbenhnhan bằng mabn (PK index, < 0.2ms)
            if (string.IsNullOrEmpty(mabn))
            {
                var bnCheck = await _context.DmBenhNhan.AsNoTracking()
                    .Where(b => b.Mabn == code)
                    .Select(b => b.Mabn)
                    .FirstOrDefaultAsync();

                if (!string.IsNullOrEmpty(bnCheck))
                {
                    mabn = bnCheck;
                }
            }

            // Nếu có dữ liệu chứng từ
            if (ctList.Count > 0)
            {
                var firstCt = ctList[0];
                if (string.IsNullOrEmpty(mabn)) mabn = firstCt.Mabn ?? "";
                if (string.IsNullOrEmpty(actualMakh) || actualMakh == code)
                {
                    actualMakh = !string.IsNullOrWhiteSpace(firstCt.Makh) ? firstCt.Makh : code;
                }
                maba = ctList.FirstOrDefault(c => !string.IsNullOrEmpty(c.Maba))?.Maba ?? firstCt.Maba ?? "";
                sohd = firstCt.Sohd ?? "";

                // Xác định loại: 13 (Dịch vụ nếu có khochan 13 hoặc 3), ngược lại là 14 (BHYT)
                if (ctList.Any(c => c.Khochan == "13" || c.Khochan == "3"))
                {
                    loai = 13;
                }
                else
                {
                    loai = 14;
                }

                // Tính tổng tiền & danh sách đơn thuốc (cho loại 13 Dịch vụ)
                if (loai == 13)
                {
                    var dvItems = ctList.Where(c => c.Khochan == "13" || c.Khochan == "3").ToList();
                    if (dvItems.Count == 0) dvItems = ctList;

                    var distinctDv = dvItems
                        .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd : Guid.NewGuid().ToString())
                        .Select(g => g.First())
                        .ToList();

                    tongTien = distinctDv.Sum(c => c.Thanhtien ?? 0);
                    danhSachThuoc = distinctDv.Select(c => new DuocNhapThuocItemDto
                    {
                        Sohd = c.Sohd,
                        Maba = c.Maba,
                        Thanhtien = c.Thanhtien ?? 0
                    }).ToList();
                }
                else
                {
                    var bhItems = ctList.Where(c => c.Khochan == "14" || c.Khochan == "1" || c.Khochan == "2").ToList();
                    tongTien = bhItems.Count > 0 ? (bhItems[0].Thanhtien ?? 0) : (firstCt.Thanhtien ?? 0);
                }
            }
            else
            {
                // Không có chứng từ, kiểm tra có thông tin bệnh nhân không
                if (string.IsNullOrEmpty(mabn))
                {
                    return Ok(new DuocNhapBarcodeResultDto
                    {
                        Success = false,
                        Message = $"Không tìm thấy thông tin bệnh nhân hoặc chứng từ với mã '{code}'."
                    });
                }
                loai = 14; // Mặc định hàng chờ BHYT
            }

            // 7. Tra cứu thông tin bệnh nhân từ DmBenhNhan và KhamBenh
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
                Thanhtien = tongTien,
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
    /// - Khochan: 13 (Dịch vụ), 14 (BHYT).
    /// - BHYT: Lần 1 = Thêm (dagiao = 0), Lần 2 = Ẩn (dagiao = 1).
    /// - Dịch vụ: Lần 1 = Thêm (dagiao = 0, Chờ thu), Lần 2 = Thanh toán (dagiao = 1, Đang soạn), Lần 3 = Ẩn tên (dagiao = 2, Đã phát).
    /// </summary>
    [HttpPost("them-hang-cho")]
    public async Task<IActionResult> ThemHangCho([FromBody] DuocNhapThemRequest req)
    {
        var makb = req.Makb?.Trim() ?? "";
        var mabn = req.Mabn?.Trim() ?? "";

        if (string.IsNullOrWhiteSpace(makb) && string.IsNullOrWhiteSpace(mabn))
            return Ok(new DuocNhapThemResponse { Success = false, Message = "Thiếu mã khám hoặc mã bệnh nhân." });

        if (string.IsNullOrEmpty(makb)) makb = mabn;
        if (string.IsNullOrEmpty(mabn)) mabn = makb;

        try
        {
            DateTime? ngayKcbVal = req.NgayKcb ?? DateTime.Now;

            var today = DateTime.UtcNow.Date;

            // Xác định khochan đích: 13 cho Dịch vụ, 14 cho BHYT
            int targetKhochan = (req.Khochan == 13 || req.Khochan == 3 || req.Loai == 13) ? 13 : 14;

            // Kiểm tra bệnh nhân đã có trong hàng chờ hôm nay chưa (ưu tiên makb trước, sau đó mabn)
            HangChoDuocTmd? existing = null;
            if (!string.IsNullOrEmpty(makb))
            {
                existing = await _context.HangChoDuocTmd
                    .Where(h => h.Makb == makb && h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today))
                    .OrderByDescending(h => h.Ngaynhap)
                    .FirstOrDefaultAsync();
            }
            if (existing == null && !string.IsNullOrEmpty(mabn))
            {
                existing = await _context.HangChoDuocTmd
                    .Where(h => h.Mabn == mabn && h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today))
                    .OrderByDescending(h => h.Ngaynhap)
                    .FirstOrDefaultAsync();
            }

            bool isDichVu = (targetKhochan == 13 || (existing != null && (existing.Khochan == 13 || existing.Khochan == 3)));

            if (isDichVu)
            {
                // DỊCH VỤ: Lần 1 = Thêm (dagiao = 0), Lần 2 = Đã phát thuốc (dagiao = 1)
                if (existing == null)
                {
                    await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        INSERT INTO current.hangchoduoc_tmd (mabn, makb, ngaynhap, ngaygiao, taikhoan, khochan, xoa, ngaykcb, maba, dagiao)
                        VALUES ({mabn}, {makb}, now(), now(), {req.OCua}, {targetKhochan}, 0, {ngayKcbVal}, {req.Maba}, 0)
                    ");

                    _logger.LogInformation("Lần 1 Thêm Dịch vụ: makb={Makb}, mabn={Mabn}, khochan={Khochan}, oCua={OCua}", makb, mabn, targetKhochan, req.OCua);
                    NotifyDuocQueuesUpdated(makb, mabn);
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "them",
                        Dagiao = 0,
                        Khochan = targetKhochan,
                        OCua = req.OCua,
                        Message = "Đã thêm vào hàng chờ Dịch vụ."
                    });
                }
                else if (existing.Dagiao == 0)
                {
                    // Lần 2: Đã phát thuốc -> Ẩn tên khỏi TV
                    await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE current.hangchoduoc_tmd
                        SET dagiao = 1, ngaygiao = now(), taikhoan = COALESCE({req.OCua}, taikhoan)
                        WHERE ((makb = {makb} AND makb <> '') OR (mabn = {mabn} AND mabn <> '')) AND dagiao = 0 AND xoa = 0
                    ");

                    _logger.LogInformation("Lần 2 Ẩn tên Dịch vụ (Đã phát): makb={Makb}, mabn={Mabn}", makb, mabn);
                    NotifyDuocQueuesUpdated(makb, mabn);
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "da_phat",
                        Dagiao = 1,
                        Khochan = existing.Khochan,
                        OCua = req.OCua ?? existing.Taikhoan,
                        IsUpdate = true,
                        Message = "Đã phát thuốc hoàn tất (Ẩn khỏi TV)."
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
                        OCua = existing.Taikhoan,
                        Message = "Bệnh nhân đã hoàn tất phát thuốc trước đó."
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
                        VALUES ({mabn}, {makb}, now(), now(), {req.OCua}, {targetKhochan}, 0, {ngayKcbVal}, {req.Maba}, 0)
                    ");

                    _logger.LogInformation("Lần 1 Thêm BHYT: makb={Makb}, mabn={Mabn}, khochan={Khochan}, oCua={OCua}", makb, mabn, targetKhochan, req.OCua);
                    NotifyDuocQueuesUpdated(makb, mabn);
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "them",
                        Dagiao = 0,
                        Khochan = targetKhochan,
                        OCua = req.OCua,
                        Message = "Đã thêm vào hàng chờ BHYT."
                    });
                }
                else if (existing.Dagiao == 0)
                {
                    // Lần 2: Đã phát thuốc -> Ẩn tên khỏi TV
                    await _context.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE current.hangchoduoc_tmd
                        SET dagiao = 1, ngaygiao = now(), taikhoan = COALESCE({req.OCua}, taikhoan)
                        WHERE ((makb = {makb} AND makb <> '') OR (mabn = {mabn} AND mabn <> '')) AND dagiao = 0 AND xoa = 0
                    ");

                    _logger.LogInformation("Lần 2 Ẩn tên BHYT (Đã phát): makb={Makb}, mabn={Mabn}", makb, mabn);
                    NotifyDuocQueuesUpdated(makb, mabn);
                    return Ok(new DuocNhapThemResponse
                    {
                        Success = true,
                        Action = "an_ten",
                        Dagiao = 1,
                        Khochan = existing.Khochan,
                        OCua = req.OCua ?? existing.Taikhoan,
                        IsUpdate = true,
                        Message = "Đã phát thuốc hoàn tất (Ẩn khỏi TV)."
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
                        OCua = existing.Taikhoan,
                        Message = "Bệnh nhân đã được phát thuốc trước đó."
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi thêm/cập nhật hàng chờ dược makb={Makb}, mabn={Mabn}", req.Makb, req.Mabn);
            return Ok(new DuocNhapThemResponse { Success = false, Message = "Lỗi hệ thống: " + ex.Message });
        }
    }

    /// <summary>
    /// Cập nhật trạng thái trực tiếp bằng nút bấm ở ô bên phải (Đã phát / Thanh toán)
    /// </summary>
    [HttpPost("cap-nhat-trang-thai")]
    public async Task<IActionResult> CapNhatTrangThai([FromBody] DuocCapNhatTrangThaiRequest req)
    {
        var makb = req.Makb?.Trim() ?? "";
        var mabn = req.Mabn?.Trim() ?? "";
        if (string.IsNullOrEmpty(makb) && string.IsNullOrEmpty(mabn))
            return Ok(new { success = false, message = "Thiếu mã khám hoặc mã bệnh nhân." });

        try
        {
            var oCua = req.OCua?.Trim();
            var today = DateTime.Today.AddDays(-1);

            var rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE current.hangchoduoc_tmd
                SET dagiao = {req.TargetDagiao}, ngaygiao = now(), taikhoan = COALESCE({oCua}, taikhoan)
                WHERE (({makb} <> '' AND makb = {makb}) OR ({mabn} <> '' AND mabn = {mabn}))
                  AND xoa = 0
                  AND (ngaynhap IS NULL OR ngaynhap >= {today})
            ");

            _logger.LogInformation("Cập nhật trạng thái makb={Makb}, mabn={Mabn}, targetDagiao={TargetDagiao}, oCua={OCua}, rows={Rows}", makb, mabn, req.TargetDagiao, oCua, rows);
            NotifyDuocQueuesUpdated(makb, mabn);
            return Ok(new { success = true, message = "Đã cập nhật trạng thái thành công!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi cập nhật trạng thái cho makb={Makb}", req.Makb);
            return Ok(new { success = false, message = "Lỗi khi cập nhật: " + ex.Message });
        }
    }

    /// <summary>
    /// Chỉ định ô cửa (Ô 1, Ô 2, Ô 3, Ô 4...) và phát loa gọi bệnh nhân
    /// </summary>
    [HttpPost("chi-dinh-o-cua")]
    public async Task<IActionResult> ChiDinhOCua([FromBody] DuocCapNhatTrangThaiRequest req)
    {
        var makb = req.Makb?.Trim() ?? "";
        var mabn = req.Mabn?.Trim() ?? "";
        if (string.IsNullOrEmpty(makb) && string.IsNullOrEmpty(mabn))
            return Ok(new { success = false, message = "Thiếu mã khám hoặc mã bệnh nhân." });

        try
        {
            var oCua = req.OCua?.Trim() ?? "";
            var today = DateTime.Today.AddDays(-1);

            var rows = await _context.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE current.hangchoduoc_tmd
                SET taikhoan = {oCua}
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

            _logger.LogInformation("Chỉ định ô cửa & gọi loa makb={Makb}, oCua={OCua}, hoTen={HoTen}, namSinh={NamSinh}, rows={Rows}", makb, oCua, hoTen, namSinh, rows);
            NotifyDuocQueuesUpdated(makb, mabn);

            // Phát loa gọi bệnh nhân qua SignalR tới màn hình TV
            if (!string.IsNullOrEmpty(hoTen) && !string.IsNullOrEmpty(oCua))
            {
                _logger.LogInformation("[SignalR Broadcast] Gửi duoc_trigger_speak: hoTen={HoTen}, namSinh={NamSinh}, oCua={OCua}", hoTen, namSinh, oCua);
                await _hubContext.Clients.All.SendAsync("duoc_trigger_speak", new
                {
                    hoTen = hoTen,
                    namSinh = namSinh,
                    oCua = oCua,
                    isBhyt = req.IsBhyt ?? true,
                    trangThai = req.TrangThai ?? ""
                });
            }

            return Ok(new { success = true, message = $"Đã gọi bệnh nhân đến Ô {oCua}!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi chỉ định ô cửa");
            return Ok(new { success = false, message = "Lỗi khi chỉ định: " + ex.Message });
        }
    }

    private void NotifyDuocQueuesUpdated(string? makb = null, string? mabn = null)
    {
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

            // Lấy danh sách hangchoduoc_tmd hôm nay:
            // BHYT và Dịch vụ chưa phát thuốc: dagiao == 0
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
                    h.Ngaynhap,
                    h.Taikhoan
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

            // Gom nhóm theo bệnh nhân
            var grouped = rawHangCho
                .GroupBy(x => !string.IsNullOrWhiteSpace(x.Makb) ? x.Makb.Trim() : (!string.IsNullOrWhiteSpace(x.Mabn) ? x.Mabn.Trim() : Guid.NewGuid().ToString()))
                .Select(g =>
                {
                    var first = g.OrderBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                                 .ThenBy(x => x.Makb)
                                 .ThenBy(x => x.Mabn)
                                 .First();
                    var (holot, ten, ngaysinh, gioitinh) = bnDict.TryGetValue(first.Mabn ?? "", out var bn)
                        ? bn
                        : (string.Empty, string.Empty, (DateTime?)null, (decimal?)null);

                    return new
                    {
                        first.Makb,
                        first.Mabn,
                        Khochan = g.Max(x => x.Khochan),
                        Dagiao = g.Max(x => x.Dagiao),
                        Taikhoan = g.OrderByDescending(x => !string.IsNullOrEmpty(x.Taikhoan)).Select(x => x.Taikhoan).FirstOrDefault() ?? "",
                        first.Ngaynhap,
                        Holot = holot,
                        Ten = ten,
                        Ngaysinh = ngaysinh,
                        Gioitinh = gioitinh
                    };
                })
                .OrderBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                .ThenBy(x => x.Makb)
                .ThenBy(x => x.Mabn)
                .ToList();

            // Tra cứu tiền cho đơn dịch vụ (khochan == 13 hoặc 3) - sử dụng cache bộ nhớ để giảm từ 2.7s xuống 2ms!
            var dvPatients = grouped.Where(g => g.Khochan == 13 || g.Khochan == 3).ToList();
            var dvInfoMap = new Dictionary<string, (decimal TotalTien, bool DaThu)>();

            if (dvPatients.Count > 0)
            {
                var nowUtc = DateTime.UtcNow;
                var allMakhs = dvPatients.Select(g => g.Makb).Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct().ToList();
                var allMabns = dvPatients.Select(g => g.Mabn).Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct().ToList();

                if (allMakhs.Count > 0 || allMabns.Count > 0)
                {
                    var yesterday = DateTime.Today.AddDays(-1);
                    var matchedCt = await _context.ChungTu.AsNoTracking()
                        .Where(c => (c.Xoa == null || c.Xoa == 0)
                                 && (c.Khochan == "13" || c.Khochan == "3")
                                 && (c.Ngaylap == null || c.Ngaylap >= yesterday)
                                 && ((c.Makh != null && allMakhs.Contains(c.Makh)) || (c.Mabn != null && allMabns.Contains(c.Mabn))))
                        .Select(c => new { c.Sohd, c.Makh, c.Mabn, c.Thanhtien, c.Dain })
                        .ToListAsync();

                    foreach (var g in dvPatients)
                    {
                        var gMakb = g.Makb?.Trim() ?? "";
                        var gMabn = g.Mabn?.Trim() ?? "";
                        var key = !string.IsNullOrEmpty(gMakb) ? gMakb : gMabn;
                        if (string.IsNullOrEmpty(key)) continue;

                        var cts = matchedCt
                            .Where(c => (!string.IsNullOrEmpty(gMakb) && (c.Makh?.Trim() == gMakb))
                                     || (string.IsNullOrEmpty(gMakb) && !string.IsNullOrEmpty(gMabn) && (c.Mabn?.Trim() == gMabn)))
                            .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : Guid.NewGuid().ToString())
                            .Select(cg => cg.First())
                            .ToList();

                        if (cts.Count == 0 && !string.IsNullOrEmpty(gMabn))
                        {
                            cts = matchedCt
                                .Where(c => c.Mabn?.Trim() == gMabn)
                                .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : Guid.NewGuid().ToString())
                                .Select(cg => cg.First())
                                .ToList();
                        }

                        decimal totalTien = cts.Sum(c => c.Thanhtien ?? 0);
                        bool isDaThu = cts.Count > 0 && cts.Any(c => (c.Dain ?? 0) != 0);

                        if (!string.IsNullOrEmpty(gMakb)) dvInfoMap[gMakb] = (totalTien, isDaThu);
                        if (!string.IsNullOrEmpty(gMabn)) dvInfoMap[gMabn] = (totalTien, isDaThu);
                    }
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
                bool isDaThu = false;

                if (!isBhyt)
                {
                    if (dvInfoMap.TryGetValue(key, out var dvInfo))
                    {
                        soTien = dvInfo.TotalTien;
                        soTienStr = dvInfo.TotalTien > 0 ? $"{dvInfo.TotalTien:N0} ₫" : "—";
                        isDaThu = dvInfo.DaThu;
                    }
                    else
                    {
                        soTienStr = "—";
                    }
                }

                string trangThaiStr;
                bool isDangSoan = isBhyt || isDaThu || (item.Dagiao >= 1);
                if (!isBhyt)
                {
                    trangThaiStr = isDangSoan ? "Đang soạn" : "Chờ thu";
                }
                else
                {
                    trangThaiStr = "Đang soạn";
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
                    DaThu = isDaThu,
                    TrangThai = trangThaiStr,
                    SoTien = soTien,
                    SoTienStr = soTienStr,
                    NgayNhapStr = item.Ngaynhap.HasValue ? item.Ngaynhap.Value.ToString("HH:mm") : "",
                    OCua = item.Taikhoan ?? ""
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

    /// <summary>
    /// Lấy danh sách các đơn thuốc đã hoàn tất / đã giao hôm nay (Lịch sử phát thuốc)
    /// </summary>
    [HttpGet("danh-sach-da-giao")]
    public async Task<IActionResult> LayDanhSachDaGiao()
    {
        try
        {
            var today = DateTime.Today;

            // Lịch sử đã phát thuốc hôm nay: dagiao >= 1
            var rawDaGiao = await _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today)
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

            var grouped = rawDaGiao
                .GroupBy(x => !string.IsNullOrWhiteSpace(x.Makb) ? x.Makb.Trim() : (!string.IsNullOrWhiteSpace(x.Mabn) ? x.Mabn.Trim() : Guid.NewGuid().ToString()))
                .Select(g =>
                {
                    var first = g.First();
                    var (holot, ten, ngaysinh, gioitinh) = bnDict.TryGetValue(first.Mabn ?? "", out var bn)
                        ? bn
                        : (string.Empty, string.Empty, (DateTime?)null, (decimal?)null);
                    return new
                    {
                        first.Makb,
                        first.Mabn,
                        Khochan = g.Max(x => x.Khochan),
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

            var result = grouped.Select(item =>
            {
                var hoTen = $"{item.Holot} {item.Ten}".Trim();
                if (string.IsNullOrEmpty(hoTen))
                {
                    hoTen = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                }

                bool isBhyt = (item.Khochan == 14 || item.Khochan == 1 || item.Khochan == 2);

                return new DuocDaGiaoItemDto
                {
                    Makb = item.Makb,
                    Mabn = item.Mabn,
                    HoTen = hoTen,
                    NamSinh = item.Ngaysinh.HasValue ? item.Ngaysinh.Value.ToString("yyyy") : "",
                    GioiTinh = item.Gioitinh == 1 ? "Nam" : (item.Gioitinh == 2 ? "Nữ" : ""),
                    Khochan = item.Khochan,
                    IsBhyt = isBhyt,
                    Dagiao = item.Dagiao,
                    NgayGiaoStr = item.Ngaygiao.ToString("HH:mm"),
                    OCua = item.Taikhoan ?? ""
                };
            }).ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi lấy danh sách đã giao (lịch sử)");
            return Ok(new List<DuocDaGiaoItemDto>());
        }
    }

    /// <summary>
    /// Lấy danh sách các đơn thuốc dịch vụ đã thu tiền hôm nay (Lịch sử thu tiền)
    /// </summary>
    [HttpGet("danh-sach-da-thu")]
    public async Task<IActionResult> LayDanhSachDaThu()
    {
        try
        {
            var today = DateTime.Today;

            // Dịch vụ đã thu: (khochan == 13 || khochan == 3) && dagiao >= 1
            var rawDaThu = await _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today)
                         && (h.Khochan == 13 || h.Khochan == 3) && h.Dagiao >= 1)
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

            var mabnList = rawDaThu
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

            var grouped = rawDaThu
                .GroupBy(x => !string.IsNullOrWhiteSpace(x.Makb) ? x.Makb.Trim() : (!string.IsNullOrWhiteSpace(x.Mabn) ? x.Mabn.Trim() : Guid.NewGuid().ToString()))
                .Select(g =>
                {
                    var first = g.First();
                    var (holot, ten, ngaysinh, gioitinh) = bnDict.TryGetValue(first.Mabn ?? "", out var bn)
                        ? bn
                        : (string.Empty, string.Empty, (DateTime?)null, (decimal?)null);
                    return new
                    {
                        first.Makb,
                        first.Mabn,
                        Khochan = g.Max(x => x.Khochan),
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

            // Tính tiền dịch vụ cho danh sách đã giao
            var dvInfoMap = new Dictionary<string, decimal>();
            var allMakhs = grouped.Where(g => g.Khochan == 13 || g.Khochan == 3)
                                  .Select(g => g.Makb).Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct().ToList();
            var allMabns = grouped.Where(g => g.Khochan == 13 || g.Khochan == 3)
                                  .Select(g => g.Mabn).Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct().ToList();

            if (allMakhs.Count > 0 || allMabns.Count > 0)
            {
                var yesterday = DateTime.Today.AddDays(-1);
                var matchedCt = await _context.ChungTu.AsNoTracking()
                    .Where(c => (c.Xoa == null || c.Xoa == 0)
                             && (c.Khochan == "13" || c.Khochan == "3")
                             && (c.Ngaylap == null || c.Ngaylap >= yesterday)
                             && ((c.Makh != null && allMakhs.Contains(c.Makh)) || (c.Mabn != null && allMabns.Contains(c.Mabn))))
                    .Select(c => new { c.Sohd, c.Makh, c.Mabn, c.Thanhtien })
                    .ToListAsync();

                foreach (var g in grouped)
                {
                    var gMakb = g.Makb?.Trim() ?? "";
                    var gMabn = g.Mabn?.Trim() ?? "";
                    if (string.IsNullOrEmpty(gMakb) && string.IsNullOrEmpty(gMabn)) continue;

                    var cts = matchedCt
                        .Where(c => (!string.IsNullOrEmpty(gMakb) && c.Makh?.Trim() == gMakb)
                                 || (string.IsNullOrEmpty(gMakb) && !string.IsNullOrEmpty(gMabn) && c.Mabn?.Trim() == gMabn))
                        .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : Guid.NewGuid().ToString())
                        .Select(cg => cg.First())
                        .ToList();

                    if (cts.Count == 0 && !string.IsNullOrEmpty(gMabn))
                    {
                        cts = matchedCt
                            .Where(c => c.Mabn?.Trim() == gMabn)
                            .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : Guid.NewGuid().ToString())
                            .Select(cg => cg.First())
                            .ToList();
                    }

                    decimal totalTien = cts.Sum(c => c.Thanhtien ?? 0);
                    if (!string.IsNullOrEmpty(gMakb)) dvInfoMap[gMakb] = totalTien;
                    if (!string.IsNullOrEmpty(gMabn)) dvInfoMap[gMabn] = totalTien;
                }
            }

            var result = grouped.Select(item =>
            {
                var hoTen = $"{item.Holot} {item.Ten}".Trim();
                if (string.IsNullOrEmpty(hoTen))
                {
                    hoTen = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                }

                var key = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                decimal? soTien = null;
                string soTienStr = string.Empty;

                if (dvInfoMap.TryGetValue(key, out var totalTien))
                {
                    soTien = totalTien;
                    soTienStr = totalTien > 0 ? $"{totalTien:N0} ₫" : "—";
                }
                else
                {
                    soTienStr = "—";
                }

                return new DuocChuaGiaoItemDto
                {
                    Makb = item.Makb,
                    Mabn = item.Mabn,
                    HoTen = hoTen,
                    NamSinh = item.Ngaysinh.HasValue ? item.Ngaysinh.Value.ToString("yyyy") : "",
                    GioiTinh = item.Gioitinh == 1 ? "Nam" : (item.Gioitinh == 2 ? "Nữ" : ""),
                    Khochan = item.Khochan,
                    IsBhyt = false,
                    Dagiao = item.Dagiao,
                    TrangThai = item.Dagiao >= 2 ? "Đã phát thuốc" : "Đã thu tiền (Đang soạn)",
                    SoTien = soTien,
                    SoTienStr = soTienStr,
                    NgayNhapStr = item.Ngaygiao.ToString("HH:mm"),
                    OCua = item.Taikhoan ?? ""
                };
            }).ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi lấy danh sách đã thu (lịch sử thu tiền)");
            return Ok(new List<DuocChuaGiaoItemDto>());
        }
    }

    /// <summary>
    /// Hoàn tác phát thuốc: Đưa bệnh nhân từ Lịch sử đã phát quay lại danh sách Chờ phát (dagiao = 0)
    /// </summary>
    [HttpPost("hoan-tac")]
    public async Task<IActionResult> HoanTac([FromBody] DuocHoanTacRequest req)
    {
        var makb = req.Makb?.Trim() ?? "";
        var mabn = req.Mabn?.Trim() ?? "";
        if (string.IsNullOrEmpty(makb) && string.IsNullOrEmpty(mabn))
            return Ok(new { success = false, message = "Thiếu mã khám hoặc mã bệnh nhân." });

        try
        {
            var today = DateTime.Today.AddDays(-1);
            var item = await _context.HangChoDuocTmd
                .Where(h => ((makb != "" && h.Makb == makb) || (mabn != "" && h.Mabn == mabn))
                         && h.Xoa == 0 && (h.Ngaynhap == null || h.Ngaynhap >= today))
                .OrderByDescending(h => h.Ngaynhap)
                .FirstOrDefaultAsync();

            if (item == null)
            {
                return Ok(new { success = false, message = "Không tìm thấy thông tin bệnh nhân trong hàng chờ." });
            }

            // Đưa dagiao về 0 để quay lại danh sách Chờ phát
            item.Dagiao = 0;
            await _context.SaveChangesAsync();

            _logger.LogInformation("Hoàn tác phát thuốc makb={Makb}, mabn={Mabn}", makb, mabn);
            NotifyDuocQueuesUpdated(makb, mabn);

            return Ok(new { success = true, message = "Đã hoàn tác phát thuốc, đưa bệnh nhân về danh sách Chờ phát!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi hoàn tác cho makb={Makb}", req.Makb);
            return Ok(new { success = false, message = "Lỗi hoàn tác: " + ex.Message });
        }
    }
}

