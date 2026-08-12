const express = require('express');
const router = express.Router();
const ttsController = require('../controllers/ttsController');

// TTS Endpoint
router.post('/tts', ttsController.generateSpeech);

module.exports = router;
