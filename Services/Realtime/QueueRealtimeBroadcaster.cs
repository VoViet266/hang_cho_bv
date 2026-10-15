using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using HangChoKhamBenh.Web.Hubs;
using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services
{
    public class QueueRealtimeBroadcaster(
        IHubContext<QueueHub> hubContext,
        IActiveRoomTracker tracker,
        IServiceProvider serviceProvider,
        ILogger<QueueRealtimeBroadcaster> logger) : IQueueRealtimeBroadcaster
    {
        private readonly ConcurrentDictionary<string, string> _roomDataCache = new();

        public Task CheckAndBroadcastRoomAsync(string roomType, string roomId, bool force = false)
            => CheckAndBroadcastRoomsAsync([(roomType, roomId)], force);

        public async Task CheckAndBroadcastRoomsAsync(IEnumerable<(string RoomType, string RoomId)> rooms, bool force = false)
        {
            var active = rooms.Distinct().Where(r => tracker.GetConnectionCount(r.RoomType, r.RoomId) > 0).ToList();
            if (active.Count == 0) return;
            using var scope = serviceProvider.CreateScope();
            DuocQueueSnapshot? pharmacy = null;
            foreach (var (roomType, roomId) in active)
            {
                var channel = tracker.GetRoomKey(roomType, roomId);
                try
                {
                    object? data;
                    if (roomType is "duoc" or "duoc-nhap")
                    {
                        pharmacy ??= await scope.ServiceProvider.GetRequiredService<IDuocQueueSnapshotService>().LoadAsync();
                        data = roomType == "duoc-nhap" ? pharmacy.Input : pharmacy.GetPage(roomId);
                    }
                    else
                    {
                        data = roomType switch
                        {
                            "room" => await scope.ServiceProvider.GetRequiredService<IClinicService>().LayDanhSachBenhNhanChoCuaPhongAsync(roomId),
                            "cdha" => await scope.ServiceProvider.GetRequiredService<ICdhaService>().LayDanhSachBenhNhanChoCDHAAsync(roomId),
                            "dashboard" => await scope.ServiceProvider.GetRequiredService<IDashboardService>().FetchDashboardStatsAsync(),
                            "cdha_dashboard" => await scope.ServiceProvider.GetRequiredService<ICdhaService>().LayDanhSachCacPhongCDHAAsync(),
                            _ => null
                        };
                    }
                    if (data == null) continue;
                    var currentHash = Convert.ToHexString(MD5.HashData(JsonSerializer.SerializeToUtf8Bytes(data)));
                    var previousHash = _roomDataCache.GetValueOrDefault(channel);
                    if (!force && currentHash == previousHash) continue;
                    await hubContext.Clients.Group(channel).SendAsync("room_data_updated", new
                    {
                        roomType, roomId, data, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    });
                    _roomDataCache[channel] = currentHash;
                    logger.LogInformation("[SignalR] Broadcast: Group={Channel} | Type={RoomType}:{RoomId} | Hash={Hash} | Force={Force}",
                        channel, roomType, roomId, currentHash[..8], force);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "[Broadcast] Lỗi cập nhật dữ liệu phòng {Channel}", channel);
                }
            }
        }
    }
}
