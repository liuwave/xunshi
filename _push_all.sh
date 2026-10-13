#!/usr/bin/env bash
# 分批推送 xunshi-data。
# 一次性推 0.8GB 会被掐断（schannel: server closed abruptly），
# 改为按 commit 分批：每批只传服务器还没有的增量对象。
set -uo pipefail
cd /c/work/project/xunshi-data || exit 1

LOG=/tmp/xunshi-push.log
: > "$LOG"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

# Windows 上 schannel 对大传输不稳定，换 OpenSSL 后端
git config http.sslBackend openssl
git config http.postBuffer 524288000
git config http.lowSpeedLimit 1024
git config http.lowSpeedTime 600

mapfile -t SHAS < <(git log --reverse --format=%H main)
TOTAL=${#SHAS[@]}
STEP=3
log "共 $TOTAL 个 commit，每 $STEP 个推一次"

push_one() {
  local sha=$1
  for attempt in 1 2 3; do
    if git push origin "${sha}:refs/heads/main" >>"$LOG" 2>&1; then
      return 0
    fi
    log "  失败（第 $attempt 次）：$sha，等待 20s 重试"
    sleep 20
  done
  return 1
}

i=$((STEP - 1))
while [ $i -lt "$TOTAL" ]; do
  sha=${SHAS[$i]}
  log "推送 $((i + 1))/$TOTAL  ${sha:0:8}"
  if ! push_one "$sha"; then
    log "ERROR: 卡在 ${sha:0:8}，终止。已推送的保留在远端，重跑本脚本会继续。"
    exit 1
  fi
  i=$((i + STEP))
done

# 收尾：确保 HEAD 完整推上去
log "收尾推送 HEAD"
if ! push_one "${SHAS[$((TOTAL - 1))]}"; then
  log "ERROR: 收尾失败"
  exit 1
fi
git push -u origin main >>"$LOG" 2>&1
log "ALL DONE exit=$?"
