const generateSpeech = async (req, res) => {
    try {
        const { text } = req.body;
        const apiKey = process.env.AZURE_TTS_API_KEY;
        const region = process.env.AZURE_TTS_REGION || 'southeastasia'; // Default region
        
        let audioBuffer = null;

        // Try Azure TTS first if API key is provided
        if (apiKey & region) {
      
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

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Ocp-Apim-Subscription-Key': apiKey,
                        'Content-Type': 'application/ssml+xml',
                        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
                        'User-Agent': 'DanhSachChoApp'
                    },
                    body: ssml,
                    signal: AbortSignal.timeout(10000)
                });
                
                if (response.ok) {
                    audioBuffer = await response.arrayBuffer();
                } else {
                    console.warn(`Azure TTS failed with status: ${response.status}. Falling back to Google TTS...`);
                }
            
        }
        else {
            console.log('Azure TTS API key or region not provided. Using Google TTS...');
        }

        // Fallback to Google Translate TTS
        if (!audioBuffer) {
            const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
            const response = await fetch(googleUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
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
