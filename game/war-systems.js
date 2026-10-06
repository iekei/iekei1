/* Peace conference, localization, volunteers, expeditionary forces and faction chat. */
'use strict';

class WarSystems {
  static countryNames = { GER: 'ドイツ国', JAP: '大日本帝国', SOV: 'ソビエト連邦', USA: 'アメリカ合衆国', ENG: 'イギリス', FRA: 'フランス', ITA: 'イタリア', POL: 'ポーランド', CHI: '中国', CZE: 'チェコスロバキア', HUN: 'ハンガリー', ROM: 'ルーマニア', TUR: 'トルコ', FIN: 'フィンランド', CAN: 'カナダ', AST: 'オーストラリア', RAJ: 'インド', MEX: 'メキシコ', SPR: 'スペイン', POR: 'ポルトガル' };
  static provinceNames = {
    Tokyo: '東京', Berlin: 'ベルリン', Paris: 'パリ', London: 'ロンドン', Moscow: 'モスクワ', Washington: 'ワシントン', Rome: 'ローマ', Warsaw: 'ワルシャワ', Praha: 'プラハ', Madrid: 'マドリード', Beijing: '北京', Shanghai: '上海', Helsinki: 'ヘルシンキ',
    Osaka: '大阪', Kyoto: '京都', Nagoya: '名古屋', Hiroshima: '広島', Fukuoka: '福岡', Seoul: 'ソウル', Busan: '釜山', Nanjing: '南京', Guangzhou: '広州', Hong_Kong: '香港', Vladivostok: 'ウラジオストク', Leningrad: 'レニングラード', Stalingrad: 'スターリングラード', Kiev: 'キエフ', Minsk: 'ミンスク', Kharkov: 'ハリコフ', Rostov: 'ロストフ', Munich: 'ミュンヘン', Hamburg: 'ハンブルク', Cologne: 'ケルン', Frankfurt: 'フランクフルト', Vienna: 'ウィーン', Prague: 'プラハ', Budapest: 'ブダペスト', Bucharest: 'ブカレスト', Belgrade: 'ベオグラード', Warsaw: 'ワルシャワ', Amsterdam: 'アムステルダム', Brussels: 'ブリュッセル', Madrid: 'マドリード', Lisbon: 'リスボン', Stockholm: 'ストックホルム', Oslo: 'オスロ', Copenhagen: 'コペンハーゲン', Ankara: 'アンカラ', Istanbul: 'イスタンブール', Cairo: 'カイロ', New_York: 'ニューヨーク', Los_Angeles: 'ロサンゼルス', Chicago: 'シカゴ', Ottawa: 'オタワ'
  };
  static chat = { tab: 'all', messages: [] };
  static volunteers = [];
  static expeditionary = [];
  static conference = null;

  static init() {
    this.patchNames(); this.mountChat();
    if (typeof CoreEngine !== 'undefined') CoreEngine.registerTickCallback(() => this.onTick());
    this.bindMultiplayer();
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && this.conference) this.closeConference(); });
  }
  static bindMultiplayer() {
    if (typeof MultiplayerManager === 'undefined' || typeof MultiplayerManager.onMessage !== 'function' || this._messageBound) return;
    const original = MultiplayerManager.onMessage.bind(MultiplayerManager);
    MultiplayerManager.onMessage = (data, peer) => {
      if (data?.type === 'chat') this.receiveChat({ ...data, from: data.from || '未知' });
      return original(data, peer);
    };
    this._messageBound = true;
  }
  static name(tag) { return this.countryNames[tag] || tag || '不明'; }
  static stateName(st, fallback, stateId) {
    const original = st?.originalName || st?.name || '';
    const tag = st?.owner || CoreEngine.gameState.country || 'GER';
    const tagKey = stateId ? tag + '_STATE_' + stateId : null;
    const genericKey = stateId ? 'STATE_' + stateId : null;
    const tagged = tagKey && window.l10n?.t(tagKey, tag);
    if (tagged && tagged !== tagKey) return tagged;
    const generic = genericKey && window.l10n?.t(genericKey, tag);
    if (generic && generic !== genericKey) return generic;
    return this.provinceNames[original] || this.provinceNames[original.replace(/\s+/g, '_')] ||
      (st?.name && st.name !== original ? st.name : null) || fallback || (stateId ? '州' + stateId : '州');
  }
  static provinceName(provinceId) {
    const stateId = typeof MapRenderer !== 'undefined' ? MapRenderer.stateOf(Number(provinceId)) : null;
    const st = stateId && MapRenderer.states?.[stateId];
    const tag = st?.owner || CoreEngine.gameState.country || 'GER';
    if (st?.vp && Object.prototype.hasOwnProperty.call(st.vp, provinceId)) {
      const countryKey = tag + '_VICTORY_POINTS_' + provinceId;
      const countryName = window.l10n?.t(countryKey, tag);
      if (countryName && countryName !== countryKey) return countryName;
      const key = 'VICTORY_POINTS_' + provinceId;
      const name = window.l10n?.t(key, tag);
      if (name && name !== key) return name;
    }
    return st ? this.stateName(st, null, stateId) : '海域 ' + provinceId;
  }
  static patchNames() {
    const apply = () => {
      if (typeof MapRenderer === 'undefined' || !MapRenderer.states) return false;
      Object.entries(MapRenderer.states).forEach(([sid, st]) => {
        st.originalName = st.originalName || st.name;
        st.name = this.stateName(st, null, sid);
      });
      return true;
    };
    if (!apply()) { const timer = setInterval(() => { if (apply()) clearInterval(timer); }, 250); }
  }
  static score(tag) {
    const s = CoreEngine.gameState; const states = typeof MapRenderer !== 'undefined' ? MapRenderer.states || {} : {};
    let occupied = 0, vp = 0;
    Object.values(states).forEach(st => { if (st.owner === tag) { occupied += (st.provinces || []).length; vp += Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0); } });
    const battles = typeof BattleManager !== 'undefined' ? BattleManager.battles : [];
    const kills = battles.filter(b => b.attacker === tag).length * 12;
    return Math.max(0, Math.round(vp * 3 + occupied * 0.4 + kills));
  }
  static openConference(defeated, winners) {
    if (this.conference) return;
    const tags = winners?.length ? winners : [CoreEngine.gameState.country];
    this.conference = { defeated, winners: tags, turn: 0, passed: {}, points: Object.fromEntries(tags.map(t => [t, Math.max(25, this.score(t))])), demands: [] };
    CoreEngine.gameState.paused = true; CoreEngine.updateSpeedUI(); this.renderConference();
  }
  static addDemand(type, stateId) {
    const c = this.conference; if (!c) return;
    const cost = { take: 8, puppet: 35, change: 25, demilitarize: 12, reparations: 18 }[type] || 10;
    const tag = CoreEngine.gameState.country;
    if ((c.points[tag] || 0) < cost) return GameUI.notify('戦勝点が不足しています。', 'alert');
    if (c.demands.some(d => d.type === type && d.stateId === stateId)) return;
    c.points[tag] -= cost; c.demands.push({ type, stateId, by: tag, cost }); this.renderConference();
  }
  static passConference() { const c = this.conference; if (!c) return; c.passed[CoreEngine.gameState.country] = true; if (c.winners.every(t => c.passed[t] || c.points[t] < 8)) this.finalizeConference(); else { c.turn = (c.turn + 1) % c.winners.length; this.renderConference(); } }
  static finalizeConference() {
    const c = this.conference;
    c.demands.forEach(d => { const st = MapRenderer.states?.[d.stateId]; if (!st) return; if (d.type === 'take') { st.owner = d.by; (st.provinces || []).forEach(pid => { CoreEngine.gameState.strategy.provinceOwners[pid] = d.by; }); } else if (d.type === 'puppet') st.puppetOf = d.by; else if (d.type === 'change') st.government = CoreEngine.gameState.ideology || '民主主義'; else if (d.type === 'demilitarize') st.demilitarized = true; else if (d.type === 'reparations') CoreEngine.gameState.civilianFactories += 1; });
    this.closeConference(); CoreEngine.log('講和条約が締結されました。'); GameUI.notify('講和条約を締結しました。', 'success');
  }
  static closeConference() { this.conference = null; document.getElementById('peace-conference')?.remove(); CoreEngine.gameState.paused = false; CoreEngine.updateSpeedUI(); }
  static renderConference() {
    document.getElementById('peace-conference')?.remove(); const c = this.conference; const states = Object.entries(MapRenderer.states || {}).filter(([, st]) => st.owner === c.defeated).slice(0, 80);
    const el = document.createElement('div'); el.id = 'peace-conference'; el.className = 'war-overlay'; el.innerHTML = `<section class="war-window" role="dialog" aria-modal="true" aria-labelledby="peace-title"><header><h2 id="peace-title">講和会議</h2><span>降伏国: ${this.name(c.defeated)}</span></header><div class="war-score"><b>戦勝点 ${c.points[CoreEngine.gameState.country] || 0}</b><span>ターン ${c.turn + 1} / ${c.winners.length}</span></div><div class="peace-actions"><button data-action="take">領土割譲 (8)</button><button data-action="puppet">傀儡化 (35)</button><button data-action="change">政権交代 (25)</button><button data-action="demilitarize">非武装化 (12)</button><button data-action="reparations">賠償 (18)</button></div><div class="peace-states">${states.map(([id, st]) => `<button class="peace-state" data-state="${id}">${this.stateName(st, '州' + id)}<small>${Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0)} VP</small></button>`).join('')}</div><footer><button class="war-pass">パス</button><button class="war-confirm">条約を確定</button></footer></section>`;
    document.body.appendChild(el); let selected = null; el.querySelectorAll('[data-action]').forEach(b => b.onclick = () => { if (!selected) return GameUI.notify('対象の州を選択してください。', 'alert'); this.addDemand(b.dataset.action, selected); }); el.querySelectorAll('.peace-state').forEach(b => b.onclick = () => { selected = b.dataset.state; el.querySelectorAll('.peace-state').forEach(x => x.classList.toggle('selected', x === b)); }); el.querySelector('.war-pass').onclick = () => this.passConference(); el.querySelector('.war-confirm').onclick = () => this.finalizeConference();
  }
  static mountChat() {
    const host = document.getElementById('multiplayer-content'); if (!host) return;
    host.insertAdjacentHTML('beforeend', `<div class="faction-chat"><div class="chat-tabs"><button data-chat="all">全体</button><button data-chat="faction">陣営</button></div><div id="chat-messages" aria-live="polite"></div><form id="chat-form"><input id="chat-input" maxlength="240" placeholder="メッセージを入力" aria-label="チャットメッセージ"><button>送信</button></form></div>`);
    host.querySelectorAll('[data-chat]').forEach(b => b.onclick = () => { this.chat.tab = b.dataset.chat; host.querySelectorAll('[data-chat]').forEach(x => x.setAttribute('aria-selected', String(x === b))); this.renderChat(); }); host.querySelectorAll('[data-chat]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.chat === this.chat.tab))); host.querySelector('#chat-form').onsubmit = e => { e.preventDefault(); const input = host.querySelector('#chat-input'); const text = input.value.trim(); if (!text) return; const message = { text, from: CoreEngine.gameState.country, channel: this.chat.tab, faction: CoreEngine.gameState.faction || CoreEngine.gameState.factionId || null }; this.chat.messages.push(message); if (typeof MultiplayerManager !== 'undefined') MultiplayerManager.broadcast({ type: 'chat', ...message }); input.value = ''; this.renderChat(); }; this.renderChat();
  }
  static receiveChat(message) { if (!message?.text) return; this.chat.messages.push(message); this.renderChat(); }
  static renderChat() { const box = document.getElementById('chat-messages'); if (!box) return; box.innerHTML = this.chat.messages.filter(m => this.chat.tab === 'all' || m.channel === 'faction').slice(-40).map(m => `<div><b>${this.name(m.from)}:</b> ${this.escape(m.text)}</div>`).join(''); box.scrollTop = box.scrollHeight; }
  static escape(v) { return String(v).replace(/[&<>"']/g, x => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[x])); }
  static onTick() { this.volunteers = this.volunteers.filter(v => v.active); this.expeditionary = this.expeditionary.filter(v => v.active); }
}
window.WarSystems = WarSystems;
window.addEventListener('DOMContentLoaded', () => WarSystems.init());
setTimeout(() => { if (typeof WarSystems !== 'undefined') WarSystems.patchNames(); }, 1200);
