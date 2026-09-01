const json = (data) => Response.json(data, {
  headers: { "cache-control": "no-store" }
});

export async function onRequestGet({ request }) {
  const response = await fetch(new URL("/catalog.json", request.url));
  if (!response.ok) return json({ error: "catalog unavailable" });
  return new Response(await response.text(), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
