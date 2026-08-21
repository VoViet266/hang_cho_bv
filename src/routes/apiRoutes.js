const express = require("express");
const router = express.Router();
const ttsController = require("../controllers/ttsController");

router.get("/tts", ttsController.streamSpeech);
router.post("/tts", ttsController.generateSpeech);

module.exports = router;
