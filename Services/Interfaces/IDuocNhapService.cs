using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{
    public interface IDuocNhapService
    {
        Task<DuocProcessScanResponse> ProcessScanAsync(string code);
        Task<DuocBarcodeDispenseResponse> RecallAsync(DuocRecallRequest req);
        Task<DuocNhapBarcodeResultDto> ScanAsync(string? makh, string? makb);
        Task<DuocNhapThemResponse> ThemHangChoAsync(DuocNhapThemRequest req);
        Task<DuocBarcodeDispenseResponse> PhatTheoMaQuetAsync(DuocBarcodeDispenseRequest req);
        Task<DuocSmartScanDvResponse> SmartScanDvAsync(string code);
        Task<List<DuocChuaGiaoItemDto>> LayDanhSachChuaGiaoAsync();
        Task<List<DuocDaGiaoItemDto>> LayDanhSachDaGiaoAsync();
        Task<List<DuocChuaGiaoItemDto>> LayDanhSachKhongMuaAsync();
        Task<List<DuocChuaGiaoItemDto>> LayDanhSachDaAnAsync();
        Task<bool> CapNhatTrangThaiAsync(DuocCapNhatTrangThaiRequest req);
        Task<(bool Success, string HoTen, string NamSinh, string OCua)> ChiDinhOCuaAsync(DuocCapNhatTrangThaiRequest req);
        Task<bool> HoanTacAsync(string makb, string mabn, string? sohd = null);
        Task<bool> KhongMuaAsync(string makb, string mabn, string? sohd = null);
        Task<bool> AnAsync(string makb, string mabn, string? sohd = null);
        Task<bool> BoAnAsync(string makb, string mabn, string? sohd = null);
    }
}
