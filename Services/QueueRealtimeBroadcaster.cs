using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using HangChoKhamBenh.Web.Hubs;

namespace HangChoKhamBenh.Web.Services;

public interface IQueueRealtimeBroadcaster
{
    Task CheckAndBroadcastRoomAsync(string roomType, string roomId, bool force = false);
}

public class QueueRealtimeBroadcaster : IQueueRealtimeBroadcaster
{
    private readonly IHubContext<QueueHub> _hubContext;
    private readonly IActiveRoomTracker _tracker;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<QueueRealtimeBroadcaster> _logger;
    private readonly ConcurrentDictionary<string, string> _roomDataCache = new();

    public QueueRealtimeBroadcaster(
        IHubContext<QueueHub> hubContext,
        IActiveRoomTracker tracker,
        IServiceProvider serviceProvider,
        ILogger<QueueRealtimeBroadcaster> logger)
    {
        _hubContext = hubContext;
        _tracker = tracker;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task CheckAndBroadcastRoomAsync(string roomType, string roomId, bool force = false)
    {
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

            var json = JsonSerializer.Serialize(data);
            var currentHash = ComputeMd5(json);

            var prevHash = _roomDataCache.GetValueOrDefault(channel);

            if (force || currentHash != prevHash)
            {
                _roomDataCache[channel] = currentHash;
                var clientCount = _tracker.GetConnectionCount(roomType, roomId);

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

    private static string ComputeMd5(string input)
    {
        using var md5 = MD5.Create();
        var bytes = md5.ComputeHash(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
