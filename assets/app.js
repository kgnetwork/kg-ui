import { getApiBase, resetApiBase, setApiBase } from "./api.js";
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

const viewRoot = document.getElementById("viewRoot");
const apiBaseText = document.getElementById("apiBaseText");

const settingsModal = document.getElementById("settingsModal");
const apiBaseInput = document.getElementById("apiBaseInput");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const resetSettingsBtn = document.getElementById("resetSettingsBtn");

function setModalOpen(open) {
  settingsModal.setAttribute("aria-hidden", open ? "false" : "true");
}

function refreshApiBaseUi() {
  apiBaseText.textContent = getApiBase();
  apiBaseInput.value = getApiBase();
}

settingsModal.addEventListener("click", (e) => {
  const target = e.target;
  if (target?.dataset?.close !== undefined) {
    setModalOpen(false);
  }
});

openSettingsBtn.addEventListener("click", () => {
  refreshApiBaseUi();
  setModalOpen(true);
});
saveSettingsBtn.addEventListener("click", () => {
  setApiBase(apiBaseInput.value);
  refreshApiBaseUi();
  setModalOpen(false);
  route();
});
resetSettingsBtn.addEventListener("click", () => {
  resetApiBase();
  refreshApiBaseUi();
});

function setActiveNav(hash) {
  document.querySelectorAll(".nav__item").forEach((a) => a.classList.remove("is-active"));
  const a = document.querySelector(`.nav__item[href="${hash}"]`);
  if (a) a.classList.add("is-active");
}

function mount(node) {
  viewRoot.innerHTML = "";
  viewRoot.appendChild(node);
}

function route() {
  const hash = window.location.hash || "#/portal";
  const [, rawPath] = hash.split("#");
  const full = (rawPath || "/portal").replace(/^\/+/, "");
  const [p, qs] = full.split("?", 2);
  const query = new URLSearchParams(qs || "");

  setActiveNav(`#/${p}`);

  if (p === "graph") return mount(renderGraph());
  if (p === "search") return mount(renderSearch());
  if (p === "import") return mount(renderImport());
  if (p === "refresh") return mount(renderRefresh());
  if (p === "agents") return mount(renderAgents());
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

refreshApiBaseUi();
window.addEventListener("hashchange", route);
route();
