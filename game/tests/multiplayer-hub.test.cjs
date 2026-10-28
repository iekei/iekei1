/*
 * multiplayer-hub.test.cjs — マルチプレイ・ラウンジ / チャット / 右クリック外交 / 陣営タブ
 *
 * 依存パッケージ不要 (node:test + node:assert のみ)。
 *   node --test game/tests/multiplayer-hub.test.cjs
 *
 * DOM は最小限のスタブで代用し、ロジック (ロスター・権限・秘匿・可否判定・同期) を検証する。
 * 実際のホスト/ゲスト間通信は PeerJS / BroadcastChannel を使うため、ここでは
 * MultiplayerManager をスタブして認証ゲートと転送だけを確認する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');

// ---- 最小 DOM スタブ ----------------------------------------------------
function fakeEl() {
  const el = {
    id: '', innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [],
    appendChild(child) { el.children.push(child); return child; },
    insertAdjacentHTML() {}, remove() {}, focus() {}, blur() {}, select() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, contains: () => false,
    getAttribute: () => null, setAttribute() {}
  };
  el.offsetWidth = 0; el.offsetHeight = 0; el.parentNode = null;
  return el;
}
const elements = {};
const document = {
  body: fakeEl(),
  activeElement: null,
  getElementById: id => elements[id] || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => fakeEl(),
  addEventListener() {}, removeEventListener() {}
};
global.document = document;
Object.defineProperty(global, 'navigator', { value: { clipboard: null }, configurable: true, writable: true });
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

// ---- ゲーム側スタブ -----------------------------------------------------
const state = {
  country: 'GER', politicalPower: 80, worldTension: 10, atWar: [], speed: 1, paused: false,
  stability: 60, warSupport: 50, resources: {}, date: new Date('1936-01-01T00:00:00Z')
};
const CoreEngine = {
  gameState: state,
  tickCallbacks: [],
  registerTickCallback(cb) { CoreEngine.tickCallbacks.push(cb); },
  log() {}, renderStats() {}, updateCalendar() {}, updateSpeedUI() {},
  setSpeed(v) { state.speed = v; state.paused = v === 0; return true; },
  getSyncState() { return {}; }, addWorldTension() {}
};
global.CoreEngine = CoreEngine;

const sentBroadcast = [];
class MultiplayerManager {
  static connected = false; static isHost = false; static roomId = null; static playerId = 'pME';
  static connections = {}; static remoteCountries = {}; static joinPassword = ''; static roomHash = 'h0';
  static onData() { return false; }
  static broadcast(d) { sentBroadcast.push(d); }
  static hashPassword(pw) { return 'h' + String(pw || '').length; }
  static verifyPassword(pw) { return MultiplayerManager.hashPassword(pw) === MultiplayerManager.roomHash; }
  static disconnect() { MultiplayerManager.connections = {}; MultiplayerManager.connected = false; }
  static handleDisconnect() {}
  static render() {}
  static setStatus() {}
}
global.MultiplayerManager = MultiplayerManager;

const notifications = [];
global.GameUI = {
  notify(msg, type) { notifications.push({ msg, type }); },
  openModal(title, body) { GameUI.modal = { title, body }; },
  closeModal() { GameUI.modal = null; },
  switchTab(tab) { GameUI.tab = tab; },
  isConnected() { return MultiplayerManager.connected; }
};
global.DataFetcher = { getCountryFlagImage: tag => '<img src="' + tag + '.png" alt="' + tag + '">' };
global.GameTools = {
  escape: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  day: () => 12
};
global.MapRenderer = { ready: true, invalidateModes() {} };
global.ProductionManager = { ensure() {} };
global.AIManager = { state: { wars: [] } };
global.NewsManager = { showing: false };
global.IntelOperations = { challenge: null, closeMission() {} };
global.WindowManager = { isOpen: () => false };
global.CountryDossier = { LEADERS: { SOV: ['stalin', 'ヨシフ・スターリン'] } };
global.MultiplayerTimeManager = {
  currentTick: 0, lastSpeed: 1,
  sendToHost() { return true; }, requestPauseToggle() {}, startHostBroadcast() {},
  stopHostBroadcast() {}, state() { return {}; }
};

let factions = [];
global.DiplomacyManager = {
  countries: [{ id: 'SOV', relation: -20, name: 'ソビエト連邦' }, { id: 'ITA', relation: 40, name: 'イタリア' }],
  factions,
  nameOf: tag => ({ GER: 'ドイツ国', SOV: 'ソビエト連邦', ITA: 'イタリア' }[tag] || tag),
  rebuildCountries() {}, render() {}
};
global.FactionSystem = {
  IDEOLOGY_NAME: { fascism: 'ファシズム', neutrality: '中立' },
  NAME_IDEAS: { fascism: ['新秩序同盟'] },
  DEMOCRACY_TENSION: 25,
  ideologyOf: () => 'fascism',
  factionOf: tag => factions.find(f => f.members.includes(tag)) || null,
  mine: () => FactionSystem.factionOf(state.country),
  sameFaction(a, b) { const f = FactionSystem.factionOf(a); return !!f && f.members.includes(b); },
  atWar: (a, b) => state.atWar.includes(b),
  adjustRelation(tag, d) { const c = DiplomacyManager.countries.find(x => x.id === tag); if (c) c.relation += d; },
  democracyBlock: () => null,
  unlocked: () => false,
  create(name) { factions.push({ name, leader: state.country, members: [state.country] }); return true; },
  invite(tag) { FactionSystem.invited = tag; return true; },
  apply(name) { FactionSystem.applied = name; },
  makeWar(x, y) { if (x === state.country && !state.atWar.includes(y)) state.atWar.push(y); return true; },
  aiJoins: () => true,
  factionTabHTML: () => '<div class="fs-root"><div class="fs-panel">WORLD</div></div>',
  openCallModal(call) { FactionSystem.lastCall = call; },
  onWarStart() {}, refresh() {}
};
global.PoliticsSystem = { render() {} };
global.PoliticsManager = { render() {} };

const { MPHub, MPChat, DiploMenu } = require('../assets/multiplayer-hub.js');

function reset() {
  state.country = 'GER'; state.politicalPower = 80; state.worldTension = 10;
  state.atWar = []; state.speed = 1; state.paused = false; state.stability = 60;
  factions = [{ name: '枢軸', leader: 'GER', members: ['GER', 'ITA'], ideology: 'fascism' }];
  DiplomacyManager.factions = factions;
  MultiplayerManager.connected = false; MultiplayerManager.isHost = false;
  MultiplayerManager.roomId = null; MultiplayerManager.connections = {}; MultiplayerManager.playerId = 'pME';
  sentBroadcast.length = 0;
  notifications.length = 0;
  MPHub._lobby = null;
  MPHub.net = { ping: null, desync: false, lastPong: 0, peers: 0, errors: 0 };
  MPHub.peerToPlayer = {}; MPHub.pending = {};
  MPHub.name = 'テスト';
  MPHub.politicsTab = 'cabinet';
  MPChat.messages = []; MPChat.tab = 'global'; MPChat.unread = { global: 0, faction: 0 };
  DiploMenu.tag = null;
  if (MPHub._bannerTimer) { clearTimeout(MPHub._bannerTimer); MPHub._bannerTimer = null; }
}

// ---------------------------------------------------------------------
test('ルームコードは HOI4-XXXX 形式で重複しない', () => {
  reset();
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const code = MPHub.genCode();
    assert.match(code, /^HOI4-\d{4}$/);
    seen.add(code);
    MPHub.roster().history = MPHub.roster().history || [];
    MPHub.roster().history.push(code);
  }
  assert.ok(seen.size >= 25, '十分な種類のコードが生成される: ' + seen.size);
});

test('ロスター: ホストが自分の国で登録される', () => {
  reset();
  MultiplayerManager.playerId = 'pHOST';
  const r = MPHub.roster();
  MPHub.setHostEntry('pHOST', { id: 'pHOST', name: 'ホスト', tag: state.country, host: true });
  assert.strictEqual(r.players.pHOST.tag, 'GER');
  assert.strictEqual(r.players.pHOST.host, true);
  assert.deepStrictEqual(r.order.join(','), 'pHOST');
});

test('開始条件: 全員が国家を選ぶまで開始できない', () => {
  reset();
  MultiplayerManager.isHost = true; MultiplayerManager.connected = true; MultiplayerManager.roomId = 'HOI4-1000';
  MPHub.setHostEntry('pHOST', { id: 'pHOST', name: 'ホスト', tag: 'GER', host: true });
  MPHub.setHostEntry('pG', { id: 'pG', name: 'ゲスト', tag: null, host: false });
  assert.strictEqual(MPHub.startGame(), false, '未選択のプレイヤーがいると開始不可');
  assert.match(notifications.at(-1).msg, /国家が未選択/);
  MPHub.roster().players.pG.tag = 'SOV';
  assert.strictEqual(MPHub.startGame(), true);
  assert.strictEqual(MPHub.roster().started, true);
});

test('国家選択: 他プレイヤーと重複できない', () => {
  reset();
  MultiplayerManager.isHost = true; MultiplayerManager.connected = true; MultiplayerManager.roomId = 'HOI4-1001';
  MPHub.setHostEntry('pHOST', { id: 'pHOST', name: 'ホスト', tag: 'GER', host: true });
  MPHub.setHostEntry('pG', { id: 'pG', name: 'ゲスト', tag: 'SOV', host: false });
  MPHub.playerId = 'pHOST';
  assert.strictEqual(MPHub.assignCountry('pG', 'GER'), false);
  assert.match(notifications.at(-1).msg, /既に/);
  assert.strictEqual(MPHub.assignCountry('pG', 'SOV'), true);
});

test('チャット: 全チャット送信 / 重複排除 / 陣営秘匿', () => {
  reset();
  MPChat.send('こんにちは');
  const own = MPChat.messages.filter(m => !m.system);
  assert.strictEqual(own.length, 1);
  assert.strictEqual(own[0].ch, 'global');
  assert.strictEqual(own[0].text, 'こんにちは');
  // 同じ ID は二度取り込まない
  assert.strictEqual(MPChat.receive({ id: 'x', ch: 'global', tag: 'SOV', text: 'a' }), true);
  assert.strictEqual(MPChat.receive({ id: 'x', ch: 'global', tag: 'SOV', text: 'a' }), false);
  // 陣営チャットは同陣営のみ
  assert.strictEqual(MPChat.receive({ id: 'y', ch: 'faction', tag: 'SOV', text: '敵' }), false);
  assert.strictEqual(MPChat.receive({ id: 'z', ch: 'faction', tag: 'ITA', text: '味方' }), true);
  // 陣営未所属では陣営チャットを送れない
  state.country = 'SOV';
  MPChat.tab = 'faction';
  assert.strictEqual(MPChat.send('だれにも届かない'), false);
  assert.ok(MPChat.messages.some(m => m.system && /陣営に所属すると/.test(m.text)));
});

test('チャット: システムメッセージは黄 / 赤で記録される', () => {
  reset();
  MPChat.system('⚔ 宣戦布告', 'error');
  MPChat.system('⏸ 一時停止を要求', 'warn');
  const tones = MPChat.messages.map(m => m.tone);
  assert.deepStrictEqual(tones.join(','), 'error,warn');
});

test('外交メニュー: 招待 / 加入申請 / 参戦要請の可否', () => {
  reset();
  // 自国は枢軸の盟主 / ソ連は無所属
  let acts = DiploMenu.actions('SOV');
  assert.strictEqual(acts.find(a => a.id === 'invite').disabled, false);
  assert.strictEqual(acts.find(a => a.id === 'join').disabled, true);
  assert.match(acts.find(a => a.id === 'join').reason, /陣営を主導していません/);
  assert.strictEqual(acts.find(a => a.id === 'call').disabled, true);
  assert.match(acts.find(a => a.id === 'call').reason, /同じ陣営/);
  // 政治力不足
  state.politicalPower = 5;
  acts = DiploMenu.actions('SOV');
  assert.match(acts.find(a => a.id === 'invite').reason, /政治力/);
  state.politicalPower = 80;
  // 交戦中は招待できない
  state.atWar = ['SOV'];
  assert.match(DiploMenu.actions('SOV').find(a => a.id === 'invite').reason, /交戦中/);
  state.atWar = [];
  // 同陣営 + 交戦中なら参戦要請できる
  state.atWar = ['FRA'];
  assert.strictEqual(DiploMenu.actions('ITA').find(a => a.id === 'call').disabled, false);
});

test('外交メニュー: メニュー内容 (国旗 / 指導者 / 関係)', () => {
  reset();
  const html = DiploMenu.html('SOV');
  assert.match(html, /ソビエト連邦/);
  assert.match(html, /ヨシフ・スターリン/);
  assert.match(html, /関係 -20/);
  assert.match(html, /陣営へ招待/);
  assert.match(html, /参戦要請/);
  assert.match(html, /SOV\.png/);
});

test('時間権限: ゲストの速度操作は拒否され、要請だけ送れる', () => {
  reset();
  MPHub.lockSpeedAuthority();
  MultiplayerManager.connected = true; MultiplayerManager.isHost = false; MultiplayerManager.roomId = 'HOI4-2000';
  const sent = [];
  MultiplayerManager.connections['peerHost'] = { open: true, authOk: true, send: d => sent.push(d) };
  const before = state.speed;
  assert.strictEqual(CoreEngine.setSpeed(4), false, 'ゲストは直接変更できない');
  assert.strictEqual(state.speed, before);
  MPHub.requestPause();
  assert.strictEqual(sent.filter(d => d.type === 'MP_PAUSE_REQ').length, 1);
  MultiplayerManager.isHost = true;
  assert.strictEqual(CoreEngine.setSpeed(3), true, 'ホストは変更できる');
});

test('一時停止要請: 未認証の接続は無視される', () => {
  reset();
  MultiplayerManager.isHost = true; MultiplayerManager.connected = true; MultiplayerManager.roomId = 'HOI4-2001';
  state.speed = 3;
  MultiplayerManager.connections['p1'] = { authOk: false, send() {} };
  assert.strictEqual(MPHub.receivePauseRequest({ name: 'x' }, 'p1'), false);
  assert.strictEqual(state.speed, 3);
  MultiplayerManager.connections['p1'] = { authOk: true, send() {} };
  assert.strictEqual(MPHub.receivePauseRequest({ name: 'ゲスト' }, 'p1'), true);
  assert.strictEqual(state.speed, 0);
});

test('通信状態: ping の閾値と desync 表示', () => {
  reset();
  MultiplayerManager.connected = true;
  MPHub.net.ping = 90; assert.strictEqual(MPHub.netState().cls, 'ok');
  MPHub.net.ping = 300; assert.strictEqual(MPHub.netState().cls, 'warn');
  MPHub.net.ping = 900; assert.strictEqual(MPHub.netState().cls, 'bad');
  MPHub.net.desync = true; assert.strictEqual(MPHub.netState().cls, 'desync');
  MPHub.net.desync = false; MPHub.net.ping = null; assert.strictEqual(MPHub.netState().cls, 'wait');
  MultiplayerManager.connected = false; assert.strictEqual(MPHub.netState().cls, 'offline');
});

test('同期ハッシュ: 自国固有値では変化せず、陣営構造で変化する', () => {
  reset();
  const base = MPHub.stateSig();
  state.politicalPower = 1; state.stability = 2;
  assert.strictEqual(MPHub.stateSig(), base);
  DiplomacyManager.factions.push({ name: '連合', leader: 'ENG', members: ['ENG'] });
  assert.notStrictEqual(MPHub.stateSig(), base);
});

test('陣営イベント: 受信側へ構造を反映する', () => {
  reset();
  MPHub.applyFactionCreate({ name: '東方条約', leader: 'SOV', members: ['SOV'] });
  MPHub.applyFactionCreate({ name: '東方条約', leader: 'SOV', members: ['SOV'] });
  assert.strictEqual(DiplomacyManager.factions.filter(f => f.name === '東方条約').length, 1);
  MPHub.applyFactionJoin('GER', '東方条約');
  const f = DiplomacyManager.factions.find(x => x.name === '東方条約');
  assert.ok(f.members.includes('GER'));
  assert.ok(!DiplomacyManager.factions.find(x => x.name === '枢軸').members.includes('GER'), '所属は 1 陣営のみ');
});

test('受信: 認証前のチャットを捨て、認証後は他ピアへ転送する', () => {
  reset();
  MultiplayerManager.isHost = true; MultiplayerManager.connected = true; MultiplayerManager.roomId = 'HOI4-3000';
  const mk = () => ({ authOk: false, sent: [], send(d) { this.sent.push(d); } });
  const unauth = mk(), sender = mk(), receiver = mk();
  sender.authOk = true; receiver.authOk = true;
  MultiplayerManager.connections = { p1: unauth, p2: sender, p3: receiver };
  MPHub.peerToPlayer = { p1: 'a', p2: 'b', p3: 'c' };
  assert.strictEqual(MPHub.handleData({ type: 'MP_CHAT', msg: { id: 'm1', ch: 'global', tag: 'SOV', text: 'x' } }, 'p1'), true);
  assert.strictEqual(MPChat.messages.length, 0);
  MPHub.handleData({ type: 'MP_CHAT', msg: { id: 'm2', ch: 'global', tag: 'SOV', text: 'y' } }, 'p2');
  assert.strictEqual(receiver.sent.filter(d => d.type === 'MP_CHAT').length, 1);
  assert.strictEqual(unauth.sent.length, 0);
  // declare_war などの既存メッセージは横取りしない
  assert.strictEqual(MPHub.handleData({ type: 'declare_war', target: 'FRA' }, 'p2'), false);
  assert.strictEqual(MPHub.handleData({ type: 'sync' }, 'p2'), false);
});

test('宣戦布告の反映: 自国が関与する戦争だけ atWar が増える', () => {
  reset();
  MPHub.applyWar('FRA', state.country);      // 自国 → フランス
  assert.ok(state.atWar.includes('FRA'));
  MPHub.applyWar('SOV', 'USA');              // 他国同士
  assert.ok(!state.atWar.includes('SOV'), '他国同士の戦争では自国は交戦しない');
});

// ---- 後始末 -------------------------------------------------------------
test('後始末', () => {
  if (MPHub._bannerTimer) clearTimeout(MPHub._bannerTimer);
  assert.ok(true);
});
