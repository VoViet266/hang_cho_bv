namespace HangChoKhamBenh.Web.Services
{
    public interface IQueueRealtimeBroadcaster
    {
        Task CheckAndBroadcastRoomsAsync(IEnumerable<(string RoomType, string RoomId)> rooms, bool force = false);
        Task CheckAndBroadcastRoomAsync(string roomType, string roomId, bool force = false);
    }
}

