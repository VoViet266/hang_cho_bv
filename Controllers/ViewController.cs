using Microsoft.AspNetCore.Mvc;
using HangChoKhamBenh.Web.Helpers;
using HangChoKhamBenh.Web.Models;
using HangChoKhamBenh.Web.Services;

namespace HangChoKhamBenh.Web.Controllers;

public class ViewController : Controller
{
    private readonly IDashboardService _dashboardService;
    private readonly IClinicService _clinicService;
    private readonly ICdhaService _cdhaService;
    private readonly IDuocService _duocService;
    private readonly ILogger<ViewController> _logger;

    public ViewController(
        IDashboardService dashboardService,
        IClinicService clinicService,
        ICdhaService cdhaService,
        IDuocService duocService,
        ILogger<ViewController> logger)
    {
        _dashboardService = dashboardService;
        _clinicService = clinicService;
        _cdhaService = cdhaService;
        _duocService = duocService;
        _logger = logger;
    }

    [HttpGet("/")]
    [HttpHead("/")]
    public IActionResult GetDashboard([FromQuery] string? rooms, [FromQuery] string? r)
    {
        if (Request.Method == "HEAD")
        {
            return Ok();
        }

        return View("Index", new MainPortalViewModel());
    }

    [HttpGet("/kham-benh")]
    [HttpGet("/kham")]
    public async Task<IActionResult> GetKhamBenhIndex()
    {
        var stats = await _dashboardService.FetchDashboardStatsAsync();
        return View("KhamBenhIndex", stats);
    }

    [HttpGet("/duoc")]
    [HttpHead("/duoc")]
    public IActionResult GetDuocIndex()
    {
        if (Request.Method == "HEAD") return Ok();
        return View("DuocIndex", new DuocIndexViewModel());
    }


    public IActionResult RedirectToTongHop() => Redirect("/duoc/danh-sach");

    [HttpGet("/duoc/nhap")]
    [HttpGet("/duoc/input")]
    public IActionResult GetDuocNhap()
    {
        return View("DuocNhap");
    }

    // Màn hình hiển thị danh sách hàng chờ Dược (chiếu TV)
    
    [HttpGet("/duoc/danh-sach")]
    [HttpHead("/duoc/danh-sach")]
    public async Task<IActionResult> GetDuocTongHop()
    {
        if (Request.Method == "HEAD") return Ok();
        var data = await _duocService.LayDanhSachHangChoDuocAsync("all");
        var model = new DuocRoomViewModel
        {
            DuocType = "all",
            Title = data.Title,
            TotalWaiting = data.TotalWaiting,
            TotalToday = data.TotalToday,
            QueueList = data.WaitingList
        };
        return View("DuocRoom", model);
    }

    [HttpGet("/room")]
    [HttpGet("/room/{id}")]
    public async Task<IActionResult> GetRoom(string? id, [FromQuery] string? rooms, [FromQuery] string? r)
    {
        if (!string.IsNullOrWhiteSpace(id) && RoomHelper.IsCdhaRoomParam(id))
        {
            return await GetCdhaRoom(id, rooms, r);
        }

        var rawRooms = rooms ?? r ?? string.Empty;
        var dashboardStats = await _dashboardService.FetchDashboardStatsAsync();

        var allAvailableRooms = dashboardStats.Rooms.Select(rm => new AvailableRoomDto
        {
            Id = rm.Maphong,
            Name = !string.IsNullOrEmpty(rm.Tenphong) ? rm.Tenphong : rm.Maphong
        }).ToList();

        var selectedRoomIds = new List<string>();
        if (!string.IsNullOrWhiteSpace(rawRooms))
        {
            selectedRoomIds = rawRooms.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        }
        else if (!string.IsNullOrWhiteSpace(id))
        {
            selectedRoomIds.Add(id.Trim());
        }

        selectedRoomIds = selectedRoomIds.Distinct().Take(4).ToList();

        var roomsData = new List<RoomDetailDto>();
        foreach (var roomId in selectedRoomIds)
        {
            var data = await _clinicService.LayDanhSachBenhNhanChoCuaPhongAsync(roomId);
            if (data != null) roomsData.Add(data);
        }

        var vm = new RoomPageViewModel
        {
            CurrentRoomId = id ?? string.Empty,
            SelectedRoomIds = selectedRoomIds,
            AllAvailableRooms = allAvailableRooms,
            Room = roomsData.FirstOrDefault() ?? new RoomDetailDto(),
            RoomsData = roomsData,
            RoomType = "room"
        };

        return View("Room", vm);
    }


    [HttpGet("/cdha")]
    [HttpGet("/cdha/dashboard")]
    public async Task<IActionResult> GetCdhaDashboard()
    {
        var stats = await _cdhaService.LayDanhSachCacPhongCDHAAsync();
        return View("CdhaIndex", stats);
    }

    [HttpGet("/cdha/room")]
    [HttpGet("/cdha/room/{tenphong}")]
    [HttpGet("/cdha/{tenphong}")]
    public async Task<IActionResult> GetCdhaRoom(string? tenphong, [FromQuery] string? rooms, [FromQuery] string? r)
    {
        var rawRooms = rooms ?? r ?? string.Empty;
        var cdhaStats = await _cdhaService.LayDanhSachCacPhongCDHAAsync();

        var allAvailableRooms = cdhaStats.Rooms.Select(rm => new AvailableRoomDto
        {
            Id = rm.Tenphong,
            Alias = !string.IsNullOrEmpty(rm.Alias) ? rm.Alias : RoomHelper.ResolveCdhaRoomAlias(rm.Tenphong),
            Name = rm.Tenphong,
            DisplayName = !string.IsNullOrEmpty(rm.DisplayName) ? rm.DisplayName : rm.Tenphong
        }).ToList();

        var selectedRoomIds = new List<string>();

        if (!string.IsNullOrWhiteSpace(rawRooms))
        {
            selectedRoomIds = RoomHelper.ParseCdhaRoomParams(rawRooms);
        }
        else if (!string.IsNullOrWhiteSpace(tenphong))
        {
            selectedRoomIds = RoomHelper.ParseCdhaRoomParams(tenphong);
        }

        // Mặc định 4 phòng: Phòng Siêu âm 1, 2, 3, 4
        if (selectedRoomIds.Count == 0)
        {
            selectedRoomIds.AddRange(RoomHelper.DefaultCdhaRooms);
        }

        selectedRoomIds = selectedRoomIds.Distinct().Take(4).ToList();

        var roomsData = new List<RoomDetailDto>();
        foreach (var roomId in selectedRoomIds)
        {
            var data = await _cdhaService.LayDanhSachBenhNhanChoCDHAAsync(roomId);
            if (data != null) roomsData.Add(data);
        }

        var currentDisplayRoomId = selectedRoomIds.Count == 1
            ? selectedRoomIds[0]
            : (!string.IsNullOrWhiteSpace(tenphong) ? RoomHelper.ResolveCdhaRoomName(tenphong) : "CDHA");

        var vm = new RoomPageViewModel
        {
            CurrentRoomId = currentDisplayRoomId,
            SelectedRoomIds = selectedRoomIds,
            AllAvailableRooms = allAvailableRooms,
            Room = roomsData.FirstOrDefault() ?? new RoomDetailDto(),
            RoomsData = roomsData,
            RoomType = "cdha"
        };

        return View("CdhaRoom", vm);
    }

    [HttpGet("/multi")]
    public async Task<IActionResult> GetMultiRoomView([FromQuery] string? type, [FromQuery] string? rooms, [FromQuery] string? r)
    {
        var roomType = type == "cdha" ? "cdha" : "room";
        var rawRooms = rooms ?? r ?? string.Empty;

        var allAvailableRooms = new List<AvailableRoomDto>();
        if (roomType == "cdha")
        {
            var cdhaStats = await _cdhaService.LayDanhSachCacPhongCDHAAsync();
            allAvailableRooms = cdhaStats.Rooms.Select(rm => new AvailableRoomDto
            {
                Id = rm.Tenphong,
                Alias = !string.IsNullOrEmpty(rm.Alias) ? rm.Alias : RoomHelper.ResolveCdhaRoomAlias(rm.Tenphong),
                Name = rm.Tenphong,
                DisplayName = !string.IsNullOrEmpty(rm.DisplayName) ? rm.DisplayName : rm.Tenphong
            }).ToList();
        }
        else
        {
            var dashboardStats = await _dashboardService.FetchDashboardStatsAsync();
            allAvailableRooms = dashboardStats.Rooms.Select(rm => new AvailableRoomDto
            {
                Id = rm.Maphong,
                Name = !string.IsNullOrEmpty(rm.Tenphong) ? rm.Tenphong : rm.Maphong
            }).ToList();
        }

        var selectedRoomIds = new List<string>();
        if (!string.IsNullOrWhiteSpace(rawRooms))
        {
            if (roomType == "cdha")
            {
                selectedRoomIds = RoomHelper.ParseCdhaRoomParams(rawRooms);
            }
            else
            {
                selectedRoomIds = rawRooms.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
            }
        }
        else
        {
            if (roomType == "cdha")
            {
                selectedRoomIds.AddRange(RoomHelper.DefaultCdhaRooms);
            }
        }

        selectedRoomIds = selectedRoomIds.Distinct().Take(4).ToList();

        var roomsData = new List<RoomDetailDto>();
        foreach (var roomId in selectedRoomIds)
        {
            if (roomType == "cdha")
            {
                var d = await _cdhaService.LayDanhSachBenhNhanChoCDHAAsync(roomId);
                if (d != null) roomsData.Add(d);
            }
            else
            {
                var d = await _clinicService.LayDanhSachBenhNhanChoCuaPhongAsync(roomId);
                if (d != null) roomsData.Add(d);
            }
        }

        var vm = new MultiRoomPageViewModel
        {
            RoomType = roomType,
            SelectedRoomIds = selectedRoomIds,
            AllAvailableRooms = allAvailableRooms,
            RoomsData = roomsData
        };

        return View("MultiRoom", vm);
    }

    [HttpGet("/{roomParam}")]
    public async Task<IActionResult> HandleShortUrl(string roomParam)
    {
        if (string.IsNullOrWhiteSpace(roomParam)) return NotFound();

        // Bỏ qua các file tĩnh hoặc tiền tố api
        if (roomParam.Equals("api", StringComparison.OrdinalIgnoreCase) ||
            roomParam.Contains('.'))
        {
            return NotFound();
        }

        // Hàng chờ Dược -> Trả về màn hình chọn 2 nút (Bảo hiểm & Dịch vụ)
        if (roomParam.Equals("duoc", StringComparison.OrdinalIgnoreCase))
        {
            return GetDuocIndex();
        }

        // 1. Nếu là phòng CĐHA (1..6, '1,2', '1,2,3,4', '1-4', 'sa1', v.v.) -> Chuyển hướng sang /cdha/{roomParam}
        if (RoomHelper.IsCdhaRoomParam(roomParam))
        {
            return Redirect($"/cdha/{roomParam}");
        }

        // 2. Nếu là phòng khám lâm sàng (A1, B1, B22, v.v.)
        var dashboardStats = await _dashboardService.FetchDashboardStatsAsync();
        var matched = dashboardStats.Rooms.FirstOrDefault(r =>
            string.Equals(r.Maphong, roomParam, StringComparison.OrdinalIgnoreCase));

        if (matched != null)
        {
            return await GetRoom(matched.Maphong, null, null);
        }

        return NotFound();
    }
}
