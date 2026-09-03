import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Simple shared-secret gate. Set LEDGER_TOKEN in Netlify site environment
// variables (Site configuration > Environment variables). If it's not set,
// the endpoint is open to anyone who can reach the URL — set it before
// putting real data in.
function checkAuth(req: Request): boolean {
  const required = Netlify.env.get("LEDGER_TOKEN");
  if (!required) return true; // no token configured — open access
  const provided = req.headers.get("x-ledger-token") || "";
  return provided === required;
}

export default async (req: Request, context: Context) => {
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const store = getStore("effort-ledger");
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const list = url.searchParams.get("list");
      if (list) {
        const prefix = url.searchParams.get("prefix") || "";
        const { blobs } = await store.list({ prefix });
        return json({ keys: blobs.map((b) => b.key) });
      }

      const key = url.searchParams.get("key");
      if (!key) return json({ error: "key required" }, 400);
      const value = await store.get(key, { type: "text" });
      if (value === null) return json({ error: "not found" }, 404);
      return json({ key, value });
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const { key, value } = body || {};
      if (!key) return json({ error: "key required" }, 400);
      await store.set(key, value ?? "");
      return json({ key, value });
    }

    if (req.method === "DELETE") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "key required" }, 400);
      await store.delete(key);
      return json({ key, deleted: true });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: "storage error", detail: String(err) }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config: Config = {
  path: "/api/storage",
};
