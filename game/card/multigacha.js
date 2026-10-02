/* ==========================================================
 * multigacha.js — 10連ガチャ（11連目SSR確定枠）共通モジュール
 * 全カードパック (GER / JAP / SOV / WORLD) から読み込まれる。
 * 依存: 各パックscript.jsのグローバル `leaders` / `unlockCard`、
 *       quiz.jsの window.CardShop (コイン管理)
 * 仕様:
 *  - 10連ガチャ (900コイン) を引くと、11連目として確定で
 *    最高レアリティ (SSR) のカードが排出される。
 *  - 単発ガチャ (100コイン) の連続未SSR回数 (pity) もカウントし、
 *    pityが10に達した次の単発はSSR確定 (天井)。
 * ========================================================== */
(function () {
  'use strict';

  var NATION = (document.body && document.body.dataset.nation) || 'WORLD';
  var PITY_KEY = NATION.toLowerCase() + '_gacha_pity';
  var COST_TEN = 900;

  var RANK_STYLE = {
    SSR: { color: '#ff4d4d', bg: 'linear-gradient(160deg,#2a0a0a,#4a1010)', border: '#ff4d4d', label: 'SSR' },
    SR:  { color: '#c9a227', bg: 'linear-gradient(160deg,#1c1a10,#3a3212)', border: '#c9a227', label: 'SR' },
    R:   { color: '#9fb3c8', bg: 'linear-gradient(160deg,#10141a,#1e2630)', border: '#9fb3c8', label: 'R' }
  };

  function getPity() {
    return parseInt(localStorage.getItem(PITY_KEY) || '0', 10);
  }
  function setPity(v) {
    localStorage.setItem(PITY_KEY, String(v));
  }
  function updatePityUI() {
    var el = document.getElementById('multigacha-pity');
    if (el) el.textContent = '次回SSR確定まで: ' + (10 - getPity()) + '回';
  }

  function randomLeader() {
    return leaders[Math.floor(Math.random() * leaders.length)];
  }
  function randomSSR() {
    var ssr = leaders.filter(function (l) { return l.rank === 'SSR'; });
    var pool = ssr.length > 0 ? ssr : leaders;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** 単発1回の抽選 (pity天井を適用) */
  function drawSingle() {
    var pity = getPity();
    var picked;
    if (pity >= 10) {
      picked = randomSSR(); // 天井到達: SSR確定
    } else {
      picked = randomLeader();
      if (picked.rank === 'SSR') setPity(0);
      else setPity(pity + 1);
    }
    return picked;
  }

  /** 10連ガチャ: 10回の抽選 + 11連目は確定SSR */
  function drawTen() {
    var results = [];
    for (var i = 0; i < 10; i++) results.push(drawSingle());
    // --- 11連目: 最高レアリティ (SSR) 確定枠 ---
    var guaranteed = randomSSR();
    guaranteed.__guaranteed = true;
    results.push(guaranteed);
    setPity(0); // 確定枠で天井リセット
    return results;
  }

  function spend(cost, onError) {
    if (window.CardShop && !window.CardShop.spendCoins(cost)) {
      if (onError) onError();
      return false;
    }
    return true;
  }

  /* ---------- 結果表示オーバーレイ ---------- */
  function ensureOverlay() {
    var ov = document.getElementById('multigacha-overlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'multigacha-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:10000;display:none;flex-direction:column;align-items:center;justify-content:center;overflow:auto;';
    ov.innerHTML =
      '<h2 style="color:#ffd700;letter-spacing:2px;text-shadow:0 0 10px rgba(255,215,0,0.4);margin:12px 0 4px;">ガチャ結果</h2>' +
      '<div id="multigacha-grid" style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:900px;padding:12px;"></div>' +
      '<div style="display:flex;gap:12px;margin:10px;">' +
      '<button id="multigacha-again" style="padding:10px 22px;border:none;border-radius:20px;background:#ffd700;color:#222;font-weight:bold;cursor:pointer;">もう一度10連 (900コイン)</button>' +
      '<button id="multigacha-close" style="padding:10px 22px;border:none;border-radius:20px;background:#555;color:#fff;font-weight:bold;cursor:pointer;">閉じる</button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('#multigacha-close').addEventListener('click', function () { ov.style.display = 'none'; });
    ov.querySelector('#multigacha-again').addEventListener('click', function () { runTenPull(); });
    return ov;
  }

  function cardHTML(leader, idx, total) {
    var st = RANK_STYLE[leader.rank] || RANK_STYLE.R;
    var guaranteed = !!leader.__guaranteed;
    var img = leader.imgUrl
      ? '<img src="' + leader.imgUrl + '" style="width:100%;height:120px;object-fit:cover;border-radius:6px 6px 0 0;" onerror="this.style.display=\'none\'">'
      : '';
    return '<div style="width:150px;background:' + st.bg + ';border:2px solid ' + (guaranteed ? '#ffd700' : st.border) + ';' +
      (guaranteed ? 'box-shadow:0 0 14px rgba(255,215,0,0.6);' : '') +
      'border-radius:8px;overflow:hidden;text-align:center;position:relative;">' +
      (guaranteed ? '<div style="position:absolute;top:4px;right:4px;background:#ffd700;color:#222;font-size:10px;font-weight:bold;padding:2px 6px;border-radius:8px;">🎯 SSR確定枠</div>' : '') +
      '<div style="height:120px;background:#000;">' + img + '</div>' +
      '<div style="padding:6px 4px;">' +
      '<div style="color:#fff;font-size:12px;font-weight:bold;line-height:1.3;min-height:31px;">' + leader.name + '</div>' +
      '<div style="color:' + st.color + ';font-weight:bold;font-size:14px;margin-top:3px;">★' + st.label + '</div>' +
      '<div style="color:#999;font-size:10px;margin-top:2px;">' + (idx + 1) + '/' + total + '連目</div>' +
      '</div></div>';
  }

  function showResults(results) {
    var ov = ensureOverlay();
    var grid = ov.querySelector('#multigacha-grid');
    var html = '';
    results.forEach(function (l, i) { html += cardHTML(l, i, results.length); });
    grid.innerHTML = html;
    ov.style.display = 'flex';
    updatePityUI();
    if (window.CardShop) window.CardShop.updateCoinDisplay();
  }

  function notifyShort(msg) {
    var el = document.getElementById('instruction');
    if (el) {
      var prev = el.innerText;
      el.innerText = msg;
      setTimeout(function () { el.innerText = prev; }, 2500);
    }
  }

  function runTenPull() {
    if (window.CardShop && !window.CardShop.spendCoins(COST_TEN)) {
      notifyShort('コインが足りません！クイズで獲得できます');
      return;
    }
    var results = drawTen();
    results.forEach(function (l) { if (l.id && typeof unlockCard === 'function') unlockCard(l.id); });
    showResults(results);
  }

  /* ---------- ボタン注入 ---------- */
  function inject() {
    if (typeof leaders === 'undefined' || !leaders || leaders.length === 0) return;
    var center = document.getElementById('center-area');
    if (!center) return;
    var btn = document.createElement('button');
    btn.id = 'multigacha-btn';
    btn.style.cssText = 'display:block;margin:10px auto;padding:10px 26px;border:none;border-radius:20px;' +
      'background:linear-gradient(90deg,#ffd700,#ffb700);color:#222;font-weight:bold;font-size:15px;cursor:pointer;' +
      'box-shadow:0 4px 14px rgba(255,215,0,0.35);';
    btn.textContent = '🪙 10連ガチャ (900コイン) — 11連目SSR確定!';
    btn.addEventListener('click', runTenPull);
    var pity = document.createElement('div');
    pity.id = 'multigacha-pity';
    pity.style.cssText = 'text-align:center;color:#c9a227;font-size:12px;margin-top:4px;';
    var ref = document.getElementById('purchase-btn');
    if (ref && ref.parentNode === center) {
      ref.insertAdjacentElement('afterend', pity);
      ref.insertAdjacentElement('afterend', btn);
    } else {
      center.appendChild(btn);
      center.appendChild(pity);
    }
    updatePityUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
