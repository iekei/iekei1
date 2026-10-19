/**
 * main.js — ゲームブートストラップ
 *
 *  初期化: I18N → GameState → 各マネージャ → カード/研究データ → TopBar/画面/マップ
 *  ゲームループ: TimeEngine の Tick が研究/経済/政治/諜報/ドクトリンを駆動
 *  マルチプレイ: ?mp=host&room=XXX / ?mp=client&room=XXX で TimeSync を有効化
 */

import { I18N } from './i18n.js';
import { toast } from './util.js';
import { GameState } from './state.js';
import { TimeEngine, TimeSync } from './time.js';
import { ResearchManager } from './research.js';
import { MIOManager } from './mio.js';
import { EconomyManager } from './economy.js';
import { DivisionTemplate } from './division.js';
import { EquipmentDesigner } from './designers.js';
import { DoctrineManager } from './doctrine.js';
import { IntelManager } from './intel.js';
import { DiplomacyManager } from './diplomacy.js';
import { PoliticsManager } from './politics.js';
import { CardLibrary } from './data/cards.js';
import { TopBar } from './ui/topbar.js';
import { ModalManager } from './ui/modal.js';
import { MapView } from './ui/map.js';
import { PoliticsPanel, renderResearchScreen, renderTradeScreen, renderProductionScreen, renderConstructionScreen, renderLogisticsScreen, renderDecisionsScreen } from './ui/screens.js';
import { renderDeploymentScreen, renderDoctrineScreen, renderIntelScreen, renderDiplomacyScreen } from './ui/screens2.js';

async function boot() {
  // 1. ローカライズ辞書
  await I18N.init('game/locales/ja.json');

  // 2. ゲーム状態（プレイヤー: ドイツで開始。?nation=USA 等で変更可）
  const params = new URLSearchParams(location.search);
  const state = new GameState();
  if (params.get('nation') && state.nation) state.changePlayer(params.get('nation'));

  // 3. カード・研究データ
  const cards = await new CardLibrary().load();
  state.cardCollection = cards.initialCollection(state.playerTag);
  const mio = new MIOManager(state, cards);
  const research = await new ResearchManager(state, mio).load();
  research.syncPlayerState();

  // 4. 各マネージャ
  const economy = new EconomyManager(state, mio);
  const doctrine = new DoctrineManager(state);
  const intel = new IntelManager(state);
  const diplomacy = new DiplomacyManager(state);
  const politics = new PoliticsManager(state);
  state._politicsMgr = politics;
  const designer = { current: null }; //師団テンプレート編集中（DivisionTemplate を保持）
  const equipDesigner = new EquipmentDesigner(state);

  // 5. 時間エンジン + マルチプレイ時間同期
  const engine = new TimeEngine(state);
  const mpMode = params.get('mp') || 'local';
  const room = params.get('room') || 'default';
  const sync = new TimeSync(engine, { mode: mpMode, room, wsUrl: params.get('ws') || undefined });
  if (sync.isMultiplayer) {
    sync.connect();
    sync.bus.on('synced', ({ caughtUp }) => {
      if (caughtUp > 0) toast(I18N.t('time.catchup', { n: caughtUp }), 'info');
    });
    const badge = document.getElementById('mp-badge');
    badge.classList.remove('hidden');
    badge.textContent = mpMode === 'host' ? `● ${I18N.t('time.mp_host')} [${room}]` : `● ${I18N.t('time.mp_client')} [${room}]`;
  }

  // 6. UI
  const modals = new ModalManager();
  const politicsPanel = new PoliticsPanel(state);
  const topbar = new TopBar(state, modals, politicsPanel);
  topbar.mount(document.getElementById('topbar'));
  const mapView = new MapView(state);

  const ctx = {
    state, research, mio, economy, doctrine, intel, diplomacy, politics,
    cards, designer, equipDesigner, modals, mapView,
    onTickScreens: [],
  };

  // 画面レジストリ（トグルID → 画面定義）
  const SCREENS = {
    decisions:    { title: I18N.t('menu.decisions'),    width: '',       render: renderDecisionsScreen(ctx) },
    intel:        { title: I18N.t('menu.intel'),        width: 'wide',   render: renderIntelScreen(ctx) },
    research:     { title: I18N.t('menu.research'),     width: 'wide',   render: renderResearchScreen(ctx) },
    trade:        { title: I18N.t('menu.trade'),        width: '',       render: renderTradeScreen(ctx) },
    construction: { title: I18N.t('menu.construction'), width: '',       render: renderConstructionScreen(ctx) },
    production:   { title: I18N.t('menu.production'),   width: 'wide',   render: renderProductionScreen(ctx) },
    deployment:   { title: I18N.t('menu.deployment'),   width: 'wide',   render: renderDeploymentScreen(ctx) },
    logistics:    { title: I18N.t('menu.logistics'),    width: '',       render: renderLogisticsScreen(ctx) },
    doctrine:     { title: I18N.t('menu.doctrine'),     width: 'wide',   render: renderDoctrineScreen(ctx) },
    diplomacy:    { title: I18N.t('menu.diplomacy'),    width: 'wide',   render: renderDiplomacyScreen(ctx) },
  };
  // トップバーから開くときはレジストリ経由
  const origToggle = modals.toggle.bind(modals);
  modals.toggle = (id, opts = {}) => {
    const def = SCREENS[id];
    if (!def) return origToggle(id, opts);
    return origToggle(id, { title: def.title, width: def.width, render: def.render });
  };
  // メニューボタンの開閉状態をトップバーへ反映
  const syncMenu = () => { for (const [id, btn] of Object.entries(topbar.menuButtons)) btn.classList.toggle('open', modals.isOpen(id)); };
  state.bus.on('modal-opened', syncMenu);
  state.bus.on('modal-closed', syncMenu);
  const _origOpen = modals.open.bind(modals);
  modals.open = (id, opts) => { const r = _origOpen(id, opts); state.bus.emit('modal-opened', id); return r; };
  const _origClose = modals.close.bind(modals);
  modals.close = (id) => { _origClose(id); state.bus.emit('modal-closed', id); };

  // 7. Tick駆動（1 Tick = 1時間）
  engine.onTick((st, hours) => {
    research.tick(st.playerTag, hours);
    economy.tick(hours);
    politics.tick(hours);
    intel.tick(hours);
    for (const b of ['land', 'naval', 'air']) doctrine.tick(b, hours);
    research.syncPlayerState();
    // 画面の定期再描画（開いている画面のみ）
    for (const fn of ctx.onTickScreens) fn(hours);
    // トップバー・マップ更新
    topbar.update(economy);
    mapView.update();
  });

  // 一時停止/速度変更をエンジンへ反映
  state.bus.on('speed-changed', (sp) => { engine.setSpeed(sp); syncHostState(); });
  state.bus.on('pause-changed', (paused) => { paused ? engine.pause() : engine.resume(); syncHostState(); });
  function syncHostState() {
    if (sync.mode === 'host') sync._send({ type: 'TIME_SYNC_STATE', paused: state.paused, speed: state.speed });
  }

  // 国家変更時
  state.bus.on('player-changed', () => {
    research.syncPlayerState();
    topbar.update(economy);
    mapView._updateCapital();
    politicsPanel.render();
  });

  // 8. 通知系
  state.bus.on('ship-completed', ({ item }) => toast(`${item.name} の建造が完了しました`, 'good'));
  state.bus.on('construction-completed', (q) => toast(`${I18N.t(q.def.name)} の建設が完了しました`, 'good'));
  state.bus.on('war-declared', ({ target }) => toast(`宣戦布告: ${target}`, 'bad'));

  // 9. 初期描画 & 時間開始
  topbar.update(economy);
  mapView.update();
  engine.start();

  // デバッグ用に公開
  window.GAME = { state, engine, research, mio, economy, doctrine, intel, diplomacy, politics, modals, topbar, mapView, cards, sync, I18N };
  console.log('%c 大戦略ゲーム 起動完了（?mp=host&room=xxx でマルチプレイ時間同期）', 'color:#e6c268;font-size:14px');
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<div style="color:#d05038;padding:20px;font-family:monospace">起動エラー: ${e.message}<br>${e.stack || ''}</div>`);
});
