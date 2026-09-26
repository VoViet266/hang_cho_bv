using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{
    public interface ICdhaService
    {
        Task<RoomDetailDto> LayDanhSachBenhNhanChoCDHAAsync(string tenphong);
        Task<CdhaDashboardStatsDto> LayDanhSachCacPhongCDHAAsync();
        Task<int> AnBenhNhanCDHAAsync(string? makb, string? mabn, string? tenphong);
        Task<int> KhoiPhucBenhNhanCDHAAsync(string? makb, string? mabn, string? tenphong);
        Task<int> KhoiPhucTatCaCDHAAsync(object? target);
        Task<List<HiddenPatientDto>> LayDanhSachBenhNhanDaAnCDHAAsync(object? target);
    }
}

