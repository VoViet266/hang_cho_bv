const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const env = require("../config/env");

// Thư mục lưu cache file MP3
const cacheDir = path.join(__dirname, "../../public/audio/cache");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Cấu hình giới hạn dung lượng bộ nhớ đệm (Cache Limit)
const MAX_CACHE_SIZE_BYTES = 300 * 1024 * 1024; // 300 MB
const TARGET_CACHE_SIZE_BYTES = 250 * 1024 * 1024; // Dọn dẹp về mức 250 MB khi vượt ngưỡng
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // Kiểm tra định kỳ tối đa 10 phút một lần

let isCleaning = false;
let lastCleanupCheck = 0;

/**
 * Tự động dọn dẹp các file cache cũ nhất (FIFO) khi dung lượng vượt quá 300 MB.
 */
async function cleanCacheIfNeeded(force = false) {
  const now = Date.now();
  if (!force && (now - lastCleanupCheck < CLEANUP_INTERVAL_MS || isCleaning)) {
    return;
  }
  lastCleanupCheck = now;
  isCleaning = true;

  try {
    const files = await fs.promises.readdir(cacheDir);
    const mp3Files = [];
    let totalSize = 0;

    for (const file of files) {
      if (file.endsWith(".mp3")) {
        const filePath = path.join(cacheDir, file);
        try {
          const stats = await fs.promises.stat(filePath);
          totalSize += stats.size;
          mp3Files.push({
            filePath,
            size: stats.size,
            mtimeMs: stats.mtimeMs,
          });
        } catch (e) {
          // Bỏ qua nếu file đang bị ghi hoặc bị xóa
        }
      }
    }

    if (totalSize > MAX_CACHE_SIZE_BYTES) {
      console.log(
        `[TTS Cache] Dung lượng cache hiện tại: ${(totalSize / 1024 / 1024).toFixed(2)} MB > 300 MB. Bắt đầu dọn dẹp FIFO...`,
      );

      // Sắp xếp file cũ nhất lên đầu (FIFO theo thời gian sửa đổi)
      mp3Files.sort((a, b) => a.mtimeMs - b.mtimeMs);

      let deletedCount = 0;
      let deletedBytes = 0;

      for (const item of mp3Files) {
        if (totalSize <= TARGET_CACHE_SIZE_BYTES) break;
        try {
          await fs.promises.unlink(item.filePath);
          totalSize -= item.size;
          deletedBytes += item.size;
          deletedCount++;
        } catch (unlinkErr) {
          console.error("Lỗi khi xóa file cache cũ:", unlinkErr.message);
        }
      }

      console.log(
        `[TTS Cache] Đã dọn dẹp ${deletedCount} file cũ (giải phóng ${(deletedBytes / 1024 / 1024).toFixed(2)} MB). Dung lượng còn lại: ${(totalSize / 1024 / 1024).toFixed(2)} MB.`,
      );
    }
  } catch (error) {
    console.error("[TTS Cache] Lỗi trong quá trình dọn dẹp cache:", error);
  } finally {
    isCleaning = false;
  }
}

// Chạy kiểm tra cache một lần khi khởi động
cleanCacheIfNeeded(true).catch(() => { });

function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: options.timeoutMs || 20000,
      family: 4, // Force IPv4
    };

    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          arrayBuffer: () => Promise.resolve(Buffer.concat(chunks)),
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request timeout after ${reqOptions.timeout}ms`));
    });

    req.on("error", reject);

    if (body) req.write(body);
    req.end();
  });
}

const inFlightTTS = new Map(); // hash -> Promise

/**
 * Lấy audio buffer từ Cache hoặc gọi Google TTS nếu chưa có.
 */
async function getOrGenerateAudioBuffer(text) {
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new Error("Nội dung text không hợp lệ");
  }

  const normalizedText = text.trim();
  const voiceName = env.VOICE_NAME;
  const speakingRate = env.SPEAKING_RATE || 1.0;

  // Hash bao gồm nội dung, tên giọng và tốc độ để tự động làm mới khi đổi cấu hình
  const hash = crypto
    .createHash("md5")
    .update(`${normalizedText}_${voiceName}_${speakingRate}`)
    .digest("hex");
  const filePath = path.join(cacheDir, `${hash}.mp3`);

  // Tránh dồn nhiều request đồng thời cho cùng một nội dung (In-flight Mutex)
  if (inFlightTTS.has(hash)) {
    return await inFlightTTS.get(hash);
  }

  const generatePromise = (async () => {
    // 1. Kiểm tra cache trên đĩa bất đồng bộ (không chặn event loop)
    try {
      const cachedBuffer = await fs.promises.readFile(filePath);
      return {
        audioBuffer: cachedBuffer,
        hash,
        fromCache: true,
        source: "Disk-Cache",
        filePath,
      };
    } catch (e) {
      // File chưa tồn tại, tiếp tục tạo mới
    }

    let audioBuffer = null;
    let source = "Google-Translate-Free";
    const googleApiKey = process.env.GOOGLE_TTS_API_KEY;

    // 2. Thử Official Google Cloud TTS nếu có API key
    if (googleApiKey) {
      try {
        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleApiKey}`;
        const payload = JSON.stringify({
          input: { text: normalizedText },
          voice: { languageCode: "vi-VN", name: voiceName },
          audioConfig: { audioEncoding: "MP3", speakingRate: speakingRate },
        });

        const response = await httpsRequest(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            },
            timeoutMs: 20000,
          },
          payload,
        );

        if (response.ok) {
          const responseData = JSON.parse(
            (await response.arrayBuffer()).toString("utf-8"),
          );
          if (responseData.audioContent) {
            audioBuffer = Buffer.from(responseData.audioContent, "base64");
            source = `Google-Cloud (${voiceName})`;
          } else {
            console.warn(
              "Google Cloud TTS trả về OK nhưng không có audioContent. Đang thử fallback...",
            );
          }
        } else {
          const errorMsg = (await response.arrayBuffer()).toString("utf-8");
          console.warn(
            `Google Cloud TTS thất bại (${response.status}): ${errorMsg}. Đang thử fallback...`,
          );
        }
      } catch (googleError) {
        console.warn(
          "Google Cloud TTS request lỗi:",
          googleError.message,
          "- Đang thử fallback...",
        );
      }
    }

    // 3. Fallback sang Google Translate TTS (miễn phí)
    if (!audioBuffer) {
      const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(normalizedText)}`;
      const response = await httpsRequest(googleUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeoutMs: 15000,
      });

      if (!response.ok) {
        throw new Error(`Google Translate TTS trả về mã lỗi: ${response.status}`);
      }
      audioBuffer = await response.arrayBuffer();
      source = "Google-Translate (Free)";
    }

    // 4. Ghi file nguyên tử (Atomic write) qua file tạm để tránh đọc file dở dang
    if (audioBuffer) {
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      try {
        await fs.promises.writeFile(tempPath, audioBuffer);
        await fs.promises.rename(tempPath, filePath);
        cleanCacheIfNeeded().catch(() => { });
      } catch (writeErr) {
        console.error("Lỗi khi ghi TTS cache file:", writeErr);
        try {
          await fs.promises.unlink(tempPath);
        } catch (_) { }
      }
    }

    return { audioBuffer, hash, fromCache: false, source, filePath };
  })();

  inFlightTTS.set(hash, generatePromise);
  try {
    return await generatePromise;
  } finally {
    inFlightTTS.delete(hash);
  }
}

const streamSpeech = async (req, res) => {
  try {
    const text = req.query.text || req.query.q;
    if (!text) {
      return res.status(400).send("Thiếu tham số 'text'");
    }

    const { audioBuffer, hash, source } = await getOrGenerateAudioBuffer(text);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${hash}"`,
      "X-TTS-Source": source,
    });

    res.end(audioBuffer);
  } catch (error) {
    console.error("Lỗi stream TTS:", error);
    res.status(500).send("Lỗi TTS: " + error.message);
  }
};

/**
 * Endpoint POST /api/tts
 * Hỗ trợ tương thích ngược (trả về JSON kèm audioUrl và audioContent)
 */
const generateSpeech = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Thiếu trường 'text' trong body" });
    }

    const { audioBuffer, hash, source } = await getOrGenerateAudioBuffer(text);

    res.json({
      hash,
      source,
      audioUrl: `/audio/cache/${hash}.mp3`,
      audioContent: audioBuffer.toString("base64"),
    });
  } catch (error) {
    console.error("Lỗi tạo TTS:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  streamSpeech,
  generateSpeech,
  getOrGenerateAudioBuffer,
  cleanCacheIfNeeded,
};
