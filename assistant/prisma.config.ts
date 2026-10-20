import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // `prisma generate` (postinstall) needs no database, so a fresh clone
    // without DATABASE_URL must still install. db push / seed fail with a
    // connection error instead.
    url: process.env.DATABASE_URL ?? "postgresql://unset:unset@localhost:5432/unset",
  },
});
