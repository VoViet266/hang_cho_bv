const prisma = require('../config/db');

const LayDanhSachHangChoCDHA = async (tenphong) => {
    const rows = await prisma.$queryRaw`
        SELECT 
            cdha.mabn, 
            cdha.makb, 
            cdha.maba, 
            cdha.ngaynhap, 
            cdha.ngaykq, 
            cdha.uutien, 
            cdha.maloai, 
            cdha.tenphong, 
            cdha.xoa, 
            cdha.phongchidinh, 
            cdha.ghichu,
            bn.holot,
            bn.ten,
            bn.ngaysinh,
            bn.gioitinh
        FROM "current".hangchocdha_tmd cdha
        LEFT JOIN "current".dmbenhnhan bn ON cdha.mabn = bn.mabn
        WHERE (cdha.xoa = 0 OR cdha.xoa IS NULL)
          AND cdha.tenphong = ${tenphong}
        ORDER BY 
            CASE 
                WHEN cdha.uutien IN ('1', '2', '3', '4', '5', '6') THEN CAST(cdha.uutien AS INTEGER)
                ELSE 999 
            END ASC, 
            cdha.ngaynhap ASC
    `;
    return rows;
};

const LayDanhSachPhongCDHA = async () => {
    const rows = await prisma.$queryRaw`
        SELECT 
            tenphong,
            COUNT(mabn)::int AS tong_cho_kham
        FROM "current".hangchocdha_tmd
        WHERE (xoa = 0 OR xoa IS NULL)
        GROUP BY tenphong
        ORDER BY tenphong ASC
    `;
    return rows;
};

module.exports = {
    LayDanhSachHangChoCDHA,
    LayDanhSachPhongCDHA
};
