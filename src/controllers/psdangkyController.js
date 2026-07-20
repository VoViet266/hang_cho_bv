const psdangkyService = require('../services/psdangkyService');
const { serializeForJson } = require('../utils/response');
const { normalizeRoomId } = require('../utils/roomValidation');

const listPsdangkys = async (req, res) => {
    try {
        const data = await psdangkyService.getPsdangkys();
        res.json(serializeForJson(data));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not fetch psdangky list' });
    }
};

const listPsdangkysByRoomId = async (req, res) => {
    try {
        const { maphong } = req.params;
        const normalizedRoomId = normalizeRoomId(maphong);
        const data = await psdangkyService.getPsdangkysByRoomId(normalizedRoomId);
        res.json(serializeForJson(data));
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: 'Invalid room id' });
    }
};

module.exports = {
    listPsdangkys,
    listPsdangkysByRoomId,
};
