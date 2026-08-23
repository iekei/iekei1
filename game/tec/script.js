// --- tec/script.js (研究側の修正完全版) ---
let completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');

// ローカルストレージへの保存を確実に行うヘルパー
function saveCompletedTechs() {
  // 重複を除外して保存
  const unique = Array.from(new Set(completedTechs.map(String)));
  localStorage.setItem('completedTechs', JSON.stringify(unique));
}

// 研究完了時の処理（例として関数が存在する前提、あるいは既存の完了処理に組み込んでください）
function completeResearch(techId) {
  const strId = String(techId);
  if (!completedTechs.includes(strId)) {
    completedTechs.push(strId);
    saveCompletedTechs();
  }
}

// ※もし既存の研究完了ロジックですでに completedTechs をいじっている場合は、
// 完了時に必ず `localStorage.setItem('completedTechs', JSON.stringify(completedTechs));` 
// が実行されるように確認してください。
