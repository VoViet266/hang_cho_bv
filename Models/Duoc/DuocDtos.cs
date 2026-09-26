using System.Text.Json.Serialization;

namespace HangChoKhamBenh.Web.Models
{
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

        [JsonPropertyName("hasBhyt")]
        public bool HasBhyt { get; set; }

        [JsonPropertyName("hasDichVu")]
        public bool HasDichVu { get; set; }

        [JsonPropertyName("hasBoth")]
        public bool HasBoth { get; set; }

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

    // ========== DTOs cho Quản lý & Nhập Hàng Chờ Dược ==========

    public class DuocNhapBarcodeResultDto
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        [JsonPropertyName("loai")]
        public int Loai { get; set; } // 13 = Dịch vụ, 14 = BHYT, 0 = Cả 2 toa

        [JsonPropertyName("hasBhyt")]
        public bool HasBhyt { get; set; }

        [JsonPropertyName("hasDichVu")]
        public bool HasDichVu { get; set; }

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

        // Thông tin chung
        [JsonPropertyName("sohd")]
        public string? Sohd { get; set; }

        [JsonPropertyName("maba")]
        public string? Maba { get; set; }

        // Thông tin chi tiết Toa BHYT
        [JsonPropertyName("sohdBhyt")]
        public string? SohdBhyt { get; set; }

        [JsonPropertyName("mabaBhyt")]
        public string? MabaBhyt { get; set; }

        // Thông tin chi tiết Toa Dịch Vụ
        [JsonPropertyName("sohdDv")]
        public string? SohdDv { get; set; }

        [JsonPropertyName("mabaDv")]
        public string? MabaDv { get; set; }

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
        public int? Loai { get; set; } // 13 = Dịch vụ, 14 = BHYT, 0 = Cả 2 toa

        [JsonPropertyName("khochan")]
        public int? Khochan { get; set; } // 13 = Dịch vụ, 14 = BHYT, 0 = Cả 2 toa

        [JsonPropertyName("hasBhyt")]
        public bool? HasBhyt { get; set; }

        [JsonPropertyName("hasDichVu")]
        public bool? HasDichVu { get; set; }

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
        public string Action { get; set; } = string.Empty;

        [JsonPropertyName("dagiao")]
        public decimal? Dagiao { get; set; }

        [JsonPropertyName("khochan")]
        public int? Khochan { get; set; }

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

        [JsonPropertyName("hasBhyt")]
        public bool HasBhyt { get; set; }

        [JsonPropertyName("hasDichVu")]
        public bool HasDichVu { get; set; }

        [JsonPropertyName("hasBoth")]
        public bool HasBoth { get; set; }

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

        [JsonPropertyName("sohd")]
        public string? Sohd { get; set; }

        [JsonPropertyName("maba")]
        public string? Maba { get; set; }
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

        [JsonPropertyName("hasBhyt")]
        public bool HasBhyt { get; set; }

        [JsonPropertyName("hasDichVu")]
        public bool HasDichVu { get; set; }

        [JsonPropertyName("hasBoth")]
        public bool HasBoth { get; set; }

        [JsonPropertyName("dagiao")]
        public decimal Dagiao { get; set; }

        [JsonPropertyName("soTienStr")]
        public string SoTienStr { get; set; } = string.Empty;

        [JsonPropertyName("ngayGiaoStr")]
        public string NgayGiaoStr { get; set; } = string.Empty;

        [JsonPropertyName("oCua")]
        public string OCua { get; set; } = string.Empty;

        [JsonPropertyName("sohd")]
        public string? Sohd { get; set; }

        [JsonPropertyName("maba")]
        public string? Maba { get; set; }
    }

    public class DuocHoanTacRequest
    {
        [JsonPropertyName("makb")]
        public string Makb { get; set; } = string.Empty;

        [JsonPropertyName("mabn")]
        public string Mabn { get; set; } = string.Empty;
    }
}

