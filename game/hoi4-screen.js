/**
 * hoi4-screen.js — 「HOI4 大戦略」全画面レイヤー（game/index.html 用）
 *
 * game/index.html（Hearts of Iron IV × 将軍カードゲーム）から、HOI4風
 * グランドストラテジー UI（リポジトリルートの hoi4.html）を全画面で開く。
 *
 *  - ナビゲーションレールの「HOI4 大戦略」ボタン / スタート画面のボタン / H キーで起動
 *  - iframe は初回オープンまで読み込まない（lazy）。閉じても保持し、再オープンは即時。
 *  - 閉じている間は HOI4 側の時間進行を一時停止（ui/embed.js と postMessage で連携）
 *  - Esc で閉じる / 背景は inert 化 / フォーカスは元の要素へ返す
 *  - ?screen=hoi4 で直接オープン、URL にも状態を反映（replaceState）
 *  - 選択中の国家タグを ?nation=GER として引き継ぐ
 *
 * iframe を使う理由: hoi4.html は steel-ui.css で body / html / button 等の
 * グローバルスタイルを所有しており、そのまま game/index.html に読み込むと
 * 将軍カードゲーム側の UI を破壊するため。DOM/CSS/タイマーを完全に分離し、
 * 必要な情報だけ postMessage でやり取りする。
 */
(function () {
  'use strict';

  const HOI4_URL = '../hoi4.html';
  const NATIONS = ['GER', 'USA', 'ENG', 'SOV', 'JAP', 'ITA', 'FRA'];
  const NATION_NAMES = {
    GER: 'ドイツ国', USA: 'アメリカ合衆国', ENG: 'イギリス',
    SOV: 'ソビエト連邦', JAP: '大日本帝国', ITA: 'イタリア王国', FRA: 'フランス共和国',
  };
  const LOAD_TIMEOUT_MS = 25000;

  const EMBLEM_SVG = [
    '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">',
    '<defs><linearGradient id="hs-hex" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#59646f"/><stop offset=".5" stop-color="#2a323a"/>',
    '<stop offset="1" stop-color="#151a1f"/></linearGradient></defs>',
    '<path d="M16 1.5 29 8.8v14.4L16 30.5 3 23.2V8.8Z" fill="url(#hs-hex)" stroke="#05070a" stroke-width="1.2"/>',
    '<path d="M16 4.4 26.5 10.4v11.2L16 27.6 5.5 21.6V10.4Z" fill="none" stroke="#e6c268" stroke-opacity=".55" stroke-width=".9"/>',
    '<path d="m16 7.6 1.9 4.1 4.5.6-3.3 3.1.8 4.5-3.9-2.2-3.9 2.2.8-4.5-3.3-3.1 4.5-.6Z" fill="#e6c268"/>',
    '</svg>',
  ].join('');

  class Hoi4ScreenBridge {
    constructor() {
      this.layer = null;
      this.stage = null;
      this.frame = null;
      this.nationChip = null;
      this.closeBtn = null;
      this.externalLink = null;
      this.isOpen = false;
      this.loaded = false;
      this._watchdog = null;
      this._prevFocus = null;
      this._inerted = [];
      this._onGlobalKeyDown = this._onGlobalKeyDown.bind(this);
      this._onMessage = this._onMessage.bind(this);
      this._onFrameLoad = this._onFrameLoad.bind(this);
    }

    /* ------------------------------------------------------------- 初期化 */

    init() {
      if (this.layer) return;
      this._build();
      this._bind();

      document.querySelectorAll('[data-open-hoi4]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.open();
        });
      });

      // ?screen=hoi4 で直接開く（スタート画面の表示後に重ねる）
      let params;
      try { params = new URLSearchParams(location.search); } catch { params = null; }
      if (params && params.get('screen') === 'hoi4') {
        setTimeout(() => this.open({ fromUrl: true }), 0);
      }
    }

    _build() {
      const layer = document.createElement('div');
      layer.id = 'hoi4-screen';
      layer.className = 'hoi4-screen';
      layer.hidden = true;
      layer.setAttribute('role', 'dialog');
      layer.setAttribute('aria-modal', 'true');
      layer.setAttribute('aria-label', 'HOI4 大戦略 — 研究・生産・外交・戦闘');
      layer.innerHTML = `
        <div class="hs-chrome">
          <span class="hs-emblem">${EMBLEM_SVG}</span>
          <div class="hs-heading">
            <div class="hs-title">HOI4 大戦略</div>
            <div class="hs-sub">Hearts of Iron IV style grand strategy — 研究 / 生産 / 外交 / 戦闘 / 補給</div>
          </div>
          <div class="hs-nation" hidden>
            <span class="hs-nation-flag"></span>
            <span class="hs-nation-name"></span>
            <span class="hs-nation-tag"></span>
          </div>
          <div class="hs-actions">
            <a class="hs-btn hs-external" href="${HOI4_URL}" target="_blank" rel="noopener">
              <span class="hs-external-text">別タブで開く</span><span aria-hidden="true">↗</span>
            </a>
            <button class="hs-btn hs-close" type="button" aria-label="HOI4 画面を閉じて将軍カードゲームに戻る">
              閉じる <span class="hs-key" aria-hidden="true">Esc</span>
            </button>
          </div>
        </div>
        <div class="hs-stage">
          <iframe class="hs-frame" title="HOI4 大戦略 — 研究・生産・外交・戦闘" loading="lazy" referrerpolicy="no-referrer" tabindex="0"></iframe>
          <div class="hs-loading" role="status" aria-live="polite">
            <div class="hs-spinner" aria-hidden="true"></div>
            <div class="hs-loading-title">戦略画面を展開中…</div>
            <div class="hs-loading-sub">294 技術ツリー・指揮官カード・生産／貿易／戦闘システムを読み込んでいます。<br>初回は数秒かかることがあります。</div>
          </div>
          <div class="hs-error" role="alert">
            <div class="hs-error-title">HOI4 画面を読み込めませんでした</div>
            <div class="hs-error-text">
              ネットワークまたはサーバーの状態を確認してください。<br>
              リポジトリルートを静的サーバーで配信している場合、<code>/hoi4.html</code> が開ける必要があります。
            </div>
            <div class="hs-error-actions">
              <button class="hs-btn" type="button" data-retry>再試行</button>
              <a class="hs-btn" href="${HOI4_URL}" target="_blank" rel="noopener">別タブで開く ↗</a>
            </div>
          </div>
        </div>
        <div class="hs-foot">
          <span><b>H</b> で HOI4 画面</span>
          <span><b>Esc</b> で将軍カードゲームに戻る</span>
          <span class="hs-foot-spacer"></span>
          <span>HOI4 側: <b>Q</b> 政治 / <b>W</b> 研究 / <b>R</b> 貿易 / <b>T</b> 建設 / <b>Y</b> 生産 / <b>U</b> 兵器設計 / <b>I</b> 補給</span>
        </div>`;

      document.body.appendChild(layer);

      this.layer = layer;
      this.stage = layer.querySelector('.hs-stage');
      this.frame = layer.querySelector('.hs-frame');
      this.closeBtn = layer.querySelector('.hs-close');
      this.externalLink = layer.querySelector('.hs-external');
      this.nationChip = layer.querySelector('.hs-nation');

      this.closeBtn.addEventListener('click', () => this.close());
      layer.querySelector('[data-retry]').addEventListener('click', () => this._load(true));
    }

    _bind() {
      document.addEventListener('keydown', this._onGlobalKeyDown, true);
      window.addEventListener('message', this._onMessage);
      this.frame.addEventListener('load', this._onFrameLoad);
    }

    /* --------------------------------------------------------------- 開閉 */

    open({ fromUrl = false } = {}) {
      if (this.isOpen) return;
      this.isOpen = true;
      this._prevFocus = document.activeElement;

      this._renderNation();
      this._syncExternalLink();
      this._clearError();
      if (!this.frame.getAttribute('src')) this._load(false);

      this.layer.hidden = false;
      document.body.classList.add('hoi4-screen-open');
      this._setBackgroundInert(true);
      if (!fromUrl) this._syncUrl(true);
      this._postVisibility(true);

      // 読み込み済みなら HOI4 側のキーボードショートカットをそのまま使えるよう
      // iframe へフォーカスを移す。未読み込みなら「閉じる」に置く。
      requestAnimationFrame(() => this._focusInitial());
    }

    _focusInitial() {
      if (this.loaded) {
        try { this.frame.focus(); return; } catch { /* フォールバック */ }
      }
      try { this.closeBtn.focus({ preventScroll: true }); } catch { this.closeBtn.focus(); }
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;

      this._postVisibility(false);
      this.layer.hidden = true;
      document.body.classList.remove('hoi4-screen-open');
      this._setBackgroundInert(false);
      this._syncUrl(false);

      const prev = this._prevFocus;
      this._prevFocus = null;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try { prev.focus({ preventScroll: true }); } catch { prev.focus(); }
      }
    }

    toggle() { this.isOpen ? this.close() : this.open(); }

    /* --------------------------------------------------------- iframe 読み込み */

    get _nationTag() {
      let tag = null;
      try { tag = window.CoreEngine && window.CoreEngine.gameState && window.CoreEngine.gameState.country; } catch { tag = null; }
      if (!tag) {
        try { tag = new URLSearchParams(location.search).get('nation'); } catch { tag = null; }
      }
      return NATIONS.includes(tag) ? tag : null;
    }

    _src() {
      const params = new URLSearchParams();
      params.set('embed', '1');
      const tag = this._nationTag;
      if (tag) params.set('nation', tag);
      return `${HOI4_URL}?${params.toString()}`;
    }

    _load(force) {
      this._clearError();
      this.stage.classList.remove('is-loaded');
      this.loaded = false;
      this._armWatchdog();
      if (force) {
        // about:blank を挟んで同じ URL でも確実に再読み込みさせる
        this.frame.src = 'about:blank';
        setTimeout(() => { this.frame.src = this._src(); }, 30);
      } else {
        this.frame.src = this._src();
      }
    }

    _onFrameLoad() {
      if (!this.frame.getAttribute('src') || this.frame.getAttribute('src') === 'about:blank') return;
      this._markLoaded();
      // 読み込み前に閉じられた場合も、ロード完了時点で正しい可視状態を伝える
      this._postVisibility(this.isOpen);
    }

    _markLoaded() {
      this.loaded = true;
      this._clearWatchdog();
      this.stage.classList.add('is-loaded');
      // 初回ロード完了時、まだクローム側にフォーカスがあるなら iframe へ移す
      if (this.isOpen && (document.activeElement === this.closeBtn || document.activeElement === document.body)) {
        try { this.frame.focus(); } catch { /* noop */ }
      }
    }

    _armWatchdog() {
      this._clearWatchdog();
      this._watchdog = setTimeout(() => {
        if (this.loaded) return;
        this._showError();
      }, LOAD_TIMEOUT_MS);
    }

    _clearWatchdog() {
      if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
    }

    _showError() {
      this._clearWatchdog();
      this.stage.classList.remove('is-loaded');
      this.stage.classList.add('is-error');
    }

    _clearError() { this.stage.classList.remove('is-error'); }

    /* ------------------------------------------------------------- 表示更新 */

    _renderNation() {
      const tag = this._nationTag;
      if (!tag) { this.nationChip.hidden = true; return; }

      const flagBox = this.nationChip.querySelector('.hs-nation-flag');
      flagBox.innerHTML = '';
      let flagHtml = '';
      try { flagHtml = window.DataFetcher && window.DataFetcher.getCountryFlagImage(tag); } catch { flagHtml = ''; }
      if (flagHtml) {
        flagBox.innerHTML = flagHtml;
      } else {
        flagBox.textContent = '🏳️';
      }
      this.nationChip.querySelector('.hs-nation-name').textContent = NATION_NAMES[tag] || tag;
      this.nationChip.querySelector('.hs-nation-tag').textContent = tag;
      this.nationChip.hidden = false;
    }

    _syncExternalLink() {
      const tag = this._nationTag;
      const params = new URLSearchParams({ embed: '0' });
      if (tag) params.set('nation', tag);
      this.externalLink.href = `${HOI4_URL}?${params.toString()}`;
    }

    _postVisibility(visible) {
      if (!this.frame || !this.frame.contentWindow) return;
      // iframe は同一オリジン。file:// で開いた場合に備えて origin を切り替える。
      const origin = /^https?:$/.test(location.protocol) ? location.origin : '*';
      try {
        this.frame.contentWindow.postMessage({ type: 'hoi4:visibility', visible }, origin);
      } catch {
        try { this.frame.contentWindow.postMessage({ type: 'hoi4:visibility', visible }, '*'); } catch { /* noop */ }
      }
    }

    /* ----------------------------------------------- 背景の inert 化 / 復元 */

    _setBackgroundInert(on) {
      if (on) {
        this._inerted = [];
        for (const node of Array.from(document.body.children)) {
          if (node === this.layer || node === this.frame) continue;
          if (/^(SCRIPT|STYLE|LINK|META)$/i.test(node.tagName)) continue;
          this._inerted.push({
            node,
            inert: node.inert === true,
            aria: node.getAttribute('aria-hidden'),
          });
          try { node.inert = true; } catch { /* 古いブラウザ */ }
          node.setAttribute('aria-hidden', 'true');
        }
      } else {
        for (const rec of this._inerted) {
          try { rec.node.inert = rec.inert; } catch { /* noop */ }
          if (rec.aria === null) rec.node.removeAttribute('aria-hidden');
          else rec.node.setAttribute('aria-hidden', rec.aria);
        }
        this._inerted = [];
      }
    }

    /* ---------------------------------------------------------------- URL */

    _syncUrl(open) {
      try {
        const url = new URL(location.href);
        if (open) {
          if (url.searchParams.get('screen') === 'hoi4') return;
          url.searchParams.set('screen', 'hoi4');
        } else {
          if (url.searchParams.get('screen') !== 'hoi4') return;
          url.searchParams.delete('screen');
        }
        history.replaceState(history.state, '', url);
      } catch { /* file:// 等では URL 同期しない */ }
    }

    /* ---------------------------------------------------------- イベント処理 */

    _onGlobalKeyDown(e) {
      if (this.isOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.close();
          return;
        }
        if (e.key === 'Tab') this._trapFocus(e);
        return;
      }

      // H で起動（入力中・修飾キー・IME 変換中は無視）
      if (e.key !== 'h' && e.key !== 'H') return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.defaultPrevented || e.isComposing) return;
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
      if (document.querySelector('#generic-modal-overlay:not(.hidden)')) return;

      e.preventDefault();
      this.open();
    }

    _trapFocus(e) {
      const focusables = Array.from(
        this.layer.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'),
      ).filter((node) => node.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || !this.layer.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    _onMessage(e) {
      if (!this.frame || e.source !== this.frame.contentWindow) return;
      const type = e.data && e.data.type;
      if (type === 'hoi4:ready') {
        this._markLoaded();
        this._postVisibility(this.isOpen);
      } else if (type === 'hoi4:close') this.close();
    }
  }

  window.Hoi4Screen = new Hoi4ScreenBridge();

  const boot = () => window.Hoi4Screen.init();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
