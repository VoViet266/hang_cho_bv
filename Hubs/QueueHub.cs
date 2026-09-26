using Microsoft.AspNetCore.SignalR;
using HangChoKhamBenh.Web.Services;

namespace HangChoKhamBenh.Web.Hubs
{
    public class QueueHub : Hub
    {
        private readonly IActiveRoomTracker _tracker;
        private readonly IClinicService _clinicService;
        private readonly ICdhaService _cdhaService;
        private readonly IDuocService _duocService;
        private readonly IDashboardService _dashboardService;
        private readonly ILogger<QueueHub> _logger;

        public QueueHub(
            IActiveRoomTracker tracker,
            IClinicService clinicService,
            ICdhaService cdhaService,
            IDuocService duocService,
            IDashboardService dashboardService,
            ILogger<QueueHub> logger)
        {
            _tracker = tracker;
            _clinicService = clinicService;
            _cdhaService = cdhaService;
            _duocService = duocService;
            _dashboardService = dashboardService;
            _logger = logger;
        }

        public override Task OnConnectedAsync()
        {
            var clientIp = Context.GetHttpContext()?.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (Context.GetHttpContext()?.Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded) == true)
            {
                var first = forwarded.ToString().Split(',')[0].Trim();
                if (!string.IsNullOrEmpty(first)) clientIp = first;
            }
            clientIp = clientIp.Replace("::ffff:", "");
            if (clientIp == "::1") clientIp = "127.0.0.1";

            _logger.LogInformation("[SignalR] Connected: ConnId={ConnectionId} | IP={ClientIp}",
                Context.ConnectionId, clientIp);
            return base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception? exception)
        {
            if (exception != null)
            {
                _logger.LogWarning(exception, "[SignalR] Disconnected with error: ConnId={ConnectionId}", Context.ConnectionId);
            }
            else
            {
                _logger.LogInformation("[SignalR] Disconnected: ConnId={ConnectionId}", Context.ConnectionId);
            }

            _tracker.RemoveConnection(Context.ConnectionId);
            return base.OnDisconnectedAsync(exception);
        }

        public async Task JoinRoom(string roomType, string roomId)
        {
            if (string.IsNullOrWhiteSpace(roomType)) return;

            var channel = _tracker.GetRoomKey(roomType, roomId);
            await Groups.AddToGroupAsync(Context.ConnectionId, channel);
            _tracker.AddConnection(Context.ConnectionId, roomType, roomId);
            var clientCount = _tracker.GetConnectionCount(roomType, roomId);

            _logger.LogInformation("[SignalR] JoinRoom: ConnId={ConnectionId} -> Group={Channel} | ActiveClients={Count}",
                Context.ConnectionId, channel, clientCount);

            // Gửi ngay dữ liệu hiện tại tới client vừa kết nối
            try
            {
                var data = await FetchRoomDataAsync(roomType, roomId);
                if (data != null)
                {
                    await Clients.Caller.SendAsync("room_data_updated", new
                    {
                        roomType,
                        roomId,
                        data,
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    });
                    _logger.LogInformation("[SignalR] InitialDataSent: ConnId={ConnectionId} -> Group={Channel}",
                        Context.ConnectionId, channel);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[SignalR] Lỗi lấy dữ liệu ban đầu cho {Channel}", channel);
            }
        }

        public async Task LeaveRoom(string roomType, string roomId)
        {
            if (string.IsNullOrWhiteSpace(roomType)) return;

            var channel = _tracker.GetRoomKey(roomType, roomId);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, channel);
            _tracker.RemoveConnection(Context.ConnectionId, roomType, roomId);
            var clientCount = _tracker.GetConnectionCount(roomType, roomId);

            _logger.LogInformation("[SignalR] LeaveRoom: ConnId={ConnectionId} <- Group={Channel} | ActiveClients={Count}",
                Context.ConnectionId, channel, clientCount);
        }

        public async Task BroadcastSpeak(string roomType, string roomId, string patientName, string roomName, string? dobYear = null)
        {
            if (string.IsNullOrWhiteSpace(patientName)) return;

            var channel = _tracker.GetRoomKey(roomType ?? "room", roomId);
            _logger.LogInformation("[SignalR] Speak: Group={Channel} | Patient='{PatientName}' (DOB: '{DobYear}') -> '{RoomName}'",
                channel, patientName, dobYear, roomName);

            // Phát tới tất cả client khác trong cùng Group (tránh client phát lệnh bị đọc trùng lặp)
            await Clients.OthersInGroup(channel).SendAsync("trigger_speak", new
            {
                roomType = roomType ?? "room",
                roomId = roomId ?? string.Empty,
                patientName,
                roomName = roomName ?? string.Empty,
                dobYear = dobYear ?? string.Empty,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            });
        }

        private async Task<object?> FetchRoomDataAsync(string roomType, string roomId)
        {
            return roomType switch
            {
                "room" => await _clinicService.LayDanhSachBenhNhanChoCuaPhongAsync(roomId),
                "cdha" => await _cdhaService.LayDanhSachBenhNhanChoCDHAAsync(roomId),
                "duoc" => await _duocService.LayDanhSachHangChoDuocAsync(roomId),
                "dashboard" => await _dashboardService.FetchDashboardStatsAsync(),
                "cdha_dashboard" => await _cdhaService.LayDanhSachCacPhongCDHAAsync(),
                _ => null
            };
        }
    }
}
