const express = require("express");
const router = express.Router();
const ttsController = require("../controllers/ttsController");
const cdhaController = require("../controllers/cdhaController");

router.get("/tts", ttsController.streamSpeech);
router.post("/tts", ttsController.generateSpeech);

// CDHA Database-backed hide / restore APIs
router.post("/cdha/patient/hide", cdhaController.hidePatient);
router.post("/cdha/patient/restore", cdhaController.restorePatient);
router.post("/cdha/patient/restore-all", cdhaController.restoreAllPatients);
router.get("/cdha/hidden", cdhaController.getHiddenPatients);

module.exports = router;
