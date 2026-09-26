using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{
    public interface IDuocNhapService
    {
        Task<DuocNhapBarcodeResultDto> ScanAsync(string? makh, string? makb);
        Task<DuocNhapThemResponse> ThemHangChoAsync(DuocNhapThemRequest req);
        Task<List<DuocChuaGiaoItemDto>> LayDanhSachChuaGiaoAsync();
        Task<List<DuocDaGiaoItemDto>> LayDanhSachDaGiaoAsync();
        Task<List<DuocChuaGiaoItemDto>> LayDanhSachKhongMuaAsync();
        Task<bool> CapNhatTrangThaiAsync(DuocCapNhatTrangThaiRequest req);
        Task<(bool Success, string HoTen, string NamSinh, string OCua)> ChiDinhOCuaAsync(DuocCapNhatTrangThaiRequest req);
        Task<bool> HoanTacAsync(string makb, string mabn);
        Task<bool> KhongMuaAsync(string makb, string mabn);
    }
}

