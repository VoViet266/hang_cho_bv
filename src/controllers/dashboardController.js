const dashboardService = require('../services/dashboardService');
const { serializeForJson } = require('../utils/response');

const getStats = async (req, res) => {
    try {
        const stats = await dashboardService.getDashboardStats();
        res.json(serializeForJson(stats));
    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ error: 'Could not fetch dashboard stats' });
    }
};

module.exports = {
    getStats,
};
