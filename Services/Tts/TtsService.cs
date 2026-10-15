using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace HangChoKhamBenh.Web.Services
{
    public class TtsService : ITtsService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<TtsService> _logger;
        private readonly string _cacheDir;
        private readonly ConcurrentDictionary<string, Lazy<Task<TtsResult>>> _inFlightTasks = new();

        private const long MaxCacheSizeBytes = 300 * 1024 * 1024; // 300 MB
        private const long TargetCacheSizeBytes = 250 * 1024 * 1024; // 250 MB
        private static DateTimeOffset _lastCleanupCheck = DateTimeOffset.MinValue;
        private static readonly SemaphoreSlim _cleanupLock = new(1, 1);

        public TtsService(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            IWebHostEnvironment env,
            ILogger<TtsService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;

            _cacheDir = Path.Combine(env.WebRootPath, "audio", "cache");
            if (!Directory.Exists(_cacheDir))
            {
                Directory.CreateDirectory(_cacheDir);
            }

            _ = CleanCacheIfNeededAsync(force: false);
        }

        public async Task<TtsResult> GetOrGenerateAudioAsync(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                throw new ArgumentException("Nội dung text không hợp lệ", nameof(text));
            }

            var normalizedText = text.Trim();
            var voiceName = _configuration["TTS:VoiceName"] ?? _configuration["VOICE_NAME"] ?? "vi-VN-Chirp3-HD-Kore";
            var speakingRateStr = _configuration["TTS:SpeakingRate"] ?? _configuration["SPEAKING_RATE"] ?? "1.10";
            double.TryParse(speakingRateStr, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var speakingRate);
            if (speakingRate <= 0) speakingRate = 1.10;

            var hash = ComputeMd5Hash($"{normalizedText}_{voiceName}_{speakingRate.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
            var filePath = Path.Combine(_cacheDir, $"{hash}.mp3");

            // Kiểm tra nhanh file cache trên đĩa trước khi tạo Task
            if (File.Exists(filePath))
            {
                try
                {
                    var cachedBytes = await File.ReadAllBytesAsync(filePath);
                    return new TtsResult
                    {
                        AudioBytes = cachedBytes,
                        Hash = hash,
                        FromCache = true,
                        Source = "Disk-Cache",
                        FilePath = filePath
                    };
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[TTS Cache] Đọc file cache bị lỗi, sẽ thử tạo lại");
                }
            }

            // Dùng Lazy<Task> để đảm bảo dù có hàng chục client gọi cùng 1 mili-giây thì chỉ duy nhất 1 Task được chạy
            var lazyTask = _inFlightTasks.GetOrAdd(
                hash,
                k => new Lazy<Task<TtsResult>>(
                    () => GenerateInternalAsync(normalizedText, voiceName, speakingRate, k, filePath),
                    LazyThreadSafetyMode.ExecutionAndPublication
                )
            );

            try
            {
                return await lazyTask.Value;
            }
            finally
            {
                _inFlightTasks.TryRemove(hash, out _);
            }
        }

        private async Task<TtsResult> GenerateInternalAsync(string normalizedText, string voiceName, double speakingRate, string hash, string filePath)
        {
            // 1. Kiểm tra cache trên đĩa
            if (File.Exists(filePath))
            {
                try
                {
                    var cachedBytes = await File.ReadAllBytesAsync(filePath);
                    return new TtsResult
                    {
                        AudioBytes = cachedBytes,
                        Hash = hash,
                        FromCache = true,
                        Source = "Disk-Cache",
                        FilePath = filePath
                    };
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[TTS Cache] Đọc file cache bị lỗi, sẽ thử tạo lại");
                }
            }

            byte[]? audioBytes = null;
            string source = "Google-Translate-Free";
            var googleApiKey = _configuration["TTS:ApiKey"] ?? _configuration["GOOGLE_TTS_API_KEY"];

            var client = _httpClientFactory.CreateClient("TTS");
            client.Timeout = TimeSpan.FromSeconds(6);

            // 2. Thử Official Google Cloud TTS (nếu có cấu hình API Key)
            if (!string.IsNullOrEmpty(googleApiKey))
            {
                try
                {
                    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                    var url = $"https://texttospeech.googleapis.com/v1/text:synthesize?key={googleApiKey}";
                    var payload = new
                    {
                        input = new { text = normalizedText },
                        voice = new { languageCode = "vi-VN", name = voiceName },
                        audioConfig = new { audioEncoding = "MP3", speakingRate }
                    };

                    var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                    var response = await client.PostAsync(url, content, cts.Token);

                    if (response.IsSuccessStatusCode)
                    {
                        var responseJson = await response.Content.ReadAsStringAsync(cts.Token);
                        using var doc = JsonDocument.Parse(responseJson);
                        if (doc.RootElement.TryGetProperty("audioContent", out var audioContentProp))
                        {
                            var base64 = audioContentProp.GetString();
                            if (!string.IsNullOrEmpty(base64))
                            {
                                audioBytes = Convert.FromBase64String(base64);
                                source = $"Google-Cloud ({voiceName})";
                            }
                        }
                    }
                    else
                    {
                        var err = await response.Content.ReadAsStringAsync();
                        _logger.LogWarning("[TTS] Google Cloud TTS thất bại ({StatusCode}): {Error}. Đang thử fallback...", response.StatusCode, err);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[TTS] Google Cloud TTS request lỗi. Đang thử fallback...");
                }
            }

            // 3. Fallback sang Google Translate TTS (miễn phí)
            if (audioBytes == null || audioBytes.Length == 0)
            {
                var endpoints = new[]
                {
                    $"https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q={Uri.EscapeDataString(normalizedText)}",
                    $"https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&q={Uri.EscapeDataString(normalizedText)}"
                };

                foreach (var googleUrl in endpoints)
                {
                    try
                    {
                        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                        using var req = new HttpRequestMessage(HttpMethod.Get, googleUrl);
                        req.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

                        var response = await client.SendAsync(req, cts.Token);
                        if (response.IsSuccessStatusCode)
                        {
                            audioBytes = await response.Content.ReadAsByteArrayAsync(cts.Token);
                            if (audioBytes != null && audioBytes.Length > 0)
                            {
                                source = "Google-Translate (Free)";
                                break;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "[TTS] Thử endpoint Translate thất bại ({Url})", googleUrl);
                    }
                }
            }

            if (audioBytes == null || audioBytes.Length == 0)
            {
                throw new Exception("Không thể tạo giọng đọc TTS qua bất kỳ cổng dịch vụ nào.");
            }

            // 4. Ghi file nguyên tử (Atomic write)
            if (audioBytes.Length > 0)
            {
                var tempPath = $"{filePath}.tmp.{DateTimeOffset.Now.ToUnixTimeMilliseconds()}";
                try
                {
                    await File.WriteAllBytesAsync(tempPath, audioBytes);
                    File.Move(tempPath, filePath, overwrite: true);
                    _ = CleanCacheIfNeededAsync(force: false);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[TTS] Lỗi ghi file cache");
                    if (File.Exists(tempPath))
                    {
                        try { File.Delete(tempPath); } catch { }
                    }
                }
            }

            return new TtsResult
            {
                AudioBytes = audioBytes,
                Hash = hash,
                FromCache = false,
                Source = source,
                FilePath = filePath
            };
        }

        public async Task CleanCacheIfNeededAsync(bool force = false)
        {
            if (!force && (DateTimeOffset.Now - _lastCleanupCheck).TotalMinutes < 10)
            {
                return;
            }

            if (!await _cleanupLock.WaitAsync(0)) return;

            try
            {
                _lastCleanupCheck = DateTimeOffset.Now;
                if (!Directory.Exists(_cacheDir)) return;

                var dirInfo = new DirectoryInfo(_cacheDir);
                var files = dirInfo.GetFiles("*.mp3").OrderBy(f => f.LastWriteTime).ToList();
                var totalSize = files.Sum(f => f.Length);

                if (totalSize > MaxCacheSizeBytes)
                {
                    _logger.LogInformation("[TTS Cache] Dung lượng hiện tại {SizeMB:F2} MB > 300 MB. Bắt đầu dọn dẹp FIFO...", totalSize / 1024.0 / 1024.0);

                    var deletedCount = 0;
                    long deletedBytes = 0;

                    foreach (var file in files)
                    {
                        if (totalSize <= TargetCacheSizeBytes) break;
                        try
                        {
                            var len = file.Length;
                            file.Delete();
                            totalSize -= len;
                            deletedBytes += len;
                            deletedCount++;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "[TTS Cache] Không thể xóa file {Name}", file.Name);
                        }
                    }

                    _logger.LogInformation("[TTS Cache] Đã dọn dẹp {Count} file ({BytesMB:F2} MB). Dung lượng còn lại: {RemainingMB:F2} MB",
                        deletedCount, deletedBytes / 1024.0 / 1024.0, totalSize / 1024.0 / 1024.0);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[TTS Cache] Lỗi trong quá trình dọn dẹp");
            }
            finally
            {
                _cleanupLock.Release();
            }
        }

        private static string ComputeMd5Hash(string input)
        {
            using var md5 = MD5.Create();
            var bytes = md5.ComputeHash(Encoding.UTF8.GetBytes(input));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }
}
