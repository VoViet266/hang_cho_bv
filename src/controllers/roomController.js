const roomService = require('../services/roomService');
const { serializeForJson } = require('../utils/response');

const listRooms = async (req, res) => {
    try {
        const rooms = await roomService.getRooms();
        res.json(serializeForJson(rooms));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not fetch rooms' });
    }
};

module.exports = {
    listRooms,
};
