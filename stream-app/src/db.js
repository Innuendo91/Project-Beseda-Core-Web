import pg from "pg";

export const pool = new pg.Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000,
  maxLifetimeMillis: 600000,
});

pool.on("error", (err, client) => {
  console.error("[db] unexpected error on idle client:", err.message);
});
