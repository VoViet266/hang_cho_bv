using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{
    public interface IDuocService
    {
        Task<DuocQueuePageDto> LayDanhSachHangChoDuocAsync(string duocType);
        Task<int> LayThongKeDuocAsync(string duocType);
    }
}

