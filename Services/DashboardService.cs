using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services;

public interface IDashboardService
{
    Task<DashboardStatsDto> FetchDashboardStatsAsync();
}

public class DashboardService : IDashboardService
{
    private readonly AppDbContext _context;

    public DashboardService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<DashboardStatsDto> FetchDashboardStatsAsync()
    {
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);
        var waitingCutoff = DateTime.Now.AddHours(-2);
        var excludedRooms = new[] { "CLS", "SL", "A12" };

        // 1. Lấy danh sách các phòng khám hợp lệ thuộc khoa khám bệnh
        var baseRooms = await _context.DmPhong.AsNoTracking()
            .Where(p => (p.Xoa == null || p.Xoa == 0)
                     && p.Khoakb == 1
                     && (p.Madv == null || p.Madv == "10")
                     && !excludedRooms.Contains(p.Maphong))
            .OrderBy(p => p.Maphong)
            .Select(p => new { p.Maphong, Tenphong = p.Tenphong ?? p.Maphong })
            .ToListAsync();

        // 2. Thống kê tổng số đăng ký theo phòng trong ngày
        var dkCounts = await _context.PsDangKy.AsNoTracking()
            .Where(dk => dk.Ngaydk >= today && dk.Ngaydk < tomorrow
                      && (dk.Xoa == null || dk.Xoa == 0)
                      && dk.Maphong != null)
            .GroupBy(dk => dk.Maphong!)
            .Select(g => new
            {
                Maphong = g.Key,
                CountDk = g.Select(x => x.Makb).Distinct().Count()
            })
            .ToDictionaryAsync(x => x.Maphong, x => x.CountDk);

        // 3. Thống kê bệnh nhân chuyển phòng và bệnh nhân đang chờ khám
        var kbStats = await (
            from dk in _context.PsDangKy.AsNoTracking()
            join kb in _context.KhamBenh.AsNoTracking() on dk.Makb equals kb.Makb
            where dk.Ngaydk >= today && dk.Ngaydk < tomorrow
              && (kb.Xoa == null || kb.Xoa == 0)
              && (dk.Xoa == null || dk.Xoa == 0)
            let effectiveMaphong = kb.Maphong ?? dk.Maphong
            where effectiveMaphong != null
            let effectiveNgay = kb.Ngaykcb ?? dk.Ngaydk
            group new { dk, kb, effectiveMaphong, effectiveNgay } by effectiveMaphong into g
            select new
            {
                Maphong = g.Key!,
                TransferIn = g.Count(x => x.dk.Maphong != x.effectiveMaphong),
                Waiting = g.Count(x => (x.kb.Dakham == null || x.kb.Dakham == 0)
                                    && x.effectiveNgay >= waitingCutoff)
            }
        ).ToDictionaryAsync(x => x.Maphong, x => new { x.TransferIn, x.Waiting });

        // 4. Kết hợp dữ liệu vào DTO
        var rooms = baseRooms.Select(p =>
        {
            var countDk = dkCounts.GetValueOrDefault(p.Maphong, 0);
            var kbStat = kbStats.GetValueOrDefault(p.Maphong);
            var transferIn = kbStat?.TransferIn ?? 0;
            var waiting = kbStat?.Waiting ?? 0;

            return new ClinicRoomOverviewDto
            {
                Maphong = p.Maphong,
                Tenphong = p.Tenphong,
                TongDangKy = countDk,
                TongChuyenSang = countDk + transferIn,
                TongChoKham = waiting
            };
        }).ToList();

        var overview = new DashboardOverviewDto
        {
            TongDangKy = rooms.Sum(r => r.TongDangKy),
            TongChuyenSang = rooms.Sum(r => r.TongChuyenSang),
            TongChoKham = rooms.Sum(r => r.TongChoKham)
        };

        return new DashboardStatsDto
        {
            Overview = overview,
            Rooms = rooms
        };
    }
}
