const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // try different queries
    const q1 = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT makb)::int as count 
        FROM "current".psdangky dk
        INNER JOIN "current".dmphong p ON dk.maphong = p.maphong
        WHERE dk.ngaydk::date = current_date
          AND (dk.xoa IS NULL OR dk.xoa = 0)
          AND (p.xoa IS NULL OR p.xoa = 0)
          AND p.khoakb = 1
          AND (p.madv IS NULL OR p.madv = '10')
          AND p.maphong NOT IN ('CLS', 'SL')
    `;

    const q2 = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT makb)::int as count 
        FROM "current".psdangky dk
        WHERE dk.ngaydk::date = current_date
          AND (dk.xoa IS NULL OR dk.xoa = 0)
    `;

    const q3 = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count 
        FROM "current".psdangky dk
        WHERE dk.ngaydk::date = current_date
    `;

    // Try timezone specific string comparison
    const todayStr = new Date().toLocaleDateString('en-CA'); // '2026-07-16'
    
    console.log("q1 (with room filters):", q1);
    console.log("q2 (without room filters):", q2);
    console.log("q3 (all):", q3);
}

main().catch(console.error).finally(() => prisma.$disconnect());
