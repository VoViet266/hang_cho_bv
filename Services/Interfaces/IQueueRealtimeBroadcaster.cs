namespace HangChoKhamBenh.Web.Services
{
    public interface IQueueRealtimeBroadcaster
    {
        Task CheckAndBroadcastRoomAsync(string roomType, string roomId, bool force = false);
    }
}

