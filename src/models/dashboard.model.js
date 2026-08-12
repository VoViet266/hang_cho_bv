const prisma = require('../config/db');
//getDashboardData
const LayTongHopDashboard = async () => {
    const rows = await prisma.$queryRaw`
        SELECT 
            p.maphong, 
            p.tenphong,
            COALESCE(dk_counts.count_dk, 0)::int AS "tong_dangky",
            (COALESCE(dk_counts.count_dk, 0) + COALESCE(kb_counts.transfer_in, 0))::int AS "tong_chuyen_sang",
            COALESCE(kb_counts.waiting, 0)::int AS "tong_cho_kham"
        FROM "current".dmphong p
        LEFT JOIN (
            SELECT maphong, COUNT(DISTINCT makb) as count_dk
            FROM "current".psdangky
            WHERE ngaydk >= current_date AND ngaydk < current_date + interval '1 day'
              AND (xoa IS NULL OR xoa = 0)
            GROUP BY maphong
        ) dk_counts ON p.maphong = dk_counts.maphong
        LEFT JOIN (
            SELECT 
                COALESCE(kb.maphong, dk.maphong) AS effective_maphong,
                COUNT(CASE WHEN dk.maphong != COALESCE(kb.maphong, dk.maphong) THEN 1 END) AS transfer_in,
                COUNT(CASE WHEN (kb.dakham IS NULL OR kb.dakham = 0) 
                    AND NOT (
                        EXTRACT(HOUR FROM COALESCE(kb.ngaykcb, dk.ngaydk)) < EXTRACT(HOUR FROM CURRENT_TIMESTAMP) - 2
                    ) THEN 1 END) AS waiting
            FROM "current".psdangky dk
            INNER JOIN "current".khambenh kb ON dk.makb = kb.makb
            WHERE dk.ngaydk >= current_date AND dk.ngaydk < current_date + interval '1 day'
              AND (kb.xoa IS NULL OR kb.xoa = 0)
              AND (dk.xoa IS NULL OR dk.xoa = 0)
            GROUP BY COALESCE(kb.maphong, dk.maphong)
        ) kb_counts ON p.maphong = kb_counts.effective_maphong
        WHERE (p.xoa IS NULL OR p.xoa = 0)
          AND p.khoakb = 1
          AND (p.madv IS NULL OR p.madv = '10')
          AND p.maphong NOT IN ('CLS', 'SL', 'A12')
        ORDER BY p.maphong ASC
    `;
    return rows;
};


const LayDanhSachPhong = async () => {
    return await prisma.$queryRaw`
        SELECT p.maphong, p.tenphong
        FROM "current".dmphong p
        WHERE (p.xoa IS NULL OR p.xoa = 0)
          AND p.khoakb = 1
          AND (p.madv IS NULL OR p.madv = '10')
          AND p.maphong NOT IN ('CLS', 'SL')
        ORDER BY p.maphong ASC
    `;
};

module.exports = {
    // LaySoLuongBenhNhanDangKy,
    LayDanhSachPhong,
    LayTongHopDashboard,
};
