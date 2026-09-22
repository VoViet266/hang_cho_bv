using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Helpers;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services;

public interface ICdhaService
{
    Task<RoomDetailDto> LayDanhSachBenhNhanChoCDHAAsync(string tenphong);
    Task<CdhaDashboardStatsDto> LayDanhSachCacPhongCDHAAsync();
    Task<int> AnBenhNhanCDHAAsync(string? makb, string? mabn, string? tenphong);
    Task<int> KhoiPhucBenhNhanCDHAAsync(string? makb, string? mabn, string? tenphong);
    Task<int> KhoiPhucTatCaCDHAAsync(object? target);
    Task<List<HiddenPatientDto>> LayDanhSachBenhNhanDaAnCDHAAsync(object? target);
}

public class CdhaService : ICdhaService
{
    private readonly AppDbContext _context;

    public CdhaService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<RoomDetailDto> LayDanhSachBenhNhanChoCDHAAsync(string tenphong)
    {
        var canonicalName = RoomHelper.ResolveCdhaRoomName(tenphong);
        var alias = RoomHelper.ResolveCdhaRoomAlias(canonicalName);
        var cutoffTime = DateTime.Now.AddMinutes(-90);

        var query = from cdha in _context.HangChoCdhaTmd.AsNoTracking()
                    where (cdha.Xoa == 0 || cdha.Xoa == null)
                      && (cdha.An == "0" || cdha.An == null)
                      && cdha.Ngaykq == null
                      && cdha.Ngaynhap >= cutoffTime
                      && (cdha.Tenphong == canonicalName || cdha.Tenphong == alias)
                    join bn in _context.DmBenhNhan.AsNoTracking() on cdha.Mabn equals bn.Mabn into bnGroup
                    from bn in bnGroup.DefaultIfEmpty()
                    orderby cdha.Ngaynhap ascending, cdha.Thoigiantao ascending, cdha.Makb ascending
                    select new
                    {
                        cdha.Makb,
                        cdha.Mabn,
                        cdha.Ngaynhap,
                        cdha.Thoigiantao,
                        cdha.Uutien,
                        cdha.Ghichu,
                        Holot = bn != null ? bn.Holot : string.Empty,
                        Ten = bn != null ? bn.Ten : string.Empty,
                        Ngaysinh = bn != null ? bn.Ngaysinh : null,
                        Gioitinh = bn != null ? bn.Gioitinh : null
                    };

        var rawRows = await query.ToListAsync();
        var hiddenList = await LayDanhSachBenhNhanDaAnCDHAAsync(canonicalName);

        var waitingList = rawRows.Select(p =>
        {
            DateTime? dob = p.Ngaysinh;
            DateTime? ngaynhap = p.Ngaynhap;
            decimal? gender = p.Gioitinh;
            string? priorityStr = p.Uutien;

            return new PatientWaitingDto
            {
                Makb = p.Makb,
                Mabn = p.Mabn,
                Holot = p.Holot,
                Ten = p.Ten,
                Ngaysinh = dob,
                DobStr = DinhDangNgaySinh(dob),
                Gioitinh = gender,
                GenderStr = LayChuoiGioiTinh(gender),
                PriorityLabel = GetPriorityLabel(priorityStr),
                Ngaydk = ngaynhap,
                Tenphong = canonicalName,
                Ghichu = p.Ghichu,
                Dakham = 0
            };
        }).ToList();

        return new RoomDetailDto
        {
            Maphong = canonicalName,
            Tenphong = canonicalName,
            TotalWaiting = waitingList.Count,
            TotalDKPlus = waitingList.Count,
            WaitingList = waitingList,
            HiddenList = hiddenList
        };
    }

    public async Task<CdhaDashboardStatsDto> LayDanhSachCacPhongCDHAAsync()
    {
        var baseRooms = new[]
        {
            new { Id = "1", Tenphong = "Phòng Siêu âm 1", Alias = "1", SortOrder = 1 },
            new { Id = "2", Tenphong = "Phòng Siêu âm 2", Alias = "2", SortOrder = 2 },
            new { Id = "3", Tenphong = "Phòng Siêu âm 3", Alias = "3", SortOrder = 3 },
            new { Id = "4", Tenphong = "Phòng Siêu âm 4", Alias = "4", SortOrder = 4 },
            new { Id = "5", Tenphong = "Phòng Siêu âm 5", Alias = "5", SortOrder = 5 },
            new { Id = "6", Tenphong = "Phòng Siêu âm 6", Alias = "6", SortOrder = 6 },
        };

        var cutoffTime = DateTime.Now.AddMinutes(-90);

        var waitingCounts = await _context.HangChoCdhaTmd.AsNoTracking()
            .Where(c => (c.Xoa == 0 || c.Xoa == null)
                     && (c.An == "0" || c.An == null)
                     && c.Ngaykq == null
                     && c.Ngaynhap >= cutoffTime
                     && c.Tenphong != null)
            .GroupBy(c => c.Tenphong!)
            .Select(g => new { Tenphong = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Tenphong, x => x.Count);

        var rooms = baseRooms.Select(r =>
        {
            var count = waitingCounts.GetValueOrDefault(r.Tenphong, 0) + waitingCounts.GetValueOrDefault(r.Alias, 0);
            var alias = RoomHelper.ResolveCdhaRoomAlias(r.Tenphong);
            return new CdhaRoomOverviewDto
            {
                Tenphong = r.Tenphong,
                TongChoKham = count,
                Alias = alias,
                DisplayName = !string.IsNullOrEmpty(alias) ? $"Phòng {alias} - {r.Tenphong}" : r.Tenphong
            };
        }).ToList();

        return new CdhaDashboardStatsDto
        {
            Overview = new CdhaOverviewDto
            {
                TongChoKham = rooms.Sum(r => r.TongChoKham)
            },
            Rooms = rooms
        };
    }

    public async Task<int> AnBenhNhanCDHAAsync(string? makb, string? mabn, string? tenphong)
    {
        var cleanMakb = (makb ?? string.Empty).Trim();
        var cleanMabn = (mabn ?? string.Empty).Trim();
        var canonicalName = RoomHelper.ResolveCdhaRoomName(tenphong);
        var alias = RoomHelper.ResolveCdhaRoomAlias(canonicalName);

        if (string.IsNullOrEmpty(canonicalName)) return 0;

        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);

        var baseQuery = _context.HangChoCdhaTmd
            .Where(c => (c.Tenphong == canonicalName || c.Tenphong == alias)
                     && (c.An == "0" || c.An == null)
                     && c.Ngaynhap >= today && c.Ngaynhap < tomorrow);

        if (!string.IsNullOrEmpty(cleanMakb) && !string.IsNullOrEmpty(cleanMabn))
        {
            return await baseQuery
                .Where(c => c.Makb == cleanMakb || c.Mabn == cleanMabn)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.An, "1"));
        }
        else if (!string.IsNullOrEmpty(cleanMakb))
        {
            return await baseQuery
                .Where(c => c.Makb == cleanMakb)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.An, "1"));
        }
        else if (!string.IsNullOrEmpty(cleanMabn))
        {
            return await baseQuery
                .Where(c => c.Mabn == cleanMabn)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.An, "1"));
        }

        return 0;
    }

    public async Task<int> KhoiPhucBenhNhanCDHAAsync(string? makb, string? mabn, string? tenphong)
    {
        var cleanMakb = (makb ?? string.Empty).Trim();
        var cleanMabn = (mabn ?? string.Empty).Trim();
        var canonicalName = RoomHelper.ResolveCdhaRoomName(tenphong);
        var alias = RoomHelper.ResolveCdhaRoomAlias(canonicalName);

        if (string.IsNullOrEmpty(canonicalName)) return 0;

        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);

        var baseQuery = _context.HangChoCdhaTmd
            .Where(c => (c.Tenphong == canonicalName || c.Tenphong == alias)
                     && c.An == "1"
                     && c.Ngaynhap >= today && c.Ngaynhap < tomorrow);

        if (!string.IsNullOrEmpty(cleanMakb) && !string.IsNullOrEmpty(cleanMabn))
        {
            return await baseQuery
                .Where(c => c.Makb == cleanMakb || c.Mabn == cleanMabn)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.An, "0"));
        }
        else if (!string.IsNullOrEmpty(cleanMakb))
        {
            return await baseQuery
                .Where(c => c.Makb == cleanMakb)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.An, "0"));
        }
        else if (!string.IsNullOrEmpty(cleanMabn))
        {
            return await baseQuery
                .Where(c => c.Mabn == cleanMabn)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.An, "0"));
        }

        return 0;
    }

    public async Task<int> KhoiPhucTatCaCDHAAsync(object? target)
    {
        var rooms = ExtractRoomList(target);
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);

        var baseQuery = _context.HangChoCdhaTmd
            .Where(c => c.An == "1"
                     && c.Ngaynhap >= today && c.Ngaynhap < tomorrow);

        if (rooms.Count > 0)
        {
            return await baseQuery
                .Where(c => rooms.Contains(c.Tenphong!))
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.An, "0"));
        }

        return await baseQuery
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.An, "0"));
    }

    public async Task<List<HiddenPatientDto>> LayDanhSachBenhNhanDaAnCDHAAsync(object? target)
    {
        var rooms = ExtractRoomList(target);
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);

        var baseQuery = _context.HangChoCdhaTmd.AsNoTracking()
            .Where(c => c.An == "1"
                     && (c.Xoa == 0 || c.Xoa == null)
                     && c.Ngaynhap >= today && c.Ngaynhap < tomorrow);

        if (rooms.Count > 0)
        {
            baseQuery = baseQuery.Where(c => rooms.Contains(c.Tenphong!));
        }

        var query = from cdha in baseQuery
                    join bn in _context.DmBenhNhan.AsNoTracking() on cdha.Mabn equals bn.Mabn into bnGroup
                    from bn in bnGroup.DefaultIfEmpty()
                    orderby cdha.Ngaynhap descending, cdha.Thoigiantao descending, cdha.Makb descending
                    select new
                    {
                        cdha.Makb,
                        cdha.Mabn,
                        cdha.Ngaynhap,
                        cdha.Tenphong,
                        Holot = bn != null ? bn.Holot : string.Empty,
                        Ten = bn != null ? bn.Ten : string.Empty
                    };

        var rawRows = await query.ToListAsync();

        return rawRows.Select(p =>
        {
            var holot = p.Holot;
            var ten = p.Ten;
            var pName = $"{holot} {ten}".Trim();
            var makb = p.Makb;
            var mabn = p.Mabn;
            DateTime? ngaynhap = p.Ngaynhap;

            return new HiddenPatientDto
            {
                Makb = makb,
                Mabn = mabn,
                Name = !string.IsNullOrEmpty(pName) ? pName : (makb ?? mabn ?? "Bệnh nhân"),
                Room = p.Tenphong ?? string.Empty,
                Time = ngaynhap.HasValue ? ngaynhap.Value.ToString("HH:mm") : string.Empty,
                Key = makb ?? mabn ?? pName
            };
        }).ToList();
    }

    private static List<string> ExtractRoomList(object? target)
    {
        var rooms = new List<string>();

        if (target is IEnumerable<string> strList)
        {
            rooms.AddRange(strList.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()));
        }
        else if (target is string str && !string.IsNullOrWhiteSpace(str))
        {
            rooms.AddRange(str.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        }

        var expanded = new List<string>();
        foreach (var r in rooms)
        {
            var cName = RoomHelper.ResolveCdhaRoomName(r);
            var alias = RoomHelper.ResolveCdhaRoomAlias(cName);
            if (!string.IsNullOrEmpty(cName)) expanded.Add(cName);
            if (!string.IsNullOrEmpty(alias) && alias != cName) expanded.Add(alias);
        }

        return expanded.Distinct().ToList();
    }

    private static string DinhDangNgaySinh(DateTime? dob)
    {
        return dob.HasValue ? dob.Value.ToString("dd/MM/yyyy") : "Chưa cập nhật";
    }

    private static string LayChuoiGioiTinh(decimal? gioitinh)
    {
        if (!gioitinh.HasValue) return "Khác";
        if (gioitinh.Value == 1) return "Nam";
        if (gioitinh.Value == 2 || gioitinh.Value == 0) return "Nữ";
        return "Khác";
    }

    private static string? GetPriorityLabel(string? uutien)
    {
        return uutien switch
        {
            "1" => "Bệnh cấp cứu",
            "2" => "Khám theo yêu cầu",
            "3" => "Bệnh tàn tật",
            "4" => ">=75 tuổi",
            "5" => "Có thai",
            "6" => "Trẻ em <6 tuổi",
            _ => null
        };
    }
}
