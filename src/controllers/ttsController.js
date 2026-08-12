const https = require('node:https');

/**
 * Dùng Node.js https module thay vì fetch/undici.
 * undici (built-in fetch Node 20) có DNS resolver riêng, bỏ qua
 * dns.setDefaultResultOrder() và không hỗ trợ family:4 option,
 * dẫn đến timeout trong Docker. Node https module dùng dns.lookup()
 * và hỗ trợ family:4 nên hoạt động ổn định.
 */
function httpsRequest(url, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const reqOptions = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.timeoutMs || 20000,
            family: 4, // Force IPv4
        };

        const req = https.request(reqOptions, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    arrayBuffer: () => Promise.resolve(Buffer.concat(chunks)),
                });
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error(`Request timeout after ${reqOptions.timeout}ms`));
        });

        req.on('error', reject);

        if (body) req.write(body);
        req.end();
    });
}

const generateSpeech = async (req, res) => {
    try {
        const { text } = req.body;
        const apiKey = process.env.AZURE_TTS_API_KEY;
        const region = process.env.AZURE_TTS_REGION || 'southeastasia';

        let audioBuffer = null;

        // Try Azure TTS first if API key is provided
        if (apiKey && region) {
            try {
                const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
                const ssml = `
                    <speak version='1.0' xml:lang='vi-VN'>
                        <voice xml:lang='vi-VN' xml:gender='Female' name='vi-VN-HoaiMyNeural'>
                            <!-- Điều chỉnh tốc độ tại rate. Ví dụ: +10% (nhanh hơn), -10% (chậm hơn), -20%, v.v. -->
                            <prosody rate="+20%">
                                ${text}
                            </prosody>
                        </voice>
                    </speak>
                `;

                const response = await httpsRequest(url, {
                    method: 'POST',
                    headers: {
                        'Ocp-Apim-Subscription-Key': apiKey,
                        'Content-Type': 'application/ssml+xml',
                        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
                        'User-Agent': 'DanhSachChoApp',
                        'Content-Length': Buffer.byteLength(ssml),
                    },
                    timeoutMs: 20000,
                }, ssml);

                if (response.ok) {
                    audioBuffer = await response.arrayBuffer();
                } else {
                    console.warn(`Azure TTS failed with status: ${response.status}. Falling back to Google TTS...`);
                }
            } catch (azureError) {
                console.warn('Azure TTS request failed:', azureError.message, '- Falling back to Google TTS...');
            }
        } else {
            console.log('Azure TTS API key or region not provided. Using Google TTS...');
        }

        // Fallback to Google Translate TTS
        if (!audioBuffer) {
            const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
            const response = await httpsRequest(googleUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeoutMs: 15000,
            });

            if (!response.ok) {
                throw new Error(`Google TTS Error: ${response.status}`);
            }
            audioBuffer = await response.arrayBuffer();
        }

        const base64Audio = Buffer.from(audioBuffer).toString('base64');
        res.json({ audioContent: base64Audio });
    } catch (error) {
        console.error('TTS Error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    generateSpeech
};
