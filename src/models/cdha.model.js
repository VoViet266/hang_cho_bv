const { Prisma } = require("@prisma/client");
const prisma = require("../config/db");
const roomHelper = require("../utils/roomHelper");

const LayDanhSachHangChoCDHA = async (tenphong) => {
  const canonicalName = roomHelper.resolveCdhaRoomName(tenphong);
  const alias = roomHelper.resolveCdhaRoomAlias(canonicalName);

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
            cdha.an,
            cdha.phongchidinh, 
            cdha.ghichu,
            bn.holot,
            bn.ten,
            bn.ngaysinh,
            bn.gioitinh
        FROM "current".hangchocdha_tmd cdha
        LEFT JOIN "current".dmbenhnhan bn ON cdha.mabn = bn.mabn
        WHERE (cdha.xoa = 0 OR cdha.xoa IS NULL)
          AND (cdha.an = '0' OR cdha.an IS NULL)
          AND cdha.ngaykq IS NULL 
          AND cdha.ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '90 minutes'
          AND (cdha.tenphong = ${canonicalName} OR cdha.tenphong = ${alias})
        ORDER BY 
            cdha.ngaynhap ASC
    `;
  return rows;
};

const LayDanhSachPhongCDHA = async () => {
  const rows = await prisma.$queryRaw`
        WITH base_rooms AS (
            SELECT '1' AS id, 'Phòng Siêu âm 1' AS tenphong, '1' AS alias, 1 AS sort_order
            UNION ALL SELECT '2', 'Phòng Siêu âm 2', '2', 2
            UNION ALL SELECT '3', 'Phòng Siêu âm 3', '3', 3
            UNION ALL SELECT '4', 'Phòng Siêu âm 4', '4', 4
            UNION ALL SELECT '5', 'Phòng Siêu âm 5', '5', 5
            UNION ALL SELECT '6', 'Phòng Siêu âm 6', '6', 6
        )
        SELECT 
            r.tenphong,
            COALESCE(COUNT(cdha.mabn), 0)::int AS tong_cho_kham
        FROM base_rooms r
        LEFT JOIN "current".hangchocdha_tmd cdha
            ON (cdha.tenphong = r.tenphong OR cdha.tenphong = r.alias)
            AND (cdha.xoa = 0 OR cdha.xoa IS NULL)
            AND (cdha.an = '0' OR cdha.an IS NULL)
            AND cdha.ngaykq IS NULL
            AND cdha.ngaynhap >= CURRENT_TIMESTAMP - INTERVAL '90 minutes'
        GROUP BY r.tenphong, r.sort_order
        ORDER BY r.sort_order ASC
    `;
  return rows;
};

const AnBenhNhanCDHA = async (makb, mabn, tenphong) => {
  const cleanMakb = (makb || "").trim();
  const cleanMabn = (mabn || "").trim();
  const canonicalName = roomHelper.resolveCdhaRoomName(tenphong);
  const alias = roomHelper.resolveCdhaRoomAlias(canonicalName);

  if (!canonicalName) return 0;

  if (cleanMakb && cleanMabn) {
    return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET an = '1'
            WHERE (makb = ${cleanMakb} OR mabn = ${cleanMabn})
              AND (tenphong = ${canonicalName} OR tenphong = ${alias})
              AND (an = '0' OR an IS NULL)
              AND ngaynhap >= CURRENT_DATE AND ngaynhap < CURRENT_DATE + INTERVAL '1 day'
        `;
  } else if (cleanMakb) {
    return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET an = '1'
            WHERE makb = ${cleanMakb}
              AND (tenphong = ${canonicalName} OR tenphong = ${alias})
              AND (an = '0' OR an IS NULL)
              AND ngaynhap >= CURRENT_DATE AND ngaynhap < CURRENT_DATE + INTERVAL '1 day'
        `;
  } else if (cleanMabn) {
    return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET an = '1'
            WHERE mabn = ${cleanMabn}
              AND (tenphong = ${canonicalName} OR tenphong = ${alias})
              AND (an = '0' OR an IS NULL)
              AND ngaynhap >= CURRENT_DATE AND ngaynhap < CURRENT_DATE + INTERVAL '1 day'
        `;
  }
  return 0;
};

const KhoiPhucBenhNhanCDHA = async (makb, mabn, tenphong) => {
  const cleanMakb = (makb || "").trim();
  const cleanMabn = (mabn || "").trim();
  const canonicalName = roomHelper.resolveCdhaRoomName(tenphong);
  const alias = roomHelper.resolveCdhaRoomAlias(canonicalName);

  if (!canonicalName) return 0;

  if (cleanMakb && cleanMabn) {
    return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET an = '0'
            WHERE (makb = ${cleanMakb} OR mabn = ${cleanMabn})
              AND (tenphong = ${canonicalName} OR tenphong = ${alias})
              AND an = '1'
              AND ngaynhap >= CURRENT_DATE AND ngaynhap < CURRENT_DATE + INTERVAL '1 day'
        `;
  } else if (cleanMakb) {
    return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET an = '0'
            WHERE makb = ${cleanMakb}
              AND (tenphong = ${canonicalName} OR tenphong = ${alias})
              AND an = '1'
              AND ngaynhap >= CURRENT_DATE AND ngaynhap < CURRENT_DATE + INTERVAL '1 day'
        `;
  } else if (cleanMabn) {
    return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET an = '0'
            WHERE mabn = ${cleanMabn}
              AND (tenphong = ${canonicalName} OR tenphong = ${alias})
              AND an = '1'
              AND ngaynhap >= CURRENT_DATE AND ngaynhap < CURRENT_DATE + INTERVAL '1 day'
        `;
  }
  return 0;
};

const KhoiPhucTatCaCDHA = async (tenphongList) => {
  let rooms = [];
  if (Array.isArray(tenphongList)) {
    rooms = tenphongList.map((r) => String(r).trim()).filter(Boolean);
  } else if (typeof tenphongList === "string" && tenphongList.trim()) {
    rooms = tenphongList
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }

  const expandedRooms = [];
  for (const r of rooms) {
    const cName = roomHelper.resolveCdhaRoomName(r);
    const alias = roomHelper.resolveCdhaRoomAlias(cName);
    if (cName) expandedRooms.push(cName);
    if (alias && alias !== cName) expandedRooms.push(alias);
  }
  rooms = Array.from(new Set(expandedRooms));

  if (rooms.length > 1) {
    return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET an = '0'
            WHERE an = '1'
              AND ngaynhap >= CURRENT_DATE AND ngaynhap < CURRENT_DATE + INTERVAL '1 day'
              AND tenphong IN (${Prisma.join(rooms)})
        `;
  } else if (rooms.length === 1) {
    const room = rooms[0];
    return await prisma.$executeRaw`
            UPDATE "current".hangchocdha_tmd
            SET an = '0'
            WHERE an = '1'
              AND ngaynhap >= CURRENT_DATE AND ngaynhap < CURRENT_DATE + INTERVAL '1 day'
              AND tenphong = ${room}
        `;
  }

  return await prisma.$executeRaw`
        UPDATE "current".hangchocdha_tmd
        SET an = '0'
        WHERE an = '1'
          AND ngaynhap >= CURRENT_DATE AND ngaynhap < CURRENT_DATE + INTERVAL '1 day'
    `;
};

const LayDanhSachBenhNhanDaAnCDHA = async (tenphongList) => {
  let rooms = [];
  if (Array.isArray(tenphongList)) {
    rooms = tenphongList.map((r) => String(r).trim()).filter(Boolean);
  } else if (typeof tenphongList === "string" && tenphongList.trim()) {
    rooms = tenphongList
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }

  const expandedRooms = [];
  for (const r of rooms) {
    const cName = roomHelper.resolveCdhaRoomName(r);
    const alias = roomHelper.resolveCdhaRoomAlias(cName);
    if (cName) expandedRooms.push(cName);
    if (alias && alias !== cName) expandedRooms.push(alias);
  }
  rooms = Array.from(new Set(expandedRooms));

  if (rooms.length > 1) {
    return await prisma.$queryRaw`
            SELECT 
                cdha.mabn, 
                cdha.makb, 
                cdha.maba, 
                cdha.ngaynhap, 
                cdha.tenphong, 
                cdha.xoa, 
                cdha.an,
                bn.holot, 
                bn.ten, 
                bn.ngaysinh,
                bn.gioitinh
            FROM "current".hangchocdha_tmd cdha
            LEFT JOIN "current".dmbenhnhan bn ON cdha.mabn = bn.mabn
            WHERE cdha.an = '1'
              AND (cdha.xoa = 0 OR cdha.xoa IS NULL)
              AND cdha.ngaynhap >= CURRENT_DATE AND cdha.ngaynhap < CURRENT_DATE + INTERVAL '1 day'
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
                cdha.an,
                bn.holot, 
                bn.ten, 
                bn.ngaysinh,
                bn.gioitinh
            FROM "current".hangchocdha_tmd cdha
            LEFT JOIN "current".dmbenhnhan bn ON cdha.mabn = bn.mabn
            WHERE cdha.an = '1'
              AND (cdha.xoa = 0 OR cdha.xoa IS NULL)
              AND cdha.ngaynhap >= CURRENT_DATE AND cdha.ngaynhap < CURRENT_DATE + INTERVAL '1 day'
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
            cdha.an,
            bn.holot, 
            bn.ten, 
            bn.ngaysinh,
            bn.gioitinh
        FROM "current".hangchocdha_tmd cdha
        LEFT JOIN "current".dmbenhnhan bn ON cdha.mabn = bn.mabn
        WHERE cdha.an = '1'
          AND (cdha.xoa = 0 OR cdha.xoa IS NULL)
          AND cdha.ngaynhap >= CURRENT_DATE AND cdha.ngaynhap < CURRENT_DATE + INTERVAL '1 day'
        ORDER BY cdha.ngaynhap DESC
    `;
};

module.exports = {
  LayDanhSachHangChoCDHA,
  LayDanhSachPhongCDHA,
  AnBenhNhanCDHA,
  KhoiPhucBenhNhanCDHA,
  KhoiPhucTatCaCDHA,
  LayDanhSachBenhNhanDaAnCDHA,
};
