using System.Text.Json.Serialization;

namespace HangChoKhamBenh.Web.Models;

public class ClinicRoomOverviewDto
{
    [JsonPropertyName("maphong")]
    public string Maphong { get; set; } = string.Empty;

    [JsonPropertyName("tenphong")]
    public string Tenphong { get; set; } = string.Empty;

    [JsonPropertyName("tong_dangky")]
    public int TongDangKy { get; set; }

    [JsonPropertyName("tong_chuyen_sang")]
    public int TongChuyenSang { get; set; }

    [JsonPropertyName("tong_cho_kham")]
    public int TongChoKham { get; set; }
}

public class DashboardOverviewDto
{
    [JsonPropertyName("tong_dangky")]
    public int TongDangKy { get; set; }

    [JsonPropertyName("tong_chuyen_sang")]
    public int TongChuyenSang { get; set; }

    [JsonPropertyName("tong_cho_kham")]
    public int TongChoKham { get; set; }
}

public class DashboardStatsDto
{
    [JsonPropertyName("overview")]
    public DashboardOverviewDto Overview { get; set; } = new();

    [JsonPropertyName("rooms")]
    public List<ClinicRoomOverviewDto> Rooms { get; set; } = new();
}

public class CdhaRoomOverviewDto
{
    [JsonPropertyName("tenphong")]
    public string Tenphong { get; set; } = string.Empty;

    [JsonPropertyName("tong_cho_kham")]
    public int TongChoKham { get; set; }

    [JsonPropertyName("alias")]
    public string Alias { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;
}

public class CdhaOverviewDto
{
    [JsonPropertyName("tong_cho_kham")]
    public int TongChoKham { get; set; }
}

public class CdhaDashboardStatsDto
{
    [JsonPropertyName("overview")]
    public CdhaOverviewDto Overview { get; set; } = new();

    [JsonPropertyName("rooms")]
    public List<CdhaRoomOverviewDto> Rooms { get; set; } = new();
}

public class PatientWaitingDto
{
    [JsonPropertyName("makb")]
    public string? Makb { get; set; }

    [JsonPropertyName("mabn")]
    public string? Mabn { get; set; }

    [JsonPropertyName("holot")]
    public string Holot { get; set; } = string.Empty;

    [JsonPropertyName("ten")]
    public string Ten { get; set; } = string.Empty;

    [JsonPropertyName("ngaysinh")]
    public DateTime? Ngaysinh { get; set; }

    [JsonPropertyName("dobStr")]
    public string DobStr { get; set; } = string.Empty;

    [JsonPropertyName("gioitinh")]
    public decimal? Gioitinh { get; set; }

    [JsonPropertyName("genderStr")]
    public string GenderStr { get; set; } = string.Empty;

    [JsonPropertyName("isPriority")]
    public bool IsPriority { get; set; }

    [JsonPropertyName("priorityLabel")]
    public string? PriorityLabel { get; set; }

    [JsonPropertyName("ngaydk")]
    public DateTime? Ngaydk { get; set; }

    [JsonPropertyName("tenphong")]
    public string? Tenphong { get; set; }

    [JsonPropertyName("ghichu")]
    public string? Ghichu { get; set; }

    [JsonPropertyName("dakham")]
    public int Dakham { get; set; } = 0;
}

public class HiddenPatientDto
{
    [JsonPropertyName("makb")]
    public string? Makb { get; set; }

    [JsonPropertyName("mabn")]
    public string? Mabn { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("room")]
    public string Room { get; set; } = string.Empty;

    [JsonPropertyName("time")]
    public string Time { get; set; } = string.Empty;

    [JsonPropertyName("key")]
    public string Key { get; set; } = string.Empty;
}

public class RoomDetailDto
{
    [JsonPropertyName("maphong")]
    public string Maphong { get; set; } = string.Empty;

    [JsonPropertyName("tenphong")]
    public string Tenphong { get; set; } = string.Empty;

    [JsonPropertyName("totalDKPlus")]
    public int TotalDKPlus { get; set; }

    [JsonPropertyName("totalWaiting")]
    public int TotalWaiting { get; set; }

    [JsonPropertyName("waitingList")]
    public List<PatientWaitingDto> WaitingList { get; set; } = new();

    [JsonPropertyName("hiddenList")]
    public List<HiddenPatientDto> HiddenList { get; set; } = new();
}

public class HidePatientRequest
{
    [JsonPropertyName("makb")]
    public string? Makb { get; set; }

    [JsonPropertyName("mabn")]
    public string? Mabn { get; set; }

    [JsonPropertyName("tenphong")]
    public string? Tenphong { get; set; }
}

public class RestorePatientRequest
{
    [JsonPropertyName("makb")]
    public string? Makb { get; set; }

    [JsonPropertyName("mabn")]
    public string? Mabn { get; set; }

    [JsonPropertyName("tenphong")]
    public string? Tenphong { get; set; }
}

public class RestoreAllPatientsRequest
{
    [JsonPropertyName("tenphong")]
    public string? Tenphong { get; set; }

    [JsonPropertyName("rooms")]
    public object? Rooms { get; set; }
}

public class TtsRequest
{
    [JsonPropertyName("text")]
    public string? Text { get; set; }
}

public class TtsResponse
{
    [JsonPropertyName("hash")]
    public string Hash { get; set; } = string.Empty;

    [JsonPropertyName("source")]
    public string Source { get; set; } = string.Empty;

    [JsonPropertyName("audioUrl")]
    public string AudioUrl { get; set; } = string.Empty;

    [JsonPropertyName("audioContent")]
    public string AudioContent { get; set; } = string.Empty;
}

public class ApiResponse<T>
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("data")]
    public T? Data { get; set; }

    public static ApiResponse<T> Ok(T data, string? message = null)
        => new() { Success = true, Data = data, Message = message };

    public static ApiResponse<T> Fail(string message)
        => new() { Success = false, Message = message };
}

public class DuocCallingPatientDto
{
    [JsonPropertyName("quaySo")]
    public int QuaySo { get; set; } = 1;

    [JsonPropertyName("quayTen")]
    public string QuayTen { get; set; } = string.Empty;

    [JsonPropertyName("soPhieu")]
    public string SoPhieu { get; set; } = string.Empty;

    [JsonPropertyName("tenBenhNhan")]
    public string TenBenhNhan { get; set; } = string.Empty;

    [JsonPropertyName("loaiToa")]
    public string LoaiToa { get; set; } = string.Empty;
}

public class DuocWaitingPatientDto
{
    [JsonPropertyName("soPhieu")]
    public string SoPhieu { get; set; } = string.Empty;

    [JsonPropertyName("tenBenhNhan")]
    public string TenBenhNhan { get; set; } = string.Empty;

    [JsonPropertyName("loaiToa")]
    public string LoaiToa { get; set; } = string.Empty;

    [JsonPropertyName("trangThai")]
    public string TrangThai { get; set; } = string.Empty;

    [JsonPropertyName("isBhyt")]
    public bool IsBhyt { get; set; } = true;
}

public class DuocQueueDataDto
{
    [JsonPropertyName("callingBhyt")]
    public DuocCallingPatientDto CallingBhyt { get; set; } = new();

    [JsonPropertyName("callingDichVu")]
    public DuocCallingPatientDto CallingDichVu { get; set; } = new();

    [JsonPropertyName("waitingList")]
    public List<DuocWaitingPatientDto> WaitingList { get; set; } = new();
}

public class DuocQueueItemDto
{
    [JsonPropertyName("stt")]
    public int Stt { get; set; }

    [JsonPropertyName("mabn")]
    public string Mabn { get; set; } = string.Empty;

    [JsonPropertyName("makb")]
    public string Makb { get; set; } = string.Empty;

    [JsonPropertyName("tenBenhNhan")]
    public string TenBenhNhan { get; set; } = string.Empty;

    [JsonPropertyName("namSinh")]
    public string NamSinh { get; set; } = string.Empty;

    [JsonPropertyName("gioiTinh")]
    public string GioiTinh { get; set; } = string.Empty;

    [JsonPropertyName("loaiToa")]
    public string LoaiToa { get; set; } = string.Empty;

    [JsonPropertyName("khochan")]
    public int Khochan { get; set; }

    [JsonPropertyName("maba")]
    public string? Maba { get; set; }

    [JsonPropertyName("ngayNhap")]
    public DateTime? NgayNhap { get; set; }

    [JsonPropertyName("ngayNhapStr")]
    public string NgayNhapStr { get; set; } = string.Empty;

    [JsonPropertyName("trangThai")]
    public string TrangThai { get; set; } = string.Empty;

    [JsonPropertyName("isToiLuot")]
    public bool IsToiLuot { get; set; }

    [JsonPropertyName("isBhyt")]
    public bool IsBhyt { get; set; }

    [JsonPropertyName("soTien")]
    public decimal? SoTien { get; set; }

    [JsonPropertyName("soTienStr")]
    public string SoTienStr { get; set; } = string.Empty;

    [JsonPropertyName("daThu")]
    public bool DaThu { get; set; }

    [JsonPropertyName("dagiao")]
    public decimal Dagiao { get; set; }

    [JsonPropertyName("oCua")]
    public string OCua { get; set; } = string.Empty;
}

public class DuocQueuePageDto
{
    [JsonPropertyName("duocType")]
    public string DuocType { get; set; } = "all"; // "bhyt", "dichvu", "all"

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("totalWaiting")]
    public int TotalWaiting { get; set; }

    [JsonPropertyName("totalToday")]
    public int TotalToday { get; set; }

    [JsonPropertyName("waitingList")]
    public List<DuocQueueItemDto> WaitingList { get; set; } = new();

    [JsonPropertyName("nextPatientName")]
    public string NextPatientName { get; set; } = string.Empty;
}

// ========== DTOs cho trang Nhập Hàng Chờ Dược ==========

public class DuocNhapBarcodeResultDto
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("loai")]
    public int Loai { get; set; } // 13 = BHYT, 14 = Dịch vụ (đọc từ chungtu.khochan)

    [JsonPropertyName("makh")]
    public string? Makh { get; set; }

    [JsonPropertyName("makb")]
    public string? Makb { get; set; }

    [JsonPropertyName("mabn")]
    public string? Mabn { get; set; }

    [JsonPropertyName("hoTen")]
    public string HoTen { get; set; } = string.Empty;

    [JsonPropertyName("ngaySinh")]
    public string NgaySinh { get; set; } = string.Empty;

    [JsonPropertyName("gioiTinh")]
    public string GioiTinh { get; set; } = string.Empty;

    [JsonPropertyName("ngayKcb")]
    public DateTime? NgayKcb { get; set; }

    // Thông tin đơn thuốc từ chungtu (dùng cho loại 14)
    [JsonPropertyName("sohd")]
    public string? Sohd { get; set; }

    [JsonPropertyName("maba")]
    public string? Maba { get; set; }

    [JsonPropertyName("thanhtien")]
    public decimal Thanhtien { get; set; }

    [JsonPropertyName("danhSachThuoc")]
    public List<DuocNhapThuocItemDto> DanhSachThuoc { get; set; } = new();
}

public class DuocNhapThuocItemDto
{
    [JsonPropertyName("sohd")]
    public string? Sohd { get; set; }

    [JsonPropertyName("maba")]
    public string? Maba { get; set; }

    [JsonPropertyName("thanhtien")]
    public decimal Thanhtien { get; set; }
}

public class DuocNhapThemRequest
{
    [JsonPropertyName("makb")]
    public string Makb { get; set; } = string.Empty;

    [JsonPropertyName("mabn")]
    public string Mabn { get; set; } = string.Empty;

    [JsonPropertyName("loai")]
    public int Loai { get; set; } // 13 = Dịch vụ, 14 = BHYT

    [JsonPropertyName("khochan")]
    public int Khochan { get; set; } // 13 = Dịch vụ, 14 = BHYT

    [JsonPropertyName("maba")]
    public string? Maba { get; set; }

    [JsonPropertyName("ngayKcb")]
    public DateTime? NgayKcb { get; set; }

    [JsonPropertyName("oCua")]
    public string? OCua { get; set; }
}

public class DuocNhapThemResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty; // "them", "thanh_toan", "an_ten"

    [JsonPropertyName("dagiao")]
    public decimal? Dagiao { get; set; }

    [JsonPropertyName("khochan")]
    public int? Khochan { get; set; }

    [JsonPropertyName("isUpdate")]
    public bool IsUpdate { get; set; }

    [JsonPropertyName("oCua")]
    public string? OCua { get; set; }
}

public class DuocCapNhatTrangThaiRequest
{
    [JsonPropertyName("makb")]
    public string? Makb { get; set; }

    [JsonPropertyName("mabn")]
    public string? Mabn { get; set; }

    [JsonPropertyName("targetDagiao")]
    public decimal TargetDagiao { get; set; } // 1: Đang soạn / Đã phát BHYT, 2: Đã phát Dịch vụ

    [JsonPropertyName("oCua")]
    public string? OCua { get; set; }

    [JsonPropertyName("hoTen")]
    public string? HoTen { get; set; }

    [JsonPropertyName("isBhyt")]
    public bool? IsBhyt { get; set; }

    [JsonPropertyName("trangThai")]
    public string? TrangThai { get; set; }

    [JsonPropertyName("namSinh")]
    public string? NamSinh { get; set; }
}

public class DuocChuaGiaoItemDto
{
    [JsonPropertyName("makb")]
    public string Makb { get; set; } = string.Empty;

    [JsonPropertyName("mabn")]
    public string Mabn { get; set; } = string.Empty;

    [JsonPropertyName("hoTen")]
    public string HoTen { get; set; } = string.Empty;

    [JsonPropertyName("namSinh")]
    public string NamSinh { get; set; } = string.Empty;

    [JsonPropertyName("gioiTinh")]
    public string GioiTinh { get; set; } = string.Empty;

    [JsonPropertyName("khochan")]
    public int Khochan { get; set; }

    [JsonPropertyName("isBhyt")]
    public bool IsBhyt { get; set; }

    [JsonPropertyName("dagiao")]
    public decimal Dagiao { get; set; }

    [JsonPropertyName("daThu")]
    public bool DaThu { get; set; }

    [JsonPropertyName("trangThai")]
    public string TrangThai { get; set; } = string.Empty;

    [JsonPropertyName("soTien")]
    public decimal? SoTien { get; set; }

    [JsonPropertyName("soTienStr")]
    public string SoTienStr { get; set; } = string.Empty;

    [JsonPropertyName("ngayNhapStr")]
    public string NgayNhapStr { get; set; } = string.Empty;

    [JsonPropertyName("oCua")]
    public string OCua { get; set; } = string.Empty;
}

public class DuocDaGiaoItemDto
{
    [JsonPropertyName("makb")]
    public string Makb { get; set; } = string.Empty;

    [JsonPropertyName("mabn")]
    public string Mabn { get; set; } = string.Empty;

    [JsonPropertyName("hoTen")]
    public string HoTen { get; set; } = string.Empty;

    [JsonPropertyName("namSinh")]
    public string NamSinh { get; set; } = string.Empty;

    [JsonPropertyName("gioiTinh")]
    public string GioiTinh { get; set; } = string.Empty;

    [JsonPropertyName("khochan")]
    public int Khochan { get; set; }

    [JsonPropertyName("isBhyt")]
    public bool IsBhyt { get; set; }

    [JsonPropertyName("dagiao")]
    public decimal Dagiao { get; set; }

    [JsonPropertyName("soTienStr")]
    public string SoTienStr { get; set; } = string.Empty;

    [JsonPropertyName("ngayGiaoStr")]
    public string NgayGiaoStr { get; set; } = string.Empty;

    [JsonPropertyName("oCua")]
    public string OCua { get; set; } = string.Empty;
}

public class DuocHoanTacRequest
{
    [JsonPropertyName("makb")]
    public string Makb { get; set; } = string.Empty;

    [JsonPropertyName("mabn")]
    public string Mabn { get; set; } = string.Empty;

    [JsonPropertyName("loai")]
    public string Loai { get; set; } = string.Empty; // "thu_tien" hoặc "phat_thuoc"
}
