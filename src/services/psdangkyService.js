const psdangkyModel = require('../models/psdangky.model');

const getPsdangkys = async () => {
    const data = await psdangkyModel.getWaitingListByRoom();
    console.log(`[psdangkyService] Dữ liệu getPsdangkys:`, JSON.stringify(data, null, 2));
    return data;
};

const getPsdangkysByRoomId = async (maphong) => {
    const data = await psdangkyModel.getWaitingListByRoomId(maphong);
    console.log(`[psdangkyService] Dữ liệu trả về cho phòng ${maphong}:`, JSON.stringify(data, null, 2));
    return data;
};

module.exports = {
    getPsdangkys,
    getPsdangkysByRoomId,
};
