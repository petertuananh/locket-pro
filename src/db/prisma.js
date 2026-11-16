const { PrismaClient } = require('@prisma/client');

let prisma;

try {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });
} catch (error) {
  console.error('Lỗi khởi tạo Prisma Client:', error);
}

module.exports = prisma;
