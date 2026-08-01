const prisma = require('../config/db');

const  LayDanhSachBenhNhanChoTheoPhongId = async (maphong) => {
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

const LayThongTinPhong = async (maphong) => {
    const rows = await prisma.$queryRaw`
        SELECT p.maphong, p.tenphong
        FROM "current".dmphong p
        WHERE p.maphong = ${maphong}
    `;
    return rows[0];
};

module.exports = {
    LayDanhSachBenhNhanChoTheoPhongId,
    LayThongTinPhong
};
