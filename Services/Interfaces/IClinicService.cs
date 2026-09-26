using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{
    public interface IClinicService
    {
        Task<RoomDetailDto?> LayDanhSachBenhNhanChoCuaPhongAsync(string maphong);
        Task<int> LayThongKeCuaPhongAsync(string maphong);
    }
}

