'use strict';

/* ==========================================================
 * focus-tree-core.js — 国家方針ツリー 共通コアエンジン
 * ----------------------------------------------------------
 * 7大国（GER/SOV/FRA/ENG/USA/JAP/ITA）すべてで再利用可能な
 * 「国家方針ツリー」のコアロジックを提供する。
 *
 * 【解決する課題】
 *  1. 択一選択（相互排他 / Mutually Exclusive）
 *     → あるルートを選択（完了）すると、排他関係にある
 *       ノードは二度と選択不可（ロック状態）になる。
 *  2. 7大国それぞれの進行状況・フラグの独立管理
 *     → 国家タグ（country）ごとに独立した状態オブジェクトを持ち、
 *       他国の完了状況やロック状態と混ざらない。
 *  3. ローカライズの動的適用
 *     → ノードの名称・説明文はローカライズキーから解決し、
 *       各国固有のツールチップを正しく生成する。
 *
 * 【データモデル（1ノードの構造）】
 *   {
 *     "id": "GER_rhineland",          // 一意のノードID
 *     "country": "GER",              // 所属国家タグ（必須・他国と混ざらない鍵）
 *     "loc_key": "GER_rhineland",     // ローカライズキー（省略時は id を使用）
 *     "x": 100, "y": 50,             // UI 上の座標
 *     "cost": 70,                    // 完了までの日数
 *     "prerequisites": ["GER_root"], // 前提ノードIDの配列（すべて完了済みが必要）
 *     "mutually_exclusive": ["GER_alt_route"], // 排他ノードIDの配列
 *     "completion_rewards": [...]    // 完了時の効果（HOI4EffectsConfig 形式）
 *   }
 *
 * ※ title / effect フィールドは後方互換のため残せるが、
 *    新しい設計では loc_key から LocalizationManager が解決する。
 * ========================================================== */
(function (global) {
  'use strict';

  // ---- 7大国のカントリータグ ----
  const MAJOR_NATIONS = ['GER', 'SOV', 'FRA', 'ENG', 'USA', 'JAP', 'ITA'];

  class FocusTreeCore {
    constructor() {
      // 国家ごとに完全に独立した状態を保持
      // state[country] = { completed: Set, locked: Set, active: null, progress: 0 }
      this.states = {};
      // 国家ごとの方針ツリーデータ（ノード配列）
      this.trees = {};
      MAJOR_NATIONS.forEach(tag => {
        this.states[tag] = { completed: new Set(), locked: new Set(), active: null, progress: 0 };
        this.trees[tag] = [];
      });
    }

    // ==========================================================
    // 方針ツリーデータを登録する
    // ==========================================================
    // country: 国家タグ（GER/SOV/...）
    // nodes:   ノードオブジェクトの配列
    registerTree(country, nodes) {
      if (!this.states[country]) {
        // 7大国以外の国も動的に登録可能（スケーラブル）
        this.states[country] = { completed: new Set(), locked: new Set(), active: null, progress: 0 };
      }
      // 各ノードに country と loc_key が無ければ補完する
      this.trees[country] = (nodes || []).map(node => ({
        ...node,
        country: node.country || country,
        loc_key: node.loc_key || node.id,
        prerequisites: node.prerequisites || [],
        mutually_exclusive: node.mutually_exclusive || [],
        cost: node.cost || 70
      }));
    }

    // ==========================================================
    // 【判定①】指定した国家の特定ノードが現在選択可能かを判定
    // ==========================================================
    // 選択可能 = 以下のすべてを満たす:
    //   1. まだ完了していない
    //   2. ロックされていない（排他ノードが完了していない）
    //   3. すべての前提ノードが完了済み
    //   4. 現在アクティブ（進行中）のフォーカスではない
    isAvailable(country, nodeId) {
      const state = this.states[country];
      if (!state) return false;
      if (state.completed.has(nodeId)) return false;   // 1. 完了済み
      if (state.locked.has(nodeId)) return false;       // 2. 排他ロック
      if (state.active === nodeId) return false;         // 4. 進行中

      const node = this.findNode(country, nodeId);
      if (!node) return false;

      // 3. 前提ノードがすべて完了済みか
      const prereqs = node.prerequisites || [];
      if (prereqs.length === 0) return true;
      return prereqs.every(parentId => state.completed.has(parentId));
    }

    // ==========================================================
    // 【判定②】排他ロックの理由を取得（UI 表示用）
    // ==========================================================
    // ノードが選択不可の理由を返す。UI で「なぜ選べないか」を表示するのに使う。
    getBlockReason(country, nodeId) {
      const state = this.states[country];
      if (!state) return '不明な国家';
      if (state.completed.has(nodeId)) return '完了済み';
      if (state.active === nodeId) return '進行中';

      const node = this.findNode(country, nodeId);
      if (!node) return 'ノードが存在しません';

      // 排他ロックの理由
      if (state.locked.has(nodeId)) {
        const blocker = (node.mutually_exclusive || []).find(id => state.completed.has(id));
        if (blocker) {
          const blockerNode = this.findNode(country, blocker);
          const name = this.getLocalizedTitle(country, blockerNode);
          return `排他選択: 「${name}」が選択済みのため選択不可`;
        }
        return '排他ロック中';
      }

      // 前提未完了の理由
      const missing = (node.prerequisites || []).filter(id => !state.completed.has(id));
      if (missing.length) {
        const names = missing.map(id => {
          const n = this.findNode(country, id);
          return n ? this.getLocalizedTitle(country, n) : id;
        });
        return `前提未完了: ${names.join(', ')}`;
      }

      return null; // 選択可能
    }

    // ==========================================================
    // 【実行】ノードを選択（アクティブ化）する
    // ==========================================================
    // 選択可能かチェックしてからアクティブにする。
    // 戻り値: { ok: boolean, reason: string|null }
    select(country, nodeId) {
      if (!this.isAvailable(country, nodeId)) {
        return { ok: false, reason: this.getBlockReason(country, nodeId) || '選択不可' };
      }
      this.states[country].active = nodeId;
      this.states[country].progress = 0;
      return { ok: true, reason: null };
    }

    // ==========================================================
    // 【実行】ノードを完了する（排他ロック + 報酬適用）
    // ==========================================================
    // 1. ノードを完了済みにする
    // 2. 排他ノードを「ロック状態」に更新する（二度と選択不可）
    // 3. 完了時の効果（completion_rewards）をゲーム状態へ適用する
    complete(country, nodeId, gameState) {
      const state = this.states[country];
      const node = this.findNode(country, nodeId);
      if (!node || !state) return { ok: false, reason: 'ノードが存在しません' };

      // 1. 完了済みにする
      state.completed.add(nodeId);
      state.active = null;
      state.progress = 0;

      // 2. 排他ノードをロック状態にする
      //    mutually_exclusive 配列内の各ノードIDを locked Set へ追加。
      //    これにより、それらのノードは isAvailable で永続的に false となる。
      const exclusives = node.mutually_exclusive || [];
      exclusives.forEach(exclusiveId => {
        state.locked.add(exclusiveId);
      });

      // 3. 報酬を適用（HOI4EffectsConfig 経由）
      const rewards = node.completion_rewards || node.completionRewards || [];
      this.applyRewards(rewards, gameState, country);

      return { ok: true, node, lockedTargets: exclusives, rewards };
    }

    // ---- 報酬適用を HOI4EffectsConfig へ委譲 ----
    applyRewards(rewards, gameState, country) {
      const apply = global.HOI4EffectsConfig?.applyEffect || global.applyEffect;
      if (typeof apply !== 'function' || !gameState) return;
      const list = Array.isArray(rewards) ? rewards : (rewards ? [rewards] : []);
      list.forEach(reward => {
        if (!reward || !reward.type) return;
        apply(gameState, reward);
      });
    }

    // ==========================================================
    // 【UI】ローカライズキーから実際の日本語テキストを取得
    // ==========================================================
    // ノードの「名称」を解決する。
    // 優先順位: loc_key → title（後方互換） → id
    getLocalizedTitle(country, node) {
      if (!node) return '';
      const l10n = global.l10n;
      // loc_key から解決
      if (node.loc_key && l10n) {
        const resolved = l10n.resolve(node.loc_key, country);
        if (resolved && resolved !== node.loc_key) return resolved;
      }
      // $KEY$ や [Token] を含む title を解決
      if (node.title && l10n) {
        const resolved = l10n.resolve(node.title, country);
        if (resolved && !/^\[.+\]$/.test(resolved) && !/^\$.+\$$/.test(resolved)) return resolved;
      }
      // 後方互換: そのまま title、最後に id
      return node.title || node.id || '';
    }

    // ---- ノードの「説明文」を解決 ----
    getLocalizedDescription(country, node) {
      if (!node) return '';
      const l10n = global.l10n;
      const descKey = node.loc_key ? node.loc_key + '_desc' : null;
      if (descKey && l10n) {
        const resolved = l10n.resolve(descKey, country);
        if (resolved && resolved !== descKey) return resolved;
      }
      if (node.effect && l10n) {
        return l10n.resolve(node.effect, country);
      }
      return node.effect || '';
    }

    // ==========================================================
    // 【UI】7大国それぞれの固有フォーカス用ツールチップを生成
    // ==========================================================
    // country に応じたローカライズを適用し、HoI4 風のツールチップ文字列を作る。
    buildTooltip(country, nodeId) {
      const node = this.findNode(country, nodeId);
      if (!node) return '';

      const state = this.states[country];
      const isCompleted = state.completed.has(nodeId);
      const isActive = state.active === nodeId;
      const isLocked = state.locked.has(nodeId) || !this.isAvailable(country, nodeId);

      // ステータス表示
      let status;
      if (isCompleted) status = '【達成済み】';
      else if (isActive) status = '【実行中】';
      else if (isLocked) {
        const reason = this.getBlockReason(country, nodeId);
        status = `🔒【選択不可】${reason || ''}`;
      } else status = '🔓【選択可能】';

      // 名称（ローカライズ解決）
      const title = this.getLocalizedTitle(country, node);
      // 説明文（ローカライズ解決）
      const desc = this.getLocalizedDescription(country, node);
      // 必要日数
      const cost = node.cost || 70;

      // 報酬（HOI4EffectsConfig で色付きフォーマット）
      const rewards = node.completion_rewards || node.completionRewards || [];
      const fmt = global.HOI4EffectsConfig?.formatEffect || global.formatEffect;
      const rewardLines = rewards
        .map(r => (typeof fmt === 'function' ? fmt(r) : null))
        .filter(Boolean)
        .map(r => r.text || r);

      // 排他関係の表示
      const exclusives = (node.mutually_exclusive || []).map(id => {
        const n = this.findNode(country, id);
        return n ? this.getLocalizedTitle(country, n) : id;
      });

      // ツールチップ組み立て
      let tooltip = `${title} ${status}\n`;
      tooltip += `⏱️ 必要時間: ${cost}日\n`;
      if (desc) tooltip += `\n${desc}\n`;
      if (rewardLines.length) tooltip += `\n【達成報酬】\n${rewardLines.join('\n')}`;
      if (exclusives.length) tooltip += `\n\n⚠️ 排他選択: ${exclusives.join(' / ')}\n（こちらを選ぶともう一方は選択不可になります）`;

      return tooltip;
    }

    // ==========================================================
    // 国家ごとの状態を取得（他国と混ざらない）
    // ==========================================================
    getState(country) {
      return this.states[country] || null;
    }

    // ---- 国家ごとの完了済みノードID一覧 ----
    getCompleted(country) {
      const s = this.states[country];
      return s ? Array.from(s.completed) : [];
    }

    // ---- 国家ごとのロック中ノードID一覧 ----
    getLocked(country) {
      const s = this.states[country];
      return s ? Array.from(s.locked) : [];
    }

    // ---- ノードを検索 ----
    findNode(country, nodeId) {
      const tree = this.trees[country];
      if (!tree) return null;
      return tree.find(n => n.id === nodeId) || null;
    }

    // ---- 国家ごとのツリー全体を取得 ----
    getTree(country) {
      return this.trees[country] || [];
    }

    // ---- サポート対象の国家タグ一覧 ----
    static get supportedNations() { return MAJOR_NATIONS; }
  }

  global.FocusTreeCore = FocusTreeCore;
  global.focusTree = new FocusTreeCore();
})(window);
