namespace HangChoKhamBenh.Web.Services
{
    public interface IActiveRoomTracker
    {
        void AddConnection(string connectionId, string roomType, string roomId);
        void RemoveConnection(string connectionId, string roomType, string roomId);
        void RemoveConnection(string connectionId);
        List<(string RoomType, string RoomId, string ChannelName)> GetActiveRooms();
        string GetRoomKey(string roomType, string roomId);
        int GetConnectionCount(string roomType, string roomId);
    }
}

