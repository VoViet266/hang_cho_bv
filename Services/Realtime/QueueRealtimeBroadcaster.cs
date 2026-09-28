using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using HangChoKhamBenh.Web.Hubs;

namespace HangChoKhamBenh.Web.Services
{
    public class QueueRealtimeBroadcaster(
        IHubContext<QueueHub> hubContext,
        IActiveRoomTracker tracker,
        IServiceProvider serviceProvider,
        ILogger<QueueRealtimeBroadcaster> logger) : IQueueRealtimeBroadcaster
    {
        private readonly IHubContext<QueueHub> _hubContext = hubContext;
        private readonly IActiveRoomTracker _tracker = tracker;
        private readonly IServiceProvider _serviceProvider = serviceProvider;
        private readonly ILogger<QueueRealtimeBroadcaster> _logger = logger;
        private readonly ConcurrentDictionary<string, string> _roomDataCache = new();

        public async Task CheckAndBroadcastRoomAsync(string roomType, string roomId, bool force = false)
        {
            var clientCount = _tracker.GetConnectionCount(roomType, roomId);
            if (clientCount == 0) return; // Không có client nào đang xem kênh này -> Bỏ qua truy vấn DB hoàn toàn

            var channel = _tracker.GetRoomKey(roomType, roomId);

            try
            {
                using var scope = _serviceProvider.CreateScope();
                var clinicService = scope.ServiceProvider.GetRequiredService<IClinicService>();
                var cdhaService = scope.ServiceProvider.GetRequiredService<ICdhaService>();
                var dashboardService = scope.ServiceProvider.GetRequiredService<IDashboardService>();
                var duocService = scope.ServiceProvider.GetRequiredService<IDuocService>();

                object? data = roomType switch
                {
                    "room" => await clinicService.LayDanhSachBenhNhanChoCuaPhongAsync(roomId),
                    "cdha" => await cdhaService.LayDanhSachBenhNhanChoCDHAAsync(roomId),
                    "duoc" => await duocService.LayDanhSachHangChoDuocAsync(roomId),
                    "dashboard" => await dashboardService.FetchDashboardStatsAsync(),
                    "cdha_dashboard" => await cdhaService.LayDanhSachCacPhongCDHAAsync(),
                    _ => null
                };

                if (data == null) return;

                var utf8Bytes = JsonSerializer.SerializeToUtf8Bytes(data);
                var hashBytes = MD5.HashData(utf8Bytes);
                var currentHash = Convert.ToHexString(hashBytes);

                var prevHash = _roomDataCache.GetValueOrDefault(channel);

                if (force || currentHash != prevHash)
                {
                    _roomDataCache[channel] = currentHash;

                    await _hubContext.Clients.Group(channel).SendAsync("room_data_updated", new
                    {
                        roomType,
                        roomId,
                        data,
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    });

                    _logger.LogInformation("[SignalR] Broadcast: Group={Channel} | Type={RoomType}:{RoomId} | Clients={ClientCount} | Hash={Hash} | Force={Force}",
                        channel, roomType, roomId, clientCount, currentHash[..8], force);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Broadcast] Lỗi cập nhật dữ liệu phòng {Channel}", channel);
            }
        }
    }
}
