#!/bin/sh
# Dependencies are installed by Compose; only incomplete work is retried.
set -eu
SCRIPT="game/assets/scraper/scrape_wiki_assets.py"
MODE="${SCRAPER_MODE:-wayback}"
# Zero means keep resuming until verified complete (or an execution error).
MAX_PASSES="${SCRAPER_MAX_PASSES:-0}"
if [ -n "${SCRAPER_ONLY:-}" ]; then
  set -- --only "$SCRAPER_ONLY"
else
  set -- --all
fi
pass=0
while [ "$MAX_PASSES" -eq 0 ] || [ "$pass" -lt "$MAX_PASSES" ]; do
  pass=$((pass + 1))
  echo "=== scraper pass ${pass}/${MAX_PASSES} ==="
  # Discover across EVERY target first. Slow/unavailable image binaries must
  # not keep categories later in the list from being discovered.
  for stage in discovery download; do
    code=0
    if [ "$stage" = discovery ]; then
      python3 "$SCRIPT" --mode "$MODE" "$@" --skip-done --download-budget 0 || code=$?
    else
      python3 "$SCRIPT" --mode "$MODE" "$@" --skip-done || code=$?
    fi
    if [ "$code" -gt 1 ]; then
      echo "実行エラー（終了コード ${code}）。進捗を保持して停止します。"
      exit "$code"
    fi
  done
  if python3 "$SCRIPT" --mode "$MODE" "$@" --status; then
    echo "=== 全カテゴリの巡回・画像保存が完了 ==="
    exit 0
  fi
  if [ "$MAX_PASSES" -eq 0 ] || [ "$pass" -lt "$MAX_PASSES" ]; then
    delay=$(python3 - "$MODE" "$pass" <<'PY'
import json, math, sys, time
from pathlib import Path
state = Path("game/assets/scraper/.state")
cooldown = state / f"{sys.argv[1]}-cooldown.json"
resume_at = json.loads(cooldown.read_text()).get("resume_at", 0) if cooldown.exists() else 0
progress_path = state / f"{sys.argv[1]}-loop-progress.json"
previous = json.loads(progress_path.read_text()) if progress_path.exists() else {}
signature = []
for path in sorted(Path("game/assets/mappings").glob("*.json")):
    mapping = json.loads(path.read_text())
    signature.append([mapping.get("id"), mapping.get("count", 0), mapping.get("count_names", 0),
                      mapping.get("pages_visited", 0), mapping.get("complete", False)])
progressed = previous.get("signature") != signature
idle = 0 if progressed else previous.get("idle_passes", 0) + 1
state.mkdir(parents=True, exist_ok=True)
temporary = progress_path.with_suffix(".tmp")
temporary.write_text(json.dumps({"signature": signature, "idle_passes": idle}))
temporary.replace(progress_path)
backoff = 0 if progressed else min(120 * 2 ** min(idle - 1, 4), 1800)
print(max(backoff, 0, math.ceil(resume_at - time.time())))
PY
)
    echo "未完了分を ${delay} 秒冷却後に再開します。"
    sleep "$delay"
  fi
done
echo "=== 再試行上限に到達。未取得分あり（完了ではありません） ==="
exit 1
