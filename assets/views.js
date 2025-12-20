import { apiFetch, downloadUrl, loadApiMeta } from "./api.js";
import { CanvasGraph } from "./graph.js";

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function fmtTs(ms) {
  if (!ms) return "-";
  const d = new Date(Number(ms));
  return isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function toQuery(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function renderPortal() {
  return el(`
    <section class="view__section">
      <div class="view__header">
        <div class="view__title">总览</div>
        <div class="muted"></div>
      </div>
      <div class="view__body">
        <div class="grid grid--3">
          <div class="card">
            <div class="card__title">图谱视图</div>
            <div class="card__desc">加载全量图谱并支持缩放/拖拽；按时间窗口高亮新增/更新知识。</div>
            <div class="card__actions">
              <a class="btn" href="#/graph">进入</a>
              <a class="btn btn--ghost" target="_blank" href="${downloadUrl("/api/dump")}">导出 JSON</a>
            </div>
          </div>
          <div class="card">
            <div class="card__title">检索</div>
            <div class="card__desc">关键字检索（名称/标题），支持按资源类型筛选。</div>
            <div class="card__actions">
              <a class="btn" href="#/search">进入</a>
            </div>
          </div>
          <div class="card">
            <div class="card__title">导入</div>
            <div class="card__desc">上传 JSON 导入图谱，后端异步执行并提供进度/日志查看与导出。</div>
            <div class="card__actions">
              <a class="btn" href="#/import">进入</a>
            </div>
          </div>
          <div class="card">
            <div class="card__title">刷新/状态</div>
            <div class="card__desc">查看最近窗口内的新增/更新统计；支持手动刷新与自动轮询。</div>
            <div class="card__actions">
              <a class="btn" href="#/refresh">进入</a>
            </div>
          </div>
          <div class="card">
            <div class="card__title">智能体状态</div>
            <div class="card__desc">展示 I/II/III 类智能体数量与基础信息摘要。</div>
            <div class="card__actions">
              <a class="btn" href="#/agents">进入</a>
            </div>
          </div>
          <div class="card">
            <div class="card__title">说明</div>
            <div class="card__desc">本 UI 仅覆盖合同条款 (1)(2)(3)(6)(7)(8)，暂不含质量控制与推理链优化。</div>
            <div class="card__actions">
              <a class="btn btn--ghost" target="_blank" href="${downloadUrl("/docs/swagger/")}">后端 API Docs</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `);
}

export function renderGraph() {
  const metaInfo = loadApiMeta();
  if (metaInfo?.ui && metaInfo.ui !== "network") {
    const root = el(`
      <section>
        <div class="view__header">
          <div class="view__title">图谱视图</div>
        </div>
        <div class="view__body">
          <div class="panel">
            <div class="panel__hd">当前后端不支持</div>
            <div class="panel__bd">
              <div class="muted">当前选择的后端类型为 ${metaInfo.ui}，未提供 /ui/api/graph。</div>
            </div>
          </div>
        </div>
      </section>
    `);
    return root;
  }
  const root = el(`
    <section>
      <div class="view__header">
        <div class="view__title">图谱视图</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input class="input" id="graphSearch" placeholder="高亮搜索（name/title）" style="width:260px;" />
          <select class="select" id="maxNodes" style="width:160px;">
            <option value="0">节点：全部</option>
            <option value="300">节点：300</option>
            <option value="600">节点：600</option>
            <option value="900">节点：900</option>
            <option value="1200">节点：1200</option>
          </select>
          <select class="select" id="highlightWindow" style="width:180px;">
            <option value="">不高亮</option>
            <option value="1">最近 1 分钟</option>
            <option value="5">最近 5 分钟</option>
            <option value="30">最近 30 分钟</option>
            <option value="120">最近 2 小时</option>
          </select>
          <button class="btn btn--ghost" id="graphReset">重置视角</button>
          <button class="btn" id="graphReload">重新加载</button>
          <a class="btn btn--ghost" target="_blank" href="${downloadUrl("/api/dump")}">导出 JSON</a>
        </div>
      </div>
      <div class="view__body">
        <div class="split">
          <div class="panel">
            <div class="panel__hd">拓扑视图（缩放：滚轮；拖拽：按住鼠标左键）</div>
            <div class="panel__bd">
              <div class="canvas-wrap">
                <canvas id="graphCanvas"></canvas>
                <div id="graphTooltip" class="tooltip" style="display:none;"></div>
              </div>
              <div class="muted" id="graphMeta" style="margin-top:10px;">-</div>
            </div>
          </div>
          <div class="panel">
            <div class="panel__hd">过滤 / 图例 / 选中</div>
            <div class="panel__bd">
              <div class="legend">
                <div>
                  <div class="legend__group-title">节点过滤</div>
                  <div class="checklist" id="graphFilters"></div>
                </div>

                <div>
                  <div class="legend__group-title">颜色 / 形状（节点）</div>
                  <div class="legend__items">
                    <div class="legend-item"><span class="swatch swatch--circle" style="background:#00ffd6;"></span><div><span class="mono">znt-i</span> <span class="muted">圆形</span></div></div>
                    <div class="legend-item"><span class="swatch swatch--square" style="background:#2ea7ff;"></span><div><span class="mono">znt-ii</span> <span class="muted">方形</span></div></div>
                    <div class="legend-item"><span class="swatch swatch--triangle"></span><div><span class="mono">znt-iii</span> <span class="muted">三角形</span></div></div>
                    <div class="legend-item"><span class="swatch swatch--diamond" style="background:#ffb000;"></span><div><span class="mono">data_attribute</span> <span class="muted">菱形</span></div></div>
                    <div class="legend-item"><span class="swatch swatch--pent" style="background:#ff4d6d;"></span><div><span class="mono">logical_decision</span> <span class="muted">五边形</span></div></div>
                    <div class="legend-item"><span class="swatch swatch--poly" style="background:#a979ff;"></span><div><span class="mono">relational_calc</span> <span class="muted">六边形</span></div></div>
                  </div>
                </div>

                <div>
                  <div class="legend__group-title">高亮颜色（规则）</div>
                  <div class="legend__items">
                    <div class="legend-item"><span class="swatch swatch--circle" style="background:rgba(0,255,214,0.18); border-color:rgba(0,255,214,0.75);"></span><div><span class="muted">选中节点/边端点：强高亮</span></div></div>
                    <div class="legend-item"><span class="swatch swatch--circle" style="background:rgba(0,255,214,0.10); border-color:rgba(0,255,214,0.35);"></span><div><span class="muted">新增/更新（created/updated 命中窗口）：弱闪烁高亮</span></div></div>
                  </div>
                  <div class="muted" style="margin-top:8px; line-height:1.6;">
                    高亮规则：节点 ` + "`created/updated`" + ` ≥ 窗口起点。
                  </div>
                </div>

	                <div class="panel" style="margin-top:8px;">
	                  <div class="panel__hd">选中详情（点击节点或边）</div>
	                  <div class="panel__bd">
	                    <div class="muted" id="selectionMeta">未选中</div>
	                    <div class="panel panel--scroll" style="margin-top:8px;">
	                      <div class="panel__hd">数据</div>
	                      <div class="panel__bd"><pre class="codeblock mono" id="selectionJson"></pre></div>
	                    </div>
	                  </div>
	                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `);

  const canvas = root.querySelector("#graphCanvas");
  const tooltip = root.querySelector("#graphTooltip");
  const graph = new CanvasGraph(canvas, tooltip);
  const meta = root.querySelector("#graphMeta");
  const search = root.querySelector("#graphSearch");
  const maxNodesSel = root.querySelector("#maxNodes");
  const win = root.querySelector("#highlightWindow");
  const filtersEl = root.querySelector("#graphFilters");
  const selectionMeta = root.querySelector("#selectionMeta");
  const selectionJson = root.querySelector("#selectionJson");

  let fullData = { nodes: [], edges: [] };
  const kindLabels = {
    "znt-i": "I 类智能体",
    "znt-ii": "II 类智能体",
    "znt-iii": "III 类智能体",
    data_attribute: "属性",
    logical_decision: "逻辑决策",
    relational_calc: "关系计算",
    unknown: "unknown",
  };
  const enabledKinds = new Set(Object.keys(kindLabels));
  let maxNodes = Number(localStorage.getItem("KG_GRAPH_MAX_NODES") || "0") || 0;
  if ([0, 300, 600, 900, 1200].includes(maxNodes)) {
    maxNodesSel.value = String(maxNodes);
  } else {
    maxNodes = 0;
    maxNodesSel.value = "0";
  }

  let hideIsolated = (localStorage.getItem("KG_GRAPH_HIDE_ISOLATED") || "0") === "1";
  let dimMode = (localStorage.getItem("KG_GRAPH_DIM_MODE") || "0") === "1";
  graph.setDimMode(dimMode);

  function applyFilters() {
    let nodes = fullData.nodes.filter((n) => enabledKinds.has(n.kind || "unknown"));

    const nodeIds = new Set(nodes.map((n) => n.id));
    let edges = fullData.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    if (hideIsolated) {
      const degree = new Map();
      for (const e of edges) {
        degree.set(e.source, (degree.get(e.source) || 0) + 1);
        degree.set(e.target, (degree.get(e.target) || 0) + 1);
      }
      nodes = nodes.filter((n) => (degree.get(n.id) || 0) > 0);
      const ids2 = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => ids2.has(e.source) && ids2.has(e.target));
    }

    if (maxNodes > 0 && nodes.length > maxNodes) {
      const degree = new Map();
      for (const e of edges) {
        degree.set(e.source, (degree.get(e.source) || 0) + 1);
        degree.set(e.target, (degree.get(e.target) || 0) + 1);
      }
      nodes = nodes
        .slice()
        .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
        .slice(0, maxNodes);
      const ids3 = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => ids3.has(e.source) && ids3.has(e.target));
    }

    graph.setData({ nodes, edges });
  }

  function renderFilters() {
    filtersEl.innerHTML = "";
    const extra = document.createElement("div");
    extra.style.marginBottom = "10px";
    extra.innerHTML = `
      <label class="check"><input type="checkbox" id="hideIsolated" ${hideIsolated ? "checked" : ""} /> <span class="muted">隐藏孤独节点（无边相连）</span></label>
      <label class="check" style="margin-top:6px;"><input type="checkbox" id="dimMode" ${dimMode ? "checked" : ""} /> <span class="muted">暗色模式（未高亮节点灰化）</span></label>
    `;
    filtersEl.appendChild(extra);

    extra.querySelector("#hideIsolated").addEventListener("change", (e) => {
      hideIsolated = e.target.checked;
      localStorage.setItem("KG_GRAPH_HIDE_ISOLATED", hideIsolated ? "1" : "0");
      applyFilters();
    });
    extra.querySelector("#dimMode").addEventListener("change", (e) => {
      dimMode = e.target.checked;
      localStorage.setItem("KG_GRAPH_DIM_MODE", dimMode ? "1" : "0");
      graph.setDimMode(dimMode);
    });

    for (const [kind, label] of Object.entries(kindLabels)) {
      const row = document.createElement("label");
      row.className = "check";
      row.innerHTML = `<input type="checkbox" ${enabledKinds.has(kind) ? "checked" : ""} /> <span class="mono">${kind}</span> <span class="muted">${label}</span>`;
      const input = row.querySelector("input");
      input.addEventListener("change", () => {
        if (input.checked) enabledKinds.add(kind);
        else enabledKinds.delete(kind);
        applyFilters();
      });
      filtersEl.appendChild(row);
    }
  }

  async function load() {
    meta.textContent = "加载中…";
    const { ok, status, payload } = await apiFetch("/ui/api/graph", { timeoutMs: 60_000 });
    if (!ok) {
      meta.textContent = `加载失败：HTTP ${status} ${JSON.stringify(payload)}`;
      return;
    }
    fullData = payload;
    renderFilters();
    applyFilters();
    meta.textContent = `nodes=${payload.nodes.length} edges=${payload.edges.length}（来源：/ui/api/graph）`;
  }

  root.querySelector("#graphReload").addEventListener("click", load);
  root.querySelector("#graphReset").addEventListener("click", () => graph.resetView());
  search.addEventListener("input", () => graph.setSearchTerm(search.value));
  maxNodesSel.addEventListener("change", () => {
    maxNodes = Number(maxNodesSel.value || "0") || 0;
    localStorage.setItem("KG_GRAPH_MAX_NODES", String(maxNodes));
    applyFilters();
  });
  win.addEventListener("change", () => {
    const minutes = Number(win.value || 0);
    if (!minutes) {
      graph.setHighlightSince(null);
      return;
    }
    graph.setHighlightSince(Date.now() - minutes * 60_000);
  });

  graph.setSelectionChangeHandler((sel) => {
    if (sel.type === "none") {
      selectionMeta.textContent = "未选中";
      selectionJson.textContent = "";
      return;
    }
    if (sel.type === "node") {
      selectionMeta.textContent = `node ${sel.node?.id || "-"}`;
      selectionJson.textContent = JSON.stringify(sel.node || {}, null, 2);
      return;
    }
    if (sel.type === "edge") {
      selectionMeta.textContent = `edge ${sel.edge?.type || "-"} ${sel.edge?.source || "-"} -> ${sel.edge?.target || "-"}`;
      selectionJson.textContent = JSON.stringify(sel.edge || {}, null, 2);
      return;
    }
  });

  setTimeout(load, 0);
  return root;
}

export function renderImport() {
  const root = el(`
    <section>
      <div class="view__header">
        <div class="view__title">导入</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <a class="btn btn--ghost" target="_blank" href="${downloadUrl("/adapter/import-ui")}">旧导入页</a>
          <button class="btn" id="refreshJobs">刷新任务列表</button>
        </div>
      </div>
      <div class="view__body">
        <div class="grid grid--2">
          <div class="panel">
            <div class="panel__hd">上传 JSON（异步导入，支持进度/日志）</div>
            <div class="panel__bd">
              <form id="importForm" class="form">
                <input class="input" type="file" id="importFile" accept=".json,application/json" />
                <div class="form__hint">后端入口：` + "`POST /ui/api/import`" + `（multipart/form-data 或 application/json）。</div>
                <div class="form__actions">
                  <button class="btn" type="submit">开始导入</button>
                  <button class="btn btn--ghost" type="button" id="cancelPoll">停止轮询</button>
                </div>
              </form>
              <div class="muted" id="importJobMeta" style="margin-top:10px;">-</div>
              <div style="margin-top:10px;">
                <a class="btn btn--ghost" id="downloadJobLog" target="_blank" href="#" style="display:none;">下载日志</a>
              </div>
	              <div class="panel panel--scroll" style="margin-top:10px;">
	                <div class="panel__hd">日志（tail）</div>
	                <div class="panel__bd"><pre class="codeblock mono" id="importLogTail"></pre></div>
	              </div>
            </div>
          </div>
          <div class="panel">
            <div class="panel__hd">最近导入任务</div>
            <div class="panel__bd">
              <table class="table">
                <thead><tr><th>job_id</th><th>status</th><th>started</th><th>updated</th></tr></thead>
                <tbody id="jobsBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  `);

  const jobsBody = root.querySelector("#jobsBody");
  const meta = root.querySelector("#importJobMeta");
  const logTail = root.querySelector("#importLogTail");
  const downloadLink = root.querySelector("#downloadJobLog");
  let pollTimer = 0;
  let activeJobId = "";

  function stopPoll() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = 0;
  }

  async function refreshJobs() {
    const { ok, payload } = await apiFetch("/ui/api/jobs");
    if (!ok) return;
    jobsBody.innerHTML = "";
    for (const j of payload.jobs || []) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono"><a href="#" data-job="${j.id}">${j.id}</a></td>
        <td>${j.status}</td>
        <td class="mono">${fmtTs(j.started_at_ms)}</td>
        <td class="mono">${fmtTs(j.updated_at_ms)}</td>
      `;
      tr.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        activeJobId = j.id;
        startPoll(activeJobId);
      });
      jobsBody.appendChild(tr);
    }
  }

  async function poll(jobId) {
    const { ok, status, payload } = await apiFetch(`/ui/api/jobs/${jobId}`);
    if (!ok) {
      meta.textContent = `任务查询失败：HTTP ${status}`;
      return;
    }
    const job = payload.job || {};
    const p = job.progress || {};
    meta.textContent = `job=${job.id} status=${job.status} section=${p.section || "-"} ${p.done_sections || 0}/${p.total_sections || 0}`;
    logTail.textContent = payload.log_tail || "";
    if (job.status !== "running") {
      stopPoll();
    }
    downloadLink.style.display = "inline-block";
    downloadLink.href = downloadUrl(`/ui/api/jobs/${jobId}/log`);
  }

  function startPoll(jobId) {
    stopPoll();
    poll(jobId);
    pollTimer = window.setInterval(() => poll(jobId), 1500);
  }

  root.querySelector("#refreshJobs").addEventListener("click", refreshJobs);
  root.querySelector("#cancelPoll").addEventListener("click", stopPoll);

  root.querySelector("#importForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = root.querySelector("#importFile").files?.[0];
    if (!file) {
      meta.textContent = "请选择 JSON 文件";
      return;
    }
    meta.textContent = "提交中…";
    const fd = new FormData();
    fd.append("file", file, file.name);
    const { ok, status, payload } = await apiFetch("/ui/api/import", {
      method: "POST",
      body: fd,
      timeoutMs: 60_000,
    });
    if (!ok) {
      meta.textContent = `提交失败：HTTP ${status} ${JSON.stringify(payload)}`;
      return;
    }
    activeJobId = payload.job_id;
    await refreshJobs();
    startPoll(activeJobId);
  });

  setTimeout(refreshJobs, 0);
  return root;
}

export function renderRefresh() {
  const root = el(`
    <section>
      <div class="view__header">
        <div class="view__title">刷新/状态</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <select class="select" id="statusWindow" style="width:180px;">
            <option value="1">最近 1 分钟</option>
            <option value="5">最近 5 分钟</option>
            <option value="30">最近 30 分钟</option>
            <option value="120">最近 2 小时</option>
          </select>
          <button class="btn" id="statusReload">刷新</button>
          <button class="btn btn--ghost" id="statusAuto">自动刷新：关</button>
        </div>
      </div>
      <div class="view__body">
        <div class="grid grid--2">
          <div class="panel">
            <div class="panel__hd">统计（/status）</div>
            <div class="panel__bd">
              <div class="muted" id="statusMeta">-</div>
	              <div class="panel panel--scroll" style="margin-top:10px;">
	                <div class="panel__hd">原始响应</div>
	                <div class="panel__bd"><pre class="codeblock mono" id="statusJson"></pre></div>
	              </div>
            </div>
          </div>
          <div class="panel">
            <div class="panel__hd">操作</div>
            <div class="panel__bd">
              <div class="form">
                <div class="form__hint">手动刷新：重新拉取图谱数据并渲染，建议在“图谱视图”页面操作。</div>
                <a class="btn" href="#/graph">进入图谱视图</a>
                <div class="form__hint">自动刷新条件导入：此版本先在浏览器本地保存（localStorage），用于前端轮询展示。</div>
                <textarea class="textarea" id="refreshRules" placeholder='{\"interval_seconds\": 10, \"highlight_minutes\": 5}'></textarea>
                <div class="form__actions">
                  <button class="btn" id="saveRules">保存条件</button>
                  <button class="btn btn--ghost" id="loadRules">加载已保存</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `);

  const meta = root.querySelector("#statusMeta");
  const jsonEl = root.querySelector("#statusJson");
  const sel = root.querySelector("#statusWindow");
  const autoBtn = root.querySelector("#statusAuto");
  let autoTimer = 0;

  async function load() {
    const minutes = Number(sel.value || 1);
    const { ok, status, payload } = await apiFetch(`/status${toQuery({ minutes })}`);
    if (!ok) {
      meta.textContent = `请求失败：HTTP ${status}`;
      jsonEl.textContent = JSON.stringify(payload, null, 2);
      return;
    }
    meta.textContent = `窗口=${minutes}min 统计时间=${fmtTs(payload?.window?.since_ms)}~${fmtTs(payload?.window?.until_ms)}`;
    jsonEl.textContent = JSON.stringify(payload, null, 2);
  }

  root.querySelector("#statusReload").addEventListener("click", load);
  autoBtn.addEventListener("click", () => {
    if (autoTimer) {
      window.clearInterval(autoTimer);
      autoTimer = 0;
      autoBtn.textContent = "自动刷新：关";
      return;
    }
    autoTimer = window.setInterval(load, 5000);
    autoBtn.textContent = "自动刷新：开";
  });

  const rulesEl = root.querySelector("#refreshRules");
  root.querySelector("#saveRules").addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.setItem("KG_REFRESH_RULES", rulesEl.value || "");
  });
  root.querySelector("#loadRules").addEventListener("click", (e) => {
    e.preventDefault();
    rulesEl.value = localStorage.getItem("KG_REFRESH_RULES") || "";
  });
  rulesEl.value = localStorage.getItem("KG_REFRESH_RULES") || "";

  setTimeout(load, 0);
  return root;
}

export function renderSearch() {
  const root = el(`
    <section>
      <div class="view__header">
        <div class="view__title">检索</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input class="input" id="kw" placeholder="关键字（name/title）" style="width:260px;" />
          <select class="select" id="type" style="width:220px;">
            <option value="">全部类型</option>
            <option value="znt-i">znt-i</option>
            <option value="znt-ii">znt-ii</option>
            <option value="znt-iii">znt-iii</option>
            <option value="data_attribute">data_attribute</option>
            <option value="logical_decision">logical_decision</option>
            <option value="relational_calc">relational_calc</option>
          </select>
          <button class="btn" id="go">搜索</button>
        </div>
      </div>
      <div class="view__body">
        <div class="grid grid--2">
          <div class="panel">
            <div class="panel__hd">结果</div>
            <div class="panel__bd">
              <table class="table">
                <thead><tr><th>name</th><th>labels</th></tr></thead>
                <tbody id="rows"></tbody>
              </table>
            </div>
          </div>
          <div class="panel">
            <div class="panel__hd">详情</div>
            <div class="panel__bd">
              <div class="muted" id="detailMeta">点击左侧结果查看</div>
	              <div class="panel panel--scroll" style="margin-top:10px;">
	                <div class="panel__hd">实体</div>
	                <div class="panel__bd"><pre class="codeblock mono" id="detailJson"></pre></div>
	              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `);

  const kw = root.querySelector("#kw");
  const type = root.querySelector("#type");
  const rows = root.querySelector("#rows");
  const meta = root.querySelector("#detailMeta");
  const detail = root.querySelector("#detailJson");

  function inferResourceType(labels) {
    if (!Array.isArray(labels)) return null;
    if (labels.includes("DataAttribute")) return "data_attribute";
    if (labels.includes("LogicalDecision")) return "logical_decision";
    if (labels.includes("RelationalCalc")) return "relational_calc";
    if (labels.includes("ZNTEntity")) {
      if (labels.includes("I")) return "znt-i";
      if (labels.includes("II")) return "znt-ii";
      if (labels.includes("III")) return "znt-iii";
    }
    return null;
  }

  async function loadDetail(item) {
    const rt = inferResourceType(item.labels) || type.value || "";
    if (!rt) {
      meta.textContent = "无法判断资源类型，请在右上角选择类型后重试";
      return;
    }
    meta.textContent = `读取中：${rt}/${item.name}`;
    const { ok, status, payload } = await apiFetch(`/openapi${toQuery({ name: item.name })}`, {
      headers: { "X-Resource-Type": rt, "X-Resource-Op": "read" },
    });
    if (!ok) {
      meta.textContent = `读取失败：HTTP ${status}`;
      detail.textContent = JSON.stringify(payload, null, 2);
      return;
    }
    meta.textContent = `资源：${rt} name=${item.name}`;
    detail.textContent = JSON.stringify(payload, null, 2);
  }

  async function search() {
    const keyword = (kw.value || "").trim();
    if (!keyword) return;
    rows.innerHTML = "";
    meta.textContent = "搜索中…";
    detail.textContent = "";

    const headers = { "X-Resource-Op": "search" };
    if (type.value) headers["X-Resource-Type"] = type.value;

    const { ok, status, payload } = await apiFetch(`/openapi${toQuery({ keyword, limit: 50 })}`, { headers });
    if (!ok) {
      meta.textContent = `搜索失败：HTTP ${status}`;
      detail.textContent = JSON.stringify(payload, null, 2);
      return;
    }
    const items = payload?.items || payload?.results || payload || [];
    const arr = Array.isArray(items) ? items : payload?.items || [];
    meta.textContent = `结果数：${arr.length}`;

    for (const it of arr) {
      const data = it?.data || it?.n || it;
      const name = data?.name || data?.__name__ || data?.title;
      const labels = it?.labels || data?.labels || it?.label || [];
      if (!name) continue;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="mono"><a href="#">${name}</a></td>
        <td class="mono muted">${Array.isArray(labels) ? labels.join(",") : String(labels)}</td>
      `;
      row.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        loadDetail({ name, labels: Array.isArray(labels) ? labels : [] });
      });
      rows.appendChild(row);
    }
  }

  root.querySelector("#go").addEventListener("click", search);
  kw.addEventListener("keydown", (e) => {
    if (e.key === "Enter") search();
  });

  return root;
}

export function renderAgents() {
  const metaInfo = loadApiMeta();
  if (metaInfo?.ui && metaInfo.ui !== "network") {
    const root = el(`
      <section>
        <div class="view__header">
          <div class="view__title">智能体状态</div>
        </div>
        <div class="view__body">
          <div class="panel">
            <div class="panel__hd">当前后端不支持</div>
            <div class="panel__bd">
              <div class="muted">当前选择的后端类型为 ${metaInfo.ui}，未提供 /ui/api/graph，无法展示智能体状态。</div>
            </div>
          </div>
        </div>
      </section>
    `);
    return root;
  }
  const root = el(`
    <section>
      <div class="view__header">
        <div class="view__title">智能体状态（network base）</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn" id="reload">刷新</button>
        </div>
      </div>
      <div class="view__body">
        <div class="grid grid--3">
          <div class="card"><div class="card__title">I 类</div><div class="card__desc"><span class="mono" id="cI">-</span></div></div>
          <div class="card"><div class="card__title">II 类</div><div class="card__desc"><span class="mono" id="cII">-</span></div></div>
          <div class="card"><div class="card__title">III 类</div><div class="card__desc"><span class="mono" id="cIII">-</span></div></div>
        </div>
        <div class="panel" style="margin-top:12px;">
          <div class="panel__hd">样例列表（取前 50 条）</div>
          <div class="panel__bd">
            <table class="table">
              <thead><tr><th>kind</th><th>name</th><th>label</th></tr></thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  `);

  const cI = root.querySelector("#cI");
  const cII = root.querySelector("#cII");
  const cIII = root.querySelector("#cIII");
  const rows = root.querySelector("#rows");

  async function load() {
    const { ok, status, payload } = await apiFetch("/ui/api/graph", { timeoutMs: 60_000 });
    if (!ok) {
      rows.innerHTML = `<tr><td colspan="3">加载失败：HTTP ${status}</td></tr>`;
      return;
    }
    const nodes = payload.nodes || [];
    const zntI = nodes.filter((n) => n.kind === "znt-i");
    const zntII = nodes.filter((n) => n.kind === "znt-ii");
    const zntIII = nodes.filter((n) => n.kind === "znt-iii");
    cI.textContent = zntI.length;
    cII.textContent = zntII.length;
    cIII.textContent = zntIII.length;
    rows.innerHTML = "";
    for (const n of nodes.filter((x) => x.kind?.startsWith("znt-")).slice(0, 50)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><span class="tag">${n.kind}</span></td><td class="mono">${n.id}</td><td class="muted">${n.label || ""}</td>`;
      rows.appendChild(tr);
    }
  }

  root.querySelector("#reload").addEventListener("click", load);
  setTimeout(load, 0);
  return root;
}

function normalizeZntType(t) {
  const s = String(t || "").trim().toLowerCase();
  if (s === "i" || s === "1") return "i";
  if (s === "ii" || s === "2") return "ii";
  if (s === "iii" || s === "3") return "iii";
  return "i";
}

function zntResourceType(zntType) {
  return `znt-${normalizeZntType(zntType)}`;
}

function msToLocal(ms) {
  if (!ms) return "-";
  const d = new Date(Number(ms));
  return isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function truncateJson(obj, maxLen = 120) {
  const s = JSON.stringify(obj);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}...`;
}

export function renderUiHome() {
  const root = el(`
    <section>
      <div class="view__header">
        <div class="view__title">/ui（兼容页）</div>
      </div>
      <div class="view__body">
        <div class="grid grid--3">
          <div class="card">
            <div class="card__title">ZNT 列表</div>
            <div class="card__desc">分页浏览 I/II/III 类 ZNT。</div>
            <div class="card__actions">
              <a class="btn" href="#/ui/znt_list?znt_type=i&page=1">I 类</a>
              <a class="btn btn--ghost" href="#/ui/znt_list?znt_type=ii&page=1">II 类</a>
              <a class="btn btn--ghost" href="#/ui/znt_list?znt_type=iii&page=1">III 类</a>
            </div>
          </div>
          <div class="card">
            <div class="card__title">导入</div>
            <div class="card__desc">跳转到新导入页（支持异步进度与日志）。</div>
            <div class="card__actions">
              <a class="btn" href="#/import">打开导入页</a>
            </div>
          </div>
          <div class="card">
            <div class="card__title">导出 JSON</div>
            <div class="card__desc">导出全量图谱 JSON。</div>
            <div class="card__actions">
              <a class="btn btn--ghost" target="_blank" href="${downloadUrl("/api/dump")}">打开 /api/dump</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `);
  return root;
}

export function renderUiZntList(query = {}) {
  const zntType = normalizeZntType(query.znt_type);
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = 10;

  const root = el(`
    <section>
      <div class="view__header">
        <div class="view__title">/ui/znt_list</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <a class="btn btn--ghost" href="#/ui">返回 /ui</a>
          <a class="btn btn--ghost" href="#/ui/znt_list?znt_type=i&page=1">I</a>
          <a class="btn btn--ghost" href="#/ui/znt_list?znt_type=ii&page=1">II</a>
          <a class="btn btn--ghost" href="#/ui/znt_list?znt_type=iii&page=1">III</a>
          <button class="btn" id="reload">刷新</button>
        </div>
      </div>
      <div class="view__body">
        <div class="muted" id="meta">-</div>
        <div style="margin-top:10px;">
          <table class="table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Type</th>
                <th>NAME</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px;" id="pager"></div>
      </div>
    </section>
  `);

  const meta = root.querySelector("#meta");
  const rows = root.querySelector("#rows");
  const pager = root.querySelector("#pager");

  function goPage(p) {
    const q = new URLSearchParams({ znt_type: zntType, page: String(p) }).toString();
    window.location.hash = `#/ui/znt_list?${q}`;
  }

  async function load() {
    meta.textContent = "加载中…";
    rows.innerHTML = "";
    pager.innerHTML = "";

    const { ok, status, payload } = await apiFetch("/ui/api/graph", { timeoutMs: 60_000 });
    if (!ok) {
      meta.textContent = `加载失败：HTTP ${status}`;
      rows.innerHTML = `<tr><td colspan="6" class="mono">${escapeHtml(JSON.stringify(payload))}</td></tr>`;
      return;
    }

    const all = (payload.nodes || []).filter((n) => n.kind === `znt-${zntType}`);
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const slice = all.slice(start, start + pageSize);

    meta.textContent = `type=${zntType.toUpperCase()} total=${total} page=${safePage}/${totalPages}（来源：/ui/api/graph）`;

    for (let i = 0; i < slice.length; i++) {
      const n = slice[i];
      const idx = start + i + 1;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${idx}</td>
        <td><span class="tag">${zntType.toUpperCase()}</span></td>
        <td class="mono"><a href="#/ui/znt_detail/${zntType}/${encodeURIComponent(n.id)}">${escapeHtml(n.id)}</a></td>
        <td class="mono muted">${escapeHtml(msToLocal(n.created))}</td>
        <td class="mono muted">${escapeHtml(msToLocal(n.updated))}</td>
        <td class="mono muted">${escapeHtml(truncateJson(n.props || {}, 140))}</td>
      `;
      rows.appendChild(tr);
    }

    if (safePage > 1) {
      const a = document.createElement("a");
      a.className = "btn btn--ghost";
      a.href = "#";
      a.textContent = "上一页";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        goPage(safePage - 1);
      });
      pager.appendChild(a);
    }
    if (safePage < totalPages) {
      const a = document.createElement("a");
      a.className = "btn btn--ghost";
      a.href = "#";
      a.textContent = "下一页";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        goPage(safePage + 1);
      });
      pager.appendChild(a);
    }
  }

  root.querySelector("#reload").addEventListener("click", load);
  setTimeout(load, 0);
  return root;
}

export function renderUiZntDetail({ zntType, zntName }) {
  const t = normalizeZntType(zntType);
  const name = decodeURIComponent(String(zntName || "").trim());

  const root = el(`
    <section>
      <div class="view__header">
        <div class="view__title">/ui/znt_detail</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <a class="btn btn--ghost" href="#/ui/znt_list?znt_type=${t}&page=1">返回列表</a>
          <button class="btn" id="reload">刷新</button>
        </div>
      </div>
      <div class="view__body">
        <div class="grid grid--2">
          <div class="panel">
            <div class="panel__hd">基本信息</div>
            <div class="panel__bd">
              <div class="kv">
                <div class="kv__k">Type</div><div class="kv__v"><span class="tag" id="typeTag">-</span></div>
                <div class="kv__k">Name</div><div class="kv__v mono" id="nameText">-</div>
                <div class="kv__k">Created</div><div class="kv__v mono muted" id="createdText">-</div>
                <div class="kv__k">Updated</div><div class="kv__v mono muted" id="updatedText">-</div>
              </div>
              <div class="muted" style="margin-top:10px;" id="meta">-</div>
            </div>
          </div>
          <div class="panel">
            <div class="panel__hd">Attributes</div>
            <div class="panel__bd">
              <table class="table">
                <thead><tr><th>Key</th><th>Value</th></tr></thead>
                <tbody id="attrs"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  `);

  const meta = root.querySelector("#meta");
  const typeTag = root.querySelector("#typeTag");
  const nameText = root.querySelector("#nameText");
  const createdText = root.querySelector("#createdText");
  const updatedText = root.querySelector("#updatedText");
  const attrs = root.querySelector("#attrs");

  async function load() {
    meta.textContent = "读取中…";
    attrs.innerHTML = "";
    typeTag.textContent = t.toUpperCase();
    nameText.textContent = name || "-";

    const { ok, status, payload } = await apiFetch(`/openapi${toQuery({ name })}`, {
      headers: {
        "X-Resource-Type": zntResourceType(t),
        "X-Resource-Op": "read",
      },
      timeoutMs: 30_000,
    });

    if (!ok) {
      meta.textContent = `读取失败：HTTP ${status}`;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="2" class="mono">${escapeHtml(JSON.stringify(payload))}</td>`;
      attrs.appendChild(tr);
      return;
    }

    let data = payload?.data || payload?.node || payload || {};
    if (Array.isArray(data)) {
      data = data.length === 1 ? data[0] : { items: data };
    }
    const created = data.created || data.attributes?.created;
    const updated = data.updated || data.attributes?.updated;
    createdText.textContent = msToLocal(created);
    updatedText.textContent = msToLocal(updated);
    meta.textContent = `resource_type=${zntResourceType(t)}（来源：/openapi read）`;

    const keys = Object.keys(data || {}).sort();
    for (const k of keys) {
      const v = data[k];
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="mono">${escapeHtml(k)}</td><td class="mono muted">${escapeHtml(String(v))}</td>`;
      attrs.appendChild(tr);
    }
  }

  root.querySelector("#reload").addEventListener("click", load);
  setTimeout(load, 0);
  return root;
}

// Re-export placeholder to satisfy legacy imports (proxy UI moved to views_proxy.js).
export { renderProxyHome } from "./views_proxy.js";

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
