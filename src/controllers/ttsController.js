const https = require("node:https");

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

const generateSpeech = async (req, res) => {
  try {
    const { text } = req.body;

    const googleApiKey = process.env.GOOGLE_TTS_API_KEY;

    let audioBuffer = null;
    let base64Audio = null;

    // 1. Try Official Google Cloud TTS if API key is provided
    if (googleApiKey) {
      try {
        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleApiKey}`;
        const payload = JSON.stringify({
          input: { text: text },
          voice: { languageCode: "vi-VN", name: "vi-VN-Standard-A" }, // Can change to Wavenet or Standard
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.1 }, // Tốc độ nói +10%
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
            base64Audio = responseData.audioContent; // Already base64 encoded by Google
          } else {
            console.warn(
              "Google Cloud TTS returned OK but no audioContent. Falling back...",
            );
          }
        } else {
          const errorMsg = (await response.arrayBuffer()).toString("utf-8");
          console.warn(
            `Google Cloud TTS failed with status: ${response.status}. Error: ${errorMsg}. Falling back...`,
          );
        }
      } catch (googleError) {
        console.warn(
          "Google Cloud TTS request failed:",
          googleError.message,
          "- Falling back...",
        );
      }
    }

    // 2. Fallback to Google Translate TTS (Free version)
    if (!base64Audio) {
      console.log("Using fallback free Google Translate TTS...");
      const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
      const response = await httpsRequest(googleUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeoutMs: 15000,
      });

      if (!response.ok) {
        throw new Error(`Fallback Google TTS Error: ${response.status}`);
      }
      audioBuffer = await response.arrayBuffer();
      base64Audio = Buffer.from(audioBuffer).toString("base64");
    }

    res.json({ audioContent: base64Audio });
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  generateSpeech,
};
