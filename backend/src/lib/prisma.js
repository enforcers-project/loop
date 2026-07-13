// Shared PrismaClient — a single connection pool for the whole process.
// Import this instead of calling `new PrismaClient()` per-module (which would
// open a fresh pool each time). Reused across `node --watch` reloads via a
// global cache so dev restarts don't leak connections.
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis

export const prisma = globalForPrisma.__loopPrisma ?? new PrismaClient()

if (!globalForPrisma.__loopPrisma) {
  globalForPrisma.__loopPrisma = prisma
}

export default prisma
