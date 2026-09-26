using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using HangChoKhamBenh.Web.Hubs;
using HangChoKhamBenh.Web.Services;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Controllers.Api
{
    [ApiController]
    [Route("api/duoc-nhap")]
    public class DuocNhapApiController : ControllerBase
    {
        private readonly IDuocNhapService _duocNhapService;
        private readonly ILogger<DuocNhapApiController> _logger;
        private readonly IQueueRealtimeBroadcaster _broadcaster;
        private readonly IHubContext<QueueHub> _hubContext;

        public DuocNhapApiController(
            IDuocNhapService duocNhapService,
            ILogger<DuocNhapApiController> logger,
            IQueueRealtimeBroadcaster broadcaster,
            IHubContext<QueueHub> hubContext)
        {
            _duocNhapService = duocNhapService;
            _logger = logger;
            _broadcaster = broadcaster;
            _hubContext = hubContext;
        }

        /// <summary>
        /// Tra cứu thông tin bệnh nhân và chứng từ đơn thuốc theo mã quét
        /// </summary>
        [HttpGet("scan")]
        public async Task<IActionResult> Scan([FromQuery] string? makh, [FromQuery] string? makb)
        {
            var result = await _duocNhapService.ScanAsync(makh, makb);
            return Ok(result);
        }

        /// <summary>
        /// Thêm hoặc cập nhật trạng thái trong hàng chờ dược
        /// </summary>
        [HttpPost("them-hang-cho")]
        public async Task<IActionResult> ThemHangCho([FromBody] DuocNhapThemRequest req)
        {
            var result = await _duocNhapService.ThemHangChoAsync(req);
            if (result.Success)
            {
                NotifyDuocQueuesUpdated(req.Makb, req.Mabn);
            }
            return Ok(result);
        }

        /// <summary>
        /// Lấy danh sách chưa giao cho quầy dược (Cột 1 Chưa thu, Cột 2 Chờ phát)
        /// </summary>
        [HttpGet("chua-giao")]
        [HttpGet("danh-sach-chua-giao")]
        public async Task<IActionResult> LayDanhSachChuaGiao()
        {
            var result = await _duocNhapService.LayDanhSachChuaGiaoAsync();
            return Ok(result);
        }

        /// <summary>
        /// Cập nhật trạng thái phát thuốc (dagiao = 1)
        /// </summary>
        [HttpPost("cap-nhat-trang-thai")]
        public async Task<IActionResult> CapNhatTrangThai([FromBody] DuocCapNhatTrangThaiRequest req)
        {
            var success = await _duocNhapService.CapNhatTrangThaiAsync(req);
            if (success)
            {
                _logger.LogInformation("Phát thuốc thành công: makb={Makb}, mabn={Mabn}", req.Makb, req.Mabn);
                NotifyDuocQueuesUpdated(req.Makb, req.Mabn);
                return Ok(new { success = true, message = "Đã phát thuốc thành công!" });
            }
            return Ok(new { success = false, message = "Không tìm thấy dữ liệu để cập nhật." });
        }

        /// <summary>
        /// Chỉ định ô cửa và phát loa gọi bệnh nhân
        /// </summary>
        [HttpPost("chi-dinh-o-cua")]
        public async Task<IActionResult> ChiDinhOCua([FromBody] DuocCapNhatTrangThaiRequest req)
        {
            var (success, hoTen, namSinh, oCua) = await _duocNhapService.ChiDinhOCuaAsync(req);
            if (success)
            {
                NotifyDuocQueuesUpdated(req.Makb, req.Mabn);

                if (!string.IsNullOrEmpty(oCua))
                {
                    var cleanTrangThai = string.IsNullOrWhiteSpace(req.TrangThai) ? "Đang soạn" : req.TrangThai.Trim();
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await _hubContext.Clients.All.SendAsync("duoc_trigger_speak", new
                            {
                                hoTen,
                                namSinh,
                                oCua,
                                makb = req.Makb ?? "",
                                mabn = req.Mabn ?? "",
                                isBhyt = req.IsBhyt ?? true,
                                trangThai = cleanTrangThai
                            });
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Lỗi gửi SignalR duoc_trigger_speak");
                        }
                    });
                }

                return Ok(new { success = true, message = $"Đã chỉ định Ô {oCua} cho bệnh nhân {hoTen}!" });
            }

            return Ok(new { success = false, message = "Không tìm thấy bệnh nhân để cập nhật." });
        }

        /// <summary>
        /// Lấy lịch sử phát thuốc hôm nay
        /// </summary>
        [HttpGet("da-giao")]
        [HttpGet("danh-sach-da-giao")]
        public async Task<IActionResult> LayDanhSachDaGiao()
        {
            var result = await _duocNhapService.LayDanhSachDaGiaoAsync();
            return Ok(result);
        }

        /// <summary>
        /// Hoàn tác phát thuốc / không mua: Đưa bệnh nhân quay lại hàng chờ (dagiao = 0)
        /// </summary>
        [HttpPost("hoan-tac")]
        public async Task<IActionResult> HoanTac([FromBody] DuocHoanTacRequest req)
        {
            var success = await _duocNhapService.HoanTacAsync(req.Makb ?? "", req.Mabn ?? "");
            if (success)
            {
                _logger.LogInformation("Hoàn tác makb={Makb}, mabn={Mabn}", req.Makb, req.Mabn);
                NotifyDuocQueuesUpdated(req.Makb, req.Mabn);
                return Ok(new { success = true, message = "Đã hoàn tác thành công, đưa bệnh nhân trở lại danh sách chờ!" });
            }
            return Ok(new { success = false, message = "Không tìm thấy dữ liệu để hoàn tác." });
        }

        /// <summary>
        /// Đánh dấu khách không mua thuốc dịch vụ (dagiao = 3)
        /// </summary>
        [HttpPost("khong-mua")]
        public async Task<IActionResult> KhongMua([FromBody] DuocCapNhatTrangThaiRequest req)
        {
            var success = await _duocNhapService.KhongMuaAsync(req.Makb ?? "", req.Mabn ?? "");
            if (success)
            {
                _logger.LogInformation("Đánh dấu không mua makb={Makb}, mabn={Mabn}", req.Makb, req.Mabn);
                NotifyDuocQueuesUpdated(req.Makb, req.Mabn);
                return Ok(new { success = true, message = "Đã chuyển đơn vào danh sách Không mua!" });
            }
            return Ok(new { success = false, message = "Không tìm thấy dữ liệu để cập nhật." });
        }

        /// <summary>
        /// Lấy danh sách khách không mua thuốc hôm nay
        /// </summary>
        [HttpGet("khong-mua")]
        [HttpGet("danh-sach-khong-mua")]
        public async Task<IActionResult> LayDanhSachKhongMua()
        {
            var result = await _duocNhapService.LayDanhSachKhongMuaAsync();
            return Ok(result);
        }

        private void NotifyDuocQueuesUpdated(string? makb, string? mabn)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.WhenAll(
                        _broadcaster.CheckAndBroadcastRoomAsync("duoc", "all", true),
                        _broadcaster.CheckAndBroadcastRoomAsync("duoc", "bhyt", true),
                        _broadcaster.CheckAndBroadcastRoomAsync("duoc", "dichvu", true)
                    );
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Lỗi broadcast NotifyDuocQueuesUpdated makb={Makb}, mabn={Mabn}", makb, mabn);
                }
            });
        }
    }
}

