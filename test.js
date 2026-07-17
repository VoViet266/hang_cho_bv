const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const query3 = await prisma.$queryRaw`
      SELECT maphong, COUNT(*) as dk_plus, SUM(CASE WHEN dakham = 0 THEN 1 ELSE 0 END) as cho
      FROM (
        SELECT DISTINCT ON (kb.maphong, kb.makb)
            p.maphong, 
            kb.makb,
            COALESCE(kb.dakham, 0) as dakham
        FROM "current".khambenh kb
        INNER JOIN "current".psdangky dk ON kb.makb = dk.makb
        INNER JOIN "current".dmphong p ON kb.maphong = p.maphong
        WHERE dk.ngaydk >= ${startOfToday} AND dk.ngaydk <= ${endOfToday}
          AND COALESCE(kb.xoa, 0) = 0
          AND COALESCE(dk.xoa, 0) = 0
          AND COALESCE(p.xoa, 0) = 0
          AND COALESCE(p.khoakb, 0) = 1
        ORDER BY kb.maphong ASC, kb.makb ASC, kb.dakham DESC
      ) t
      GROUP BY maphong
    `;
    console.log('Query 3 without madv:', query3.filter(r => r.maphong === 'B18' || r.maphong === 'B17'));
  } catch(e) {
    console.log('error', e);
  }
}

main().finally(() => prisma.$disconnect());
