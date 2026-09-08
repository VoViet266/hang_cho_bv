const { Prisma } = require('@prisma/client');
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
        AND cdha.ngaykq IS NULL 
        AND cdha.ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
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
        WITH all_cdha_rooms AS (
            SELECT DISTINCT tenphong 
            FROM "current".hangchocdha_tmd 
            WHERE tenphong IS NOT NULL AND TRIM(tenphong) != ''
            UNION
            SELECT 'Phòng Siêu âm 1' AS tenphong
            UNION
            SELECT 'Phòng Siêu âm 2' AS tenphong
            UNION
            SELECT 'Phòng Siêu âm 3' AS tenphong
            UNION
            SELECT 'Phòng Siêu âm 4' AS tenphong
            UNION
            SELECT 'Phòng Siêu âm 5' AS tenphong
            UNION
            SELECT 'Phòng Siêu âm 6' AS tenphong
        )
        SELECT 
            r.tenphong,
            COALESCE(COUNT(cdha.mabn), 0)::int AS tong_cho_kham
        FROM all_cdha_rooms r
        LEFT JOIN "current".hangchocdha_tmd cdha
            ON cdha.tenphong = r.tenphong
            AND (cdha.xoa = 0 OR cdha.xoa IS NULL)
            AND cdha.ngaykq IS NULL
            AND cdha.ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
        GROUP BY r.tenphong
        ORDER BY r.tenphong ASC
    `;
    return rows;
};

const AnBenhNhanCDHA = async (makb, mabn, tenphong) => {
    const cleanMakb = (makb || '').trim();
    const cleanMabn = (mabn || '').trim();
    const cleanTenphong = (tenphong || '').trim();

    if (!cleanTenphong) return 0;

    if (cleanMakb && cleanMabn) {
        return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET xoa = 1
            WHERE (makb = ${cleanMakb} OR mabn = ${cleanMabn})
              AND tenphong = ${cleanTenphong}
              AND (xoa = 0 OR xoa IS NULL)
        `;
    } else if (cleanMakb) {
        return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET xoa = 1
            WHERE makb = ${cleanMakb}
              AND tenphong = ${cleanTenphong}
              AND (xoa = 0 OR xoa IS NULL)
        `;
    } else if (cleanMabn) {
        return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET xoa = 1
            WHERE mabn = ${cleanMabn}
              AND tenphong = ${cleanTenphong}
              AND (xoa = 0 OR xoa IS NULL)
        `;
    }
    return 0;
};

const KhoiPhucBenhNhanCDHA = async (makb, mabn, tenphong) => {
    const cleanMakb = (makb || '').trim();
    const cleanMabn = (mabn || '').trim();
    const cleanTenphong = (tenphong || '').trim();

    if (!cleanTenphong) return 0;

    if (cleanMakb && cleanMabn) {
        return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET xoa = 0
            WHERE (makb = ${cleanMakb} OR mabn = ${cleanMabn})
              AND tenphong = ${cleanTenphong}
              AND xoa = 1
        `;
    } else if (cleanMakb) {
        return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET xoa = 0
            WHERE makb = ${cleanMakb}
              AND tenphong = ${cleanTenphong}
              AND xoa = 1
        `;
    } else if (cleanMabn) {
        return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET xoa = 0
            WHERE mabn = ${cleanMabn}
              AND tenphong = ${cleanTenphong}
              AND xoa = 1
        `;
    }
    return 0;
};

const KhoiPhucTatCaCDHA = async (tenphongList) => {
    let rooms = [];
    if (Array.isArray(tenphongList)) {
        rooms = tenphongList.map(r => String(r).trim()).filter(Boolean);
    } else if (typeof tenphongList === 'string' && tenphongList.trim()) {
        rooms = tenphongList.split(',').map(r => r.trim()).filter(Boolean);
    }

    if (rooms.length > 1) {
        return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET xoa = 0
            WHERE xoa = 1
              AND ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
              AND tenphong IN (${Prisma.join(rooms)})
        `;
    } else if (rooms.length === 1) {
        const room = rooms[0];
        return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET xoa = 0
            WHERE xoa = 1
              AND ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
              AND tenphong = ${room}
        `;
    }

    return await prisma.$executeRaw`
        UPDATE "current".hangchocdha_tmd
        SET xoa = 0
        WHERE xoa = 1
          AND ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
    `;
};

const LayDanhSachBenhNhanDaAnCDHA = async (tenphongList) => {
    let rooms = [];
    if (Array.isArray(tenphongList)) {
        rooms = tenphongList.map(r => String(r).trim()).filter(Boolean);
    } else if (typeof tenphongList === 'string' && tenphongList.trim()) {
        rooms = tenphongList.split(',').map(r => r.trim()).filter(Boolean);
    }

    if (rooms.length > 1) {
        return await prisma.$queryRaw`
            SELECT 
                cdha.mabn, 
                cdha.makb, 
                cdha.maba, 
                cdha.ngaynhap, 
                cdha.tenphong, 
                cdha.xoa, 
                bn.holot, 
                bn.ten, 
                bn.ngaysinh,
                bn.gioitinh
            FROM "current".hangchocdha_tmd cdha
            LEFT JOIN "current".dmbenhnhan bn ON cdha.mabn = bn.mabn
            WHERE cdha.xoa = 1
              AND cdha.ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
              AND cdha.tenphong IN (${Prisma.join(rooms)})
            ORDER BY cdha.ngaynhap DESC
        `;
    } else if (rooms.length === 1) {
        const room = rooms[0];
        return await prisma.$queryRaw`
            SELECT 
                cdha.mabn, 
                cdha.makb, 
                cdha.maba, 
                cdha.ngaynhap, 
                cdha.tenphong, 
                cdha.xoa, 
                bn.holot, 
                bn.ten, 
                bn.ngaysinh,
                bn.gioitinh
            FROM "current".hangchocdha_tmd cdha
            LEFT JOIN "current".dmbenhnhan bn ON cdha.mabn = bn.mabn
            WHERE cdha.xoa = 1
              AND cdha.ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
              AND cdha.tenphong = ${room}
            ORDER BY cdha.ngaynhap DESC
        `;
    }

    return await prisma.$queryRaw`
        SELECT 
            cdha.mabn, 
            cdha.makb, 
            cdha.maba, 
            cdha.ngaynhap, 
            cdha.tenphong, 
            cdha.xoa, 
            bn.holot, 
            bn.ten, 
            bn.ngaysinh,
            bn.gioitinh
        FROM "current".hangchocdha_tmd cdha
        LEFT JOIN "current".dmbenhnhan bn ON cdha.mabn = bn.mabn
        WHERE cdha.xoa = 1
          AND cdha.ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
        ORDER BY cdha.ngaynhap DESC
    `;
};

module.exports = {
    LayDanhSachHangChoCDHA,
    LayDanhSachPhongCDHA,
    AnBenhNhanCDHA,
    KhoiPhucBenhNhanCDHA,
    KhoiPhucTatCaCDHA,
    LayDanhSachBenhNhanDaAnCDHA
};
