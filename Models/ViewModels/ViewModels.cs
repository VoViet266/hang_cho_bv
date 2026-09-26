namespace HangChoKhamBenh.Web.Models
{
    public class RoomPageViewModel
    {
        public string CurrentRoomId { get; set; } = string.Empty;
        public List<string> SelectedRoomIds { get; set; } = [];
        public List<AvailableRoomDto> AllAvailableRooms { get; set; } = [];
        public RoomDetailDto Room { get; set; } = new();
        public List<RoomDetailDto> RoomsData { get; set; } = [];
        public string RoomType { get; set; } = "room";
    }

    public class AvailableRoomDto
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Alias { get; set; }
        public string? DisplayName { get; set; }
    }

    public class MultiRoomPageViewModel
    {
        public string RoomType { get; set; } = "room";
        public List<string> SelectedRoomIds { get; set; } = [];
        public List<AvailableRoomDto> AllAvailableRooms { get; set; } = [];
        public List<RoomDetailDto> RoomsData { get; set; } = [];
    }

    public class PortalIndexViewModel
    {
        public List<AvailableRoomDto> ClinicRooms { get; set; } = [];
        public List<AvailableRoomDto> CdhaRooms { get; set; } = [];
    }

    public class MainPortalViewModel
    {
        public string Title { get; set; } = "HỆ THỐNG MÀN HÌNH HÀNG CHỜ";
    }

    public class DuocIndexViewModel
    {
        public string Title { get; set; } = "KHOA DƯỢC";
    }

    public class DuocRoomViewModel
    {
        public string DuocType { get; set; } = "all"; // "bhyt", "dichvu", "all"
        public string Title { get; set; } = "HÀNG CHỜ PHÁT THUỐC";
        public int TotalWaiting { get; set; }
        public int TotalToday { get; set; }
        public List<DuocQueueItemDto> QueueList { get; set; } = [];
    }
}

