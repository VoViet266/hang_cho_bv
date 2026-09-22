using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Helpers;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services;

public interface IClinicService
{
    Task<RoomDetailDto?> LayDanhSachBenhNhanChoCuaPhongAsync(string maphong);
    Task<int> LayThongKeCuaPhongAsync(string maphong);
}

public class ClinicService(AppDbContext context) : IClinicService
{
    private readonly AppDbContext _context = context;

    public async Task<int> LayThongKeCuaPhongAsync(string maphong)
    {
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);

        var count = await (
            from dk in _context.PsDangKy.AsNoTracking()
            join kb in _context.KhamBenh.AsNoTracking().Where(k => k.Xoa == null || k.Xoa == 0)
                on dk.Makb equals kb.Makb into kbGroup
            from kb in kbGroup.DefaultIfEmpty()
            where dk.Ngaydk >= today && dk.Ngaydk < tomorrow
              && (dk.Xoa == null || dk.Xoa == 0)
              && (
                  dk.Maphong == maphong 
                  || 
                  (kb != null && kb.Maphong == maphong && dk.Maphong != maphong)
              )
            select dk.Makb
        ).Distinct().CountAsync();

        return count;
    }

    public async Task<RoomDetailDto?> LayDanhSachBenhNhanChoCuaPhongAsync(string maphong)
    {
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);
        var cutoffTime = DateTime.Now.AddMinutes(-90);
        var priorityCutoff = today.AddYears(-75);


        var query = from dk in _context.PsDangKy.AsNoTracking()
                    join kb in _context.KhamBenh.AsNoTracking() on dk.Makb equals kb.Makb
                    where dk.Ngaydk >= today && dk.Ngaydk < tomorrow
                      && (kb.Maphong ?? dk.Maphong) == maphong
                      && (kb.Xoa == null || kb.Xoa == 0)
                      && (dk.Xoa == null || dk.Xoa == 0)
                      && (kb.Dakham == null || kb.Dakham == 0)
                      && (kb.Ngaykcb ?? dk.Ngaydk) >= cutoffTime
                    join p in _context.DmPhong.AsNoTracking() on (kb.Maphong ?? dk.Maphong) equals p.Maphong
                    join bn in _context.DmBenhNhan.AsNoTracking() on dk.Mabn equals bn.Mabn into bnGroup
                    from bn in bnGroup.DefaultIfEmpty()
                    orderby (bn != null && bn.Ngaysinh != null && bn.Ngaysinh.Value <= priorityCutoff ? 0 : 1),
                            (kb.Ngaykcb ?? dk.Ngaydk)
                    select new
                    {
                        Makb = dk.Makb,
                        Mabn = dk.Mabn,
                        Ngaydk = kb.Ngaykcb ?? dk.Ngaydk,
                        Holot = bn != null ? bn.Holot : string.Empty,
                        Ten = bn != null ? bn.Ten : string.Empty,
                        Ngaysinh = bn != null ? bn.Ngaysinh : null,
                        Gioitinh = bn != null ? bn.Gioitinh : null,
                        Tenphong = p.Tenphong ?? maphong,
                        Maphong = maphong
                    };

        var totalDKPlus = await LayThongKeCuaPhongAsync(maphong);
        var rows = await query.ToListAsync();

        string roomName = maphong;

        if (rows.Count == 0)
        {
            var roomInfo = await _context.DmPhong.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Maphong == maphong);

            if (roomInfo == null) return null; // Invalid room
            roomName = roomInfo.Tenphong ?? maphong;

            return new RoomDetailDto
            {
                Maphong = maphong,
                Tenphong = roomName,
                TotalDKPlus = totalDKPlus,
                TotalWaiting = 0,
                WaitingList = [],
                HiddenList = []
            };
        }

        roomName = rows[0].Tenphong;

        var waitingList = rows.Select(r =>
        {
            DateTime? dob = r.Ngaysinh;
            DateTime? ngaydk = r.Ngaydk;
            decimal? gender = r.Gioitinh;
            bool isPriority = KiemTraUuTien(dob);

            return new PatientWaitingDto
            {
                Makb = r.Makb,
                Mabn = r.Mabn,
                Holot = r.Holot,
                Ten = r.Ten,
                Ngaysinh = dob,
                DobStr = DinhDangNgaySinh(dob),
                Gioitinh = gender,
                GenderStr = LayChuoiGioiTinh(gender),
                IsPriority = isPriority,
                Ngaydk = ngaydk,
                Dakham = 0
            };
        }).ToList();

        return new RoomDetailDto
        {
            Maphong = maphong,
            Tenphong = roomName,
            TotalDKPlus = totalDKPlus,
            TotalWaiting = waitingList.Count,
            WaitingList = waitingList,
            HiddenList = []
        };
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

    private static bool KiemTraUuTien(DateTime? ngaysinh)
    {
        if (!ngaysinh.HasValue) return false;
        var now = DateTime.Today;
        return ngaysinh.Value <= now.AddYears(-75);
    }
}
