const express = require('express');
const router = express.Router();
const viewController = require('../controllers/viewController');

router.get('/', viewController.getDashboard);
router.get('/multi', viewController.getMultiRoomView);
router.get('/split', viewController.getMultiRoomView);
router.get('/room/:id', viewController.getRoom);
router.get('/cdha', viewController.getCdhaDashboard);
router.get('/cdha/room/:tenphong', viewController.getCdhaRoom);

module.exports = router;
