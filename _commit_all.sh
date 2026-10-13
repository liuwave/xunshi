#!/usr/bin/env bash
# 逐桶提交 xunshi-data：一次只加一个桶（1000 个文件），可观测、可续跑。
# 教训：一次性 git add 50 个桶（5 万文件）有病态开销，20 分钟没出一片；
#       单个桶单独加实测 1.8 秒。
set -uo pipefail
cd /c/work/project/xunshi-data || exit 1

LOG=/tmp/xunshi-data-commit.log
exec > >(tee -a "$LOG") 2>&1

# 已提交过的桶直接跳过（续跑安全）
committed_dirs() { git log --pretty=format: --name-only 2>/dev/null | grep -o '^data/[0-9]\{3\}$' | sort -u; }

mapfile -t BUCKETS < <(ls data | sort)
DONE=$(committed_dirs)
TOTAL=${#BUCKETS[@]}
COMMIT_EVERY=25

echo "[$(date +%H:%M:%S)] 开始：共 $TOTAL 个桶，已完成 $(echo "$DONE" | grep -c . ) 个"

i=0
pending=0
for b in "${BUCKETS[@]}"; do
  if echo "$DONE" | grep -qx "data/$b"; then continue; fi
  t0=$(date +%s)
  git add -- "data/$b"
  rc=$?
  t1=$(date +%s)
  i=$((i + 1))
  pending=$((pending + 1))
  echo "[$(date +%H:%M:%S)] add data/$b  用时=$((t1 - t0))s  本轮第 $i 个  (rc=$rc)"
  if [ $pending -ge $COMMIT_EVERY ]; then
    git -c user.name=liuwave -c user.email=liuwave@users.noreply.github.com \
      commit -q -m "data: 诗词 JSON 桶 $(printf '%03d' $((i - pending + 1))) 起 $pending 个桶"
    echo "[$(date +%H:%M:%S)] commit #$(git log --oneline | wc -l)，tracked=$(git ls-files | wc -l)"
    pending=0
  fi
done

if [ $pending -gt 0 ]; then
  git -c user.name=liuwave -c user.email=liuwave@users.noreply.github.com \
    commit -q -m "data: 诗词 JSON 桶 收尾 $pending 个桶"
fi

echo "[$(date +%H:%M:%S)] ALL DONE: commits=$(git log --oneline | wc -l) tracked=$(git ls-files | wc -l)"
