const prisma = require('../config/db');

const getWaitingListByRoom = async () => {
    const rows = await prisma.$queryRaw`
        SELECT
            p.maphong,
            p.tenphong,
            json_agg(
                json_build_object(
                    'makb', dk.makb,
                    'ngaydk', dk.ngaydk,
                    'dmbenhnhan', CASE WHEN bn.mabn IS NOT NULL THEN
                        json_build_object(
                            'mabn', bn.mabn,
                            'holot', bn.holot,
                            'ten', bn.ten,
                            'ngaysinh', bn.ngaysinh,
                            'gioitinh', bn.gioitinh
                        )
                    ELSE NULL END
                ) ORDER BY dk.ngaydk ASC
            ) AS psdangky
        FROM "current".dmphong p
        INNER JOIN "current".psdangky dk ON p.maphong = dk.maphong
        LEFT JOIN "current".dmbenhnhan bn ON dk.mabn = bn.mabn
        WHERE dk.ngaydk >= CURRENT_DATE
          AND dk.ngaydk < CURRENT_DATE + INTERVAL '1 day'
          AND (p.tenphong NOT ILIKE '%CLS%' OR p.tenphong IS NULL)
          AND (p.xoa IS NULL OR p.xoa = 0)
          AND p.maphong NOT IN ('CLS', 'SL')
        GROUP BY p.maphong, p.tenphong
    `;

    return rows;
};

const getWaitingListByRoomId = async (maphong) => {
    const rows = await prisma.$queryRaw`
        SELECT
            p.maphong,
            p.tenphong,
            json_agg(
                json_build_object(
                    'makb', dk.makb,
                    'ngaydk', dk.ngaydk,
                    'dmbenhnhan', CASE WHEN bn.mabn IS NOT NULL THEN
                        json_build_object(
                            'mabn', bn.mabn,
                            'holot', bn.holot,
                            'ten', bn.ten,
                            'ngaysinh', bn.ngaysinh,
                            'gioitinh', bn.gioitinh
                        )
                    ELSE NULL END
                ) ORDER BY dk.ngaydk ASC
            ) AS psdangky
        FROM "current".dmphong p
        INNER JOIN "current".psdangky dk ON p.maphong = dk.maphong
        LEFT JOIN "current".dmbenhnhan bn ON dk.mabn = bn.mabn
        WHERE dk.ngaydk >= CURRENT_DATE
          AND dk.ngaydk < CURRENT_DATE + INTERVAL '1 day'
          AND p.maphong = ${maphong}
          AND (p.xoa IS NULL OR p.xoa = 0)
          AND p.maphong NOT IN ('CLS', 'SL')
        GROUP BY p.maphong, p.tenphong
    `;

    return rows;
};

module.exports = {
    getWaitingListByRoom,
    getWaitingListByRoomId,
};
