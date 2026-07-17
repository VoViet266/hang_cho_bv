const prisma = require('../config/db');

const findAll = async () => {
    return prisma.dmphong.findMany({
        select: {
            maphong: true,
            tenphong: true,
            succhua: true,
            sophong: true,
            loaphat: true,
            xoa: true,
            loaiphong: true,
            thannhantao: true,
            khoakb: true,
            mack: true,
            stt: true,
        },
    });
};

module.exports = {
    findAll,
};
