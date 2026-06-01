import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export const db = drizzle({
    connection: { url: process.env.DB_FILE_NAME ?? "file:storage/applier.db" },
    schema,
});

export type Db = typeof db;
