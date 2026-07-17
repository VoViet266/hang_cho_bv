const roomService = require('../services/roomService');

const listRooms = async (req, res) => {
    try {
        const rooms = await roomService.getRooms();
        
        // Ensure BigInts are correctly serialized to JSON if returned by raw query
        const serializeBigInt = (obj) => {
            return JSON.parse(
                JSON.stringify(obj, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value
                )
            );
        };
        
        res.json(serializeBigInt(rooms));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not fetch rooms' });
    }
};

module.exports = {
    listRooms,
};
