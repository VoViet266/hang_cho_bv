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

        [HttpPost("xu-ly-ma-quet")]
        public async Task<IActionResult> ProcessScan([FromBody] DuocProcessScanRequest req)
        {
            var result = await _duocNhapService.ProcessScanAsync(req.Code);
            var patient = result.Patient;
            if (patient?.Success == true)
                NotifyDuocQueuesUpdated(patient.Makb, patient.Mabn);
            if (result.Success && result.Action is "goi-thu-tien" or "goi-nhan-thuoc")
            {
                await _hubContext.Clients.All.SendAsync("duoc_trigger_speak", new
                {
                    hoTen = result.HoTen, namSinh = result.NamSinh, oCua = result.OCua,
                    makb = patient?.Makb, mabn = patient?.Mabn, isBhyt = result.IsBhyt,
                    trangThai = result.Action == "goi-thu-tien" ? "Chờ thu tiền" : "Nhận thuốc"
                });
            }
            return Ok(result);
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
            if (result.Success) NotifyDuocQueuesUpdated(req.Makb, req.Mabn);
            return Ok(result);
        }

        [HttpPost("phat-theo-ma-quet")]
        public async Task<IActionResult> PhatTheoMaQuet([FromBody] DuocBarcodeDispenseRequest req)
        {
            var result = await _duocNhapService.PhatTheoMaQuetAsync(req);
            if (result.Success)
            {
                NotifyDuocQueuesUpdated(req.Makb, req.Mabn);
                if (result.Action is "goi-thu-tien" or "goi-nhan-thuoc")
                {
                    await _hubContext.Clients.All.SendAsync("duoc_trigger_speak", new
                    {
                        hoTen = result.HoTen,
                        namSinh = result.NamSinh,
                        oCua = result.OCua,
                        makb = req.Makb,
                        mabn = req.Mabn,
                        isBhyt = result.IsBhyt,
                        trangThai = result.Action == "goi-thu-tien" ? "Chờ thu tiền" : "Nhận thuốc"
                    });
                }
                _logger.LogInformation("Xử lý mã quét: action={Action}, makb={Makb}, mabn={Mabn}", result.Action, req.Makb, req.Mabn);
            }
            return Ok(result);
        }

        /// <summary>
        /// Quét dịch vụ theo luồng chung: tiếp nhận, gọi ô 5 khi chưa thu,
        /// chờ phần mềm thu tiền cập nhật, gọi ô 3 rồi xác nhận đã phát.
        /// </summary>
        [HttpPost("smart-scan-dv")]
        public async Task<IActionResult> SmartScanDv([FromBody] DuocBarcodeDispenseRequest req)
        {
            var code = (!string.IsNullOrWhiteSpace(req.Makb) ? req.Makb : req.Mabn)?.Trim() ?? "";
            var result = await _duocNhapService.SmartScanDvAsync(code);

            if (result.Success)
            {
                _logger.LogInformation(
                    "SmartScanDv step={Step} action={Action}: makb={Makb}, mabn={Mabn}, oCua={OCua}",
                    result.Step, result.Action, result.Makb, result.Mabn, result.OCua);

                NotifyDuocQueuesUpdated(result.Makb, result.Mabn);

                // Chỉ phát loa khi kết quả xử lý là gọi thu tiền hoặc gọi nhận thuốc.
                if (result.Step == 1 || result.Step == 2)
                {
                    var trangThai = result.Step == 1 ? "Chờ thu tiền" : "Vào lấy thuốc";
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await _hubContext.Clients.All.SendAsync("duoc_trigger_speak", new
                            {
                                hoTen = result.HoTen,
                                namSinh = result.NamSinh,
                                oCua = result.OCua,
                                makb = result.Makb,
                                mabn = result.Mabn,
                                isBhyt = false,
                                trangThai
                            });
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Lỗi gửi SignalR duoc_trigger_speak (SmartScanDv)");
                        }
                    });
                }
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
                    var cleanTrangThai = string.IsNullOrWhiteSpace(req.TrangThai) ? "Đang soạn thuốc" : req.TrangThai.Trim();
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

        /// <summary>
        /// Ẩn bệnh nhân khỏi hàng chờ dược (an = 1)
        /// </summary>
        [HttpPost("an")]
        public async Task<IActionResult> An([FromBody] DuocCapNhatTrangThaiRequest req)
        {
            var success = await _duocNhapService.AnAsync(req.Makb ?? "", req.Mabn ?? "");
            if (success)
            {
                _logger.LogInformation("Ẩn bệnh nhân makb={Makb}, mabn={Mabn}", req.Makb, req.Mabn);
                NotifyDuocQueuesUpdated(req.Makb, req.Mabn);
                return Ok(new { success = true, message = "Đã ẩn bệnh nhân khỏi hàng chờ!" });
            }
            return Ok(new { success = false, message = "Không tìm thấy dữ liệu để cập nhật." });
        }

        /// <summary>
        /// Bỏ ẩn / Khôi phục bệnh nhân vào hàng chờ dược (an = 0)
        /// </summary>
        [HttpPost("bo-an")]
        public async Task<IActionResult> BoAn([FromBody] DuocCapNhatTrangThaiRequest req)
        {
            var success = await _duocNhapService.BoAnAsync(req.Makb ?? "", req.Mabn ?? "");
            if (success)
            {
                _logger.LogInformation("Bỏ ẩn bệnh nhân makb={Makb}, mabn={Mabn}", req.Makb, req.Mabn);
                NotifyDuocQueuesUpdated(req.Makb, req.Mabn);
                return Ok(new { success = true, message = "Đã khôi phục bệnh nhân vào hàng chờ!" });
            }
            return Ok(new { success = false, message = "Không tìm thấy dữ liệu để cập nhật." });
        }

        /// <summary>
        /// Lấy danh sách bệnh nhân đã ẩn hôm nay
        /// </summary>
        [HttpGet("da-an")]
        [HttpGet("danh-sach-an")]
        public async Task<IActionResult> LayDanhSachDaAn()
        {
            var result = await _duocNhapService.LayDanhSachDaAnAsync();
            return Ok(result);
        }

        private void NotifyDuocQueuesUpdated(string? makb, string? mabn)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await _broadcaster.CheckAndBroadcastRoomsAsync(
                        [("duoc", "all"), ("duoc", "bhyt"), ("duoc", "dichvu"), ("duoc-nhap", "all")], true);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Lỗi broadcast NotifyDuocQueuesUpdated makb={Makb}, mabn={Mabn}", makb, mabn);
                }
            });
        }
    }
}

