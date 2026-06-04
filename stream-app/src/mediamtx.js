export async function listPaths() {
  const host = process.env.MEDIAMTX_API_HOST || "127.0.0.1";
  const port = process.env.MEDIAMTX_API_PORT || "9997";
  const url = `http://${host}:${port}/v3/paths/list`;

  const u = process.env.MEDIAMTX_API_USER || "";
  const p = process.env.MEDIAMTX_API_PASS || "";
  const b64 = Buffer.from(`${u}:${p}`, "utf8").toString("base64");

  const headers = {
    "Accept": "application/json",
    "Authorization": `Basic ${b64}`,
  };

  const res = await fetch(url, { headers });

  if (!res.ok) {
    try {
      const data = await res.json();
      console.error("[mediamtx] API error:", res.status, JSON.stringify(data));
    } catch {}
    return { ok: false, paths: [] };
  }

  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const paths = items.map(x => x?.name).filter(Boolean);

  return { ok: true, paths };
}
