const roomModel = require('../models/room.model');

const getRooms = async () => {
    return roomModel.findAll();
};

module.exports = {
    getRooms,
};
