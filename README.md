
## 本地开发

> 假设本机 IP 为 `192.168.1.5`，下面配置需要按照实际情况调整，除了环境变量外，还需要重点调整`config.json`的内容。

### 启动后端

#### kg-network

```bash
cd kg-network
export SERVER_IP=192.168.1.60
export ALGO_SERVER_URL=http://192.168.1.5:5002
export UI_DATA_DIR=/opt/var/tmp
export DATA_DIR=/opt/var/tmp
export ACCESS_LOG_FILE=/opt/var/tmp/access.log

# 本机neo4j已经启动
flask run
# flask run --host=0.0.0.0
```

#### kg-proxy

```bash
cd kg-proxy
export SERVICE_ENDPOINTS=http://192.168.1.60:5000,http://192.168.1.52:5000
export CENTER_SERVICE_URL=http://192.168.1.60:5000
export AUTONOMY_URL=http://192.168.1.5:5000
flask run --port=5001 --host=0.0.0.0
```

#### znt-agent

```bash
cd znt-agent/app
export BROKER_URL=http://192.168.1.5:5001
export AGENT_NAME=I_node_888
export DICT_PATH=/opt/etc/agent/dict.yaml
export AGENT_PORT=8888
export SEMPROTOCOL_ENABLED=true
export SEMPROTOCOL_DB_PATH=/opt/etc/agent/vec.db
export JSONFILE_PATH=/tmp/I_node_888.json
export LOCAL_SERVICE_ADDR=192.168.1.5:8888
export AUTO_CORRECTION_ENABLED=true

go run main.go
```


### 启动前端
 
```bash
cd kg-ui
python3 -m http.server 8000
```