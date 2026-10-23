using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{
    public class DuocService : IDuocService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<DuocService> _logger;
        private readonly IDuocQueueSnapshotService _snapshots;

        public DuocService(AppDbContext context, ILogger<DuocService> logger, IDuocQueueSnapshotService snapshots)
        {
            _context = context;
            _logger = logger;
            _snapshots = snapshots;
        }

        public async Task<int> LayThongKeDuocAsync(string duocType)
        {
            var today = DateTime.Today;
            var tomorrow = today.AddDays(1);
            var isAll = duocType.Equals("all", StringComparison.OrdinalIgnoreCase);
            var isBhyt = !isAll && duocType.Equals("bhyt", StringComparison.OrdinalIgnoreCase);

            var query = _context.HangChoDuocTmd.AsNoTracking()
                .Where(h => h.Xoa == 0
                         && h.An == 0
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

    
            return await query
                .Select(h => !string.IsNullOrEmpty(h.Makb) ? h.Makb : h.Mabn)
                .Distinct()
                .CountAsync();
        }

        public async Task<DuocQueuePageDto> LayDanhSachHangChoDuocAsync(string duocType)
        {
            return (await _snapshots.LoadAsync()).GetPage(duocType);
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
