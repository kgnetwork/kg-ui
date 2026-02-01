# kg-ui 文件/日志目录集成 SOP（递归目录浏览）

本 SOP 说明如何将 kg-ui 与 Nginx 目录索引集成，在侧栏提供“文件/日志”入口，并支持**递归目录浏览 + 新窗口打开文件**。

---

## 1. 前置条件
- Nginx 版本：`1.24.0`（Ubuntu 包默认支持 `autoindex_format`）。
- 站点根目录：`/var/www/html`。
- 需要展示的目录：`/var/www/html/files` 与 `/var/www/html/task-logs`。
- kg-ui 已部署可访问（建议同域）。

---

## 2. Nginx 配置（必须）
**如果通过 `fileserver.local` 访问 UI，务必在第一个 `server` 中声明 `/files/` 与 `/logs/`，避免被 `/` 代理吞掉。**

示例（摘录）：

```nginx
server {
    listen 80;
    server_name fileserver.local ubuntu-pn51.local;

    location ^~ /files/ {
        alias /var/www/html/files/;
        autoindex on;
        autoindex_format json;
        autoindex_exact_size off;
        autoindex_localtime on;
    }

    location ^~ /logs/ {
        alias /var/www/html/task-logs/;
        autoindex on;
        autoindex_format json;
        autoindex_exact_size off;
        autoindex_localtime on;
    }

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

验证：
```bash
sudo nginx -t
sudo systemctl reload nginx
```

检查 JSON 目录：
- `http://fileserver.local/files/`（应返回 JSON）
- `http://fileserver.local/logs/`（应返回 JSON）

---

## 3. kg-ui 配置（config.json）
在 `kg-ui/config.json` 中增加多目录配置：

```json
"defaults": {
  "ui": "network",
  "timeout_ms": 30000,
  "file_browsers": [
    {
      "id": "files",
      "title": "任务文件",
      "path": "/files/",
      "mode": "autoindex-json",
      "open_target": "_blank"
    },
    {
      "id": "task-logs",
      "title": "任务日志",
      "path": "/logs/",
      "mode": "autoindex-json",
      "open_target": "_blank"
    }
  ]
}
```

说明：
- `path` 为相对路径，UI 会自动拼接 `window.location.origin`。
- `open_target` 固定 `_blank`，文件点击后新窗口打开。

---

## 4. 用户使用说明（UI 操作）
1) 打开 kg-ui，左侧栏点击 **“文件/日志”**。
2) 选择目录（任务文件 / 任务日志）。
3) **目录进入**：点击“进入”可下钻子目录。
4) **返回上级**：点击“返回上级”回到父目录。
5) **面包屑导航**：可直接跳回任意层级。
6) **文件打开**：点击“打开”将文件在新窗口打开（`target=_blank`）。
7) 若需要排查 JSON 原始输出，可点击“打开原始目录”。

---

## 5. 常见问题
**1）目录加载失败**
- 确认 Nginx 已启用 `autoindex_format json`。
- 确认访问 `http://<host>/files/` 返回 JSON。

**2）点击目录仍打开 JSON**
- 确认 UI 已更新到“递归目录浏览”版本。

**3）跨域问题**
- 建议 UI 与文件目录同域。
- 若不同域，需要在 Nginx 上加 `Access-Control-Allow-Origin`。

---

## 6. 回滚方式
- 删除 Nginx 中 `/files/` `/logs/` 的 `autoindex_format json`。
- 移除 `config.json` 中 `file_browsers` 段落。
- 重新加载 Nginx。

---

完成以上步骤后，用户即可在 kg-ui 中通过侧栏统一入口完成目录浏览与文件下载。
