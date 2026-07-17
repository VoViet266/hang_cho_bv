const express = require('express');
const roomRoutes = require('./roomRoutes');
const psdangkyRoutes = require('./psdangkyRoutes');
const dashboardRoutes = require('./dashboardRoutes');

const router = express.Router();

router.use('/rooms', roomRoutes);
router.use('/psdangky', psdangkyRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
