/**
- main.js — ゲームブートストラップ
 *
-  初期化: I18N → GameState → 各マネージャ → カード/研究データ → TopBar/画面/マップ
-  ゲームループ: TimeEngine の Tick が研究/経済/政治/諜報/ドクトリンを駆動
-  マルチプレイ: ?mp=host&room=XXX / ?mp=client&room=XXX で TimeSync を有効化
 */

import { I18N } from './i18n.js';
import { toast } from './util.js';
import { GameState } from './state.js';
import { TimeEngine, TimeSync } from './time.js';
import { ResearchManager } from './research.js';
import { MIOManager } from './mio.js';
import { EconomyManager } from './economy.js';
import { DivisionTemplate } from './division.js';
import { installDivisionDesigner } from './division-designer.js';
import { installSupplySystem } from './supply.js';
import { installAirWingSystem } from './air-wings.js';
import { EquipmentDesigner } from './designers.js';
import { DoctrineManager } from './doctrine.js';
import { installIntelAgency } from './intel.js';
import { DiplomacyManager } from './diplomacy.js';
import { PoliticsManager } from './politics.js';
import { CardLibrary } from './data/cards.js';
import { TopBar } from './ui/topbar.js';
import { ModalManager } from './ui/modal.js';
import { initEmbedBridge } from './ui/embed.js';
import { MapEngine } from './map-engine.js';
import { EffectEngine } from './effects.js';
import { NationalFocusManager } from './national-focus.js';
import { AirNavalManager } from './air-naval.js';
import { GachaManager, PACKS } from './gacha.js';
import { PeaceConferenceManager } from './peace-conference.js';
import { NukeManager } from './nukes.js';
import { SpecialProjectManager } from './special-projects.js';
import { PoliticsPanel, renderResearchScreen, renderTradeScreen, renderProductionScreen, renderConstructionScreen, renderLogisticsScreen, renderDecisionsScreen } from './ui/screens.js';
import { renderDeploymentScreen, renderDoctrineScreen, renderIntelScreen, renderDiplomacyScreen } from './ui/screens2.js';
import { renderDivisionDesignerScreen } from './ui/division-designer.js';
import { renderAirForceScreen, openAirRegionModal, installProvincePanel } from './ui/air-ui.js';
import { renderFocusScreen, renderAirNavalScreen, renderGachaScreen, renderPeaceScreen, renderSpecialScreen, renderNukeScreen } from './ui/screens3.js';
import { NationSelect } from './nation-select.js';
import { BattlePlanManager } from './battle-plan.js';
import { installBattlePlanUI } from './ui/battle-plan-ui.js';

async function boot() {
  // ゲーム本体を即座に可視化（オーバーレイル除去の保証）
  const gameRoot = document.getElementById('game-root');
  if (gameRoot) {
    gameRoot.style.filter = '';
    gameRoot.style.display = '';
    gameRoot.style.visibility = 'visible';
    gameRoot.style.pointerEvents = '';
    gameRoot.style.opacity = '1';
  }

  // 0. game/index.html の HOI4 全画面レイヤーに埋め込まれている場合のブリッジ
  //    （?embed=1。単独起動時は何もしない）
  const embedded = initEmbedBridge();

  // 1. ローカライズ辞書
  await I18N.init('game/locales/ja.json');

  // パラメータ
  const params = new URLSearchParams(location.search);

  // 1.5 国家選択画面（?nation= で直接指定時はスキップ）
  const directTag = params.get('nation') || null;
  let selectedTag = directTag;
  let mpMode = params.get('mp') || 'local';
  let room = params.get('room') || 'default';
  
  if (!directTag) {
    const ns = new NationSelect({
      onSelect: (tag, mp) => { selectedTag = tag; mpMode = mp.mode; room = mp.room; },
      container: document.body,
    });
    ns.mount();
    try {
      // オーバーレイが操作不能でも自動開始（nation-select 側でカウントダウン済み）。
      // 保険として 10 秒でタイムアウトし、必ずデフォルト国家(ドイツ)で続行。
      await Promise.race([
        new Promise((resolve) => {
          const t = setInterval(() => {
            if (selectedTag !== null) { clearInterval(t); resolve(); }
          }, 50);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('nation-select timeout')), 10000))
      ]);
    } catch (e) {
      selectedTag = selectedTag || 'GER';
      mpMode = 'local';
      room = 'default';
      console.warn('[nation-select] フォールバック: デフォルト国家(ドイツ)で開始', e);
    } finally {
      // オーバーレイを確実に除去し、ゲーム本体の見た目を戻す（真っ暗固定防止）
      ns.unmount();
      if (gameRoot) {
        gameRoot.style.filter = '';
        gameRoot.style.pointerEvents = '';
      }
    }
  }

  // ゲーム本体を常に可視化（オーバーレイ残滓やCSSで暗くならないよう保証）
  if (gameRoot) {
    gameRoot.style.filter = '';
    gameRoot.style.display = '';
    gameRoot.style.visibility = '';
    gameRoot.style.pointerEvents = '';
  }

  // 2. ゲーム状態（選択国家で開始。既定はドイツ）
  const state = new GameState();
  if (selectedTag) state.changePlayer(selectedTag);
  // マルチプレイ設定を状態に保存（TopBar のホスト専用時間制御などで参照）
  state.multiplayer = { mode: mpMode, room };
  // 師団テンプレートの読み込み + 訓練キューの時間進行を接続
  installDivisionDesigner(state);

  // 3. カード・研究データ
  const cards = await new CardLibrary().load();
  state.cardCollection = cards.initialCollection(state.playerTag);
  const mio = new MIOManager(state, cards);
  const research = await new ResearchManager(state, mio).load();
  research.syncPlayerState();

  // 4. 各マネージャ
  const economy = new EconomyManager(state, mio);
  const doctrine = new DoctrineManager(state);
  state._doctrineMgr = doctrine;
  const intel = installIntelAgency(state);
  const diplomacy = new DiplomacyManager(state);
  const politics = new PoliticsManager(state);
  state._politicsMgr = politics;
  const designer = { current: null }; //師団テンプレート編集中（DivisionTemplate を保持）
  const equipDesigner = new EquipmentDesigner(state, research);
  state._researchMgr = research;
  const effectEngine = new EffectEngine(state);
  // 作戦計画（前線 / 攻撃線 / 計画準備ボーナス）
  const battlePlan = new BattlePlanManager(state, doctrine);
  state.ensureDivisions(state.playerTag, 8);
  // 補給網・インフラ・補給ハブ（建設完了で再計算、毎時ペナルティ適用）
  state._economyMgr = economy;
  const supply = installSupplySystem(state);
  // 航空隊・航空基地・空域任務（CAS は作戦計画の戦闘に直接反映される）
  const airWings = installAirWingSystem(state);
  state._airWingMgr = airWings;
  const focusMgr = new NationalFocusManager(state, effectEngine);
  await focusMgr.load(state.playerTag);
  const gacha = new GachaManager(state, cards);
  const peace = new PeaceConferenceManager(state, diplomacy, effectEngine);
  const special = new SpecialProjectManager(state);
  await special.load();

  // 5. 時間エンジン + マルチプレイ時間同期
  const engine = new TimeEngine(state);
  // mpMode / room は 1.5 の国家選択画面（または URL パラメータ）で決定済み
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
  const mapEngine = new MapEngine(state, document.getElementById('map-svg'));
  mapEngine.setSupplyManager(supply);
  mapEngine.setAirWingManager(airWings);
  mapEngine.setIntelManager(intel);
  mapEngine.onIntelTargetClick = () => { modals.toggle('intel', {}); };

  // F2: 補給モード / F3: 諜報モードのオン・オフ（マップ上部のボタンと同じ）
  document.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!mapEngine.setMode) return;
    if (e.key === 'F2') {
      e.preventDefault();
      mapEngine.setMode(mapEngine.mapMode === 'supply' ? 'land' : 'supply');
    } else if (e.key === 'F3') {
      e.preventDefault();
      mapEngine.setMode(mapEngine.mapMode === 'intel' ? 'land' : 'intel');
      toast(mapEngine.mapMode === 'intel' ? 'マップを諜報モードに切り替えました' : 'マップを陸軍モードに戻しました', 'info');
    }
  });

  const airNaval = new AirNavalManager(state, mapEngine);
  // 航空隊システムを空域オーバーレイの唯一の算出元にする
  airNaval.wingManager = airWings;
  airNaval.onRegionClick = (regionId) => openAirRegionModal(ctx, regionId);
  const nukes = new NukeManager(state, airNaval, effectEngine, mapEngine);

  // 州クリックでその国の外交ウィンドウを開く
  // マップ上の作戦計画UI（前線ドラッグ・攻撃線・実行ボタン）
  const battlePlanUI = installBattlePlanUI({ mapEngine, battlePlan, state, doctrine, modals });
  mapEngine.battlePlan = battlePlan;

  // 州クリック：自国州は建設パネル（インフラ / 補給ハブ / 航空基地）、他国は外交
  mapEngine.onProvinceClick = (provinceId) => {
    const p = mapEngine.byId[provinceId];
    if (!p) return;
    if (p.tag === state.playerTag) {
      provincePanel.open(provinceId);
      return;
    }
    provincePanel.close();
    diplomacy.select(p.tag);
    modals.toggle('diplomacy', {});
  };

  const ctx = {
    state, research, mio, economy, doctrine, intel, diplomacy, politics,
    cards, designer, equipDesigner, modals, mapEngine,
    effectEngine, focusMgr, airNaval, gacha, peace, special, nukes,
    battlePlan, battlePlanUI, supply, airWings,
    onTickScreens: [],
  };

  // マップ上の州パネル（自国州クリックでインフラ / 補給ハブ / 航空基地を建設）
  const provincePanel = installProvincePanel(ctx);
  ctx.provincePanel = provincePanel;

  // 画面レジストリ（トグルID → 画面定義）
  const SCREENS = {
    decisions:    { title: I18N.t('menu.decisions'),    width: '',       render: renderDecisionsScreen(ctx) },
    intel:        { title: I18N.t('menu.intel'),        width: 'wide',   render: renderIntelScreen(ctx) },
    research:     { title: I18N.t('menu.research'),     width: 'wide',   render: renderResearchScreen(ctx) },
    trade:        { title: I18N.t('menu.trade'),        width: '',       render: renderTradeScreen(ctx) },
    construction: { title: I18N.t('menu.construction'), width: '',       render: renderConstructionScreen(ctx) },
    production:   { title: I18N.t('menu.production'),   width: 'wide',   render: renderProductionScreen(ctx) },
    division:     { title: I18N.t('menu.division'),     width: 'wide',   render: renderDivisionDesignerScreen(ctx) },
    deployment:   { title: I18N.t('menu.deployment'),   width: 'wide',   render: renderDeploymentScreen(ctx) },
    logistics:    { title: I18N.t('menu.logistics'),    width: '',       render: renderLogisticsScreen(ctx) },
    doctrine:     { title: I18N.t('menu.doctrine'),     width: 'wide',   render: renderDoctrineScreen(ctx) },
    diplomacy:    { title: I18N.t('menu.diplomacy'),    width: 'wide',   render: renderDiplomacyScreen(ctx) },
    focus:        { title: I18N.t('menu.focus'),        width: 'wide',   render: renderFocusScreen(ctx) },
    airforce:     { title: '空軍',                     width: 'wide',   render: renderAirForceScreen(ctx) },
    airnaval:     { title: I18N.t('menu.airnaval'),     width: 'wide',   render: renderAirNavalScreen(ctx) },
    gacha:        { title: I18N.t('menu.gacha'),        width: '',       render: renderGachaScreen(ctx) },
    special:      { title: I18N.t('menu.special'),      width: '',       render: renderSpecialScreen(ctx) },
    nukes:        { title: I18N.t('menu.nukes'),        width: '',       render: renderNukeScreen(ctx) },
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
  modals.open = (id, opts) => {
    if (id === 'peace') {
      const surrendered = [...state.surrendered];
      if (surrendered.length) peace.open(surrendered[0]);
    }
    const r = _origOpen(id, opts);
    state.bus.emit('modal-opened', id);
    return r;
  };
  const _origClose = modals.close.bind(modals);
  modals.close = (id) => { _origClose(id); state.bus.emit('modal-closed', id); };

  // 7. Tick駆動（1 Tick = 1時間）
  engine.onTick((st, hours) => {
    research.tick(st.playerTag, hours);
    economy.tick(hours);
    supply.tick(hours);
    airWings.tick(hours);
    politics.tick(hours);
    intel.tick(hours);
    focusMgr.tick(st.playerTag, hours);
    special.tick(st.playerTag, hours);
    for (const b of ['land', 'naval', 'air']) doctrine.tick(b, hours);
    battlePlan.tick(hours);
    research.syncPlayerState();
    // 画面の定期再描画（開いている画面のみ）
    for (const fn of ctx.onTickScreens) fn(hours);
    // トップバー・マップ更新
    topbar.update(economy);
    mapEngine.update();
  });

  // 一時停止/速度変更をエンジンへ反映（ホストのみ。クライアントは HOST からの同期に従う）
  state.bus.on('speed-changed', (sp) => {
    if (state.multiplayer?.mode === 'client') return;
    engine.setSpeed(sp); syncHostState();
  });
  state.bus.on('pause-changed', (paused) => {
    if (state.multiplayer?.mode === 'client') return;
    paused ? engine.pause() : engine.resume(); syncHostState();
  });
  function syncHostState() {
    if (sync.mode === 'host') sync._send({ type: 'TIME_SYNC_STATE', paused: state.paused, speed: state.speed });
  }

  // 国家変更時
  state.bus.on('player-changed', () => {
    research.syncPlayerState();
    state.ensureDivisions(state.playerTag, 8);
    if (!battlePlan.plans().length) {
      const p = battlePlan.createPlan({ name: '第1軍集団 作戦計画' });
      battlePlanUI.planId = p.id;
      battlePlanUI.render();
    }
    topbar.update(economy);
    mapEngine.update();
    politicsPanel.render();
  });

  // 国家方針の完了報酬（completion_reward）
  state.bus.on('focus-completed', ({ node }) => {
    if (node?.reward_description) toast(`国家方針「${node.title}」完了：${node.reward_description}`, 'good');
    mapEngine.refreshProvinceColors();
    mapEngine.update();
  });
  // 研究ボーナス獲得（国家方針など）
  state.bus.on('research-bonus-added', () => {
    topbar.update(economy);
  });
  // 作戦計画による占領
  state.bus.on('province-captured', ({ planId }) => {
    mapEngine.refreshProvinceColors();
    supply.refresh();
    if (mapEngine.mapMode === 'supply') mapEngine.renderSupplyNetwork();
    mapEngine.renderBattlePlans();
    if (battlePlanUI.planId === planId) battlePlanUI.render();
  });
  state.bus.on('battle-started', () => mapEngine.renderCombatBubbles());
  state.bus.on('battle-lost', () => mapEngine.renderCombatBubbles());

  // 8. 通知系
  // 航空基地の建設完了（供給システムと同じ建設キューを共有）
  state.bus.on('construction-completed', (q) => {
    if (q?.type !== 'air_base') return;
    const level = airWings.completeConstruction(q);
    if (level != null) {
      const p = mapEngine.byId[q.provinceId];
      toast(`${p?.name || q.provinceName} の航空基地が Lv${level} になりました（収容 ${level * 100} 機）`, 'good');
      mapEngine.update();
    }
  });
  // 航空隊の消耗・戦略爆撃
  state.bus.on('air-bombing', (e) => {
    const what = e.destroyed === 'airbase' ? '航空基地'
      : e.destroyed === 'infrastructure' ? 'インフラ'
      : e.destroyed === 'factory' ? `工場（残り ${e.factories}）` : '目標';
    toast(`戦略爆撃：${e.provinceName} の${what}を破壊しました`, 'good');
    mapEngine.update();
  });
  state.bus.on('supply-buildings-changed', ({ provinceId, type, level }) => {
    const p = mapEngine.byId[provinceId];
    const name = type === 'supply_hub' ? '補給ハブ' : 'インフラ';
    if (p) toast(`${p.name} の${name}が Lv${level} になりました`, 'good');
    if (mapEngine.mapMode === 'supply') mapEngine.renderSupplyNetwork();
  });
  state.bus.on('ship-completed', ({ item }) => toast(`${item.name} の建造が完了しました`, 'good'));
  state.bus.on('construction-completed', (q) => toast(`${I18N.t(q.def.name)} の建設が完了しました`, 'good'));
  state.bus.on('war-declared', ({ target }) => toast(`宣戦布告: ${target}`, 'bad'));

  // 9. 初期描画 & 時間開始
  topbar.update(economy);
  mapEngine.update();
  engine.start();

  // デバッグ用に公開
  window.GAME = { state, engine, research, mio, economy, doctrine, intel, diplomacy, politics, modals, topbar, mapEngine, effectEngine, focusMgr, airNaval, gacha, peace, special, nukes, cards, sync, I18N, battlePlan, battlePlanUI, equipDesigner, supply, airWings };
  // 埋め込み元（game/index.html）へ読み込み完了を通知（ローディング解除）
  if (embedded) window.dispatchEvent(new CustomEvent('hoi4:ready'));
  console.log('%c 大戦略ゲーム 起動完了（?mp=host&room=xxx でマルチプレイ時間同期）', 'color:#e6c268;font-size:14px');
}

boot().catch((e) => {
  console.error(e);
  // 起動失敗時もオーバーレイを除去し game-root を可視化（真っ暗固定防止）
  const nsRoot = document.querySelector('.nation-select');
  if (nsRoot) nsRoot.remove();
  const gameRoot = document.getElementById('game-root');
  if (gameRoot) {
    gameRoot.style.filter = '';
    gameRoot.style.display = '';
    gameRoot.style.visibility = '';
    gameRoot.style.pointerEvents = '';
  }
  document.body.insertAdjacentHTML('beforeend', `<div style="color:#d05038;padding:20px;font-family:monospace">起動エラー: ${e.message}<br>${e.stack || ''}</div>`);
});