using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services;

public interface IDuocService
{
    Task<DuocQueuePageDto> LayDanhSachHangChoDuocAsync(string duocType);
    Task<int> LayThongKeDuocAsync(string duocType);
}

public class DuocService : IDuocService
{
    private static readonly ConcurrentDictionary<string, (decimal TotalTien, DateTime ExpireAt)> _dvMoneyCache = new();

    public static void InvalidateCache(string? key)
    {
        if (!string.IsNullOrWhiteSpace(key))
        {
            _dvMoneyCache.TryRemove(key.Trim(), out _);
        }
    }

    private readonly AppDbContext _context;
    private readonly ILogger<DuocService> _logger;

    public DuocService(AppDbContext context, ILogger<DuocService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<int> LayThongKeDuocAsync(string duocType)
    {
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);
        var isBhyt = duocType.Equals("bhyt", StringComparison.OrdinalIgnoreCase);

        var query = _context.HangChoDuocTmd.AsNoTracking()
            .Where(h => h.Xoa == 0
                     && h.Ngaynhap >= today && h.Ngaynhap < tomorrow);

        if (isBhyt)
        {
            query = query.Where(h => h.Khochan == 14 );
        }
        else
        {
            query = query.Where(h => h.Khochan == 13 );
        }

        // Đếm số lượng bệnh nhân khác nhau trong ngày (tránh đếm trùng)
        return await query
            .Select(h => !string.IsNullOrEmpty(h.Makb) ? h.Makb : h.Mabn)
            .Distinct()
            .CountAsync();
    }

    public async Task<DuocQueuePageDto> LayDanhSachHangChoDuocAsync(string duocType)
    {
        var isAll  = duocType.Equals("all",    StringComparison.OrdinalIgnoreCase);
        var isBhyt = !isAll && duocType.Equals("bhyt", StringComparison.OrdinalIgnoreCase);
        var title  = isAll
            ? "KHOA DƯỢC - HÀNG CHỜ PHÁT THUỐC"
            : (isBhyt
                ? "KHOA DƯỢC - HÀNG CHỜ PHÁT THUỐC BẢO HIỂM"
                : "KHOA DƯỢC - HÀNG CHỜ PHÁT THUỐC DỊCH VỤ");

        var cutoffTime = DateTime.Today; // Hôm nay
        var tomorrow = cutoffTime.AddDays(1);

        try
        {
            var baseQuery = _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Xoa == 0
                         && (h.Ngaynhap == null || h.Ngaynhap >= cutoffTime));

            if (isAll)
            {
                // Gộp cả BHYT (dagiao=0) và Dịch Vụ (dagiao=0,1)
                baseQuery = baseQuery.Where(h =>
                    ((h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2) && h.Dagiao == 0)
                    || ((h.Khochan == 13 || h.Khochan == 3) && (h.Dagiao == 0 || h.Dagiao == 1)));
            }
            else if (isBhyt)
            {
                baseQuery = baseQuery.Where(h => (h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2) && h.Dagiao == 0);
            }
            else
            {
                // Dịch vụ: lấy cả dagiao = 0 (Chờ thu) và dagiao = 1 (Đang soạn thuốc)
                baseQuery = baseQuery.Where(h => (h.Khochan == 13 || h.Khochan == 3) && (h.Dagiao == 0 || h.Dagiao == 1));
            }

            var rawHangCho = await baseQuery
                .OrderBy(h => h.Ngaynhap)
                .ThenBy(h => h.Makb)
                .ThenBy(h => h.Mabn)
                .Select(h => new
                {
                    h.Mabn,
                    h.Makb,
                    h.Khochan,
                    h.Dagiao,
                    h.Maba,
                    h.Ngaynhap,
                    h.Ngaygiao,
                    h.Taikhoan
                })
                .ToListAsync();

            // Lấy thông tin danh mục bệnh nhân CHỈ cho danh sách mã bệnh nhân trong hàng chờ (nhanh gấp 100 lần so với JOIN toàn bảng)
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
                    h.Mabn,
                    h.Makb,
                    h.Khochan,
                    h.Dagiao,
                    h.Maba,
                    h.Ngaynhap,
                    h.Ngaygiao,
                    Taikhoan = h.Taikhoan,
                    Holot = holot,
                    Ten = ten,
                    Ngaysinh = ngaysinh,
                    Gioitinh = gioitinh
                };
            }).ToList();

            // Gom nhóm theo bệnh nhân (makb hoặc mabn) để mỗi bệnh nhân chỉ xuất hiện 1 dòng duy nhất trên bảng TV
            var groupedList = rawList
                .GroupBy(x => !string.IsNullOrWhiteSpace(x.Makb) ? x.Makb.Trim() : (!string.IsNullOrWhiteSpace(x.Mabn) ? x.Mabn.Trim() : Guid.NewGuid().ToString()))
                .Select(g =>
                {
                    var first = g.OrderBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                                 .ThenBy(x => x.Makb)
                                 .ThenBy(x => x.Mabn)
                                 .First();
                    var maxKhochan = g.Max(x => x.Khochan);
                    var maxDagiao = g.Max(x => x.Dagiao);
                    return new
                    {
                        first.Mabn,
                        first.Makb,
                        Khochan = maxKhochan,
                        Dagiao = maxDagiao,
                        first.Maba,
                        first.Ngaynhap,
                        first.Ngaygiao,
                        Taikhoan = g.OrderByDescending(x => !string.IsNullOrEmpty(x.Taikhoan)).Select(x => x.Taikhoan).FirstOrDefault() ?? "",
                        first.Holot,
                        first.Ten,
                        first.Ngaysinh,
                        first.Gioitinh,
                        PrescriptionCount = g.Count()
                    };
                })
                .OrderBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                .ThenBy(x => x.Makb)
                .ThenBy(x => x.Mabn)
                .ToList();

            // Nếu là Dịch vụ: tra cứu số tiền từ chungtu (theo makh/mabn) và tổng lại tất cả toa dịch vụ (khochan = 13)
            var dvInfoMap = new Dictionary<string, decimal>();
            if (!isBhyt && groupedList.Count > 0)
            {
                var now = DateTime.UtcNow;

                // Kiểm tra cache tiền trước
                var missingMakhs = new List<string>();
                var missingMabnsWithoutMakh = new List<string>();

                foreach (var g in groupedList)
                {
                    var key = !string.IsNullOrEmpty(g.Makb) ? g.Makb : g.Mabn;
                    if (!string.IsNullOrEmpty(key) && _dvMoneyCache.TryGetValue(key, out var cached) && cached.ExpireAt > now)
                    {
                        dvInfoMap[key] = cached.TotalTien;
                    }
                    else
                    {
                        if (!string.IsNullOrEmpty(g.Makb)) missingMakhs.Add(g.Makb);
                        else if (!string.IsNullOrEmpty(g.Mabn)) missingMabnsWithoutMakh.Add(g.Mabn);
                    }
                }

                if (missingMakhs.Count > 0 || missingMabnsWithoutMakh.Count > 0)
                {
                    var matchedChungTu = new List<(string? Sohd, string? Makh, string? Mabn, decimal? Tienvat)>();

                    // Dùng trực tiếp Index Scan trên makh (chỉ vài mili-giây, không quét toàn bảng)
                    if (missingMakhs.Count > 0)
                    {
                        var makhRecords = await _context.ChungTu.AsNoTracking()
                            .Where(c => (c.Xoa == null || c.Xoa == 0)
                                     && (c.Khochan == "13" || c.Khochan == "3")
                                     && missingMakhs.Contains(c.Makh))
                            .Select(c => new { c.Sohd, c.Makh, c.Mabn, c.Tienvat })
                            .ToListAsync();

                        matchedChungTu.AddRange(makhRecords.Select(c => (c.Sohd, c.Makh, c.Mabn, c.Tienvat)));
                    }

                    if (missingMabnsWithoutMakh.Count > 0)
                    {
                        var mabnRecords = await _context.ChungTu.AsNoTracking()
                            .Where(c => (c.Xoa == null || c.Xoa == 0)
                                     && (c.Khochan == "13" || c.Khochan == "3")
                                     && missingMabnsWithoutMakh.Contains(c.Mabn))
                            .Select(c => new { c.Sohd, c.Makh, c.Mabn, c.Tienvat })
                            .ToListAsync();

                        matchedChungTu.AddRange(mabnRecords.Select(c => (c.Sohd, c.Makh, c.Mabn, c.Tienvat)));
                    }

                    foreach (var g in groupedList)
                    {
                        var key = !string.IsNullOrEmpty(g.Makb) ? g.Makb : g.Mabn;
                        if (string.IsNullOrEmpty(key) || dvInfoMap.ContainsKey(key)) continue;

                        var patientCts = matchedChungTu
                            .Where(c => (!string.IsNullOrEmpty(g.Makb) && c.Makh == g.Makb)
                                     || (!string.IsNullOrEmpty(g.Mabn) && c.Mabn == g.Mabn))
                            .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd : Guid.NewGuid().ToString())
                            .Select(cg => cg.First())
                            .ToList();

                        decimal totalTien = patientCts.Sum(c => c.Tienvat ?? 0);
                        dvInfoMap[key] = totalTien;
                        _dvMoneyCache[key] = (totalTien, now.AddSeconds(60));
                    }
                }
            }

            var waitingList = new List<DuocQueueItemDto>();
            string nextPatientName = string.Empty;

            for (int i = 0; i < groupedList.Count; i++)
            {
                var item = groupedList[i];
                var hoTen = $"{item.Holot} {item.Ten}".Trim();
                if (string.IsNullOrEmpty(hoTen))
                {
                    hoTen = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                }

                var key = !string.IsNullOrEmpty(item.Makb) ? item.Makb : item.Mabn;
                decimal? soTien = null;
                string soTienStr = string.Empty;

                // Mỗi item tự xác định loại dựa trên khochan (quan trọng khi mode = all)
                var itemIsBhyt = (item.Khochan == 14 || item.Khochan == 1 || item.Khochan == 2);

                if (!itemIsBhyt)
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

                var isToiLuot = (i == 0);
                if (isToiLuot)
                {
                    nextPatientName = hoTen;
                }

                var namSinhStr = item.Ngaysinh.HasValue ? item.Ngaysinh.Value.ToString("yyyy") : "";
                var loaiToaStr = item.Khochan switch
                {
                    13 => "Toa Dịch Vụ",
                    14 => "Toa BHYT",
                    3 => "Toa Dịch Vụ",
                    1 => "Toa BHYT",
                    2 => "Toa BHYT",
                    _ => itemIsBhyt ? "Toa BHYT" : "Toa Dịch Vụ"
                };

                // Trạng thái:
                // - Toa Dịch Vụ: Dựa vào cột dagiao trong bảng hangchoduoc_tmd
                //   dagiao == 0 -> "Chờ thu"
                //   dagiao >= 1 -> "Đang soạn"
                // - Toa BHYT: Mặc định là "Đang soạn"
                string trangThaiStr;
                bool isDangSoan = item.Dagiao >= 1;
                if (!itemIsBhyt)
                {
                    trangThaiStr = isDangSoan ? "Đang soạn" : "Chờ thu";
                }
                else
                {
                    trangThaiStr = "Đang soạn";
                }

                waitingList.Add(new DuocQueueItemDto
                {
                    Stt = i + 1,
                    Mabn = item.Mabn!,
                    Makb = item.Makb!,
                    TenBenhNhan = hoTen!,
                    NamSinh = namSinhStr,
                    GioiTinh = item.Gioitinh == 1 ? "Nam" : (item.Gioitinh == 2 ? "Nữ" : ""),
                    LoaiToa = loaiToaStr,
                    Khochan = item.Khochan,
                    Maba = item.Maba,
                    NgayNhap = item.Ngaynhap,
                    NgayNhapStr = item.Ngaynhap.HasValue ? item.Ngaynhap.Value.ToString("HH:mm") : "",
                    TrangThai = trangThaiStr,
                    IsToiLuot = isToiLuot,
                    IsBhyt = itemIsBhyt,
                    SoTien = soTien,
                    SoTienStr = soTienStr,
                    DaThu = isDangSoan,
                    Dagiao = item.Dagiao,
                    OCua = item.Taikhoan ?? ""
                });
            }

            var totalToday = await LayThongKeDuocAsync(duocType);

            return new DuocQueuePageDto
            {
                DuocType = isAll ? "all" : (isBhyt ? "bhyt" : "dichvu"),
                Title = title,
                TotalWaiting = waitingList.Count,
                TotalToday = Math.Max(totalToday, waitingList.Count),
                WaitingList = waitingList,
                NextPatientName = nextPatientName
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi lấy danh sách hàng chờ dược duocType={Type}", duocType);
            return new DuocQueuePageDto
            {
                DuocType = isAll ? "all" : (isBhyt ? "bhyt" : "dichvu"),
                Title = title,
                TotalWaiting = 0,
                TotalToday = 0,
                WaitingList = new(),
                NextPatientName = string.Empty
            };
        }
    }
}
