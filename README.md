
## 本地开发

### 启动后端

```bash
cd kg-network
export SERVER_IP=192.168.1.60
export ALGO_SERVER_URL=http://192.168.1.5:5002
export UI_DATA_DIR=/opt/var/tmp
export DATA_DIR=/opt/var/tmp
export ACCESS_LOG_FILE=/opt/var/tmp/access.log

# 本机neo4j已经启动
flask run
```

### 启动前端
 
```bash
cd kg-ui
python3 -m http.server 8000
```