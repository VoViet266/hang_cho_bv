using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{
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
            var isAll = duocType.Equals("all", StringComparison.OrdinalIgnoreCase);
            var isBhyt = !isAll && duocType.Equals("bhyt", StringComparison.OrdinalIgnoreCase);

            var query = _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Xoa == 0
                         && h.Ngaynhap >= today && h.Ngaynhap < tomorrow);

            if (isAll)
            {
                query = query.Where(h => h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2 || h.Khochan == 13 || h.Khochan == 3);
            }
            else if (isBhyt)
            {
                query = query.Where(h => h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2);
            }
            else
            {
                query = query.Where(h => h.Khochan == 13 || h.Khochan == 3);
            }

            // Đếm số lượng bệnh nhân khác nhau trong ngày
            return await query
                .Select(h => !string.IsNullOrEmpty(h.Makb) ? h.Makb : h.Mabn)
                .Distinct()
                .CountAsync();
        }

        public async Task<DuocQueuePageDto> LayDanhSachHangChoDuocAsync(string duocType)
        {
            var isAll = duocType.Equals("all", StringComparison.OrdinalIgnoreCase);
            var isBhyt = !isAll && duocType.Equals("bhyt", StringComparison.OrdinalIgnoreCase);
            var isDichVu = !isAll && !isBhyt;
            var title = isAll
                ? "KHOA DƯỢC - HÀNG CHỜ PHÁT THUỐC"
                : (isBhyt
                    ? "KHOA DƯỢC - HÀNG CHỜ PHÁT THUỐC BẢO HIỂM"
                    : "KHOA DƯỢC - HÀNG CHỜ PHÁT THUỐC DỊCH VỤ");

            var cutoffTime = DateTime.Today;

            try
            {
                var rawHangCho = await _context.HangChoDuocTmd.AsNoTracking()
                    .Where(h => h.Xoa == 0
                             && (h.Ngaynhap == null || h.Ngaynhap >= cutoffTime)
                             && h.Dagiao == 0
                             && (h.Khochan == 14 || h.Khochan == 1 || h.Khochan == 2 || h.Khochan == 13 || h.Khochan == 3))
                    .OrderBy(h => h.Ngaynhap)
                    .ThenBy(h => h.Makb)
                    .ThenBy(h => h.Mabn)
                    .Select(h => new
                    {
                        h.Mabn,
                        h.Makb,
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
                    .Distinct()
                    .ToList();

                var bnDict = new Dictionary<string, (string Holot, string Ten, DateTime? Ngaysinh, decimal? Gioitinh)>(StringComparer.OrdinalIgnoreCase);
                if (mabnList.Count > 0)
                {
                    var bnRecords = await _context.DmBenhNhan.AsNoTracking()
                        .Where(bn => bn.Mabn != null && mabnList.Contains(bn.Mabn))
                        .Select(bn => new { bn.Mabn, bn.Holot, bn.Ten, bn.Ngaysinh, bn.Gioitinh })
                        .ToListAsync();

                    foreach (var b in bnRecords)
                    {
                        if (!string.IsNullOrEmpty(b.Mabn))
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
                        h.Dathu,
                        h.Maba,
                        h.Ngaynhap,
                        h.Ngaygiao,
                        h.Taikhoan,
                        Holot = holot,
                        Ten = ten,
                        Ngaysinh = ngaysinh,
                        Gioitinh = gioitinh
                    };
                }).ToList();

                // Gom nhóm theo Bệnh nhân (Makb / Mabn) để mỗi bệnh nhân chỉ xuất hiện đúng 1 dòng trên màn hình TV
                var groupedList = rawList
                    .GroupBy(x => !string.IsNullOrWhiteSpace(x.Makb) ? x.Makb.Trim() : (!string.IsNullOrWhiteSpace(x.Mabn) ? x.Mabn.Trim() : (x.Maba ?? string.Empty)))
                    .Select(g =>
                    {
                        var first = g.OrderBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                                     .ThenBy(x => x.Makb)
                                     .ThenBy(x => x.Mabn)
                                     .First();
                        var maxDagiao = g.Max(x => x.Dagiao);
                        var latestNgayGiao = g.Max(x => x.Ngaygiao);
                        var earliestNgayNhap = g.Min(x => x.Ngaynhap);
                        var assignedOcua = g.OrderByDescending(x => !string.IsNullOrEmpty(x.Taikhoan)).Select(x => x.Taikhoan).FirstOrDefault() ?? "";
                        var assignedMaba = g.OrderByDescending(x => !string.IsNullOrEmpty(x.Maba)).Select(x => x.Maba).FirstOrDefault() ?? "";
                    
                        bool hasBhyt = g.Any(x => x.Khochan == 14 || x.Khochan == 1 || x.Khochan == 2);
                        bool hasDv = g.Any(x => x.Khochan == 13 || x.Khochan == 3);
                        bool hasBoth = hasBhyt && hasDv;
                        int primaryKhochan = hasBoth ? 0 : (hasDv ? 13 : 14);
                        bool dvDathuInDb = g.Where(x => x.Khochan == 13 || x.Khochan == 3).Any(x => x.Dathu == true);

                        return new
                        {
                            first.Mabn,
                            first.Makb,
                            Khochan = primaryKhochan,
                            HasBhyt = hasBhyt,
                            HasDichVu = hasDv,
                            HasBoth = hasBoth,
                            Dagiao = maxDagiao,
                            DvDathuInDb = dvDathuInDb,
                            Maba = assignedMaba,
                            Ngaynhap = earliestNgayNhap,
                            Ngaygiao = latestNgayGiao,
                            Taikhoan = assignedOcua,
                            first.Holot,
                            first.Ten,
                            first.Ngaysinh,
                            first.Gioitinh,
                            PrescriptionCount = g.Count()
                        };
                    })
                    .OrderByDescending(x => !string.IsNullOrWhiteSpace(x.Taikhoan))
                    .ThenByDescending(x => !string.IsNullOrWhiteSpace(x.Taikhoan) ? x.Ngaygiao : DateTime.MinValue)
                    .ThenBy(x => x.Ngaynhap ?? DateTime.MaxValue)
                    .ThenBy(x => x.Makb)
                    .ThenBy(x => x.Mabn)
                    .ToList();

                if (isBhyt)
                {
                    groupedList = groupedList.Where(x => x.HasBhyt).ToList();
                }
                else if (isDichVu)
                {
                    groupedList = groupedList.Where(x => x.HasDichVu).ToList();
                }

                // Nếu có Toa Dịch vụ: tra cứu số tiền và trạng thái đã in (dain != 0 hoặc dathu != 0) từ chungtu
                var dvInfoMap = new Dictionary<string, (decimal TotalTien, bool DaThu)>(StringComparer.OrdinalIgnoreCase);
                var dvPatients = groupedList.Where(g => g.HasDichVu).ToList();
                if (dvPatients.Count > 0)
                {
                    var allMakhs = dvPatients.Select(g => g.Makb).Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                    var allMabns = dvPatients.Select(g => g.Mabn).Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

                    if (allMakhs.Count > 0 || allMabns.Count > 0)
                    {
                        var yesterday = DateTime.Today.AddDays(-2);
                        var matchedChungTu = await _context.ChungTu.AsNoTracking()
                            .Where(c => (c.Xoa == null || c.Xoa == 0)
                                     && (c.Khochan == "13" || c.Khochan == "3")
                                     && (c.Ngaylap == null || c.Ngaylap >= yesterday)
                                     && ((c.Makh != null && allMakhs.Contains(c.Makh)) || (c.Mabn != null && allMabns.Contains(c.Mabn))))
                            .Select(c => new ChungTuShortDto { Sohd = c.Sohd, Makh = c.Makh, Mabn = c.Mabn, Thanhtien = c.Thanhtien, Dain = c.Dain, Dathu = c.Dathu })
                            .ToListAsync();

                        foreach (var g in dvPatients)
                        {
                            var gMakb = g.Makb?.Trim() ?? "";
                            var gMabn = g.Mabn?.Trim() ?? "";
                            var key = !string.IsNullOrEmpty(gMakb) ? gMakb : gMabn;
                            if (string.IsNullOrEmpty(key)) continue;

                            var patientCts = matchedChungTu
                                .Where(c => (!string.IsNullOrEmpty(gMakb) && string.Equals(c.Makh?.Trim(), gMakb, StringComparison.OrdinalIgnoreCase))
                                         || (string.IsNullOrEmpty(gMakb) && !string.IsNullOrEmpty(gMabn) && string.Equals(c.Mabn?.Trim(), gMabn, StringComparison.OrdinalIgnoreCase)))
                                .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : (c.Makh ?? string.Empty))
                                .Select(cg => cg.First())
                                .ToList();

                            if (patientCts.Count == 0 && !string.IsNullOrEmpty(gMabn))
                            {
                                patientCts = matchedChungTu
                                    .Where(c => string.Equals(c.Mabn?.Trim(), gMabn, StringComparison.OrdinalIgnoreCase))
                                    .GroupBy(c => !string.IsNullOrEmpty(c.Sohd) ? c.Sohd.Trim() : (c.Makh ?? string.Empty))
                                    .Select(cg => cg.First())
                                    .ToList();
                            }

                            decimal totalTien = patientCts.Sum(c => c.Thanhtien ?? 0);
                            bool isDaThu = patientCts.Count > 0 && patientCts.Any(c => (c.Dain ?? 0) != 0 || (c.Dathu ?? 0) != 0);

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

                    bool isPaidDv = false;
                    if (item.HasDichVu)
                    {
                        (decimal TotalTien, bool DaThu) dvInfo = (0, false);
                        bool found = (!string.IsNullOrEmpty(cleanMakb) && dvInfoMap.TryGetValue(cleanMakb, out dvInfo))
                                  || (!string.IsNullOrEmpty(cleanMabn) && dvInfoMap.TryGetValue(cleanMabn, out dvInfo));

                        if (found)
                        {
                            soTien = dvInfo.TotalTien;
                            soTienStr = dvInfo.TotalTien > 0 ? $"{dvInfo.TotalTien:N0} ₫" : "—";
                            isPaidDv = dvInfo.DaThu;
                        }
                        else
                        {
                            soTienStr = "—";
                            isPaidDv = item.DvDathuInDb;
                        }
                    }

                    string loaiToaStr;
                    string trangThaiStr;
                    bool isBhytFlag;
                    bool isDangSoanFlag;

                    if (item.HasBoth)
                    {
                        if (isBhyt)
                        {
                            // Trên màn hình BHYT: Đơn BHYT luôn sẵn sàng soạn thuốc
                            loaiToaStr = "Toa BHYT";
                            trangThaiStr = "Đang soạn";
                            isBhytFlag = true;
                            isDangSoanFlag = true;
                            soTien = null;
                            soTienStr = "";
                        }
                        else if (isDichVu)
                        {
                            // Trên màn hình Dịch Vụ: Hiển thị trạng thái đơn DV
                            loaiToaStr = "Toa Dịch Vụ";
                            trangThaiStr = isPaidDv ? "Đang soạn" : "Chờ thu";
                            isBhytFlag = false;
                            isDangSoanFlag = isPaidDv;
                        }
                        else // isAll
                        {
                            loaiToaStr = "BHYT + Dịch Vụ";
                            if (!isPaidDv)
                            {
                                trangThaiStr = "Chờ thu";
                                isBhytFlag = false;
                                isDangSoanFlag = false;
                            }
                            else
                            {
                                trangThaiStr = "Đang soạn";
                                isBhytFlag = true;
                                isDangSoanFlag = true;
                            }
                        }
                    }
                    else if (item.HasBhyt)
                    {
                        loaiToaStr = "Toa BHYT";
                        trangThaiStr = "Đang soạn";
                        isBhytFlag = true;
                        isDangSoanFlag = true;
                    }
                    else // Chỉ có Dịch vụ
                    {
                        loaiToaStr = "Toa Dịch Vụ";
                        if (!isPaidDv)
                        {
                            trangThaiStr = "Chờ thu";
                            isBhytFlag = false;
                            isDangSoanFlag = false;
                        }
                        else
                        {
                            trangThaiStr = "Đang soạn";
                            isBhytFlag = false;
                            isDangSoanFlag = true;
                        }
                    }

                    var isToiLuot = (i == 0);
                    if (isToiLuot)
                    {
                        nextPatientName = hoTen ?? string.Empty;
                    }

                    var namSinhStr = item.Ngaysinh.HasValue ? item.Ngaysinh.Value.ToString("yyyy") : "";

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
                        HasBhyt = item.HasBhyt,
                        HasDichVu = item.HasDichVu,
                        HasBoth = item.HasBoth,
                        Maba = item.Maba,
                        NgayNhap = item.Ngaynhap,
                        NgayNhapStr = item.Ngaynhap.HasValue ? item.Ngaynhap.Value.ToString("HH:mm") : "",
                        TrangThai = trangThaiStr,
                        IsToiLuot = isToiLuot,
                        IsBhyt = isBhytFlag,
                        SoTien = soTien,
                        SoTienStr = soTienStr,
                        DaThu = isDangSoanFlag,
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

    internal class ChungTuShortDto
    {
        public string? Sohd { get; set; }
        public string? Makh { get; set; }
        public string? Mabn { get; set; }
        public decimal? Thanhtien { get; set; }
        public decimal? Dain { get; set; }
        public decimal? Dathu { get; set; }
    }
}
