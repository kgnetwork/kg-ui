import { apiFetch } from "./api.js";

export function renderAgentHome() {
  const root = document.createElement("section");
  root.innerHTML = `
    <div class="view__header">
      <div class="view__title">Agent 面板</div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn" id="reload">刷新</button>
      </div>
    </div>
    <div class="view__body">
      <div class="panel">
        <div class="panel__hd">/api/dump</div>
        <div class="panel__bd">
          <div class="muted" id="meta">点击刷新尝试从 /api/dump 拉取数据。</div>
          <div class="panel panel--scroll" style="margin-top:10px;">
            <div class="panel__hd">响应</div>
            <div class="panel__bd"><pre class="codeblock mono" id="resp"></pre></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const meta = root.querySelector("#meta");
  const respEl = root.querySelector("#resp");

  async function load() {
    meta.textContent = "请求中...";
    respEl.textContent = "";
    const { ok, status, payload } = await apiFetch("/api/dump", { method: "GET", timeoutMs: 60_000 });
    meta.textContent = ok ? `HTTP ${status}` : `请求失败：HTTP ${status}`;
    respEl.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  }

  root.querySelector("#reload").addEventListener("click", load);
  // 首次进入页面自动触发一次加载，避免手动点击
  setTimeout(load, 0);
  return root;
}
