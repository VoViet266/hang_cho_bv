const psdangkyService = require('../services/psdangkyService');

const listPsdangkys = async (req, res) => {
    try {
        const data = await psdangkyService.getPsdangkys();
        
       
        const serializeData = (obj) => {
            return JSON.parse(
                JSON.stringify(obj, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value
                )
            );
        };
        
        res.json(serializeData(data));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not fetch psdangky list' });
    }
};

const listPsdangkysByRoomId = async (req, res) => {
    try {
        const { maphong } = req.params;
        const data = await psdangkyService.getPsdangkysByRoomId(maphong);
        
       
        const serializeData = (obj) => {
            return JSON.parse(
                JSON.stringify(obj, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value
                )
            );
        };
        
        res.json(serializeData(data));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not fetch psdangky list' });
    }
};

module.exports = {
    listPsdangkys,
    listPsdangkysByRoomId,
};
