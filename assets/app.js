import { getApiBase, resetApiBase, setApiBase, saveApiMeta, loadApiMeta } from "./api.js";
import { loadConfig, normalizeServices, parseConfig } from "./config.js";
import {
  renderAgents,
  renderGraph,
  renderImport,
  renderPortal,
  renderRefresh,
  renderSearch,
  renderUiHome,
  renderUiZntDetail,
  renderUiZntList,
} from "./views.js";
import { renderProxyHome } from "./views_proxy.js";
import { renderAgentHome } from "./views_agent.js";

const viewRoot = document.getElementById("viewRoot");
const apiBaseText = document.getElementById("apiBaseText");
const brandTitle = document.querySelector(".brand__title");
const brandSub = document.querySelector(".brand__sub");

const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const serviceTypeSelect = document.getElementById("serviceTypeSelect");
const endpointSelect = document.getElementById("endpointSelect");
const addAgentBtn = document.getElementById("addAgentBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const resetSettingsBtn = document.getElementById("resetSettingsBtn");
const navContainer = document.querySelector(".nav");

const TYPE_OPTIONS = [
  { value: "III", label: "III类智能体" },
  { value: "II", label: "II类智能体" },
  { value: "I", label: "I类智能体" },
];
const DYN_AGENT_KEY = "KG_AGENT_DYNAMIC_LIST";

let services = [];
let defaults = {};
let endpointsMap = { III: [], II: [], I: [] };
let currentMeta = loadApiMeta() || {};
let pendingType = null;
let pendingEndpoint = null;

function setModalOpen(open) {
  settingsModal.setAttribute("aria-hidden", open ? "false" : "true");
  if (!open) {
    try {
      document.activeElement?.blur();
    } catch (_) {}
  }
}

function refreshApiBaseUi() {
  apiBaseText.textContent = getApiBase();
}

function updateBrand(roles = [], ui = "network", type = "III") {
  const rolesNorm = (roles || []).map((r) => (r || "").trim()).filter(Boolean);
  const typeLabel =
    type === "III" ? "III类智能体" : type === "II" ? "II类智能体" : type === "I" ? "I类智能体" : "内域运行系统监控大屏";

  let title = typeLabel;
  if (rolesNorm.includes("中心服务")) title = `${typeLabel}·中心服务`;
  else if (rolesNorm.includes("自治服务")) title = `${typeLabel}·自治服务`;
  else if (rolesNorm.includes("路由服务")) title = `${typeLabel}·路由服务`;
  else if (rolesNorm.includes("分片服务")) title = `${typeLabel}·分片服务`;

  if (brandTitle) brandTitle.textContent = title;
  if (brandSub) brandSub.textContent = "";
}

function loadDynamicAgents() {
  try {
    const arr = JSON.parse(localStorage.getItem(DYN_AGENT_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function saveDynamicAgents(list) {
  try {
    localStorage.setItem(DYN_AGENT_KEY, JSON.stringify(list || []));
  } catch (_) {}
}

function buildEndpoints() {
  endpointsMap = { III: [], II: [], I: [] };
  const dynAgents = loadDynamicAgents();

  services.forEach((s) => {
    const label = s.label || "";
    let typ = null;
    if (label.includes("III")) typ = "III";
    else if (label.includes("II")) typ = "II";
    else if (label.includes("I")) typ = "I";

    if (s.ui === "agent" || typ === "I") {
      (s.agents || []).forEach((a, idx) => {
        endpointsMap.I.push({
          id: a.id || `${s.id || "agent"}_ag_${idx}`,
          base_url: a.base_url,
          ui: "agent",
          roles: a.roles || [],
          serviceId: s.id || "",
        });
      });
      return;
    }

    const endpoints = s.endpoints || [];
    endpoints.forEach((ep, idx) => {
      const t = typ || (ep.ui === "proxy" ? "II" : "III");
      endpointsMap[t].push({
        id: ep.id || `${s.id || "svc"}_ep_${idx}`,
        base_url: ep.base_url,
        ui: ep.ui || s.ui || "network",
        roles: ep.roles || [],
        serviceId: s.id || "",
      });
    });
  });

  dynAgents.forEach((a, idx) => {
    endpointsMap.I.push({
      id: a.id || `dyn_agent_${idx}`,
      base_url: a.base_url,
      ui: "agent",
      roles: a.roles || ["动态输入"],
      serviceId: "agent_dynamic",
    });
  });
}

function renderTypeOptions() {
  serviceTypeSelect.innerHTML = "";
  TYPE_OPTIONS.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.value;
    opt.textContent = t.label;
    serviceTypeSelect.appendChild(opt);
  });
}

function renderEndpointOptions(type) {
  endpointSelect.innerHTML = "";
  const list = endpointsMap[type] || [];
  list.forEach((ep) => {
    const opt = document.createElement("option");
    opt.value = ep.id;
    const roles = (ep.roles || []).filter((r) => r && r.trim());
    if (type === "I") {
      // I 类：id 优先，其次 base_url
      opt.textContent = ep.id ? `${ep.id} · ${ep.base_url}` : `${ep.base_url}`;
    } else {
      // II/III：id 优先，其次 base_url + 可选 roles
      const rolesStr = roles.length ? ` · ${roles.join("/")}` : "";
      opt.textContent = ep.serviceId ? `${ep.serviceId} · ${ep.base_url}${rolesStr}` : `${ep.base_url}${rolesStr}`;
    }
    endpointSelect.appendChild(opt);
  });
}

function applyEndpoint(type, endpointId) {
  const list = endpointsMap[type] || [];
  const ep = list.find((e) => e.id === endpointId) || list[0];
  if (!ep) return;
  setApiBase(ep.base_url);
  saveApiMeta({ ui: ep.ui, type, endpointId: ep.id, serviceId: ep.serviceId, base_url: ep.base_url });
  refreshApiBaseUi();
  updateBrand(ep.roles, ep.ui, type);
  // 跳转到对应 UI
  if (ep.ui === "proxy") {
    window.location.hash = "#/proxy";
  } else if (ep.ui === "agent") {
    window.location.hash = "#/agent";
  } else if (window.location.hash === "#/proxy" || window.location.hash === "#/agent") {
    window.location.hash = "#/portal";
  }
}

function handleTypeChange() {
  const type = serviceTypeSelect.value;
  pendingType = type;
  renderEndpointOptions(type);
  const list = endpointsMap[type] || [];
  const defaultId = pendingEndpoint && list.find((e) => e.id === pendingEndpoint)?.id ? pendingEndpoint : list[0]?.id;
  if (defaultId) {
    endpointSelect.value = defaultId;
    pendingEndpoint = defaultId;
  }
  addAgentBtn.style.display = type === "I" ? "inline-block" : "none";
}

function handleEndpointChange() {
  pendingType = serviceTypeSelect.value;
  pendingEndpoint = endpointSelect.value;
}

function handleAddAgent() {
  const id = prompt("请输入 I 类智能体 ID（必填）", "");
  if (!id || !id.trim()) return;
  const url = prompt("请输入 I 类智能体 base_url (如 http://x.x.x.x:8888)", "http://");
  if (!url || !url.trim()) return;
  const trimmed = url.trim();
  const trimmedId = id.trim();
  const dyn = loadDynamicAgents();
  dyn.push({ id: trimmedId, base_url: trimmed });
  saveDynamicAgents(dyn);
  buildEndpoints();
  renderEndpointOptions("I");
  serviceTypeSelect.value = "I";
  pendingType = "I";
  pendingEndpoint = trimmedId;
  endpointSelect.value = trimmedId;
  addAgentBtn.style.display = "inline-block";
}

function setActiveNav(hash) {
  document.querySelectorAll(".nav__item").forEach((a) => a.classList.remove("is-active"));
  const a = document.querySelector(`.nav__item[href="${hash}"]`);
  if (a) a.classList.add("is-active");
}

function mount(node) {
  viewRoot.innerHTML = "";
  viewRoot.appendChild(node);
}

function rebuildNav(uiType) {
  if (!navContainer) return;
  navContainer.innerHTML = "";
  const items = [];
  if (uiType === "proxy") {
    items.push({ href: "#/proxy", label: "路由服务" });
  } else if (uiType === "agent") {
    items.push({ href: "#/agent", label: "I类智能体" });
  } else {
    items.push({ href: "#/portal", label: "总览" });
    items.push({ href: "#/graph", label: "图谱视图" });
    items.push({ href: "#/search", label: "检索" });
    items.push({ href: "#/import", label: "导入" });
    items.push({ href: "#/refresh", label: "刷新/状态" });
    items.push({ href: "#/agents", label: "智能体状态" });
    items.push({ href: "#/ui", label: "UI" });
  }
  items.forEach((it) => {
    const a = document.createElement("a");
    a.className = "nav__item";
    a.href = it.href;
    a.textContent = it.label;
    navContainer.appendChild(a);
  });
}

function route() {
  const current = loadApiMeta();
  const uiType = current?.ui || "network";
  rebuildNav(uiType);
  const notSupported = (title) => {
    const div = document.createElement("section");
    div.innerHTML = `
      <div class="view__header"><div class="view__title">${title}</div></div>
      <div class="view__body"><div class="panel"><div class="panel__hd">当前后端不支持</div><div class="panel__bd"><div class="muted">当前选择的后端类型为 ${uiType}，此页面仅适用于 network。</div></div></div></div>
    `;
    return div;
  };
  const hash = window.location.hash || "#/portal";
  const [, rawPath] = hash.split("#");
  const full = (rawPath || "/portal").replace(/^\/+/, "");
  const [p, qs] = full.split("?", 2);
  const query = new URLSearchParams(qs || "");

  setActiveNav(`#/${p}`);

  if (p === "graph") return mount(uiType === "network" ? renderGraph() : notSupported("图谱视图"));
  if (p === "search") return mount(uiType === "network" ? renderSearch() : notSupported("检索"));
  if (p === "import") return mount(uiType === "network" ? renderImport() : notSupported("导入"));
  if (p === "refresh") return mount(uiType === "network" ? renderRefresh() : notSupported("刷新/状态"));
  if (p === "agents") return mount(uiType === "network" ? renderAgents() : notSupported("智能体状态"));
  if (p === "proxy") return mount(renderProxyHome());
  if (p === "agent") return mount(renderAgentHome());
  if (p === "ui") return mount(renderUiHome());
  if (p === "ui/znt_list") return mount(renderUiZntList(Object.fromEntries(query.entries())));
  if (p.startsWith("ui/znt_detail/")) {
    const parts = p.split("/");
    const zntType = parts[2] || "";
    const zntName = parts.slice(3).join("/") || "";
    return mount(renderUiZntDetail({ zntType, zntName }));
  }
  return mount(renderPortal());
}

async function init() {
  try {
    const raw = await loadConfig();
    const parsed = parseConfig(raw);
    services = normalizeServices(parsed.services);
    defaults = parsed.defaults || {};
    buildEndpoints();
    renderTypeOptions();

    const defaultType = currentMeta.type || "III";
    serviceTypeSelect.value = defaultType;
    pendingType = defaultType;
    renderEndpointOptions(defaultType);
    const list = endpointsMap[defaultType] || [];
    const defaultId = currentMeta.endpointId && list.find((e) => e.id === currentMeta.endpointId) ? currentMeta.endpointId : list[0]?.id;
    if (defaultId) {
      endpointSelect.value = defaultId;
      pendingEndpoint = defaultId;
    }
    // 应用一次默认/记忆的选择
    if (pendingType && pendingEndpoint) {
      applyEndpoint(pendingType, pendingEndpoint);
    }
  } catch (err) {
    console.error("config load error", err);
  }

  refreshApiBaseUi();
  rebuildNav(currentMeta.ui || "network");
  window.addEventListener("hashchange", route);
  route();
}

openSettingsBtn.addEventListener("click", () => {
  refreshApiBaseUi();
  setModalOpen(true);
});
settingsModal.addEventListener("click", (e) => {
  if (e.target?.dataset?.close !== undefined) setModalOpen(false);
});
serviceTypeSelect.addEventListener("change", handleTypeChange);
endpointSelect.addEventListener("change", handleEndpointChange);
addAgentBtn.addEventListener("click", handleAddAgent);
saveSettingsBtn.addEventListener("click", () => {
  const t = pendingType || serviceTypeSelect.value;
  const epId = pendingEndpoint || endpointSelect.value;
  if (t && epId) {
    applyEndpoint(t, epId);
  }
  setModalOpen(false);
  // 关闭设置后立刻刷新当前视图，避免用户再手动点击刷新
  route();
});
resetSettingsBtn.addEventListener("click", () => {
  currentMeta = {};
  handleTypeChange();
});

init();
