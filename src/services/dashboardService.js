const dashboardModel = require('../models/dashboard.model');

const fetchDashboardStats = async () => {
    const rooms = await dashboardModel.LayTongHopDashboard();

    return {
        overview: {
            tong_dangky: rooms.reduce((sum, r) => sum + Number(r.tong_dangky || 0), 0),
            tong_chuyen_sang: rooms.reduce((sum, r) => sum + Number(r.tong_chuyen_sang || 0), 0),
            tong_cho_kham: rooms.reduce((sum, r) => sum + Number(r.tong_cho_kham || 0), 0),
        },
        rooms: rooms
    };
};

module.exports = {
    fetchDashboardStats,
};
