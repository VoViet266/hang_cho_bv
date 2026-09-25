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
            query = query.Where(h => h.Khochan == 14);
        }
        else
        {
            query = query.Where(h => h.Khochan == 13);
        }

        // Đếm số lượng bệnh nhân khác nhau trong ngày (tránh đếm trùng)
        return await query
            .Select(h => !string.IsNullOrEmpty(h.Makb) ? h.Makb : h.Mabn)
            .Distinct()
            .CountAsync();
    }

    public async Task<DuocQueuePageDto> LayDanhSachHangChoDuocAsync(string duocType)
    {
        var isAll = duocType.Equals("all", StringComparison.OrdinalIgnoreCase);
        var isBhyt = !isAll && duocType.Equals("bhyt", StringComparison.OrdinalIgnoreCase);
        var title = isAll
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
                         && (h.Ngaynhap == null || h.Ngaynhap >= cutoffTime)
                         && h.Dagiao == 0);

            if (isAll)
            {
                baseQuery = baseQuery.Where(h =>
                    h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2
                    || h.Khochan == 13 || h.Khochan == 3);
            }
            else if (isBhyt)
            {
                baseQuery = baseQuery.Where(h => h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2);
            }
            else
            {
                baseQuery = baseQuery.Where(h => h.Khochan == 13 || h.Khochan == 3);
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

            // Nếu là Dịch vụ: tra cứu số tiền và trạng thái đã in (dain != 0) từ chungtu
            var dvInfoMap = new Dictionary<string, (decimal TotalTien, bool DaThu)>();
            if (!isBhyt && groupedList.Count > 0)
            {
                var now = DateTime.UtcNow;

                var allMakhs = groupedList.Select(g => g.Makb).Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct().ToList();
                var allMabns = groupedList.Select(g => g.Mabn).Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct().ToList();

                if (allMakhs.Count > 0 || allMabns.Count > 0)
                {
                    var yesterday = DateTime.Today.AddDays(-1);
                    var matchedChungTu = await _context.ChungTu.AsNoTracking()
                        .Where(c => (c.Xoa == null || c.Xoa == 0)
                                 && (c.Khochan == "13" || c.Khochan == "3")
                                 && (c.Ngaylap == null || c.Ngaylap >= yesterday)
                                 && ((c.Makh != null && allMakhs.Contains(c.Makh)) || (c.Mabn != null && allMabns.Contains(c.Mabn))))
                        .Select(c => new { c.Sohd, c.Makh, c.Mabn, c.Thanhtien, c.Dain })
                        .ToListAsync();

                    foreach (var g in groupedList)
                    {
                        var gMakb = g.Makb?.Trim() ?? "";
                        var gMabn = g.Mabn?.Trim() ?? "";
                        var key = !string.IsNullOrEmpty(gMakb) ? gMakb : gMabn;
                        if (string.IsNullOrEmpty(key)) continue;

                        var patientCts = matchedChungTu
                            .Where(c => (!string.IsNullOrEmpty(gMakb) && (c.Makh?.Trim() == gMakb))
                                     || (string.IsNullOrEmpty(gMakb) && !string.IsNullOrEmpty(gMabn) && (c.Mabn?.Trim() == gMabn)))
                            .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : Guid.NewGuid().ToString())
                            .Select(cg => cg.First())
                            .ToList();

                        if (patientCts.Count == 0 && !string.IsNullOrEmpty(gMabn))
                        {
                            patientCts = matchedChungTu
                                .Where(c => c.Mabn?.Trim() == gMabn)
                                .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : Guid.NewGuid().ToString())
                                .Select(cg => cg.First())
                                .ToList();
                        }

                        decimal totalTien = patientCts.Sum(c => c.Thanhtien ?? 0);
                        bool isDaThu = patientCts.Count > 0 && patientCts.Any(c => (c.Dain ?? 0) != 0);

                        if (!string.IsNullOrEmpty(gMakb)) dvInfoMap[gMakb] = (totalTien, isDaThu);
                        if (!string.IsNullOrEmpty(gMabn)) dvInfoMap[gMabn] = (totalTien, isDaThu);
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

                var cleanMakb = item.Makb?.Trim() ?? "";
                var cleanMabn = item.Mabn?.Trim() ?? "";
                decimal? soTien = null;
                string soTienStr = string.Empty;
                bool isDaThu = false;

                var itemIsBhyt = (item.Khochan == 14 || item.Khochan == 1 || item.Khochan == 2);

                if (!itemIsBhyt)
                {
                    (decimal TotalTien, bool DaThu) dvInfo = (0, false);
                    bool found = (!string.IsNullOrEmpty(cleanMakb) && dvInfoMap.TryGetValue(cleanMakb, out dvInfo))
                              || (!string.IsNullOrEmpty(cleanMabn) && dvInfoMap.TryGetValue(cleanMabn, out dvInfo));

                    if (found)
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
                // - Toa Dịch Vụ: Dựa vào cột dain trong bảng chungtu (dain != 0 là đã in/thu tiền) hoặc dagiao >= 1
                //   Đã thu -> "Đang soạn"
                //   Chưa thu -> "Chờ thu"
                // - Toa BHYT: Mặc định là "Đang soạn"
                string trangThaiStr;
                bool isDangSoan = itemIsBhyt || isDaThu || (item.Dagiao >= 1);
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
