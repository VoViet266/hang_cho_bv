using System.Text.Json.Serialization;

namespace HangChoKhamBenh.Web.Models
{
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
}

