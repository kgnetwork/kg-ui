const KIND_COLORS = {
  "znt-i": "#00ffd6",
  "znt-ii": "#2ea7ff",
  "znt-iii": "#30ffb1",
  data_attribute: "#ffb000",
  relational_calc: "#a979ff",
  logical_decision: "#ff4d6d",
  unknown: "#8bb3d9",
};

const KIND_SHAPES = {
  "znt-i": "circle",
  "znt-ii": "square",
  "znt-iii": "triangle",
  data_attribute: "diamond",
  relational_calc: "hexagon",
  logical_decision: "pentagon",
  unknown: "circle",
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function nowMs() {
  return Date.now();
}

class QuadNode {
  constructor(x0, y0, x1, y1) {
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    this.cx = 0;
    this.cy = 0;
    this.mass = 0;
    this.point = null;
    this.points = null;
    this.children = null;
  }
}

function buildQuadtree(points, x0, y0, x1, y1) {
  const root = new QuadNode(x0, y0, x1, y1);
  const QT_MAX_DEPTH = 24;
  const QT_MIN_SIZE = 1e-3;

  function insert(node, p, depth) {
    if (!node.children) {
      if (node.points) {
        node.points.push(p);
        return;
      }
      if (!node.point) {
        node.point = p;
        return;
      }

      const w = node.x1 - node.x0;
      const h = node.y1 - node.y0;
      if (depth >= QT_MAX_DEPTH || w <= QT_MIN_SIZE || h <= QT_MIN_SIZE) {
        node.points = [node.point, p];
        node.point = null;
        return;
      }

      const mx = (node.x0 + node.x1) / 2;
      const my = (node.y0 + node.y1) / 2;
      node.children = [
        new QuadNode(node.x0, node.y0, mx, my),
        new QuadNode(mx, node.y0, node.x1, my),
        new QuadNode(node.x0, my, mx, node.y1),
        new QuadNode(mx, my, node.x1, node.y1),
      ];
      const old = node.point;
      node.point = null;
      insert(node, old, depth);
    }

    const mx = (node.x0 + node.x1) / 2;
    const my = (node.y0 + node.y1) / 2;
    const i = (p._x >= mx ? 1 : 0) + (p._y >= my ? 2 : 0);
    insert(node.children[i], p, depth + 1);
  }

  for (const p of points) insert(root, p, 0);

  function accumulate(node) {
    let mass = 0;
    let cx = 0;
    let cy = 0;
    if (node.children) {
      for (const c of node.children) {
        accumulate(c);
        if (c.mass > 0) {
          mass += c.mass;
          cx += c.mass * c.cx;
          cy += c.mass * c.cy;
        }
      }
    } else if (node.points) {
      mass = node.points.length;
      for (const p of node.points) {
        cx += p._x;
        cy += p._y;
      }
    } else if (node.point) {
      mass = 1;
      cx = node.point._x;
      cy = node.point._y;
    }
    node.mass = mass;
    if (mass > 0) {
      node.cx = cx / mass;
      node.cy = cy / mass;
    }
  }

  accumulate(root);
  return root;
}

function applyRepulsion(root, node, strength, theta, jitter) {
  const stack = [root];
  while (stack.length) {
    const q = stack.pop();
    if (!q || q.mass === 0) continue;

    if (!q.children && q.point === node) continue;

    const dx = q.cx - node._x;
    const dy = q.cy - node._y;
    const dist2 = dx * dx + dy * dy + jitter;
    const w = q.x1 - q.x0;
    if (!q.children || (w * w) / dist2 < theta * theta) {
      const inv = 1 / Math.sqrt(dist2);
      const f = (strength * q.mass) * inv * inv;
      node._vx -= dx * f;
      node._vy -= dy * f;
    } else {
      for (const c of q.children) stack.push(c);
    }
  }
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(px - ax, py - ay);
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

export class CanvasGraph {
  constructor(canvas, tooltipEl) {
    this.canvas = canvas;
    this.tooltipEl = tooltipEl;
    this.ctx = canvas.getContext("2d");
    this.dpr = window.devicePixelRatio || 1;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.offsetStart = { x: 0, y: 0 };
    this.nodes = [];
    this.edges = [];
    this.nodeIndex = new Map();
    this.highlightSinceMs = null;
    this.searchTerm = "";
    this.selected = { nodeId: null, edge: null };
    this.onSelectionChange = null;
    this.dimMode = false;
    this._sim = null;
    this._raf = 0;

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas);

    this._bindEvents();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    if (this._sim) {
      this._sim.cx = rect.width / 2;
      this._sim.cy = rect.height / 2;
    }
    this.render();
  }

  setData({ nodes, edges }) {
    this.nodes = Array.isArray(nodes) ? nodes : [];
    this.edges = Array.isArray(edges) ? edges : [];
    this.nodeIndex = new Map(this.nodes.map((n) => [n.id, n]));
    this.resetView();
    this._initSimulation();
    this.render();
  }

  setHighlightSince(ms) {
    this.highlightSinceMs = ms || null;
    this.render();
  }

  setDimMode(on) {
    this.dimMode = Boolean(on);
    this.render();
  }

  setSearchTerm(term) {
    this.searchTerm = (term || "").trim().toLowerCase();
    this.render();
  }

  resetView() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.render();
  }

  setSelectionChangeHandler(fn) {
    this.onSelectionChange = typeof fn === "function" ? fn : null;
  }

  clearSelection() {
    this.selected = { nodeId: null, edge: null };
    if (this.onSelectionChange) this.onSelectionChange(this.getSelection());
    this.render();
  }

  getSelection() {
    if (this.selected.edge) return { type: "edge", edge: this.selected.edge };
    if (this.selected.nodeId) return { type: "node", node: this.nodeIndex.get(this.selected.nodeId) || null };
    return { type: "none" };
  }

  zoom(delta, cx, cy) {
    const factor = delta > 0 ? 0.9 : 1.1;
    const newScale = clamp(this.scale * factor, 0.2, 6);
    const rect = this.canvas.getBoundingClientRect();
    const px = (cx - rect.left) * this.dpr;
    const py = (cy - rect.top) * this.dpr;

    const wx = (px - this.offsetX) / this.scale;
    const wy = (py - this.offsetY) / this.scale;

    this.scale = newScale;
    this.offsetX = px - wx * this.scale;
    this.offsetY = py - wy * this.scale;
    this.render();
  }

  _bindEvents() {
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom(e.deltaY, e.clientX, e.clientY);
    }, { passive: false });

    this.canvas.addEventListener("mousedown", (e) => {
      this.dragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.offsetStart = { x: this.offsetX, y: this.offsetY };
    });
    window.addEventListener("mouseup", () => (this.dragging = false));
    window.addEventListener("mousemove", (e) => {
      if (this.dragging) {
        const dx = (e.clientX - this.dragStart.x) * this.dpr;
        const dy = (e.clientY - this.dragStart.y) * this.dpr;
        this.offsetX = this.offsetStart.x + dx;
        this.offsetY = this.offsetStart.y + dy;
        this.render();
        this._hideTooltip();
        return;
      }
      this._hoverAt(e.clientX, e.clientY);
    });

    this.canvas.addEventListener("click", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * this.dpr;
      const py = (e.clientY - rect.top) * this.dpr;
      const { x: wx, y: wy } = this._screenToWorld(px, py);
      const hitNode = this._pickNode(wx, wy);
      if (hitNode) {
        this.selected = { nodeId: hitNode.id, edge: null };
        if (this.onSelectionChange) this.onSelectionChange(this.getSelection());
        this.render();
        return;
      }
      const hitEdge = this._pickEdge(wx, wy);
      if (hitEdge) {
        this.selected = { nodeId: null, edge: hitEdge };
        if (this.onSelectionChange) this.onSelectionChange(this.getSelection());
        this.render();
        return;
      }
      this.clearSelection();
    });
  }

  _initSimulation() {
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    for (const n of this.nodes) {
      if (typeof n._x !== "number" || typeof n._y !== "number") {
        n._x = cx + (Math.random() - 0.5) * rect.width * 0.6;
        n._y = cy + (Math.random() - 0.5) * rect.height * 0.6;
      }
      if (typeof n._vx !== "number") n._vx = 0;
      if (typeof n._vy !== "number") n._vy = 0;
    }

    this._sim = {
      alpha: 1,
      alphaMin: 0.03,
      alphaDecay: 0.02,
      velocityDecay: 0.55,
      charge: 26,
      theta: 0.9,
      jitter: 0.01,
      linkDistance: 44,
      linkStrength: 0.06,
      centerStrength: 0.0025,
      cx,
      cy,
      boundsPad: 220,
    };
  }

  _worldToScreen(x, y) {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }

  _screenToWorld(x, y) {
    return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
  }

  _pickNode(wx, wy) {
    let best = null;
    let bestDist = 1e9;
    for (const n of this.nodes) {
      const dx = wx - n._x;
      const dy = wy - n._y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = n;
      }
    }
    const hitR = 9 / this.scale;
    return best && bestDist <= hitR * hitR ? best : null;
  }

  _pickEdge(wx, wy) {
    const tol = 7 / this.scale;
    let best = null;
    let bestD = 1e9;
    for (const e of this.edges) {
      const a = this.nodeIndex.get(e.source);
      const b = this.nodeIndex.get(e.target);
      if (!a || !b) continue;
      const d = distPointToSegment(wx, wy, a._x, a._y, b._x, b._y);
      if (d < tol && d < bestD) {
        bestD = d;
        best = { ...e };
      }
    }
    return best;
  }

  _hoverAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * this.dpr;
    const py = (clientY - rect.top) * this.dpr;
    const { x: wx, y: wy } = this._screenToWorld(px, py);
    const hit = this._pickNode(wx, wy);
    if (!hit) {
      const edge = this._pickEdge(wx, wy);
      if (!edge) {
        this._hideTooltip();
        return;
      }
      this._showEdgeTooltip(edge, px, py);
      return;
    }
    this._showTooltip(hit, px, py);
  }

  _showTooltip(node, px, py) {
    if (!this.tooltipEl) return;
    const kind = node.kind || "unknown";
    const created = node.created ? new Date(Number(node.created)).toISOString() : "-";
    const updated = node.updated ? new Date(Number(node.updated)).toISOString() : "-";
    this.tooltipEl.innerHTML = `
      <div><span class="tag">${kind}</span> <span class="mono">${escapeHtml(node.id)}</span></div>
      <div class="muted" style="margin-top:6px;">${escapeHtml(node.label || "")}</div>
      <div class="muted" style="margin-top:6px;">created=${escapeHtml(created)} updated=${escapeHtml(updated)}</div>
    `;
    this.tooltipEl.style.left = `${Math.round(px / this.dpr + 12)}px`;
    this.tooltipEl.style.top = `${Math.round(py / this.dpr + 12)}px`;
    this.tooltipEl.style.display = "block";
  }

  _showEdgeTooltip(edge, px, py) {
    if (!this.tooltipEl) return;
    const props = edge.props || {};
    const keys = Object.keys(props).slice(0, 8);
    const kv = keys.map((k) => `${k}=${String(props[k])}`).join(", ");
    this.tooltipEl.innerHTML = `
      <div><span class="tag">edge</span> <span class="mono">${escapeHtml(edge.type || "-")}</span></div>
      <div class="muted" style="margin-top:6px;">${escapeHtml(edge.source)} → ${escapeHtml(edge.target)}</div>
      <div class="muted" style="margin-top:6px;">${escapeHtml(kv || "no props")}</div>
    `;
    this.tooltipEl.style.left = `${Math.round(px / this.dpr + 12)}px`;
    this.tooltipEl.style.top = `${Math.round(py / this.dpr + 12)}px`;
    this.tooltipEl.style.display = "block";
  }

  _hideTooltip() {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = "none";
  }

  render() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._render());
  }

  _tickSimulation() {
    if (!this._sim || this.nodes.length === 0) return false;
    const s = this._sim;
    if (s.alpha < s.alphaMin) return false;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of this.nodes) {
      if (typeof n._x !== "number" || typeof n._y !== "number") continue;
      if (n._x < minX) minX = n._x;
      if (n._y < minY) minY = n._y;
      if (n._x > maxX) maxX = n._x;
      if (n._y > maxY) maxY = n._y;
    }
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      const rect = this.canvas.getBoundingClientRect();
      minX = 0;
      minY = 0;
      maxX = rect.width;
      maxY = rect.height;
    }

    const x0 = minX - s.boundsPad;
    const y0 = minY - s.boundsPad;
    const x1 = maxX + s.boundsPad;
    const y1 = maxY + s.boundsPad;
    const tree = buildQuadtree(this.nodes, x0, y0, x1, y1);

    for (const n of this.nodes) {
      applyRepulsion(tree, n, s.charge * s.alpha, s.theta, s.jitter);
    }

    for (const e of this.edges) {
      const a = this.nodeIndex.get(e.source);
      const b = this.nodeIndex.get(e.target);
      if (!a || !b) continue;
      let dx = b._x - a._x;
      let dy = b._y - a._y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const diff = dist - s.linkDistance;
      const k = s.linkStrength * s.alpha;
      dx /= dist;
      dy /= dist;
      const fx = diff * dx * k;
      const fy = diff * dy * k;
      a._vx += fx;
      a._vy += fy;
      b._vx -= fx;
      b._vy -= fy;
    }

    for (const n of this.nodes) {
      n._vx += (s.cx - n._x) * s.centerStrength * s.alpha;
      n._vy += (s.cy - n._y) * s.centerStrength * s.alpha;

      n._vx *= s.velocityDecay;
      n._vy *= s.velocityDecay;
      n._x += n._vx;
      n._y += n._vy;
    }

    s.alpha *= 1 - s.alphaDecay;
    return true;
  }

  _render() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    const didTick = this._tickSimulation();

    const hasSelection = Boolean(this.selected.nodeId || this.selected.edge);
    const focusMode = Boolean(hasSelection || this.searchTerm || this.highlightSinceMs);

    // Keep edges readable even when searching/highlighting; only dim them when a specific node/edge is selected.
    const baseEdgeAlpha = hasSelection ? 0.10 : 0.22;
    ctx.lineWidth = 1 / this.scale;
    ctx.strokeStyle = `rgba(80, 210, 255, ${baseEdgeAlpha})`;
	    for (const e of this.edges) {
      const a = this.nodeIndex.get(e.source);
      const b = this.nodeIndex.get(e.target);
      if (!a || !b) continue;
      const isSelected =
        this.selected.edge &&
        this.selected.edge.source === e.source &&
        this.selected.edge.target === e.target &&
        this.selected.edge.type === e.type;
      const isLinkedToSelectedNode =
        this.selected.nodeId && (this.selected.nodeId === e.source || this.selected.nodeId === e.target);
      ctx.beginPath();
      ctx.moveTo(a._x, a._y);
      ctx.lineTo(b._x, b._y);
	      if (isSelected) {
	        ctx.save();
	        ctx.strokeStyle = "rgba(0, 255, 214, 0.95)";
	        ctx.lineWidth = 3.2 / this.scale;
	        ctx.shadowColor = "rgba(0,255,214,0.35)";
	        ctx.shadowBlur = 16;
	        ctx.stroke();
	        ctx.restore();
      } else if (isLinkedToSelectedNode) {
        ctx.save();
        ctx.strokeStyle = "rgba(0, 255, 214, 0.55)";
        ctx.lineWidth = 2.0 / this.scale;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.stroke();
      }
	    }

    const tNow = nowMs();
    for (const n of this.nodes) {
      const kind = n.kind || "unknown";
      const color = KIND_COLORS[kind] || KIND_COLORS.unknown;
      const shape = KIND_SHAPES[kind] || "circle";

      const isRecent =
        this.highlightSinceMs != null &&
        (Number(n.created || 0) >= this.highlightSinceMs || Number(n.updated || 0) >= this.highlightSinceMs);
      const matchesSearch =
        this.searchTerm &&
        ((n.id || "").toLowerCase().includes(this.searchTerm) || (n.label || "").toLowerCase().includes(this.searchTerm));
      const isSelectedNode = this.selected.nodeId && this.selected.nodeId === n.id;
      const isSelectedEdgeEndpoint =
        this.selected.edge && (this.selected.edge.source === n.id || this.selected.edge.target === n.id);

      const baseR = 6;
      const r = isRecent ? baseR + 2.2 + 1.2 * Math.sin((tNow / 220) % (Math.PI * 2)) : baseR;

      const dimAlpha = focusMode ? 0.06 : 0.16;
      const recentAlpha = 0.75;
      const endpointAlpha = 0.88;
      const selectedAlpha = 1.0;
      const searchAlpha = 0.92;
	      const alpha = isSelectedNode
	        ? selectedAlpha
	        : isSelectedEdgeEndpoint
	          ? endpointAlpha
	          : matchesSearch
	            ? searchAlpha
	            : isRecent
	              ? recentAlpha
	              : dimAlpha;

      const isDim = !(isSelectedNode || isSelectedEdgeEndpoint || matchesSearch || isRecent);
      const fill = this.dimMode && isDim ? "#8aa0b6" : color;

      ctx.save();
      ctx.globalAlpha = alpha;
      drawNodeShape(ctx, shape, n._x, n._y, r, fill);
      ctx.restore();

	      if (isSelectedNode || isSelectedEdgeEndpoint || isRecent || matchesSearch) {
	        const ringAlpha = isSelectedNode ? 0.95 : isSelectedEdgeEndpoint ? 0.82 : matchesSearch ? 0.75 : 0.55;
	        ctx.save();
	        ctx.strokeStyle = `rgba(0, 255, 214, ${ringAlpha})`;
	        ctx.lineWidth = (isSelectedNode ? 3.6 : isSelectedEdgeEndpoint ? 3.0 : 2.4) / this.scale;
	        ctx.shadowColor = "rgba(0,255,214,0.38)";
	        ctx.shadowBlur = isSelectedNode ? 22 : isSelectedEdgeEndpoint ? 18 : 14;
	        drawNodeStroke(ctx, shape, n._x, n._y, r + (isSelectedNode ? 2.2 : 1.2));
	        ctx.restore();
	      }
	    }

    ctx.restore();

    if (didTick) this.render();
  }
}

function drawNodeShape(ctx, shape, x, y, r, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  pathForShape(ctx, shape, x, y, r);
  ctx.fill();
  ctx.restore();
}

function drawNodeStroke(ctx, shape, x, y, r) {
  ctx.beginPath();
  pathForShape(ctx, shape, x, y, r);
  ctx.stroke();
}

function pathForShape(ctx, shape, x, y, r) {
  if (shape === "square") {
    ctx.rect(x - r, y - r, r * 2, r * 2);
    return;
  }
  if (shape === "triangle") {
    polygon(ctx, x, y, r * 1.25, 3, -Math.PI / 2);
    return;
  }
  if (shape === "diamond") {
    ctx.moveTo(x, y - r * 1.25);
    ctx.lineTo(x + r * 1.1, y);
    ctx.lineTo(x, y + r * 1.25);
    ctx.lineTo(x - r * 1.1, y);
    ctx.closePath();
    return;
  }
  if (shape === "hexagon") {
    polygon(ctx, x, y, r * 1.2, 6, Math.PI / 6);
    return;
  }
  if (shape === "pentagon") {
    polygon(ctx, x, y, r * 1.25, 5, -Math.PI / 2);
    return;
  }
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function polygon(ctx, x, y, radius, sides, rotate) {
  for (let i = 0; i < sides; i++) {
    const a = rotate + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
