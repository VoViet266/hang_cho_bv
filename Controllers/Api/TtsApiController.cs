using Microsoft.AspNetCore.Mvc;
using HangChoKhamBenh.Web.Models;
using HangChoKhamBenh.Web.Services;

namespace HangChoKhamBenh.Web.Controllers.Api;

[ApiController]
[Route("api/tts")]
public class TtsApiController : ControllerBase
{
    private readonly ITtsService _ttsService;
    private readonly ILogger<TtsApiController> _logger;

    public TtsApiController(ITtsService ttsService, ILogger<TtsApiController> logger)
    {
        _ttsService = ttsService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> StreamSpeech([FromQuery] string? text, [FromQuery] string? q)
    {
        var content = text ?? q;
        if (string.IsNullOrWhiteSpace(content))
        {
            return BadRequest("Thiếu tham số 'text'");
        }

        _logger.LogInformation("[TTS Request] Stream nội dung: \"{Text}\"", content);

        try
        {
            var result = await _ttsService.GetOrGenerateAudioAsync(content);

            Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            Response.Headers.ETag = $"\"{result.Hash}\"";
            Response.Headers["X-TTS-Source"] = result.Source;

            return File(result.AudioBytes, "audio/mpeg");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi stream TTS");
            return StatusCode(500, "Lỗi TTS: " + ex.Message);
        }
    }

    [HttpPost]
    public async Task<IActionResult> GenerateSpeech([FromBody] TtsRequest? request)
    {
        var text = request?.Text;
        if (string.IsNullOrWhiteSpace(text) && Request.HasFormContentType)
        {
            text = Request.Form["text"];
        }
        if (string.IsNullOrWhiteSpace(text))
        {
            text = Request.Query["text"];
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            return BadRequest(new { error = "Thiếu trường 'text' trong body" });
        }

        _logger.LogInformation("[TTS Request] Tạo audio: \"{Text}\"", text);

        try
        {
            var result = await _ttsService.GetOrGenerateAudioAsync(text);

            return Ok(new TtsResponse
            {
                Hash = result.Hash,
                Source = result.Source,
                AudioUrl = $"/audio/cache/{result.Hash}.mp3",
                AudioContent = Convert.ToBase64String(result.AudioBytes)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi tạo TTS");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
