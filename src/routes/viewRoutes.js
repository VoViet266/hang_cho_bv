const express = require('express');
const router = express.Router();
const viewController = require('../controllers/viewController');

router.get('/', viewController.getDashboard);
router.get('/multi', viewController.getMultiRoomView);
router.get('/room', viewController.getRoom);
router.get('/room/:id', viewController.getRoom);
router.get('/cdha', viewController.getCdhaRoom);
router.get('/cdha/dashboard', viewController.getCdhaDashboard);
router.get('/cdha/room', viewController.getCdhaRoom);
router.get('/cdha/room/:tenphong', viewController.getCdhaRoom);
router.get('/cdha/:tenphong', viewController.getCdhaRoom);

// Short URL route: /1, /2, /1,2,3,4, /b1, v.v.
router.get('/:roomParam', viewController.handleShortUrl);

module.exports = router;

