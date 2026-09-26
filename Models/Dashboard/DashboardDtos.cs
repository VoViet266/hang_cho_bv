using System.Text.Json.Serialization;

namespace HangChoKhamBenh.Web.Models
{
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
}

