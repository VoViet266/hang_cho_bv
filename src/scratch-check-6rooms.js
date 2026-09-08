const cs = require('./src/services/cdhaService');
const prisma = require('./src/config/db');

async function test() {
  const result = await cs.LayDanhSachCacPhongCDHA();
  console.log('TOTAL ROOMS COUNT:', result.rooms.length);
  console.log('ROOMS:', result.rooms.map(r => r.tenphong));
}

test().catch(console.error).finally(() => prisma.$disconnect());
