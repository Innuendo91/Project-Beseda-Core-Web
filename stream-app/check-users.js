import { pool } from "./src/db.js";
try {
  const { rows } = await pool.query("SELECT id, username, display_name FROM users ORDER BY id");
  console.log("Users count:", rows.length);
  for (const r of rows) console.log(`  ${r.id}: ${r.username} (${r.display_name})`);
} catch (e) {
  console.error("DB Error:", e.message);
}
process.exit(0);
