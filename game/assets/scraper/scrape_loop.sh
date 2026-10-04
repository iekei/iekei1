#!/bin/sh
# Dependencies are installed by Compose; only incomplete work is retried.
set -eu
SCRIPT="game/assets/scraper/scrape_wiki_assets.py"
MODE="${SCRAPER_MODE:-wayback}"
MAX_PASSES="${SCRAPER_MAX_PASSES:-10}"
pass=0
while [ "$pass" -lt "$MAX_PASSES" ]; do
  pass=$((pass + 1))
  echo "=== scraper pass ${pass}/${MAX_PASSES} ==="
  code=0
  python3 "$SCRIPT" --mode "$MODE" --all --skip-done || code=$?
  if [ "$code" -gt 1 ]; then
    echo "実行エラー（終了コード ${code}）。進捗を保持して停止します。"
    exit "$code"
  fi
  if python3 "$SCRIPT" --mode "$MODE" --all --status; then
    echo "=== 全カテゴリの巡回・画像保存が完了 ==="
    exit 0
  fi
  if [ "$pass" -lt "$MAX_PASSES" ]; then
    delay=$(python3 - "$MODE" "$pass" <<'PY'
import json, math, sys, time
from pathlib import Path
cooldown = Path(f"game/assets/scraper/.state/{sys.argv[1]}-cooldown.json")
resume_at = json.loads(cooldown.read_text()).get("resume_at", 0) if cooldown.exists() else 0
print(max(min(120 * 2 ** (int(sys.argv[2]) - 1), 1800), math.ceil(resume_at - time.time())))
PY
)
    echo "未完了分を ${delay} 秒冷却後に再開します。"
    sleep "$delay"
  fi
done
echo "=== 再試行上限に到達。未取得分あり（完了ではありません） ==="
exit 1
