using System.Text.Json.Serialization;

namespace HangChoKhamBenh.Web.Models
{
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
}

