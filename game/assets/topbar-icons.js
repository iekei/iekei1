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

    // Muted, embossed metal status symbols. Kept inline for reliable startup.
    const metal = '<defs><linearGradient id="metal" x2="0" y2="1"><stop stop-color="#e0d5ad"/><stop offset=".45" stop-color="#bca674"/><stop offset="1" stop-color="#76623c"/></linearGradient></defs>';
    const emblem = inner => s(wrap(metal + '<g fill="url(#metal)" stroke="#171e14" stroke-width=".7" stroke-linejoin="round">' + inner + '</g>'));
    TopbarIcons.politicalPower = emblem(
      '<path d="M15 7l2-3 3 2-2 3 3 3 9-5-3 7-7 4-2 3 5 6-7-3-7 3 5-6-2-3-7-4-3-7 9 5z"/><path d="M4 12l8 4M28 12l-8 4M16 11v9" fill="none" stroke="#ece0b3"/>'
    );
    TopbarIcons.stability = emblem(
      '<path d="M16 3l11 4v10c0 6-5 10-11 13C10 27 5 23 5 17V7z"/><path d="M16 7l7 3v7c0 4-3 7-7 9-4-2-7-5-7-9v-7z" fill="#3e4b32"/><path d="M11 16l3 3 7-8" fill="none" stroke="#d8d1a9" stroke-width="2"/>'
    );
    TopbarIcons.warSupport = emblem(
      '<path d="M10 29v-8l-5-7 1-6 4 1V5l4-1 3 1 4-1 3 2 3 1v11l-6 5v6z"/><path d="M10 9v7M14 5v9M18 5v9M22 6v8M10 18l8-2 4 3M10 24h11" fill="none" stroke="#655535"/>'
    );
    TopbarIcons.manpower = emblem(
      '<path d="M5 29v-5l7-5v-3h8v3l7 5v5z"/><path d="M10 9h13v5l-4 5h-5l-4-5z"/><path d="M6 11C6 3 25 1 26 11l-2 2H7z"/><path d="M12 22l4 5 4-5" fill="none" stroke="#655535"/>'
    );
    TopbarIcons.factories = emblem(
      '<path d="M3 29V17l8-5v5l8-5v7h4V5h5v24z"/><path d="M7 21h4v4H7zM15 21h4v4h-4zM23 22h3v3h-3z" fill="#232b1e"/><path d="M24 3c-4-2-6 1-9-1" fill="none" stroke="#bcbca5" stroke-width="2"/>'
    );
    TopbarIcons.fuel = emblem(
      '<path d="M9 4h14v3l3 2v19H6V9l3-2z"/><path d="M12 4v3h8V4M9 12l14 12M23 12L9 24" fill="none" stroke="#655535"/><path d="M16 11c-1 3-4 5-4 7a4 4 0 008 0c0-2-3-4-4-7" fill="#d6bc7f"/>'
    );
    TopbarIcons.armyXp = emblem(
      '<path d="M16 4l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="url(#metal)"/><path d="M13 14l3 3 5-6" fill="none" stroke="#ece0b3" stroke-width="1.5"/>'
    );
    TopbarIcons.convoys = emblem(
      '<path d="M2 22l28-3-5 9H7zM9 21v-6h13v5M13 15V9h4v6M20 15v-5h3v5"/><path d="M15 9V4l8 3h-8"/><path d="M3 30l4-1 4 1 5-1 5 1 5-1 4 1" fill="none" stroke="#aab7aa"/>'
    );
    TopbarIcons.worldTension = emblem(
      '<circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="10" fill="#3f4933"/><path d="M7 10l7-2 3 4-3 5-4-1-1 6M20 7l-2 6 6 2-2 9-4-3-2-5" fill="#c9b986"/>'
    );

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
