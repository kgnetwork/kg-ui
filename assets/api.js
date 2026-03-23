const DEFAULT_API_BASE = "http://127.0.0.1:5000";
const STORAGE_KEY_BASE = "KG_API_BASE";
const STORAGE_KEY_META = "KG_API_META"; // { ui, serviceId, endpointId?, agentId?, base_url }

export function getApiBase() {
  const v = (localStorage.getItem(STORAGE_KEY_BASE) || "").trim();
  return v || DEFAULT_API_BASE;
}

export function setApiBase(v) {
  localStorage.setItem(STORAGE_KEY_BASE, (v || "").trim());
}

export function resetApiBase() {
  localStorage.removeItem(STORAGE_KEY_BASE);
}

export function saveApiMeta(meta) {
  try {
    localStorage.setItem(STORAGE_KEY_META, JSON.stringify(meta || {}));
  } catch (_) {}
}

export function loadApiMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(STORAGE_KEY_META) || "{}");
    return m || {};
  } catch (_) {
    return {};
  }
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
    const url = joinUrl(getApiBase(), path);
    const resp = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const contentType = resp.headers.get("Content-Type") || "";
    const isJson = contentType.includes("application/json");
    
    if (isJson) {
      const text = await resp.text().catch(() => "");
      // 修复非法 JSON 值: Infinity, -Infinity, NaN
      const sanitized = text
        .replace(/:-Infinity\b/g, ':null')
        .replace(/:Infinity\b/g, ':null')
        .replace(/:NaN\b/g, ':null')
        .replace(/\[-Infinity\b/g, '[null')
        .replace(/\[Infinity\b/g, '[null')
        .replace(/,Infinity\b/g, ',null')
        .replace(/,-Infinity\b/g, ',null')
        .replace(/,NaN\b/g, ',null');
      try {
        const payload = JSON.parse(sanitized);
        return { ok: resp.ok, status: resp.status, headers: resp.headers, payload };
      } catch (parseErr) {
        // 提取错误位置附近的上下文
        const posMatch = parseErr.message.match(/position (\d+)/);
        const errorPos = posMatch ? parseInt(posMatch[1], 10) : 0;
        const contextStart = Math.max(0, errorPos - 50);
        const contextEnd = Math.min(sanitized.length, errorPos + 50);
        const context = sanitized.slice(contextStart, contextEnd);
        console.error(`[apiFetch] JSON 解析失败:`, parseErr.message);
        console.error(`[apiFetch] 错误位置 ${errorPos} 附近内容:`, context);
        return { ok: resp.ok, status: resp.status, headers: resp.headers, payload: null };
      }
    }
    
    // 即使 Content-Type 不是 application/json，也尝试解析 JSON
    const text = await resp.text().catch(() => "");
    try {
      const payload = JSON.parse(text);
      return { ok: resp.ok, status: resp.status, headers: resp.headers, payload };
    } catch (_) {
      return { ok: resp.ok, status: resp.status, headers: resp.headers, payload: text };
    }
  } finally {
    clearTimeout(timer);
  }
}

export function downloadUrl(path) {
  return joinUrl(getApiBase(), path);
}
