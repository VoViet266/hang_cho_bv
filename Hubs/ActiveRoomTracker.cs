using System.Collections.Concurrent;
using HangChoKhamBenh.Web.Helpers;
using HangChoKhamBenh.Web.Services;

namespace HangChoKhamBenh.Web.Hubs
{
    public class ActiveRoomTracker : IActiveRoomTracker
    {
        // ChannelName -> Set of ConnectionIds
        private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, byte>> _channelConnections = new();
        // ConnectionId -> Set of ChannelNames
        private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, byte>> _connectionChannels = new();

        public int GetConnectionCount(string roomType, string roomId)
        {
            var channel = GetRoomKey(roomType, roomId);
            return _channelConnections.TryGetValue(channel, out var conns) ? conns.Count : 0;
        }

        public string GetRoomKey(string roomType, string roomId)
        {
            var normId = roomType == "cdha" && !string.IsNullOrWhiteSpace(roomId)
                ? RoomHelper.ResolveCdhaRoomName(roomId)
                : (roomId ?? string.Empty);

            return $"{roomType}:{normId}";
        }

        public void AddConnection(string connectionId, string roomType, string roomId)
        {
            var channel = GetRoomKey(roomType, roomId);

            var connList = _channelConnections.GetOrAdd(channel, _ => new ConcurrentDictionary<string, byte>());
            connList.TryAdd(connectionId, 0);

            var chanList = _connectionChannels.GetOrAdd(connectionId, _ => new ConcurrentDictionary<string, byte>());
            chanList.TryAdd(channel, 0);
        }

        public void RemoveConnection(string connectionId, string roomType, string roomId)
        {
            var channel = GetRoomKey(roomType, roomId);

            if (_channelConnections.TryGetValue(channel, out var connList))
            {
                connList.TryRemove(connectionId, out _);
                if (connList.IsEmpty)
                {
                    _channelConnections.TryRemove(channel, out _);
                }
            }

            if (_connectionChannels.TryGetValue(connectionId, out var chanList))
            {
                chanList.TryRemove(channel, out _);
                if (chanList.IsEmpty)
                {
                    _connectionChannels.TryRemove(connectionId, out _);
                }
            }
        }

        public void RemoveConnection(string connectionId)
        {
            if (_connectionChannels.TryRemove(connectionId, out var chanList))
            {
                foreach (var channel in chanList.Keys)
                {
                    if (_channelConnections.TryGetValue(channel, out var connList))
                    {
                        connList.TryRemove(connectionId, out _);
                        if (connList.IsEmpty)
                        {
                            _channelConnections.TryRemove(channel, out _);
                        }
                    }
                }
            }
        }

        public List<(string RoomType, string RoomId, string ChannelName)> GetActiveRooms()
        {
            var result = new List<(string RoomType, string RoomId, string ChannelName)>();

            foreach (var (channel, conns) in _channelConnections)
            {
                if (conns.IsEmpty || !channel.Contains(':')) continue;

                var parts = channel.Split(':', 2);
                result.Add((parts[0], parts.Length > 1 ? parts[1] : string.Empty, channel));
            }

            return result;
        }
    }
}
