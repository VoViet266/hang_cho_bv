const express = require('express');

const errorMiddleware = require('./middlewares/error.middleware');
const logger = require('./config/logger');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const time = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(4); // Đổi ra mili-giây
        logger.info(`HTTP ${req.method} ${req.url} responded ${res.statusCode} in ${time} ms`);
    });
    next();
});

const path = require('path');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, '../public')));

// API for TTS (Microsoft Azure with Google TTS Fallback)
app.post('/api/tts', async (req, res) => {
    try {
        const { text } = req.body;
        const apiKey = process.env.AZURE_TTS_API_KEY;
        const region = process.env.AZURE_TTS_REGION || 'southeastasia'; // Default region
        
        let audioBuffer = null;

        // Try Azure TTS first if API key is provided
        if (apiKey) {
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

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Ocp-Apim-Subscription-Key': apiKey,
                        'Content-Type': 'application/ssml+xml',
                        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
                        'User-Agent': 'DanhSachChoApp'
                    },
                    body: ssml
                });
                
                if (response.ok) {
                    audioBuffer = await response.arrayBuffer();
                } else {
                    console.warn(`Azure TTS failed with status: ${response.status}. Falling back to Google TTS...`);
                }
            } catch (azureError) {
                console.warn('Azure TTS request failed:', azureError.message, '- Falling back to Google TTS...');
            }
        }

        // Fallback to Google Translate TTS
        if (!audioBuffer) {
            const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
            const response = await fetch(googleUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
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
});


// View Routes
const dashboardService = require('./services/dashboardService');
const psdangkyService = require('./services/psdangkyService');
const cdhaService = require('./services/cdhaService');

app.get('/', async (req, res) => {
    try {
        const stats = await dashboardService.fetchDashboardStats();
        res.render('index', { data: stats });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading dashboard: ' + (error.message || String(error)));
    }
});

app.get('/room/:id', async (req, res) => {
    try {
        const room = await psdangkyService.LayDanhSachBenhNhanChoCuaPhong(req.params.id);
       
        res.render('room', { room: room });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading room details: ' + (error.message || String(error)));
    }
});

app.get('/cdha', async (req, res) => {
    try {
        const stats = await cdhaService.LayDanhSachCacPhongCDHA();
        res.render('cdha_index', { data: stats });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading CDHA dashboard: ' + (error.message || String(error)));
    }
});

app.get('/cdha/room/:tenphong', async (req, res) => {
    try {
        const room = await cdhaService.LayDanhSachBenhNhanChoCDHA(req.params.tenphong);
       
        res.render('cdha', { room: room });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading CDHA room details: ' + (error.message || String(error)));
    }
});

app.use(errorMiddleware);

module.exports = app;
