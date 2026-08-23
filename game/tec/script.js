// --- tec/script.js (研究側の完全修正版) ---

let completedTechs = [];
let allTechsMap = {}; // 全カテゴリの技術データをIDで引き出せるように保持

// ローカルストレージから完了した研究をロード
function loadCompletedTechs() {
  try {
    const raw = localStorage.getItem('completedTechs');
    if (raw) {
      const parsed = JSON.parse(raw);
      completedTechs = parsed.map(item => String(typeof item === 'object' && item !== null ? (item.id || item.techId) : item)).filter(Boolean);
    } else {
      completedTechs = [];
    }
  } catch (e) {
    completedTechs = [];
  }
}

// 完了した研究をローカルストレージに保存（重複なし）
function saveCompletedTechs() {
  const unique = Array.from(new Set(completedTechs.map(String)));
  localStorage.setItem('completedTechs', JSON.stringify(unique));
  // 別タブや別画面（生産画面など）にストレージ変更を即時通知
  window.dispatchEvent(new Event('storage'));
}

// 技術データを全カテゴリ分ロードしてマップ化する
async function loadAllTechsData() {
  const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
  for (const cat of categories) {
    try {
      const res = await fetch(`data/tech_${cat}.json`);
      if (res.ok) {
        const list = await res.json();
        list.forEach(tech => {
          const uniqueId = String(tech.id || tech.techId);
          if (uniqueId) {
            allTechsMap[uniqueId] = tech;
          }
        });
      }
    } catch (e) {
      console.error(`Failed to load data/tech_${cat}.json`, e);
    }
  }
}

// 研究完了をトリガーする関数（研究が完了したタイミングで呼び出してください）
// 例: completeTech("infantry_1") のように使います
window.completeTech = function(techId) {
  const strId = String(techId);
  if (!completedTechs.includes(strId)) {
    completedTechs.push(strId);
    saveCompletedTechs();
    console.log(`研究完了を保存しました: ${strId}`);
  }
};

// 画面読み込み時の初期化
document.addEventListener('DOMContentLoaded', async () => {
  loadCompletedTechs();
  await loadAllTechsData();

  // もし既存の研究ツリー側に「研究完了ボタン」や「自動完了判定」がある場合、
  // そこから上記の大域関数 `window.completeTech(id)` を呼び出すように組み込んでください。
});
