const prisma = require('../config/db');

const  LayDanhSachBenhNhanChoTheoPhongId = async (maphong) => {
    const rows = await prisma.$queryRaw`
        SELECT 
            COALESCE(kb.maphong, dk.maphong) AS maphong, 
            MAX(p.tenphong) AS tenphong, 
            json_agg(
                json_build_object(
                    'makb', dk.makb,
                    'ngaydk', COALESCE(kb.ngaykcb, dk.ngaydk),
                    'dmbenhnhan', CASE WHEN bn.mabn IS NOT NULL THEN
                        json_build_object(
                            'mabn', bn.mabn,
                            'holot', bn.holot,
                            'ten', bn.ten,
                            'ngaysinh', bn.ngaysinh,
                            'gioitinh', bn.gioitinh
                        )
                    ELSE NULL END
                ) ORDER BY CASE WHEN bn.ngaysinh <= current_date - interval '75 years' THEN 0 ELSE 1 END ASC, COALESCE(kb.ngaykcb, dk.ngaydk) ASC
            ) as psdangky
        FROM "current".psdangky dk
        INNER JOIN "current".khambenh kb ON dk.makb = kb.makb
        INNER JOIN "current".dmphong p ON p.maphong = COALESCE(kb.maphong, dk.maphong)
        LEFT JOIN "current".dmbenhnhan bn ON dk.mabn = bn.mabn
        WHERE dk.ngaydk >= current_date AND dk.ngaydk < current_date + interval '1 day'
          AND COALESCE(kb.maphong, dk.maphong) = ${maphong}
          AND p.maphong NOT IN ('CLS', 'SL')
          AND (kb.xoa IS NULL OR kb.xoa = 0)
          AND (dk.xoa IS NULL OR dk.xoa = 0)
          AND (kb.dakham IS NULL OR kb.dakham = 0)
          AND NOT (
              EXTRACT(HOUR FROM COALESCE(kb.ngaykcb, dk.ngaydk)) < EXTRACT(HOUR FROM CURRENT_TIMESTAMP) - 2
          )
        GROUP BY COALESCE(kb.maphong, dk.maphong)
    `;
    return rows;
};

const LayThongKeCuaPhong = async (maphong) => {
    const rows = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT dk.makb)::int AS total_dk_plus
        FROM "current".psdangky dk
        LEFT JOIN "current".khambenh kb ON dk.makb = kb.makb AND (kb.xoa IS NULL OR kb.xoa = 0)
        WHERE dk.ngaydk >= current_date AND dk.ngaydk < current_date + interval '1 day'
          AND (dk.xoa IS NULL OR dk.xoa = 0)
          AND (
              dk.maphong = ${maphong} 
              OR 
              (kb.maphong = ${maphong} AND dk.maphong != ${maphong})
          )
    `;
    return rows[0]?.total_dk_plus || 0;
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
    LayThongKeCuaPhong,
    LayThongTinPhong
};
