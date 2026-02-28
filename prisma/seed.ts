import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL || "";
const prisma = url.startsWith("prisma+postgres://")
  ? new PrismaClient({ accelerateUrl: url })
  : (() => {
      const pool = new Pool({ connectionString: url });
      const adapter = new PrismaPg(pool);
      return new PrismaClient({ adapter });
    })();

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";

  const existing = await prisma.adminUser.findUnique({
    where: { username },
  });

  if (existing) {
    console.log(`Admin user "${username}" already exists, skipping seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
    },
  });

  console.log(`Admin user "${username}" created successfully.`);

  // Ensure AppSettings row exists
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, refreshIntervalMin: 360 },
  });

  console.log("App settings initialized.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
