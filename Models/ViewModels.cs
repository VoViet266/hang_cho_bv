namespace HangChoKhamBenh.Web.Models;

public class RoomPageViewModel
{
    public string CurrentRoomId { get; set; } = string.Empty;
    public List<string> SelectedRoomIds { get; set; } = new();
    public List<AvailableRoomDto> AllAvailableRooms { get; set; } = new();
    public RoomDetailDto Room { get; set; } = new();
    public List<RoomDetailDto> RoomsData { get; set; } = new();
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
    public List<string> SelectedRoomIds { get; set; } = new();
    public List<AvailableRoomDto> AllAvailableRooms { get; set; } = new();
    public List<RoomDetailDto> RoomsData { get; set; } = new();
}

public class PortalIndexViewModel
{
    public List<AvailableRoomDto> ClinicRooms { get; set; } = new();
    public List<AvailableRoomDto> CdhaRooms { get; set; } = new();
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
    public List<DuocQueueItemDto> QueueList { get; set; } = new();
    public DuocCallingPatientDto CallingBhyt { get; set; } = new();
    public DuocCallingPatientDto CallingDichVu { get; set; } = new();
    public List<DuocWaitingPatientDto> WaitingList { get; set; } = new();
}
