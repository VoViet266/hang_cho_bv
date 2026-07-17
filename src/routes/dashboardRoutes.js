const express = require('express');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

router.get('/', dashboardController.getStats);

module.exports = router;
