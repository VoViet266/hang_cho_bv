using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{
    public interface IDashboardService
    {
        Task<DashboardStatsDto> FetchDashboardStatsAsync();
    }
}

