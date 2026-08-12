const dashboardService = require('../services/dashboardService');
const psdangkyService = require('../services/psdangkyService');
const cdhaService = require('../services/cdhaService');

const getDashboard = async (req, res) => {
    try {
        const stats = await dashboardService.fetchDashboardStats();
        res.render('index', { data: stats });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading dashboard: ' + (error.message || String(error)));
    }
};

const getRoom = async (req, res) => {
    try {
        const room = await psdangkyService.LayDanhSachBenhNhanChoCuaPhong(req.params.id);
        res.render('room', { room: room });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading room details: ' + (error.message || String(error)));
    }
};

const getCdhaDashboard = async (req, res) => {
    try {
        const stats = await cdhaService.LayDanhSachCacPhongCDHA();
        res.render('cdha_index', { data: stats });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading CDHA dashboard: ' + (error.message || String(error)));
    }
};

const getCdhaRoom = async (req, res) => {
    try {
        const room = await cdhaService.LayDanhSachBenhNhanChoCDHA(req.params.tenphong);
        res.render('cdha', { room: room });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading CDHA room details: ' + (error.message || String(error)));
    }
};

module.exports = {
    getDashboard,
    getRoom,
    getCdhaDashboard,
    getCdhaRoom
};
