namespace HangChoKhamBenh.Web.Services
{
    public class TtsResult
    {
        public byte[] AudioBytes { get; set; } = Array.Empty<byte>();
        public string Hash { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
        public bool FromCache { get; set; }
        public string FilePath { get; set; } = string.Empty;
    }

    public interface ITtsService
    {
        Task<TtsResult> GetOrGenerateAudioAsync(string text);
        Task CleanCacheIfNeededAsync(bool force = false);
    }
}

