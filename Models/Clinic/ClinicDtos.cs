using System.Text.Json.Serialization;

namespace HangChoKhamBenh.Web.Models
{
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
}

