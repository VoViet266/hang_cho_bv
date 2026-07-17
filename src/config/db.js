const { PrismaClient } = require('@prisma/client');
const env = require('./env');

const prismaClientSingleton = () => {
    return new PrismaClient({
        datasources: {
            db: {
                url: env.DATABASE_URL,
            },
        },
    });
};

const prisma = global.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
    global.prismaGlobal = prisma;
}

module.exports = prisma;
