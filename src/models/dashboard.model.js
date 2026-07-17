const prisma = require('../config/db');

const getDashboardData = async () => {
    // Sử dụng Raw SQL để Join các bảng lại một cách tối ưu
    // Mục tiêu: Lấy danh sách bệnh nhân khám tại từng phòng (kể cả chuyển phòng - ĐK+)
    const rows = await prisma.$queryRaw`
        SELECT DISTINCT ON (kb.maphong, kb.makb)
            p.maphong, 
            p.tenphong,
            kb.makb,
            dk.ngaydk,
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
        SELECT dk.maphong, COUNT(DISTINCT dk.makb)::int as count_dk 
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
