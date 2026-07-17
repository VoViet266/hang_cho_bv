const express = require('express');
const roomController = require('../controllers/roomController');

const router = express.Router();

router.get('/', roomController.listRooms);

module.exports = router;
