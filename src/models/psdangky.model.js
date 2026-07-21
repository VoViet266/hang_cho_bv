const prisma = require('../config/db');

const getWaitingListByRoom = async () => {
    // Sử dụng $queryRaw thay cho Prisma ORM để tối ưu tốc độ, tương tự dashboard.model.js
    // Lọc dk.ngaydk theo khoảng thời gian để tận dụng Index
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
                ) ORDER BY CASE WHEN bn.ngaysinh <= current_date - interval '75 years' THEN 0 ELSE 1 END ASC, dk.ngaydk ASC
            ) as psdangky
        FROM "current".dmphong p
        INNER JOIN "current".psdangky dk ON p.maphong = dk.maphong
        LEFT JOIN "current".dmbenhnhan bn ON dk.mabn = bn.mabn
        WHERE dk.ngaydk >= current_date AND dk.ngaydk < current_date + interval '1 day'
          AND (p.tenphong NOT ILIKE '%CLS%' OR p.tenphong IS NULL)
          AND NOW() <= GREATEST(dk.ngaydk, current_date + interval '7 hours') + interval '45 minutes'
        GROUP BY p.maphong, p.tenphong
    `;
    console.log(rows)
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
                ) ORDER BY CASE WHEN bn.ngaysinh <= current_date - interval '75 years' THEN 0 ELSE 1 END ASC, dk.ngaydk ASC
            ) as psdangky
        FROM "current".dmphong p
        INNER JOIN "current".psdangky dk ON p.maphong = dk.maphong
        LEFT JOIN "current".dmbenhnhan bn ON dk.mabn = bn.mabn
        WHERE dk.ngaydk >= current_date AND dk.ngaydk < current_date + interval '1 day'
          AND p.maphong = ${maphong}
          AND p.maphong NOT IN ('CLS', 'SL')
          AND NOW() <= GREATEST(dk.ngaydk, current_date + interval '7 hours') + interval '45 minutes'
        GROUP BY p.maphong, p.tenphong
    `;
   
    return rows;
};

module.exports = {
    getWaitingListByRoom,
    getWaitingListByRoomId
};