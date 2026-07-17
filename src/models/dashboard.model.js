const prisma = require('../config/db');

const getDashboardData = async () => {
    // Lấy bệnh nhân theo phòng hiện tại của khambenh để thống kê ĐK+, chờ và danh sách phòng.
    // Nếu bệnh nhân đã đổi phòng thì maphong trong khambenh sẽ phản ánh phòng mới ngay lập tức.
    const rows = await prisma.$queryRaw`
        SELECT
            COALESCE(kb.maphong, dk.maphong) AS effective_maphong,
            COALESCE(kb.maphong, dk.maphong) AS maphong,
            p.tenphong,
            kb.makb,
            dk.ngaydk,
            kb.ngaykcb,
            dk.maphong AS registered_maphong,
            bn.mabn,
            bn.holot,
            bn.ten,
            bn.ngaysinh,
            bn.gioitinh,
            COALESCE(kb.dakham, 0) as dakham
        FROM "current".psdangky dk
        INNER JOIN "current".khambenh kb ON dk.makb = kb.makb
        INNER JOIN "current".dmphong p ON kb.maphong = p.maphong
        LEFT JOIN "current".dmbenhnhan bn ON kb.mabn = bn.mabn AND (bn.xoa IS NULL OR bn.xoa = 0)
        WHERE dk.ngaydk >= current_date AND dk.ngaydk < current_date + interval '1 day'
          AND (kb.xoa IS NULL OR kb.xoa = 0)
          AND (dk.xoa IS NULL OR dk.xoa = 0)
          AND (p.xoa IS NULL OR p.xoa = 0)
          AND p.khoakb = 1
          AND (p.madv IS NULL OR p.madv = '10')
          AND p.maphong NOT IN ('CLS', 'SL')
        ORDER BY kb.maphong ASC, kb.makb ASC, kb.dakham DESC, dk.ngaydk ASC
    `;

    return rows;
};

const getInitialRegistrations = async () => {
    return await prisma.$queryRaw`
        SELECT dk.maphong, COUNT(DISTINCT dk.makb)::int AS count_dk
        FROM "current".psdangky dk
        INNER JOIN "current".dmphong p ON dk.maphong = p.maphong
        WHERE dk.ngaydk >= current_date AND dk.ngaydk < current_date + interval '1 day'
          AND (dk.xoa IS NULL OR dk.xoa = 0)
          AND (p.xoa IS NULL OR p.xoa = 0)
          AND p.khoakb = 1
          AND (p.madv IS NULL OR p.madv = '10')
          AND p.maphong NOT IN ('CLS', 'SL')
        GROUP BY dk.maphong
    `;
};

const getAllRooms = async () => {
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
    getDashboardData,
    getInitialRegistrations,
    getAllRooms,
};
