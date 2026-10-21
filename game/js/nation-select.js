/**
 * nation-select.js — 国家選択・ゲーム初期化画面
 *
 * プレイ可能な主要7カ国（ドイツ、ソ連、アメリカ、イギリス、日本、イタリア、フランス）
 * をカード形式で表示。国旗、国家元首ポートレート、国家的精神（バフ/デバフ）、
 * 歴史的背景を確認してゲームを開始する。
 *
 * マルチプレイ: ローカル / ホスト / クライアント のモード選択と部屋コード入力。
 * ホストのみが時間変更（一時停止・倍速）を制御できる。
 *
 * 画面が真っ暗に固定されるのを防ぐため、オーバーレイは半透明のダーク背景にし、
 * 操作がなければ一定時間後に既定国家（ドイツ）で自動開始する。
 */

import { el, img } from './util.js';
import { I18N } from './i18n.js';
import { NATIONS, MAJORS } from './data/nations.js';

const ORDER = ['GER', 'SOV', 'USA', 'ENG', 'JAP', 'ITA', 'FRA'];
const AUTO_START_SECONDS = 3;

/** 各国の歴史的背景説明（ローカライズ辞書に無い分を補完） */
const HISTORY = {
  GER: 'ヴェルサイユ体制に対する不満と経済危機の中、ナチス党が政権を獲得。電撃戦を核とする機甲軍でヨーロッパを席巻しようとする。',
  SOV: '大粛清で将校層を痛めた赤軍。広大な国土と人的資源、工業化を背景に、ドイツの侵攻に備えた総力戦体制を構築する。',
  USA: '大恐慌から立ち直りつつある民主主義大国。圧倒的な生産力を誇るが、参戦には世論の喚起と租借法が必要。',
  ENG: '日が沈まない大英帝国。海軍の覇権と英仏同盟を軸に、大陸での勢力拡大を目指すドイツに対抗する。',
  JAP: 'アジアへの進出を進める大日本帝国。南方資源獲得と大東亜共栄圏構築を掲げ、米英との対立が深まる。',
  ITA: 'ファシスト政権下のイタリア。地中海における「マレ・ノストルム」を掲げ、バルカン・北アフリカへの拡大を狙う。',
  FRA: 'マジノー線に依存する防御戦略を採るフランス。強力な陸軍を持つが、対独戦への備えは不十分な状態にある。',
};

export class NationSelect {
  constructor({ onSelect, container }) {
    this.onSelect = onSelect;
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.selectedTag = null;
    this.mpMode = 'local';
    this.room = 'default';
    this.root = null;
    this._timer = null;
  }

  mount() {
    if (!this.container) return;
    // 固定オーバーレイとして document.body の末尾に追加するだけ。
    // game-root / topbar / map-view などゲーム本体は消さない。
    this.root = el('div', 'nation-select');
    this.root.innerHTML = this._html();
    this.container.appendChild(this.root);

    this._bind();
    // デフォルトでドイツを選択状態に（自動開始用）
    this._select(ORDER[0]);
    this._startAutoStartCountdown();
  }

  _html() {
    return `
      <div class="ns-header">
        <h1>大戦略 — Hearts of Iron IV 風グランドストラテジー</h1>
        <p class="ns-sub">統率すべき国家を選択し、ゲームを開始してください</p>
      </div>

      <div class="ns-mp">
        <div class="ns-mp-row">
          <span class="ns-mp-label">プレイモード</span>
          <label class="ns-mp-radio"><input type="radio" name="ns-mp-mode" value="local" checked> ローカル（ソロ）</label>
          <label class="ns-mp-radio"><input type="radio" name="ns-mp-mode" value="host"> ホスト（部屋を作成）</label>
          <label class="ns-mp-radio"><input type="radio" name="ns-mp-mode" value="client"> クライアント（部屋に参加）</label>
        </div>
        <div class="ns-mp-row">
          <span class="ns-mp-label">部屋コード</span>
          <input type="text" class="ns-mp-room" value="default" placeholder="英数字・記号 最大32文字" maxlength="32">
          <span class="ns-mp-hint">ホストは部屋を作成、クライアントは同じコードを入力して参加</span>
        </div>
      </div>

      <div class="ns-grid" id="ns-grid"></div>
      <div class="ns-footer">
        <button class="steel-btn primary ns-start" id="ns-start">ゲーム開始</button>
        <span class="ns-autostart" id="ns-autostart">3秒後に自動開始</span>
        <span class="ns-hint">キーボードショートカット: Q 政治 / W 研究 / R 貿易 / T 建設 / Y 生産 / U 展開 / I 政治パネル / E ドクトリン</span>
      </div>
    `;
  }

  _bind() {
    const grid = this.root.querySelector('#ns-grid');
    const startBtn = this.root.querySelector('#ns-start');
    const modeRadios = this.root.querySelectorAll('input[name="ns-mp-mode"]');
    const roomInput = this.root.querySelector('.ns-mp-room');

    const updateRoomInput = () => {
      roomInput.disabled = this.mpMode === 'local';
    };
    modeRadios.forEach((r) => {
      r.addEventListener('change', () => {
        this.mpMode = r.value;
        this.room = roomInput.value.trim() || 'default';
        updateRoomInput();
        this._restartAutoStartCountdown();
      });
    });
    roomInput.addEventListener('input', () => {
      this.room = roomInput.value.trim() || 'default';
      this._restartAutoStartCountdown();
    });
    updateRoomInput();

    for (const tag of ORDER) {
      const nat = NATIONS[tag];
      const card = this._makeCard(tag, nat);
      card.addEventListener('click', () => { this._select(tag); this._restartAutoStartCountdown(); });
      grid.appendChild(card);
    }

    startBtn.addEventListener('click', () => {
      this._stopAutoStartCountdown();
      if (this.selectedTag) {
        this.room = roomInput.value.trim() || 'default';
        this.onSelect(this.selectedTag, { mode: this.mpMode, room: this.room });
      }
    });
  }

  _makeCard(tag, nat) {
    const card = el('div', `ns-card ${tag === this.selectedTag ? 'selected' : ''}`);
    const leaderImg = nat.leader.portrait ? `url("${nat.leader.portrait}")` : '';
    const flagUrl = nat.flag;

    card.innerHTML = `
      <div class="ns-flag-wrap">
        <img class="ns-flag" src="${flagUrl}" alt="${nat.name} flag" onerror="this.style.display='none'">
        <div class="ns-flag-fallback">${tag}</div>
      </div>
      <div class="ns-portrait-wrap">
        ${leaderImg ? `<div class="ns-portrait" style="background-image:${leaderImg}"></div>` : `<div class="ns-portrait ns-portrait-empty">${nat.leader.name.slice(0,1)}</div>`}
        <div class="ns-leader-name">${nat.leader.name}</div>
      </div>
      <div class="ns-name">${nat.name}</div>
      <div class="ns-ideology">${I18N.t(`politics.${nat.ideology}`) || nat.ideology}</div>
      <div class="ns-spirits">
        ${(nat.spirits || []).map((s) => `<span class="ns-spirit">${s.name}</span>`).join('')}
      </div>
      <div class="ns-stats">
        <div class="ns-stat"><span class="ns-stat-label">PP</span><span class="ns-stat-val">${nat.start.pp}</span></div>
        <div class="ns-stat"><span class="ns-stat-label">安定度</span><span class="ns-stat-val">${nat.start.stability}%</span></div>
        <div class="ns-stat"><span class="ns-stat-label">戦協力</span><span class="ns-stat-val">${nat.start.warSupport}%</span></div>
        <div class="ns-stat"><span class="ns-stat-label">民需/軍需/造船</span><span class="ns-stat-val">${nat.start.civ}/${nat.start.mil}/${nat.start.dock}</span></div>
      </div>
      <div class="ns-desc">${HISTORY[tag] || ''}</div>
    `;
    return card;
  }

  _select(tag) {
    this.selectedTag = tag;
    this.root.querySelectorAll('.ns-card').forEach((c) => c.classList.remove('selected'));
    const idx = ORDER.indexOf(tag);
    const card = idx >= 0 ? this.root.querySelector(`.ns-card:nth-child(${idx + 1})`) : null;
    if (card) card.classList.add('selected');
    const btn = this.root.querySelector('#ns-start');
    btn.disabled = false;
    const nat = NATIONS[tag];
    btn.textContent = `${nat.name} でゲーム開始`;
  }

  _startAutoStartCountdown() {
    this._stopAutoStartCountdown();
    let remaining = AUTO_START_SECONDS;
    const autostart = this.root.querySelector('#ns-autostart');
    const update = () => {
      if (autostart) autostart.textContent = `${remaining}秒後に自動開始`;
      remaining -= 1;
      if (remaining < 0) {
        this._stopAutoStartCountdown();
        this._autoStart();
      }
    };
    update();
    this._timer = setInterval(update, 1000);
  }

  _restartAutoStartCountdown() {
    this._startAutoStartCountdown();
  }

  _stopAutoStartCountdown() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _autoStart() {
    const startBtn = this.root.querySelector('#ns-start');
    if (startBtn && !startBtn.disabled && this.selectedTag) {
      startBtn.click();
    }
  }

  unmount() {
    this._stopAutoStartCountdown();
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
  }
}

export default NationSelect;
