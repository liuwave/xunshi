#!/usr/bin/env bash
# 续推 xunshi-data：从远端已有的位置之后，逐个 commit 推。
# 走的是 HTTP 代理，大上传会被掐（CONNECT 502 / curl 55），所以每批要小。
set -uo pipefail
cd /c/work/project/xunshi-data || exit 1

LOG=/tmp/xunshi-push2.log
: > "$LOG"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

# 撤掉会误杀「慢但仍在传」的阈值（curl 28 就是这个触发的）
git config --unset http.lowSpeedLimit 2>/dev/null
git config --unset http.lowSpeedTime 2>/dev/null
git config http.sslBackend openssl
git config http.postBuffer 524288000

# 远端当前位置
REMOTE=$(timeout 60 git ls-remote origin refs/heads/main 2>/dev/null | awk '{print $1}')
log "远端当前：$REMOTE"

mapfile -t SHAS < <(git log --reverse --format=%H main)
TOTAL=${#SHAS[@]}

# 找到远端位置在列表中的下标，从它之后开始
start=0
for i in "${!SHAS[@]}"; do
  if [ "${SHAS[$i]}" = "$REMOTE" ]; then start=$((i + 1)); fi
done
log "共 $TOTAL 个 commit，从第 $((start + 1)) 个开始续推（剩 $((TOTAL - start)) 个）"

push_one() {
  local sha=$1
  for attempt in 1 2 3 4 5; do
    if git push origin "${sha}:refs/heads/main" >>"$LOG" 2>&1; then return 0; fi
    log "  第 $attempt 次失败：${sha:0:8}，退避 45s"
    sleep 45
  done
  return 1
}

for ((i = start; i < TOTAL; i++)); do
  log "推送 $((i + 1))/$TOTAL  ${SHAS[$i]:0:8}"
  if ! push_one "${SHAS[$i]}"; then
    log "ERROR: 卡在 $((i + 1))/$TOTAL ${SHAS[$i]:0:8}。远端保留已推部分，重跑本脚本可续。"
    exit 1
  fi
done

git push -u origin main >>"$LOG" 2>&1
log "ALL DONE exit=$?"
