using HangChoKhamBenh.Web.Hubs;

namespace HangChoKhamBenh.Web.Services
{
    public class QueuePollingBackgroundService(
        IActiveRoomTracker tracker,
        IQueueRealtimeBroadcaster broadcaster,
        ILogger<QueuePollingBackgroundService> logger) : BackgroundService
    {
        private readonly IActiveRoomTracker _tracker = tracker;
        private readonly IQueueRealtimeBroadcaster _broadcaster = broadcaster;
        private readonly ILogger<QueuePollingBackgroundService> _logger = logger;
        private const int PollingIntervalMs = 3000;

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[BackgroundService] Khởi chạy dịch vụ Polling hàng chờ định kỳ 3 giây cho Active Rooms");

            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(PollingIntervalMs));

            while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    var activeRooms = _tracker.GetActiveRooms();
                    if (activeRooms.Count == 0) continue;

                    foreach (var (roomType, roomId, _) in activeRooms)
                    {
                        if (stoppingToken.IsCancellationRequested) break;
                        await _broadcaster.CheckAndBroadcastRoomAsync(roomType, roomId, force: false);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[BackgroundService] Lỗi trong chu kỳ polling active rooms");
                }
            }

            _logger.LogInformation("[BackgroundService] Dịch vụ Polling hàng chờ đã dừng");
        }
    }
}
