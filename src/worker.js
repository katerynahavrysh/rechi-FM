// Сервер обліку речей Феміністичної майстерні.
// Статичні файли з ./public віддає Cloudflare, а запити на /api/* обробляє цей код.
// Кожен запит до API перевіряється токеном Cloudflare Access: без входу нічого не можна ні прочитати, ні змінити.

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 64 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const auth = await checkAccess(request, env);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    try {
      await ensureSchema(env);
      if (url.pathname === "/api/items" && request.method === "GET") return listItems(env, auth.email);
      const m = url.pathname.match(/^\/api\/items\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!ID_RE.test(id)) return json({ error: "bad_id" }, 400);
        if (request.method === "PUT") return saveItem(request, env, id, auth.email);
        if (request.method === "DELETE") return deleteItem(env, id);
      }
      return json({ error: "not_found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "server_error" }, 500);
    }
  },
};

// Створюємо таблицю сами при першому запиті, щоб не запускати SQL вручну
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated TEXT NOT NULL)"
  ).run();
  schemaReady = true;
}

async function listItems(env, email) {
  const { results } = await env.DB.prepare("SELECT id, data, version FROM items").all();
  const items = results.map((r) => Object.assign(JSON.parse(r.data), { id: r.id, _v: r.version }));
  return json({ items, me: email });
}

async function saveItem(request, env, id, email) {
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "too_large" }, 400);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: "bad_json" }, 400); }
  const item = body && body.item;
  const version = Number(body && body.version) || 0;
  if (!item || typeof item !== "object" || Array.isArray(item)) return json({ error: "bad_item" }, 400);
  if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 160) return json({ error: "bad_name" }, 400);

  delete item.id; delete item._v;
  // Підписуємо нові записи історії поштою людини, яка увійшла
  if (Array.isArray(item.history)) {
    item.history = item.history.slice(0, 50).map((h) => (h && h.by === "__me__" ? { ...h, by: email || null } : h));
  }
  item.updated = new Date().toISOString();
  const data = JSON.stringify(item);

  let res;
  if (version === 0) {
    res = await env.DB.prepare(
      "INSERT INTO items (id, data, version, updated) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO NOTHING"
    ).bind(id, data, item.updated).run();
  } else {
    res = await env.DB.prepare(
      "UPDATE items SET data = ?, version = version + 1, updated = ? WHERE id = ? AND version = ?"
    ).bind(data, item.updated, id, version).run();
  }
  // Нічого не змінилося: хтось інший уже встиг оновити цю річ
  if (!res.meta || res.meta.changes !== 1) return json({ error: "conflict" }, 409);
  return json({ item, version: version + 1 });
}

async function deleteItem(env, id) {
  await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ---------- Перевірка токена Cloudflare Access (RS256) ----------
let jwksCache = { at: 0, keys: [] };

async function checkAccess(request, env) {
  const team = (env.TEAM_DOMAIN || "").replace(/\/+$/, "");
  const aud = env.POLICY_AUD || "";
  if (!team || !aud || aud.startsWith("ВСТАВТЕ")) return { ok: true, email: null };
  
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return { ok: false, status: 401, error: "no_token" };

  try {
    const [h64, p64, s64] = token.split(".");
    const header = JSON.parse(b64urlText(h64));
    const payload = JSON.parse(b64urlText(p64));
    if (header.alg !== "RS256") throw new Error("alg");

    const key = await getKey(team, header.kid);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, b64urlBytes(s64), new TextEncoder().encode(`${h64}.${p64}`)
    );
    if (!valid) throw new Error("signature");

    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) throw new Error("aud");
    if (payload.iss !== team) throw new Error("iss");
    if (typeof payload.exp !== "number" || payload.exp < now) throw new Error("exp");
    if (typeof payload.nbf === "number" && payload.nbf > now + 60) throw new Error("nbf");

    return { ok: true, email: payload.email || null };
  } catch (e) {
    return { ok: false, status: 403, error: "bad_token" };
  }
}

async function getKey(team, kid) {
  const fresh = Date.now() - jwksCache.at < 60 * 60 * 1000;
  let jwk = fresh && jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) {
    const res = await fetch(`${team}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error("certs");
    const body = await res.json();
    jwksCache = { at: Date.now(), keys: body.keys || [] };
    jwk = jwksCache.keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error("kid");
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

function b64urlBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlText(s) {
  return new TextDecoder().decode(b64urlBytes(s));
}
