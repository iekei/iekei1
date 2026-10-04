/**
 * topbar-icons.js
 * HoI4風トップバーアイコン (インラインSVGデータURI)
 *
 * トップバーは常に表示されるため preload 対象。
 * 外部画像に依存しないよう、SVGをデータURIとしてインライン埋め込む。
 * 各アイコンは HoI4 のトップバーのステータスアイコン風デザイン。
 */

const TopbarIcons = {

  // SVG をデータURIにエンコード
  _toDataUri(svg) {
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  },

  // ── ステータスアイコン (左から順) ──

  // 政治力 (Political Power) — 鷲のシルエット
  politicalPower: null, // init で生成

  // 安定度 (Stability) — 盾アイコン
  stability: null,

  // 戦争協力度 (War Support) — 握り拳
  warSupport: null,

  // 人的資源 (Manpower) — 人型
  manpower: null,

  // 工場数 (Factories) — 工場アイコン
  factories: null,

  // 燃料 (Fuel) — 燃料タンク
  fuel: null,

  // 輸送船 (Convoys) — 船アイコン
  convoys: null,

  // ── トップメニューアイコン ──
  menu: {},

  // ── 初期化: 全SVGデータURIを生成 ──
  init() {
    const s = (svg) => TopbarIcons._toDataUri(svg);

    // 共通SVGラッパー (32x32, HoI4風カラーパレット)
    const wrap = (inner, size = 32) =>
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' + inner + '</svg>';

    // 政治力 — 星と鷲の簡易シンボル (HoI4: eagle/star)
    TopbarIcons.politicalPower = s(wrap(
      '<circle cx="16" cy="16" r="14" fill="#2a3a4a" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<path d="M16 6 L18.5 13 L26 13 L20 17.5 L22.5 25 L16 20.5 L9.5 25 L12 17.5 L6 13 L13.5 13 Z" fill="#c4ad72"/>' +
      '<circle cx="16" cy="16" r="2" fill="#2a3a4a"/>'
    ));

    // 安定度 — 盾
    TopbarIcons.stability = s(wrap(
      '<path d="M16 4 L26 8 L26 18 Q26 24 16 28 Q6 24 6 18 L6 8 Z" fill="#2a3a4a" stroke="#4ac46a" stroke-width="1.5"/>' +
      '<path d="M16 10 L20 12 L20 17 Q20 21 16 23 Q12 21 12 17 L12 12 Z" fill="#4ac46a" opacity="0.6"/>' +
      '<text x="16" y="20" text-anchor="middle" font-size="10" fill="#4ac46a" font-family="serif">S</text>'
    ));

    // 戦争協力度 — 握り拳 (シンプル化)
    TopbarIcons.warSupport = s(wrap(
      '<rect x="6" y="10" width="20" height="14" rx="3" fill="#2a3a4a" stroke="#d4843a" stroke-width="1.5"/>' +
      '<rect x="8" y="12" width="16" height="3" fill="#d4843a" opacity="0.5"/>' +
      '<rect x="8" y="16" width="16" height="3" fill="#d4843a" opacity="0.5"/>' +
      '<rect x="8" y="20" width="16" height="2" fill="#d4843a" opacity="0.5"/>' +
      '<path d="M10 10 Q10 6 16 6 Q22 6 22 10" fill="none" stroke="#d4843a" stroke-width="1.5"/>'
    ));

    // 人的資源 — 人型シルエット
    TopbarIcons.manpower = s(wrap(
      '<circle cx="16" cy="10" r="5" fill="#2a3a4a" stroke="#8a9aaa" stroke-width="1.5"/>' +
      '<path d="M8 28 Q8 18 16 18 Q24 18 24 28" fill="#2a3a4a" stroke="#8a9aaa" stroke-width="1.5"/>' +
      '<circle cx="14" cy="9" r="1" fill="#8a9aaa"/>' +
      '<circle cx="18" cy="9" r="1" fill="#8a9aaa"/>'
    ));

    // 工場数 — 工場の煙突
    TopbarIcons.factories = s(wrap(
      '<rect x="6" y="14" width="5" height="14" fill="#2a3a4a" stroke="#8a9aaa" stroke-width="1"/>' +
      '<rect x="13" y="10" width="5" height="18" fill="#2a3a4a" stroke="#8a9aaa" stroke-width="1"/>' +
      '<rect x="20" y="16" width="5" height="12" fill="#2a3a4a" stroke="#8a9aaa" stroke-width="1"/>' +
      '<path d="M7 14 Q7 10 8 8 M14 10 Q14 6 15 4 M21 16 Q21 12 22 10" fill="none" stroke="#8a9aaa" stroke-width="1" opacity="0.5"/>'
    ));

    // 燃料 — 燃料タンク
    TopbarIcons.fuel = s(wrap(
      '<rect x="8" y="8" width="16" height="20" rx="2" fill="#2a3a4a" stroke="#d4843a" stroke-width="1.5"/>' +
      '<rect x="10" y="10" width="12" height="8" fill="#d4843a" opacity="0.4"/>' +
      '<rect x="12" y="6" width="8" height="3" fill="none" stroke="#d4843a" stroke-width="1.5"/>' +
      '<path d="M14 14 L16 11 L18 14 L16 17 Z" fill="#d4843a"/>' +
      '<text x="16" y="24" text-anchor="middle" font-size="6" fill="#d4843a">F</text>'
    ));

    // 輸送船 — 船のシルエット
    TopbarIcons.convoys = s(wrap(
      '<path d="M4 22 L28 22 L25 28 L7 28 Z" fill="#2a3a4a" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<rect x="12" y="14" width="8" height="8" fill="#2a3a4a" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<rect x="14" y="10" width="4" height="4" fill="#2a3a4a" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<path d="M16 10 L16 6" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<path d="M16 6 L20 8 L16 8" fill="none" stroke="#4a8fc4" stroke-width="1"/>' +
      '<path d="M4 25 Q4 27 7 27 M28 25 Q28 27 25 27" fill="none" stroke="#4a8fc4" stroke-width="1" opacity="0.5"/>'
    ));

    // ── トップメニューアイコン ──
    // 研究 — 顕微鏡/フラスコ
    TopbarIcons.menu.research = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<path d="M11 8 L11 16 L10 20 L14 20 L13 16 L13 8 Z" fill="none" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<circle cx="12" cy="21" r="3" fill="#4a8fc4" opacity="0.4"/>' +
      '<path d="M18 10 L22 14 L18 18 L14 14 Z" fill="none" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<circle cx="18" cy="14" r="1.5" fill="#4a8fc4"/>'
    ));

    // 国家方針 — ツリー
    TopbarIcons.menu.focus = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<circle cx="16" cy="8" r="2.5" fill="#c4ad72"/>' +
      '<circle cx="10" cy="20" r="2.5" fill="#c4ad72" opacity="0.7"/>' +
      '<circle cx="22" cy="20" r="2.5" fill="#c4ad72" opacity="0.7"/>' +
      '<path d="M16 10.5 L16 14 M16 14 L10 17.5 M16 14 L22 17.5" stroke="#c4ad72" stroke-width="1.5" fill="none"/>'
    ));

    // 特別研究 — 原子記号
    TopbarIcons.menu.special = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#bd9260" stroke-width="1.5"/>' +
      '<circle cx="16" cy="16" r="2" fill="#bd9260"/>' +
      '<ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="#bd9260" stroke-width="1.2"/>' +
      '<ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="#bd9260" stroke-width="1.2" transform="rotate(60 16 16)"/>' +
      '<ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="#bd9260" stroke-width="1.2" transform="rotate(120 16 16)"/>'
    ));

    // 核攻撃 — キノコ雲
    TopbarIcons.menu.nuclear = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#c44a4a" stroke-width="1.5"/>' +
      '<path d="M10 22 Q10 16 16 14 Q22 16 22 22 Z" fill="#c44a4a" opacity="0.5"/>' +
      '<circle cx="16" cy="13" r="4" fill="#c44a4a" opacity="0.7"/>' +
      '<path d="M12 22 L12 25 M16 22 L16 25 M20 22 L20 25" stroke="#c44a4a" stroke-width="1.5"/>' +
      '<circle cx="16" cy="13" r="2" fill="#e05a5a"/>'
    ));

    // 建設 — クレーン
    TopbarIcons.menu.construction = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#8a9aaa" stroke-width="1.5"/>' +
      '<path d="M10 24 L10 10 L22 10" stroke="#8a9aaa" stroke-width="1.5" fill="none"/>' +
      '<path d="M10 10 L16 6 L22 10" stroke="#8a9aaa" stroke-width="1.5" fill="none"/>' +
      '<rect x="13" y="12" width="4" height="6" fill="#8a9aaa" opacity="0.4"/>' +
      '<path d="M10 14 L22 14" stroke="#8a9aaa" stroke-width="1" opacity="0.5"/>' +
      '<rect x="8" y="24" width="16" height="2" fill="#8a9aaa" opacity="0.3"/>'
    ));

    // 貿易 — 箱と矢印
    TopbarIcons.menu.trade = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<rect x="9" y="14" width="10" height="8" fill="none" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<path d="M9 14 L14 10 L19 14" fill="none" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<path d="M14 10 L19 10 L19 14" fill="none" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<path d="M20 18 L25 18 L23 15 M25 18 L23 21" stroke="#4a8fc4" stroke-width="1.2" fill="none"/>'
    ));

    // 外交 — 握手
    TopbarIcons.menu.diplomacy = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#4ac46a" stroke-width="1.5"/>' +
      '<path d="M8 16 Q8 12 12 12 L16 14 L20 12 Q24 12 24 16" fill="none" stroke="#4ac46a" stroke-width="1.5"/>' +
      '<path d="M12 12 L16 14 L20 12" fill="none" stroke="#4ac46a" stroke-width="1.5"/>' +
      '<path d="M10 18 L14 18 M18 18 L22 18" stroke="#4ac46a" stroke-width="1.5"/>' +
      '<circle cx="16" cy="16" r="2" fill="#4ac46a" opacity="0.5"/>'
    ));

    // 将軍カード — カード
    TopbarIcons.menu.cards = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<rect x="9" y="8" width="10" height="14" rx="1" fill="none" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<rect x="13" y="10" width="10" height="14" rx="1" fill="#1a2230" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<circle cx="18" cy="15" r="2.5" fill="#c4ad72" opacity="0.5"/>' +
      '<path d="M15 20 L21 20" stroke="#c4ad72" stroke-width="1" opacity="0.5"/>'
    ));

    // 師団編成 — 師団シンボル (X印)
    TopbarIcons.menu.division = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#c44a4a" stroke-width="1.5"/>' +
      '<rect x="8" y="12" width="16" height="8" fill="none" stroke="#c44a4a" stroke-width="1.5"/>' +
      '<path d="M10 14 L22 18 M22 14 L10 18" stroke="#c44a4a" stroke-width="1.5"/>' +
      '<rect x="8" y="12" width="16" height="8" fill="#c44a4a" opacity="0.1"/>'
    ));

    // マルチプレイ — 接続ノード
    TopbarIcons.menu.multiplayer = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<circle cx="10" cy="12" r="2.5" fill="#4a8fc4"/>' +
      '<circle cx="22" cy="12" r="2.5" fill="#4a8fc4"/>' +
      '<circle cx="16" cy="22" r="2.5" fill="#4a8fc4"/>' +
      '<path d="M12 12 L20 12 M11 14 L15 20 M21 14 L17 20" stroke="#4a8fc4" stroke-width="1" opacity="0.5"/>'
    ));

    // 固有システム — 記念碑
    TopbarIcons.menu.nation = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<path d="M16 6 L16 22" stroke="#c4ad72" stroke-width="2"/>' +
      '<path d="M12 22 L20 22" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<path d="M14 8 L18 8" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<path d="M13 10 L19 10 L19 22 L13 22 Z" fill="none" stroke="#c4ad72" stroke-width="1" opacity="0.5"/>' +
      '<rect x="10" y="22" width="12" height="2" fill="#c4ad72" opacity="0.3"/>'
    ));

    // セーブ/ロード — フロッピーディスク
    TopbarIcons.menu.winsave = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#8a9aaa" stroke-width="1.5"/>' +
      '<rect x="9" y="8" width="14" height="16" rx="1" fill="none" stroke="#8a9aaa" stroke-width="1.5"/>' +
      '<rect x="12" y="8" width="8" height="5" fill="#8a9aaa" opacity="0.3"/>' +
      '<rect x="11" y="16" width="10" height="6" fill="none" stroke="#8a9aaa" stroke-width="1"/>' +
      '<path d="M13 10 L13 12 M15 10 L15 12 M17 10 L17 12" stroke="#8a9aaa" stroke-width="1"/>'
    ));

    // 政治 — 議会/柱
    TopbarIcons.menu.politics = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<path d="M8 22 L24 22" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<path d="M10 22 L10 12 M14 22 L14 12 M18 22 L18 12 M22 22 L22 12" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<path d="M7 12 L25 12 L23 8 L9 8 Z" fill="#c4ad72" opacity="0.3" stroke="#c4ad72" stroke-width="1.5"/>' +
      '<path d="M6 24 L26 24" stroke="#c4ad72" stroke-width="1.5"/>'
    ));

    // マップ画面 — 地球儁
    TopbarIcons.menu.map = s(wrap(
      '<circle cx="16" cy="16" r="13" fill="#1a2230" stroke="#4a8fc4" stroke-width="1.5"/>' +
      '<circle cx="16" cy="16" r="10" fill="none" stroke="#4a8fc4" stroke-width="1"/>' +
      '<ellipse cx="16" cy="16" rx="4" ry="10" fill="none" stroke="#4a8fc4" stroke-width="1"/>' +
      '<path d="M6 16 L26 16" stroke="#4a8fc4" stroke-width="1"/>' +
      '<path d="M8 11 L24 11 M8 21 L24 21" stroke="#4a8fc4" stroke-width="0.8" opacity="0.5"/>'
    ));
  },

  // アイコンURLを取得 (ステータス)
  get(key) {
    return TopbarIcons[key] || null;
  },

  // メニューアイコンURLを取得
  getMenu(key) {
    return TopbarIcons.menu[key] || null;
  }
};

// グローバル公開
if (typeof window !== 'undefined') window.TopbarIcons = TopbarIcons;
