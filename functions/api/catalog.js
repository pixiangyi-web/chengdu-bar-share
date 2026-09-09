const json = (data) => Response.json(data, {
  headers: { "cache-control": "no-store" }
});

export async function onRequestGet({ request, env }) {
  const response = await fetch(new URL("/catalog.json", request.url));
  if (!response.ok) return json({ error: "catalog unavailable" });
  const data = await response.json();
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS catalog_overrides (bar_name TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
    const { results } = await env.DB.prepare("SELECT bar_name,data FROM catalog_overrides").all();
    const overrides = new Map(results.map((row) => [row.bar_name, JSON.parse(row.data)]));
    data.bars = data.bars.map((bar) => ({ ...bar, ...(overrides.get(bar.name) || {}) }));
  } catch (error) {
    console.warn("[catalog overrides] unavailable", error);
  }
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}
