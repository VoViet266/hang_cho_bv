const express = require('express');
const psdangkyController = require('../controllers/psdangkyController');

const router = express.Router();

router.get('/', psdangkyController.listPsdangkys);
router.get('/:maphong', psdangkyController.listPsdangkysByRoomId);

module.exports = router;
