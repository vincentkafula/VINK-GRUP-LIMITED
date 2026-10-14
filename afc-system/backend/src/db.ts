import { PrismaClient, Prisma } from "@prisma/client";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
export { Prisma };

export function createDb(url: string): Db {
  return new PrismaClient({ datasources: { db: { url } }, log: ["warn", "error"] });
}

/** Postgres error text -> a short code the API can map to a status. */
export const isUniqueViolation = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
