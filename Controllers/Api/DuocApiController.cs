using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data;
using HangChoKhamBenh.Web.Services;

namespace HangChoKhamBenh.Web.Controllers.Api
{
    [ApiController]
    [Route("api/duoc")]
    public class DuocApiController : ControllerBase
    {
        private readonly IDuocService _duocService;
        private readonly AppDbContext _context;
        private readonly ILogger<DuocApiController> _logger;

        public DuocApiController(IDuocService duocService, AppDbContext context, ILogger<DuocApiController> logger)
        {
            _duocService = duocService;
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// Lấy danh sách hàng chờ Khoa Dược cho màn hình TV (type = bhyt hoặc dichvu).
        /// </summary>
        [HttpGet("queue")]
        public async Task<IActionResult> GetQueue([FromQuery] string? type)
        {
            var duocType = string.IsNullOrWhiteSpace(type) ? "bhyt" : type.Trim().ToLowerInvariant();
            try
            {
                var data = await _duocService.LayDanhSachHangChoDuocAsync(duocType);
                return Ok(data);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi lấy hàng chờ dược type={Type}", duocType);
                return StatusCode(500, new { error = "Lỗi máy chủ khi lấy dữ liệu hàng chờ dược." });
            }
        }
    }
}
