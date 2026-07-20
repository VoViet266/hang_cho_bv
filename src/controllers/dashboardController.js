const dashboardService = require('../services/dashboardService');

const getStats = async (req, res) => {
    try {
        const stats = await dashboardService.getDashboardStats();

        // Serialize BigInt and other objects correctly
        const serializeData = (obj) => {
            return JSON.parse(
                JSON.stringify(obj, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value
                )
            );
        };

        res.json(serializeData(stats));
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ error: 'Could not fetch dashboard stats' });
    }
};

module.exports = {
    getStats,
};
