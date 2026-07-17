const psdangkyModel = require('../models/psdangky.model');

const getPsdangkys = async () => {
    return psdangkyModel.getWaitingListByRoom();
};

const getPsdangkysByRoomId = async (maphong) => {
    return psdangkyModel.getWaitingListByRoomId(maphong);
};

module.exports = {
    getPsdangkys,
    getPsdangkysByRoomId,
};
