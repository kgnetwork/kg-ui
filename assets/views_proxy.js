import { apiFetch, saveApiMeta, setApiBase } from "./api.js";

export function renderProxyHome() {
  const root = document.createElement("section");
  root.innerHTML = `
    <div class="view__header">
      <div class="view__title">Proxy 面板</div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn" id="reload">刷新</button>
      </div>
    </div>
    <div class="view__body">
      <div class="panel">
        <div class="panel__hd">服务列表</div>
        <div class="panel__bd">
          <div class="muted" id="metaSvc">加载中...</div>
          <div class="grid grid--2" id="svcList" style="margin-top:10px;"></div>
        </div>
      </div>

      <div class="panel" style="margin-top:16px;">
        <div class="panel__hd">缓存概览</div>
        <div class="panel__bd">
          <div class="muted" id="metaCache">加载中...</div>
          <div class="panel panel--scroll" style="margin-top:10px;">
            <div class="panel__hd">缓存条目</div>
            <div class="panel__bd">
              <table class="table" id="cacheTable">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>状态码</th>
                    <th>TTL(s)</th>
                    <th>大小(B)</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const metaSvc = root.querySelector("#metaSvc");
  const svcList = root.querySelector("#svcList");
  const metaCache = root.querySelector("#metaCache");
  const cacheTableBody = root.querySelector("#cacheTable tbody");

  function _updateBrandAndPill(baseUrl, roles = []) {
    const typeLabel = "III类智能体";
    let title = typeLabel;
    if (roles.includes("中心服务")) title = `${typeLabel}·中心服务`;
    else if (roles.includes("自治服务")) title = `${typeLabel}·自治服务`;
    else if (roles.includes("路由服务")) title = `${typeLabel}·路由服务`;
    else if (roles.includes("分片服务")) title = `${typeLabel}·分片服务`;

    const titleEl = document.querySelector(".brand__title");
    const subEl = document.querySelector(".brand__sub");
    const apiBaseEl = document.getElementById("apiBaseText");
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = "";
    if (apiBaseEl) apiBaseEl.textContent = baseUrl;
  }

  function quickSetNetworkEndpoint(baseUrl, roles = []) {
    // 视为 III 类智能体（中心/自治/分片节点），直接切到 network UI
    setApiBase(baseUrl);
    saveApiMeta({
      ui: "network",
      type: "III",
      endpointId: baseUrl,
      serviceId: baseUrl,
      base_url: baseUrl,
      roles: roles,
    });
    _updateBrandAndPill(baseUrl, roles);
    // 跳到 network 总览并触发路由
    window.location.hash = "#/portal";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  async function load() {
    metaSvc.textContent = "加载中...";
    metaCache.textContent = "加载中...";
    svcList.innerHTML = "";
    cacheTableBody.innerHTML = "";

    const [svcResp, cacheResp] = await Promise.all([
      apiFetch("/ui/api/services"),
      apiFetch("/ui/api/cache"),
    ]);

    if (svcResp.ok && svcResp.payload?.services) {
      const services = svcResp.payload.services;
      metaSvc.textContent = `共 ${services.length} 个服务`;
      services.forEach((s) => {
        const roles = (s.roles || []).join(" / ") || "-";
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <div class="card__title">${s.url}</div>
          <div class="card__desc">角色：${roles}</div>
        `;
        card.style.cursor = "pointer";
        card.addEventListener("click", () => quickSetNetworkEndpoint(s.url, s.roles || []));
        svcList.appendChild(card);
      });
      if (!services.length) {
        metaSvc.textContent = "暂无服务。";
      }
    } else {
      metaSvc.textContent = `服务加载失败：HTTP ${svcResp.status}`;
    }

    if (cacheResp.ok && cacheResp.payload) {
      const entries = cacheResp.payload.entries || [];
      metaCache.textContent = `默认超时 ${cacheResp.payload.cache_timeout}s，当前 ${entries.length} 条。`;
      entries.forEach((e) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="mono">${e.display_key || e.key}</td>
          <td>${e.status_code ?? "-"}</td>
          <td>${e.ttl !== undefined ? e.ttl.toFixed(1) : "-"}</td>
          <td>${e.payload_size ?? "-"}</td>
        `;
        cacheTableBody.appendChild(tr);
      });
      if (!entries.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="4" class="muted">暂无缓存数据。</td>`;
        cacheTableBody.appendChild(tr);
      }
    } else {
      metaCache.textContent = `缓存加载失败：HTTP ${cacheResp.status}`;
    }
  }

  root.querySelector("#reload").addEventListener("click", load);
  // 首次进入页面自动触发一次加载，避免用户再手动点击
  setTimeout(load, 0);
  return root;
}
