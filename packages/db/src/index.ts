export * from "./schema/index.js";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://projecterp:projecterp@127.0.0.1:15432/projecterp";

const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
export { client as sql };
