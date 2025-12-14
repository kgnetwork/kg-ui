const DEFAULT_API_BASE = "http://127.0.0.1:5000";

export function getApiBase() {
  const v = (localStorage.getItem("KG_API_BASE") || "").trim();
  return v || DEFAULT_API_BASE;
}

export function setApiBase(v) {
  localStorage.setItem("KG_API_BASE", (v || "").trim());
}

export function resetApiBase() {
  localStorage.removeItem("KG_API_BASE");
}

function joinUrl(base, path) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export async function apiFetch(path, { method = "GET", headers = {}, body, timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(joinUrl(getApiBase(), path), {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const contentType = resp.headers.get("Content-Type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await resp.json().catch(() => null) : await resp.text().catch(() => "");
    return { ok: resp.ok, status: resp.status, headers: resp.headers, payload };
  } finally {
    clearTimeout(timer);
  }
}

export function downloadUrl(path) {
  return joinUrl(getApiBase(), path);
}

