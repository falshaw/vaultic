import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth-core";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = (process.env.VAULTIC_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.VAULTIC_ADMIN_PASSWORD ?? "change-me";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("admin already exists:", email);
    return;
  }
  await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), role: "admin" },
  });
  console.log("admin created:", email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
