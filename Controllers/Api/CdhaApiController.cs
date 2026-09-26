using Microsoft.AspNetCore.Mvc;
using HangChoKhamBenh.Web.Helpers;
using HangChoKhamBenh.Web.Models;
using HangChoKhamBenh.Web.Services;

namespace HangChoKhamBenh.Web.Controllers.Api
{
    [ApiController]
    [Route("api/cdha")]
    public class CdhaApiController : ControllerBase
    {
        private readonly ICdhaService _cdhaService;
        private readonly IQueueRealtimeBroadcaster _broadcaster;
        private readonly ILogger<CdhaApiController> _logger;

        public CdhaApiController(
            ICdhaService cdhaService,
            IQueueRealtimeBroadcaster broadcaster,
            ILogger<CdhaApiController> logger)
        {
            _cdhaService = cdhaService;
            _broadcaster = broadcaster;
            _logger = logger;
        }

        [HttpPost("patient/hide")]
        public async Task<IActionResult> HidePatient([FromBody] HidePatientRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Tenphong) ||
                (string.IsNullOrWhiteSpace(request.Makb) && string.IsNullOrWhiteSpace(request.Mabn)))
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Thiếu thông tin phòng hoặc bệnh nhân (cần makb/mabn và tenphong)"
                });
            }

            try
            {
                await _cdhaService.AnBenhNhanCDHAAsync(request.Makb, request.Mabn, request.Tenphong);
                _logger.LogInformation("[CDHA] Đã ẩn bệnh nhân ({MakbMabn}) tại phòng {Tenphong} trực tiếp vào database",
                    request.Makb ?? request.Mabn, request.Tenphong);

                // Broadcast cập nhật tức thì tới các màn hình TV
                await _broadcaster.CheckAndBroadcastRoomAsync("cdha", request.Tenphong, force: true);
                await _broadcaster.CheckAndBroadcastRoomAsync("cdha_dashboard", string.Empty, force: true);

                return Ok(new
                {
                    success = true,
                    message = "Đã ẩn bệnh nhân CĐHA thành công"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[CDHA] Lỗi khi ẩn bệnh nhân vào DB");
                return StatusCode(500, new { success = false, message = "Lỗi máy chủ: " + ex.Message });
            }
        }

        [HttpPost("patient/restore")]
        public async Task<IActionResult> RestorePatient([FromBody] RestorePatientRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Tenphong) ||
                (string.IsNullOrWhiteSpace(request.Makb) && string.IsNullOrWhiteSpace(request.Mabn)))
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Thiếu thông tin phòng hoặc bệnh nhân (cần makb/mabn và tenphong)"
                });
            }

            try
            {
                await _cdhaService.KhoiPhucBenhNhanCDHAAsync(request.Makb, request.Mabn, request.Tenphong);
                _logger.LogInformation("[CDHA] Đã khôi phục bệnh nhân ({MakbMabn}) tại phòng {Tenphong} trong database",
                    request.Makb ?? request.Mabn, request.Tenphong);

                await _broadcaster.CheckAndBroadcastRoomAsync("cdha", request.Tenphong, force: true);
                await _broadcaster.CheckAndBroadcastRoomAsync("cdha_dashboard", string.Empty, force: true);

                return Ok(new
                {
                    success = true,
                    message = "Đã khôi phục bệnh nhân CĐHA thành công"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[CDHA] Lỗi khi khôi phục bệnh nhân vào DB");
                return StatusCode(500, new { success = false, message = "Lỗi máy chủ: " + ex.Message });
            }
        }

        [HttpPost("patient/restore-all")]
        public async Task<IActionResult> RestoreAllPatients([FromBody] RestoreAllPatientsRequest request)
        {
            try
            {
                var target = request.Rooms ?? request.Tenphong;
                await _cdhaService.KhoiPhucTatCaCDHAAsync(target);
                _logger.LogInformation("[CDHA] Đã khôi phục tất cả bệnh nhân cho phòng: {Target}", target ?? "ALL");

                var roomList = new List<string>();
                if (request.Rooms is System.Text.Json.JsonElement elem && elem.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var item in elem.EnumerateArray())
                    {
                        var str = item.GetString();
                        if (!string.IsNullOrWhiteSpace(str)) roomList.Add(str.Trim());
                    }
                }
                else if (request.Rooms is string rStr && !string.IsNullOrWhiteSpace(rStr))
                {
                    roomList.AddRange(rStr.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
                }
                else if (!string.IsNullOrWhiteSpace(request.Tenphong))
                {
                    roomList.Add(request.Tenphong);
                }

                foreach (var r in roomList)
                {
                    await _broadcaster.CheckAndBroadcastRoomAsync("cdha", r, force: true);
                }
                await _broadcaster.CheckAndBroadcastRoomAsync("cdha_dashboard", string.Empty, force: true);

                return Ok(new
                {
                    success = true,
                    message = "Đã khôi phục tất cả bệnh nhân CĐHA thành công"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[CDHA] Lỗi khi khôi phục tất cả bệnh nhân");
                return StatusCode(500, new { success = false, message = "Lỗi máy chủ: " + ex.Message });
            }
        }

        [HttpGet("hidden")]
        public async Task<IActionResult> GetHiddenPatients([FromQuery] string? rooms, [FromQuery] string? tenphong)
        {
            try
            {
                var targetRooms = !string.IsNullOrWhiteSpace(rooms) ? rooms : (tenphong ?? string.Empty);
                var list = await _cdhaService.LayDanhSachBenhNhanDaAnCDHAAsync(targetRooms);
                return Ok(new
                {
                    success = true,
                    data = list
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[CDHA] Lỗi khi lấy danh sách bệnh nhân đã ẩn");
                return StatusCode(500, new { success = false, message = "Lỗi máy chủ: " + ex.Message });
            }
        }
    }
}
