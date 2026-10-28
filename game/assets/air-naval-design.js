/* ==========================================================
 * air-naval-design.js — BBA 準拠 空軍設計 / MtG 準拠 海軍設計 / 将軍カード割当
 * ----------------------------------------------------------
 *  1. カードパック連携の司令官スロット
 *     - 航空隊 (AirForce の wing) と 任務部隊 (NavalForce の TF) に「司令官スロット」を追加
 *     - game/card/air, game/card/navy から雇用済みカード (エース / 提督 / 司令官) を選択
 *     - 選択したカードのパッシブを「リアルタイム」に反映 (制空権 +15% / CAS +20% / 半径 +100km /
 *       哨戒発見率 +25% / 潜水艦攻撃力 +30% / 全艦退避速度 +15% など)
 *  2. BBA 準拠 空軍設計 (機体 × モジュール) と 作戦半径
 *     - 小型 / 中型 / 大型機体 × エンジン (単発 / 双発 / 4発) × 武装 × 補助装備
 *     - 任務はモジュールから動的に導出 (制空 / CAS / 戦略爆撃 / 核攻撃)
 *     - 選択中の航空隊・基地を中心に作戦半径 (km) の円をマップへ描画し、
 *       空域が円の外へはみ出した割合に応じて任務効率を低下させる
 *  3. MtG 準拠 海軍設計 (船体 × スロット)
 *     - 小型 (DD/CL) / 大型 (CA/BB/CV) / 潜水艦 × 主砲・副砲・魚雷・対空・爆雷・機関・レーダー/ソナー・飛行甲板
 *     - 設計値は 制海権 %・哨戒発見・潜水艦攻撃・退避速度 に反映
 *     - 強襲上陸は 50% 以上の制海権を要求 (index.html / naval-force.js 側で判定)
 *     - 通商破壊で輸送船が枯渇すると 貿易輸入が止まり、前線の組織力が低下する (補給切れ)
 *
 *  既存ファイルのデータ構造をそのまま使い、プロトタイプをラップして拡張する。
 * ========================================================== */
'use strict';

class AirNavalDesign {
  // 既定の作戦半径 450px ≒ 1400km (AirForce.AIRCRAFT の range と整合)
  static PX_PER_KM = 450 / 1400;
  static KM_PER_PX = 1400 / 450;

  // ==========================================================
  // データ: 機体 (BBA Airframe)
  // ==========================================================
  static FRAMES = {
    small:  { id: 'small',  label: '小型機体', short: 'S', icon: '✈️', weight: 6,  payload: 2, speed: 540, rangeKm: 1400, slots: { engine: 1, weapon: 1, aux: 1 }, requires: ['iw_small_airframe', 'small_airframe'] },
    medium: { id: 'medium', label: '中型機体', short: 'M', icon: '🛩️', weight: 14, payload: 5, speed: 440, rangeKm: 1500, slots: { engine: 2, weapon: 2, aux: 2 }, requires: ['iw_medium_airframe', 'medium_airframe'] },
    large:  { id: 'large',  label: '大型機体', short: 'L', icon: '🛫', weight: 30, payload: 9, speed: 360, rangeKm: 2100, slots: { engine: 4, weapon: 3, aux: 3 }, requires: ['iw_large_airframe', 'large_airframe'] }
  };
  static FRAME_ORDER = ['small', 'medium', 'large'];

  static ENGINES = {
    single: { id: 'single', label: '単発エンジン', engine: 1, speed: 0,  weight: 2,  range: 1.00, requires: ['engine_tech_1'] },
    twin:   { id: 'twin',   label: '双発エンジン', engine: 2, speed: 22, weight: 5,  range: 1.15, frames: ['medium', 'large'], requires: ['engine_tech_2'] },
    quad:   { id: 'quad',   label: '4発エンジン', engine: 4, speed: 34, weight: 11, range: 1.35, frames: ['large'], requires: ['engine_tech_3'] }
  };

  static AIR_WEAPONS = {
    light_mg:        { id: 'light_mg',        label: '軽機関銃 7.7mm',   air: 6,  ground: 1,  weight: 1, gun: true },
    heavy_mg:        { id: 'heavy_mg',        label: '重機関銃 12.7mm',  air: 10, ground: 2,  weight: 2, gun: true },
    cannon20:        { id: 'cannon20',        label: '20mm 機関砲',      air: 16, ground: 3,  weight: 3, gun: true, requires: ['artillery2'] },
    cannon30:        { id: 'cannon30',        label: '30mm 機関砲',      air: 22, ground: 4,  weight: 4, gun: true, frames: ['medium', 'large'], requires: ['artillery3'] },
    bomb_rack_light: { id: 'bomb_rack_light', label: '軽爆弾架',         ground: 12, strategic: 4,  weight: 3, cas: true, requires: ['early_bombs'] },
    bomb_rack_heavy: { id: 'bomb_rack_heavy', label: '重爆弾架',         ground: 24, strategic: 12, weight: 6, cas: true, frames: ['medium', 'large'], requires: ['heavy_bombs'] },
    at_cannon:       { id: 'at_cannon',       label: '対戦車機関砲',     ground: 18, hard: 20, weight: 4, cas: true, frames: ['medium', 'large'], requires: ['artillery3'] },
    torpedo:         { id: 'torpedo',         label: '航空魚雷',         ground: 8,  naval: 26, weight: 4, cas: true, frames: ['medium', 'large'], requires: ['air_torpedoe_1'] },
    bomb_bay_large:  { id: 'bomb_bay_large',  label: '大型爆弾倉',       ground: 10, strategic: 30, weight: 9, cas: true, nuclear: true, frames: ['medium', 'large'], requires: ['heavy_bombs'] }
  };

  static AIR_AUX = {
    armor_plate:  { id: 'armor_plate',  label: '防弾装甲',           defense: 12, weight: 3, speed: -10, requires: ['aircraft_construction'] },
    self_sealing: { id: 'self_sealing', label: '自動封鎖式燃料タンク', defense: 8, weight: 2, reliability: 8, requires: ['aircraft_construction'] },
    drop_tank:    { id: 'drop_tank',    label: '落下型増槽',         rangeMul: 0.35, weight: 2, agility: -6 },
    radar_air:    { id: 'radar_air',    label: '対空レーダー',       air: 4, detection: 12, weight: 2, requires: ['radio'] },
    bombsight:    { id: 'bombsight',    label: '爆撃照準器',         strategicMul: 0.2, weight: 1, requires: ['early_bombs'] },
    dive_brake:   { id: 'dive_brake',   label: 'ダイブブレーカー',   groundMul: 0.25, weight: 1, requires: ['early_bombs'] }
  };

  // ==========================================================
  // データ: 船体 (MtG Ship Hull)
  // ==========================================================
  static HULLS = {
    small: { id: 'small', label: '小型船体 (DD/CL)', short: 'DD/CL', icon: '⛴', weight: 18, speed: 33, visibility: 0, slots: { main: 2, torp: 1, aa: 1, engine: 1, radar: 1, depth: 1 }, requires: ['early_ship_hull_light'] },
    large: { id: 'large', label: '大型船体 (CA/BB/CV)', short: 'CA/BB/CV', icon: '♜', weight: 55, speed: 26, visibility: 12, slots: { main: 3, secondary: 1, aa: 2, engine: 1, radar: 1, deck: 1 }, requires: ['early_ship_hull_heavy'] },
    sub:   { id: 'sub',   label: '潜水艦船体 (SS)', short: 'SS', icon: '◉', weight: 14, speed: 18, visibility: -8, slots: { torp: 2, engine: 1, sonar: 1, aa: 1 }, requires: ['early_ship_hull_submarine'] }
  };
  static HULL_ORDER = ['small', 'large', 'sub'];

  static SEA_MODULES = {
    main_light:    { id: 'main_light',    label: '軽巡主砲 152mm',   slot: 'main',      firepower: 16, penetration: 8,  weight: 6 },
    main_medium:   { id: 'main_medium',   label: '重巡主砲 203mm',   slot: 'main',      firepower: 30, penetration: 16, weight: 12, requires: ['early_ship_hull_heavy'] },
    main_heavy:    { id: 'main_heavy',    label: '戦艦主砲 380mm',   slot: 'main',      firepower: 60, penetration: 30, weight: 26, hulls: ['large'], requires: ['early_ship_hull_heavy'] },
    secondary:     { id: 'secondary',     label: '副砲',             slot: 'secondary', firepower: 10, aa: 4,  weight: 5 },
    torpedo_tubes: { id: 'torpedo_tubes', label: '魚雷発射管',       slot: 'torp',      torpedo: 22, weight: 6, hulls: ['small', 'sub'] },
    aa_gun:        { id: 'aa_gun',        label: '対空砲',           slot: 'aa',        aa: 14, weight: 4 },
    depth_charges: { id: 'depth_charges', label: '爆雷投射機',       slot: 'depth',     asw: 22, weight: 4, hulls: ['small'] },
    engine_boiler: { id: 'engine_boiler', label: '機関・ボイラー',   slot: 'engine',    speed: 6, visibility: 6, weight: 8, requires: ['engines_1'] },
    radar:         { id: 'radar',         label: 'レーダー',         slot: 'radar',     detection: 20, weight: 3, requires: ['radio'] },
    sonar:         { id: 'sonar',         label: 'ソナー',           slot: 'sonar',     subDetection: 24, weight: 3, requires: ['radio'] },
    flight_deck:   { id: 'flight_deck',   label: '飛行甲板',         slot: 'deck',      deck: 40, weight: 20, hulls: ['large'], requires: ['early_ship_hull_carrier'] }
  };

  // 既定 (プリセット) 設計 — 航空隊/任務部隊はこれで動き続ける
  static PRESETS = {
    air: {
      fighter: { key: 'preset:fighter', name: '汎用戦闘機', frame: 'small',  modules: { engine: ['single'], weapon: ['heavy_mg'], aux: [] } },
      cas:     { key: 'preset:cas',     name: '近接支援機', frame: 'medium', modules: { engine: ['twin'], weapon: ['bomb_rack_light', 'light_mg'], aux: ['dive_brake'] } },
      bomber:  { key: 'preset:bomber',  name: '戦略爆撃機', frame: 'large',  modules: { engine: ['quad'], weapon: ['bomb_rack_heavy'], aux: ['bombsight'] } }
    },
    sea: {
      destroyer:  { key: 'preset:destroyer',  name: '駆逐艦 (DD)',   hull: 'small', modules: { main: ['main_light'], torp: ['torpedo_tubes'], aa: ['aa_gun'], engine: ['engine_boiler'], radar: ['radar'], depth: ['depth_charges'] } },
      cruiser:    { key: 'preset:cruiser',    name: '巡洋艦 (CL)',   hull: 'small', modules: { main: ['main_light', 'main_light'], torp: ['torpedo_tubes'], aa: ['aa_gun'], engine: ['engine_boiler'], radar: ['radar'], depth: [] } },
      battleship: { key: 'preset:battleship', name: '戦艦 (BB)',     hull: 'large', modules: { main: ['main_heavy', 'main_medium', 'main_medium'], secondary: ['secondary'], aa: ['aa_gun', 'aa_gun'], engine: ['engine_boiler'], radar: ['radar'], deck: [] } },
      carrier:    { key: 'preset:carrier',    name: '空母 (CV)',     hull: 'large', modules: { main: ['main_medium'], secondary: ['secondary'], aa: ['aa_gun', 'aa_gun'], engine: ['engine_boiler'], radar: ['radar'], deck: ['flight_deck'] } },
      submarine:  { key: 'preset:submarine',  name: '潜水艦 (SS)',   hull: 'sub',   modules: { torp: ['torpedo_tubes', 'torpedo_tubes'], engine: ['engine_boiler'], sonar: ['sonar'], aa: [] } }
    }
  };

  // 将軍カードの traits → パッシブ
  static TRAIT_BONUS = {
    fighter_general:      { superiority: 0.15, label: '制空権補正 +15%' },
    air_commander:        { superiority: 0.08, label: '制空権補正 +8%' },
    ace:                  { cas: 0.20, air: 0.10, label: 'CAS 攻撃力 +20%' },
    fighter_ace:          { cas: 0.15, superiority: 0.05, label: 'CAS 攻撃力 +15% / 制空権 +5%' },
    bomber_general:       { strategic: 0.20, label: '戦略爆撃 +20%' },
    strategic_bomber:     { strategic: 0.15, label: '戦略爆撃 +15%' },
    long_range:           { rangeKm: 100, label: '全機作戦半径 +100km' },
    naval_commander:      { detection: 0.10, efficiency: 0.05, label: '哨戒発見率 +10%' },
    patrol_specialist:    { detection: 0.25, label: '哨戒発見率 +25%' },
    submarine_specialist: { subAttack: 0.30, label: '潜水艦攻撃力 +30%' },
    surface_raider:       { raid: 0.20, label: '通商破壊効率 +20%' },
    commerce_raider:      { raid: 0.25, label: '通商破壊効率 +25%' },
    carrier_commander:    { deck: 0.20, label: '艦載機運用 +20%' },
    cautious:             { retreat: 0.15, label: '全艦退避速度 +15%' },
    defensive:            { retreat: 0.10, survivability: 0.10, label: '全艦退避速度 +10% / 生存性 +10%' },
    logistics:            { efficiency: 0.08, label: '任務効率 +8%' }
  };

  // カード ID 個別の上書き (カードパックの代表的な将軍に明確なパッシブを与える)
  static CARD_OVERRIDES = {
    dowding:     { superiority: 0.15, label: '制空権補正 +15% (ダウディング)' },
    hirohito_a:  { superiority: 0.10, efficiency: 0.05, label: '制空権補正 +10% / 任務効率 +5%' },
    hartmann:    { cas: 0.20, superiority: 0.05, label: 'CAS 攻撃力 +20% (ハルトマン)' },
    kesselring_a:{ cas: 0.15, strategic: 0.10, label: 'CAS +15% / 戦略爆撃 +10%' },
    arnold:      { strategic: 0.20, rangeKm: 100, label: '戦略爆撃 +20% / 作戦半径 +100km' },
    tedder:      { rangeKm: 100, efficiency: 0.05, label: '全機作戦半径 +100km' },
    chernyak:    { cas: 0.18, efficiency: 0.05, label: 'CAS 攻撃力 +18%' },
    yamamoto_a:  { superiority: 0.12, deck: 0.15, label: '制空権 +12% / 艦載機 +15%' },
    cunningham:  { detection: 0.25, efficiency: 0.05, label: '哨戒発見率 +25% (カニンガム)' },
    cunningham_uk: { detection: 0.20, retreat: 0.10, label: '哨戒発見率 +20% / 退避速度 +10%' },
    'dönitz':    { subAttack: 0.30, raid: 0.15, label: '潜水艦攻撃力 +30% (デーニッツ)' },
    raeder:      { retreat: 0.15, survivability: 0.10, label: '全艦退避速度 +15% (レーダー)' },
    pound:       { detection: 0.15, deck: 0.10, label: '哨戒発見率 +15% / 艦載機 +10%' },
    kuznetsov:   { torpedo: 0.15, retreat: 0.10, label: '魚雷攻撃 +15% / 退避速度 +10%' },
    okada_n:     { deck: 0.20, detection: 0.10, label: '艦載機 +20% / 哨戒 +10%' },
    yamamoto:    { superiority: 0.15, torpedo: 0.10, label: '制空権 +15% / 魚雷 +10%' }
  };

  static installed = false;
  static draft = { air: null, sea: null };
  static selected = { air: null, sea: null };

  // ==========================================================
  // 状態
  // ==========================================================
  static data() {
    const s = typeof CoreEngine !== 'undefined' ? CoreEngine.gameState : null;
    if (!s || !s.strategy) return null;
    const d = (s.strategy.airnaval ||= {
      designs: { air: {}, sea: {} }, nextDesign: 1,
      wing: {}, tf: {}, cmd: { air: {}, navy: {} },
      nukeLog: [], lastSupplyDay: -1, cut: false, cutReason: ''
    });
    d.designs ||= { air: {}, sea: {} };
    d.designs.air ||= {}; d.designs.sea ||= {};
    d.wing ||= {}; d.tf ||= {};
    d.cmd ||= { air: {}, navy: {} };
    d.cmd.air ||= {}; d.cmd.navy ||= {};
    d.nukeLog ||= [];
    if (!Number.isFinite(d.nextDesign)) d.nextDesign = 1;
    return d;
  }

  static num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  static esc(v) { return typeof GameTools !== 'undefined' && GameTools.escape ? GameTools.escape(String(v ?? '')) : String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  static round1(v) { return Math.round(AirNavalDesign.num(v) * 10) / 10; }
  static clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  static unlocked(option) {
    if (!option) return true;
    const techs = Array.isArray(option.requires) ? option.requires : [];
    if (!techs.length) return true;
    const R = typeof ResearchManager !== 'undefined' ? ResearchManager : null;
    const set = R && R.researchedTech;
    if (!set) return true; // 研究データ未読込はプレビュー解放 (equipment-designer と同じ扱い)
    const has = (id) => (typeof set.has === 'function' ? set.has(id) : Array.isArray(set) && set.includes(id));
    if (techs.some(has)) return true;
    // 研究セットが空 = データ未読込 → プレビュー扱い
    const size = typeof set.size === 'number' ? set.size : (Array.isArray(set) ? set.length : 0);
    return size === 0;
  }

  static moduleAllowed(option, frameOrHull) {
    if (!option) return false;
    if (Array.isArray(option.frames) && !option.frames.includes(frameOrHull)) return false;
    if (Array.isArray(option.hulls) && !option.hulls.includes(frameOrHull)) return false;
    return true;
  }

  // ==========================================================
  // 空軍設計: 計算
  // ==========================================================
  static flatten(modules) {
    const out = [];
    Object.keys(modules || {}).forEach(group => {
      (modules[group] || []).forEach(id => {
        const def = AirNavalDesign.AIR_WEAPONS[id] || AirNavalDesign.AIR_AUX[id] || AirNavalDesign.ENGINES[id] || AirNavalDesign.SEA_MODULES[id];
        if (def) out.push(def);
      });
    });
    return out;
  }

  static airStats(frameId, modules) {
    const frame = AirNavalDesign.FRAMES[frameId] || AirNavalDesign.FRAMES.small;
    const list = AirNavalDesign.flatten(modules);
    let weight = frame.weight;
    let speed = frame.speed;
    let airAttack = 0, groundAttack = 0, hardAttack = 0, strategic = 0, defense = 0, detection = 0, navalAttack = 0, reliability = 0;
    let engines = 0, rangeMul = 1, casMul = 1, strategicMul = 1, agility = 0;
    let nuclear = false, casCapable = false, strategicCapable = false;
    list.forEach(m => {
      weight += AirNavalDesign.num(m.weight);
      speed += AirNavalDesign.num(m.speed);
      airAttack += AirNavalDesign.num(m.air);
      groundAttack += AirNavalDesign.num(m.ground);
      hardAttack += AirNavalDesign.num(m.hard);
      strategic += AirNavalDesign.num(m.strategic);
      defense += AirNavalDesign.num(m.defense);
      detection += AirNavalDesign.num(m.detection);
      navalAttack += AirNavalDesign.num(m.naval);
      reliability += AirNavalDesign.num(m.reliability);
      agility += AirNavalDesign.num(m.agility);
      if (m.engine) engines += AirNavalDesign.num(m.engine);
      if (m.range) rangeMul *= m.range;
      if (m.rangeMul) rangeMul *= (1 + m.rangeMul);
      if (m.groundMul) casMul += m.groundMul;
      if (m.strategicMul) strategicMul += m.strategicMul;
      if (m.nuclear) nuclear = true;
      if (m.cas) casCapable = true;
      if (AirNavalDesign.num(m.strategic) >= 10) strategicCapable = true;
    });
    const engineSpeed = list.filter(m => m.engine).reduce((n, m) => n + AirNavalDesign.num(m.speed), 0);
    // ペイロード上限 = 機体固有 + エンジン数 × 6 (BBA: エンジンで搭載量が決まる)
    const payloadCap = frame.payload * 3 + engines * 6;
    const overWeight = Math.max(0, weight - payloadCap);
    const overload = payloadCap > 0 ? overWeight / payloadCap : 0;
    const finalSpeed = Math.max(120, Math.round((speed + engines * 14) * (1 - AirNavalDesign.clamp(overload, 0, 0.6) * 0.35) + engineSpeed * 0.5));
    const rangeKm = Math.max(200, Math.round(frame.rangeKm * rangeMul * (1 - Math.min(0.4, overload * 0.5))));
    const stats = {
      frame: frame.id, frameLabel: frame.label, weight, payloadCap, overWeight, overload,
      engines, speed: finalSpeed, rangeKm,
      airAttack: Math.round(airAttack), groundAttack: Math.round(groundAttack), hardAttack: Math.round(hardAttack),
      strategic: Math.round(strategic * strategicMul), navalAttack: Math.round(navalAttack),
      defense: Math.round(defense), detection: Math.round(detection), reliability: Math.round(reliability),
      agility: Math.round(60 + agility - overWeight * 2),
      casCapable, strategicCapable, nuclear: nuclear && (frame.id === 'large' || frame.id === 'medium'),
      cost: Math.round((frame.weight + weight) * 0.6 + airAttack * 0.4 + strategic * 0.5)
    };
    stats.missions = AirNavalDesign.missionsOf(stats);
    stats.score = Math.round(stats.airAttack * 1.2 + stats.groundAttack * 1.1 + stats.strategic * 1.3 + stats.navalAttack * 0.8 + stats.speed * 0.05);
    return stats;
  }

  static missionsOf(stats) {
    const list = [];
    if (stats.airAttack > 0) list.push('air_sup');
    if (stats.casCapable) list.push('ground');
    if (stats.strategicCapable) list.push('strategic');
    if (stats.nuclear) list.push('nuclear');
    return list;
  }

  /** 設計の妥当性 (スロット数・機体制限・ペイロード) */
  static validateAir(frameId, modules) {
    const frame = AirNavalDesign.FRAMES[frameId];
    const errors = [];
    if (!frame) return { ok: false, errors: ['機体が選択されていません。'], stats: null };
    const groups = modules || {};
    ['engine', 'weapon', 'aux'].forEach(group => {
      const slots = frame.slots[group] || 0;
      const used = (groups[group] || []).length;
      if (used > slots) errors.push(frame.label + 'の' + ({ engine: 'エンジン', weapon: '武装', aux: '補助' })[group] + 'スロットは' + slots + 'までです。');
    });
    if (!(groups.engine || []).length) errors.push('エンジンは必須です。');
    Object.keys(groups).forEach(group => {
      (groups[group] || []).forEach(id => {
        const def = AirNavalDesign.AIR_WEAPONS[id] || AirNavalDesign.AIR_AUX[id] || AirNavalDesign.ENGINES[id];
        if (!def) { errors.push('不明なモジュール: ' + id); return; }
        if (!AirNavalDesign.moduleAllowed(def, frameId)) errors.push(def.label + 'は' + frame.label + 'に搭載できません。');
        if (!AirNavalDesign.unlocked(def)) errors.push(def.label + 'は未研究です。');
      });
    });
    const stats = AirNavalDesign.airStats(frameId, groups);
    const warnings = [];
    if (stats.overWeight > 0) warnings.push('ペイロード超過 (' + AirNavalDesign.round1(stats.weight) + ' / ' + stats.payloadCap + ') — 速度と航続距離が低下します。');
    return { ok: errors.length === 0, errors, warnings, stats };
  }

  // ==========================================================
  // 海軍設計: 計算
  // ==========================================================
  static seaStats(hullId, modules) {
    const hull = AirNavalDesign.HULLS[hullId] || AirNavalDesign.HULLS.small;
    const list = AirNavalDesign.flatten(modules);
    let weight = hull.weight, speed = hull.speed, firepower = 0, penetration = 0, torpedo = 0, aa = 0, asw = 0;
    let detection = 0, subDetection = 0, visibility = hull.visibility, deck = 0;
    list.forEach(m => {
      weight += AirNavalDesign.num(m.weight);
      speed += AirNavalDesign.num(m.speed);
      firepower += AirNavalDesign.num(m.firepower);
      penetration += AirNavalDesign.num(m.penetration);
      torpedo += AirNavalDesign.num(m.torpedo);
      aa += AirNavalDesign.num(m.aa);
      asw += AirNavalDesign.num(m.asw);
      detection += AirNavalDesign.num(m.detection);
      subDetection += AirNavalDesign.num(m.subDetection);
      visibility += AirNavalDesign.num(m.visibility);
      deck += AirNavalDesign.num(m.deck);
    });
    const overload = Math.max(0, weight - (hull.weight * 2.2));
    const finalSpeed = Math.max(8, Math.round(speed - overload * 0.15));
    const stats = {
      hull: hull.id, hullLabel: hull.label, weight, overload, speed: finalSpeed,
      firepower: Math.round(firepower), penetration: Math.round(penetration), torpedo: Math.round(torpedo),
      aa: Math.round(aa), asw: Math.round(asw), detection: Math.round(detection),
      subDetection: Math.round(subDetection), visibility: Math.round(visibility), deck: Math.round(deck)
    };
    stats.score = Math.round(firepower * 1.4 + penetration * 0.8 + torpedo * 1.1 + aa * 0.6 + asw * 0.7 + detection * 0.5 + deck * 0.9);
    return stats;
  }

  static validateSea(hullId, modules) {
    const hull = AirNavalDesign.HULLS[hullId];
    const errors = [];
    if (!hull) return { ok: false, errors: ['船体が選択されていません。'], stats: null };
    Object.keys(modules || {}).forEach(slot => {
      const used = (modules[slot] || []).length;
      const slots = hull.slots[slot] || 0;
      if (used > slots) errors.push(hull.label + 'の' + slot + 'スロットは' + slots + 'までです。');
    });
    Object.keys(modules || {}).forEach(slot => {
      (modules[slot] || []).forEach(id => {
        const def = AirNavalDesign.SEA_MODULES[id];
        if (!def) { errors.push('不明なモジュール: ' + id); return; }
        if (!AirNavalDesign.moduleAllowed(def, hullId)) errors.push(def.label + 'は' + hull.label + 'に搭載できません。');
        if (!AirNavalDesign.unlocked(def)) errors.push(def.label + 'は未研究です。');
      });
    });
    return { ok: errors.length === 0, errors, stats: AirNavalDesign.seaStats(hullId, modules) };
  }

  // ==========================================================
  // 設計の解決 (航空隊 / 任務部隊 → 設計)
  // ==========================================================
  static designOf(kind, unitId) {
    const d = AirNavalDesign.data();
    if (!d) return null;
    const key = kind === 'air' ? d.wing[unitId] : d.tf[unitId];
    if (!key) return null;
    return (kind === 'air' ? d.designs.air : d.designs.sea)[key] || null;
  }

  static presetForAir(wing) {
    const type = wing && wing.aircraftType;
    const preset = AirNavalDesign.PRESETS.air[type] || AirNavalDesign.PRESETS.air.fighter;
    return { ...preset, preset: true };
  }

  static presetForSea(tf) {
    const counts = {};
    if (tf && Array.isArray(tf.ships) && typeof NavalForce !== 'undefined') {
      NavalForce.shipsOf(tf).forEach(sh => { counts[sh.type] = (counts[sh.type] || 0) + 1; });
    }
    const type = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'destroyer';
    const preset = AirNavalDesign.PRESETS.sea[type] || AirNavalDesign.PRESETS.sea.destroyer;
    return { ...preset, preset: true, shipType: type };
  }

  /** その航空隊が選択できる任務 (設計から導出) */
  static missionAllowed(w, missionId) {
    if (!w) return false;
    if (missionId === 'nuclear') return !!(AirNavalDesign.airStatsOf(w) && AirNavalDesign.airStatsOf(w).nuclear);
    const def = typeof AirForce !== 'undefined' ? AirForce.AIRCRAFT[w.aircraftType] : null;
    return !!(def && Array.isArray(def.missions) && def.missions.includes(missionId));
  }

  /** 航空隊の実効設計 (明示設計 → 機種プリセット) */
  static airDesign(wing) {
    if (!wing) return null;
    const explicit = AirNavalDesign.designOf('air', wing.id);
    return explicit || AirNavalDesign.presetForAir(wing);
  }

  static seaDesign(tf) {
    if (!tf) return null;
    const explicit = AirNavalDesign.designOf('sea', tf.id);
    return explicit || AirNavalDesign.presetForSea(tf);
  }

  static airStatsOf(wing) {
    const design = AirNavalDesign.airDesign(wing);
    if (!design) return null;
    const cache = AirNavalDesign._airCache ||= {};
    const sig = design.frame + '|' + JSON.stringify(design.modules || {});
    if (cache[sig]) return cache[sig];
    const stats = AirNavalDesign.airStats(design.frame, design.modules);
    cache[sig] = stats;
    return stats;
  }

  static seaStatsOf(tf) {
    const design = AirNavalDesign.seaDesign(tf);
    if (!design) return null;
    const cache = AirNavalDesign._seaCache ||= {};
    const sig = design.hull + '|' + JSON.stringify(design.modules || {});
    if (cache[sig]) return cache[sig];
    const stats = AirNavalDesign.seaStats(design.hull, design.modules);
    cache[sig] = stats;
    return stats;
  }

  // ==========================================================
  // 司令官 (カードパック連携)
  // ==========================================================
  static cardBranch(card) {
    if (!card) return '';
    if (card.branch) return card.branch;
    if (/air/.test(card.type || '')) return 'air';
    if (/navy|naval/.test(card.type || '')) return 'navy';
    const traits = (card.traits || []).join(' ').toLowerCase();
    if (/air|fighter|bomber|ace/.test(traits)) return 'air';
    if (/naval|admiral|submarine|carrier|sailor/.test(traits)) return 'navy';
    return '';
  }

  /**
   * 所持カード (配備済み + ガチャで解放済み) をまとめて返す。
   * カードパックは game/card/air, game/card/navy — 自国のパックのみ。
   */
  static ownedCards() {
    const out = [];
    const seen = new Set();
    const add = (card, source) => {
      if (!card || !card.id || seen.has(card.id)) return;
      seen.add(card.id);
      out.push({ ...card, source });
    };
    if (typeof CardSystem === 'undefined') return out;
    (Array.isArray(CardSystem.hiredCards) ? CardSystem.hiredCards : []).forEach(card => add(card, 'hired'));
    const all = CardSystem.allCards || {};
    const country = (typeof CoreEngine !== 'undefined' && CoreEngine.gameState) ? CoreEngine.gameState.country : null;
    const packs = country ? [country] : [];
    packs.forEach(tag => {
      (Array.isArray(all[tag]) ? all[tag] : []).forEach(card => {
        let unlocked = false;
        try { unlocked = typeof CardSystem.isUnlocked === 'function' ? CardSystem.isUnlocked(card.id, tag) : false; } catch (e) { unlocked = false; }
        if (unlocked) add(card, 'pack');
      });
    });
    return out;
  }

  /** 司令官候補 (kind: air | navy) — 所持カードのみ */
  static commanderPool(kind) {
    return AirNavalDesign.ownedCards().filter(card => AirNavalDesign.cardBranch(card) === kind);
  }

  static cardById(cardId) {
    if (!cardId) return null;
    return AirNavalDesign.ownedCards().find(card => card.id === cardId) || null;
  }

  static commanderOf(kind, unitId) {
    const d = AirNavalDesign.data();
    if (!d) return null;
    const id = (kind === 'air' ? d.cmd.air : d.cmd.navy)[unitId];
    return id ? AirNavalDesign.cardById(id) : null;
  }

  /** カード 1 枚のパッシブ (traits + 個別上書き) */
  static cardBonus(card) {
    const out = { superiority: 0, cas: 0, strategic: 0, rangeKm: 0, detection: 0, subAttack: 0, retreat: 0, raid: 0, deck: 0, efficiency: 0, survivability: 0, labels: [] };
    if (!card) return out;
    const override = AirNavalDesign.CARD_OVERRIDES[card.id] || AirNavalDesign.CARD_OVERRIDES[String(card.id).toLowerCase()];
    const apply = (src) => {
      if (!src) return;
      ['superiority', 'cas', 'strategic', 'rangeKm', 'detection', 'subAttack', 'retreat', 'raid', 'deck', 'efficiency', 'survivability'].forEach(key => {
        if (Number.isFinite(Number(src[key]))) out[key] += Number(src[key]);
      });
      if (src.label) out.labels.push(src.label);
    };
    if (override) apply(override);
    (card.traits || []).forEach(trait => apply(AirNavalDesign.TRAIT_BONUS[trait]));
    // カードステータス (attack/defense/speed/agility) → わずかな補正
    const stats = card.stats || {};
    const atk = AirNavalDesign.num(stats.attack);
    out.cas += atk * 0.02;
    out.superiority += atk * 0.02;
    out.detection += AirNavalDesign.num(stats.maneuver) * 0.01;
    out.retreat += AirNavalDesign.num(stats.speed) * 0.02;
    out.labels = [...new Set(out.labels)];
    return out;
  }

  static commanderBonus(kind, unitId) {
    const card = AirNavalDesign.commanderOf(kind, unitId);
    return AirNavalDesign.cardBonus(card);
  }

  /** 割当/解除 — 選択した瞬間に全計算へ反映される */
  static assignCommander(kind, unitId, cardId) {
    const d = AirNavalDesign.data();
    if (!d) return false;
    const table = kind === 'air' ? d.cmd.air : d.cmd.navy;
    if (!cardId) {
      delete table[unitId];
    } else {
      const card = AirNavalDesign.cardById(cardId);
      if (!card) { if (typeof GameUI !== 'undefined') GameUI.notify('🚫 雇用済みのカードではありません。將軍カードウィンドウで雇用してください。', 'alert'); return false; }
      const branch = AirNavalDesign.cardBranch(card);
      if (branch && branch !== kind) { if (typeof GameUI !== 'undefined') GameUI.notify('🚫 ' + (branch === 'air' ? '空軍' : '海軍') + '将軍カードはこのスロットに配置できません。', 'alert'); return false; }
      table[unitId] = cardId;
    }
    AirNavalDesign._airCache = {}; AirNavalDesign._seaCache = {};
    AirNavalDesign.refresh(kind, unitId);
    if (typeof GameUI !== 'undefined') GameUI.notify(cardId ? '🎖 司令官を割り当てました: ' + (AirNavalDesign.cardById(cardId)?.name || cardId) : '司令官を解除しました', 'success');
    if (typeof CoreEngine !== 'undefined' && typeof CoreEngine.log === 'function') CoreEngine.log('🎖 ' + (kind === 'air' ? '航空隊' : '任務部隊') + ' ' + unitId + ' の司令官を変更しました。');
    if (typeof GameUI !== 'undefined') GameUI.closeModal();
    return true;
  }

  static refresh(kind, unitId) {
    if (kind === 'air' && typeof AirForce !== 'undefined') AirForce.render();
    if (kind === 'sea' && typeof NavalForce !== 'undefined') NavalForce.render();
    if (typeof BattlePlanManager !== 'undefined' && BattlePlanManager.renderPanel) BattlePlanManager.renderPanel();
  }

  // ==========================================================
  // 作戦半径 (op radius) と 任務効率
  // ==========================================================
  static rangeKm(wing) {
    const stats = AirNavalDesign.airStatsOf(wing);
    const bonus = AirNavalDesign.commanderBonus('air', wing?.id);
    const base = stats ? stats.rangeKm : (wing?.aircraftType === 'bomber' ? 2100 : 1400);
    return Math.max(100, Math.round(base + AirNavalDesign.num(bonus.rangeKm)));
  }

  /** 作戦半径 (ワールド座標 px) */
  static rangePx(wing) {
    return AirNavalDesign.rangeKm(wing) * AirNavalDesign.PX_PER_KM;
  }

  static zoneDistance(wing) {
    if (!wing || !wing.base || !wing.zone) return 0;
    let dx = Math.abs(wing.zone.x - wing.base[0]);
    const width = (typeof MapRenderer !== 'undefined' && MapRenderer.mapW) || 0;
    if (width > 0) { dx = ((dx % width) + width) % width; dx = Math.min(dx, width - dx); }
    return Math.hypot(dx, wing.zone.y - wing.base[1]);
  }

  /**
   * 割り当てた空域 (半径 zoneRadius) が 作戦半径円 にどれだけ収まっているか
   * coverage 1 = 完全に内側 / 0 = 完全に外側
   */
  static rangeInfo(wing) {
    const r = AirNavalDesign.rangePx(wing);
    if (!wing || !wing.zone || !wing.base || !r) return { coverage: 1, factor: 1, dist: 0, radius: r, rangeKm: AirNavalDesign.rangeKm(wing), coveredKm: AirNavalDesign.rangeKm(wing) };
    const zoneR = (typeof AirForce !== 'undefined' ? AirForce.CONFIG.zoneRadius : 220);
    const dist = AirNavalDesign.zoneDistance(wing);
    const coverage = AirNavalDesign.clamp((r + zoneR - dist) / (zoneR * 2), 0, 1);
    const factor = 0.15 + 0.85 * coverage;
    return { coverage, factor, dist, radius: r, rangeKm: AirNavalDesign.rangeKm(wing), coveredKm: Math.round(AirNavalDesign.rangeKm(wing) * coverage) };
  }

  /** 任務効率 (半径の外へはみ出した割合で低下) × 司令官の効率補正 */
  static efficiency(wing) {
    if (!wing) return 1;
    const info = AirNavalDesign.rangeInfo(wing);
    const cmd = AirNavalDesign.commanderBonus('air', wing.id);
    return Math.max(0.05, info.factor * (1 + AirNavalDesign.num(cmd.efficiency)));
  }

  static zoneCommandBonus(sid) {
    if (typeof AirForce === 'undefined') return 0;
    const wings = AirForce.wings().filter(w => w.executing && AirForce.inZone(w, sid));
    if (!wings.length) return 0;
    let weight = 0, sum = 0;
    wings.forEach(w => {
      const cmd = AirNavalDesign.commanderBonus('air', w.id);
      const eff = Math.max(1, AirForce.effective(w));
      weight += eff; sum += eff * AirNavalDesign.num(cmd.superiority);
    });
    return weight > 0 ? sum / weight : 0;
  }

  static casCommandBonus(sid) {
    if (typeof AirForce === 'undefined') return 0;
    let best = 0;
    AirForce.wings().forEach(w => {
      if (!w.executing || !AirForce.inZone(w, sid)) return;
      if (w.mission !== 'ground') return;
      const cmd = AirNavalDesign.commanderBonus('air', w.id);
      best = Math.max(best, AirNavalDesign.num(cmd.cas));
    });
    return best;
  }

  // ==========================================================
  // 海軍: 設計 + 司令官 → ステータス補正
  // ==========================================================
  static seaMods(tf) {
    if (!tf) return null;
    const cache = AirNavalDesign._seaModCache ||= {};
    const design = AirNavalDesign.seaDesign(tf);
    const cmdId = (AirNavalDesign.data()?.cmd.navy || {})[tf.id] || '';
    const sig = tf.id + '|' + (design ? design.key || (design.hull + JSON.stringify(design.modules)) : '') + '|' + cmdId;
    if (cache[sig]) return cache[sig];
    const stats = AirNavalDesign.seaStatsOf(tf) || { firepower: 0, penetration: 0, torpedo: 0, aa: 0, asw: 0, speed: 0, detection: 0, subDetection: 0, visibility: 0, deck: 0 };
    const cmd = AirNavalDesign.commanderBonus('navy', tf.id);
    const hasSub = typeof NavalForce !== 'undefined' && NavalForce.shipsOf(tf).some(sh => NavalForce.SHIPS[sh.type]?.sub);
    const mods = {
      gun: 1 + stats.firepower / 120,
      torpedo: 1 + stats.torpedo / 90 + (hasSub ? AirNavalDesign.num(cmd.subAttack) : 0) + AirNavalDesign.num(cmd.torpedo),
      aa: 1 + stats.aa / 80,
      spot: 1 + stats.detection / 100 + AirNavalDesign.num(cmd.detection),
      speed: stats.speed / 10 + AirNavalDesign.num(cmd.retreat) * 8,
      asw: stats.asw + stats.subDetection,
      deck: 1 + AirNavalDesign.num(cmd.deck),
      survivability: 1 + AirNavalDesign.num(cmd.survivability),
      raid: 1 + AirNavalDesign.num(cmd.raid),
      penetration: stats.penetration,
      commander: cmd
    };
    cache[sig] = mods;
    return mods;
  }

  // ==========================================================
  // 設計の保存 / 適用
  // ==========================================================
  static saveDesign(kind, name, frameOrHull, modules) {
    const d = AirNavalDesign.data();
    if (!d) return null;
    const check = kind === 'air' ? AirNavalDesign.validateAir(frameOrHull, modules) : AirNavalDesign.validateSea(frameOrHull, modules);
    if (!check.ok) {
      if (typeof GameUI !== 'undefined') GameUI.notify('⚠️ ' + check.errors[0], 'alert');
      return null;
    }
    const key = 'd' + (d.nextDesign++);
    const design = { key, kind, name: String(name || (kind === 'air' ? '新設計' : '新艦級')).slice(0, 24), modules: JSON.parse(JSON.stringify(modules)) };
    if (kind === 'air') design.frame = frameOrHull; else design.hull = frameOrHull;
    (kind === 'air' ? d.designs.air : d.designs.sea)[key] = design;
    AirNavalDesign._airCache = {}; AirNavalDesign._seaCache = {};
    return design;
  }

  static applyDesign(kind, unitId, frameOrHull, modules) {
    const d = AirNavalDesign.data();
    if (!d) return false;
    const saved = AirNavalDesign.saveDesign(kind, (kind === 'air' ? '航空隊設計' : '艦級設計') + ' #' + d.nextDesign, frameOrHull, modules);
    if (!saved) return false;
    if (kind === 'air') d.wing[unitId] = saved.key; else d.tf[unitId] = saved.key;
    AirNavalDesign._airCache = {}; AirNavalDesign._seaCache = {};
    AirNavalDesign.refresh(kind === 'air' ? 'air' : 'sea', unitId);
    if (typeof GameUI !== 'undefined') {
      const stats = kind === 'air' ? AirNavalDesign.airStats(frameOrHull, modules) : AirNavalDesign.seaStats(frameOrHull, modules);
      GameUI.notify('🛠 ' + saved.name + ' を適用しました (' + (kind === 'air' ? '作戦半径 ' + stats.rangeKm + 'km' : '速力 ' + stats.speed + 'kt') + ')', 'success');
      GameUI.closeModal();
    }
    return true;
  }

  static clearDesign(kind, unitId) {
    const d = AirNavalDesign.data();
    if (!d) return;
    if (kind === 'air') delete d.wing[unitId]; else delete d.tf[unitId];
    AirNavalDesign._airCache = {}; AirNavalDesign._seaCache = {};
    AirNavalDesign.refresh(kind, unitId);
    if (typeof GameUI !== 'undefined') GameUI.closeModal();
  }

  // ==========================================================
  // 核攻撃 (大型爆弾倉 + 核備蓄 + 制空権 75%)
  // ==========================================================
  static airSupremacyOf(wing) {
    if (typeof AirForce === 'undefined' || !wing?.zone) return 0;
    const sid = AirForce.zoneSid(wing);
    return sid ? AirForce.superiority(sid).percent : 0;
  }

  static nukeStatus(wing) {
    const s = typeof CoreEngine !== 'undefined' ? CoreEngine.gameState : {};
    const stats = AirNavalDesign.airStatsOf(wing) || {};
    const stock = Math.floor(AirNavalDesign.num(s.nuclearStockpile));
    const sup = AirNavalDesign.airSupremacyOf(wing);
    const requires = {
      frame: ['medium', 'large'].includes(stats.frame),
      bay: !!stats.nuclear,
      stock: stock >= 1,
      superiority: sup >= 75,
      zone: !!wing?.zone,
      cooldown: !(Number(wing?.nukeCooldown) > 0)
    };
    const ok = Object.values(requires).every(Boolean);
    return { ok, requires, stock, sup, stats };
  }

  static launchNuke(wing) {
    const s = typeof CoreEngine !== 'undefined' ? CoreEngine.gameState : null;
    if (!s) return false;
    const status = AirNavalDesign.nukeStatus(wing);
    if (!status.ok) {
      if (typeof GameUI !== 'undefined') {
        const miss = [];
        if (!status.requires.bay) miss.push('大型爆弾倉');
        if (!status.requires.frame) miss.push('中型/大型機体');
        if (!status.requires.stock) miss.push('核爆弾備蓄');
        if (!status.requires.superiority) miss.push('制空権75%');
        if (!status.requires.cooldown) miss.push('再出撃まで ' + Math.ceil(Number(wing?.nukeCooldown) / 24) + ' 日');
        GameUI.notify('☢️ 核攻撃できません: ' + (miss.join(' / ') || '空域未指定'), 'alert');
      }
      return false;
    }
    const sid = AirForce.zoneSid(wing);
    if (!sid) { if (typeof GameUI !== 'undefined') GameUI.notify('☢️ 攻撃目標の空域がありません。', 'alert'); return false; }
    const st = MapRenderer.states[sid];
    if (!st) return false;
    s.nuclearStockpile = Math.max(0, AirNavalDesign.num(s.nuclearStockpile) - 1);
    if (st.b) Object.keys(st.b).forEach(k => { st.b[k] = Math.floor(AirNavalDesign.num(st.b[k]) * 0.3); });
    st.supply = 0;
    s.stability = Math.max(0, AirNavalDesign.num(s.stability) - 3);
    s.warSupport = Math.min(100, AirNavalDesign.num(s.warSupport) + 8);
    if (typeof MapRenderer !== 'undefined' && MapRenderer.addNukeEffectAtState) MapRenderer.addNukeEffectAtState(sid);
    if (typeof MapRenderer !== 'undefined' && MapRenderer.invalidateModes) MapRenderer.invalidateModes();
    wing.nukeCooldown = 240;
    const d = AirNavalDesign.data();
    if (d) d.nukeLog.unshift({ sid, name: st.name || ('州' + sid), at: typeof GameTools !== 'undefined' && GameTools.day ? GameTools.day() : 0 });
    if (typeof CoreEngine !== 'undefined' && typeof CoreEngine.log === 'function') CoreEngine.log('☢️ ' + wing.name + 'が' + (st.name || '州' + sid) + 'へ核攻撃を実施しました。');
    if (typeof GameUI !== 'undefined') GameUI.notify('☢️ 核攻撃: ' + (st.name || '州' + sid) + ' の施設を壊滅させました。', 'alert');
    if (typeof NewsManager !== 'undefined' && NewsManager.fireCustom) {
      NewsManager.fireCustom({ icon: '☢️', title: '原子爆弾投下 — ' + (st.name || '敵都市'), body: '航空隊が核兵器を投下しました。世界は核の時代へ踏み出しました。', reactions: ['恐怖だ…', '報復だ!', '戦争を終わらせろ'] });
    }
    if (typeof MultiplayerManager !== 'undefined' && MultiplayerManager.broadcast) {
      MultiplayerManager.broadcast({ type: 'nuclear_strike', target: st.name || sid, attacker: s.country });
    }
    if (typeof AirForce !== 'undefined') AirForce.render();
    return true;
  }

  // ==========================================================
  // 戦略爆撃 (インフラ / 工場 / 要塞 / 原子炉)
  // ==========================================================
  static strategicStrike(w, sid, sup) {
    if (typeof AirForce !== 'undefined' && (!sid)) sid = AirForce.zoneSid(w);
    const s = CoreEngine.gameState;
    const st = MapRenderer.states[sid];
    if (!st || st.owner === s.country || !(s.atWar || []).includes(st.owner)) return false;
    const stats = AirNavalDesign.airStatsOf(w) || { strategic: 0 };
    const cmd = AirNavalDesign.commanderBonus('air', w.id);
    const power = AirForce.effective(w) * (stats.strategic / 30) * (0.3 + 0.7 * (sup?.ratio ?? 0.5)) * (1 + AirNavalDesign.num(cmd.strategic));
    const chance = Math.min(0.92, power / 40);
    if (Math.random() > chance) return false;
    const names = { infrastructure: 'インフラ', arms_factory: '軍需工場', industrial_complex: '民需工場', air_base: '航空基地', supply_hub: '補給ハブ', bunker: '要塞', coastal_bunker: '沿岸要塞', anti_air_building: '対空砲', nuclear_reactor: '原子炉' };
    const keys = ['infrastructure', 'arms_factory', 'industrial_complex', 'air_base', 'supply_hub', 'bunker', 'coastal_bunker', 'anti_air_building', 'nuclear_reactor'];
    const targets = keys.filter(k => AirNavalDesign.num(st.b?.[k]) > 0);
    if (!targets.length) return false;
    const key = targets[Math.floor(Math.random() * targets.length)];
    st.b[key] = Math.max(0, AirNavalDesign.num(st.b[key]) - 1);
    if (typeof CoreEngine !== 'undefined' && typeof CoreEngine.log === 'function') CoreEngine.log('🏭 ' + w.name + 'の戦略爆撃: ' + (st.name || '州' + sid) + 'の' + names[key] + 'を破壊 (Lv.' + (AirNavalDesign.num(st.b[key]) + 1) + '→' + st.b[key] + ')');
    if (typeof GameUI !== 'undefined') GameUI.notify('🏭 戦略爆撃成功: ' + (st.name || '') + ' ' + names[key] + ' -1', 'success');
    if (typeof MapRenderer !== 'undefined' && MapRenderer.invalidateModes) MapRenderer.invalidateModes();
    return true;
  }

  // ==========================================================
  // 補給 / 通商破壊
  // ==========================================================
  static supplyStatus() {
    const s = typeof CoreEngine !== 'undefined' ? CoreEngine.gameState : null;
    if (!s) return { cut: false, convoy: 1, minSup: 100, reason: '', atWar: false };
    const atWar = Array.isArray(s.atWar) && s.atWar.some(tag => tag !== s.country);
    let convoy = 1;
    if (typeof TradeSystem !== 'undefined' && TradeSystem.convoyInfo) {
      try { convoy = TradeSystem.convoyInfo(s.country).efficiency; } catch (error) { convoy = 1; }
    } else if (typeof ProductionManager !== 'undefined' && ProductionManager.account) {
      const stock = ProductionManager.account(s.country).stock || {};
      convoy = AirNavalDesign.num(stock.convoys) > 0 ? 1 : 0;
    }
    let minSup = 100;
    if (typeof NavalForce !== 'undefined' && NavalForce.tfs) {
      const zones = NavalForce.tfs().filter(tf => tf.executing && tf.zone);
      if (zones.length) minSup = Math.min(...zones.map(tf => NavalForce.superiority(tf.zone.x, tf.zone.y).percent));
    }
    const reasons = [];
    if (atWar && convoy < 0.25) reasons.push('輸送船不足で輸入 ' + Math.round(convoy * 100) + '%');
    if (atWar && minSup < 25) reasons.push('制海権 ' + Math.round(minSup) + '% (25%未満)');
    return { cut: reasons.length > 0, convoy, minSup, reason: reasons.join(' / '), atWar };
  }

  static applySupplyCut() {
    const s = CoreEngine.gameState;
    const d = AirNavalDesign.data();
    const status = AirNavalDesign.supplyStatus();
    if (d) { d.cut = status.cut; d.cutReason = status.reason; }
    if (!status.cut) return false;
    const day = typeof GameTools !== 'undefined' && GameTools.day ? GameTools.day() : 0;
    if (d && d.lastSupplyDay === day) return false;
    if (d) d.lastSupplyDay = day;
    // 前線の組織力低下 (補給切れ)
    (BattlePlanManager.armies || []).forEach(army => {
      army.divisions.forEach(div => { div.org = Math.max(5, AirNavalDesign.num(div.org) - 0.6); });
      if (army.executing) army.status = '補給切れ';
    });
    s.warSupport = Math.max(0, AirNavalDesign.num(s.warSupport) - 0.2);
    if (typeof NavalForce !== 'undefined' && NavalForce.logEvent) NavalForce.logEvent('📉 補給切れ: ' + status.reason + ' — 前線の組織力が低下');
    if (typeof CoreEngine !== 'undefined') CoreEngine.log('📉 海上輸送の断絶: ' + status.reason + ' (前線補給 -)');
    if (typeof GameUI !== 'undefined') GameUI.notify('📉 補給切れ: ' + status.reason + ' — 貿易輸入と前線補給が停止しています。', 'alert');
    return true;
  }

  // ==========================================================
  // 毎日処理 (CAS 自動参加 / 打撃 / 補給)
  // ==========================================================
  static casStrike() {
    if (typeof AirForce === 'undefined' || typeof BattleManager === 'undefined') return;
    const battles = BattleManager.battles || [];
    if (!battles.length) return;
    const s = typeof CoreEngine !== 'undefined' ? CoreEngine.gameState : null;
    battles.forEach(b => {
      const sid = b.stateId != null ? String(b.stateId) : (typeof MapRenderer !== 'undefined' ? String(MapRenderer.stateOf(b.provId) || '') : '');
      if (!sid) return;
      // 攻撃側が自軍の戦闘のみ敵戦力を削る (防衛時は casBonus 側で防御が強化される)
      if (s && b.attacker && b.attacker !== s.country) return;
      const cas = AirForce.wings().filter(w => w.executing && w.mission === 'ground' && AirForce.inZone(w, sid));
      if (!cas.length) return;
      const power = cas.reduce((n, w) => {
        const stats = AirNavalDesign.airStatsOf(w) || { groundAttack: 0 };
        return n + AirForce.effective(w) * (stats.groundAttack / 12);
      }, 0) * (1 + AirNavalDesign.casCommandBonus(sid));
      if (power <= 0) return;
      const dmg = Math.min(6, power * 0.02);
      b.defense = Math.max(1, AirNavalDesign.num(b.defense) - dmg);
      b.advantage = AirNavalDesign.clamp(AirNavalDesign.num(b.advantage) + dmg * 0.02, -1, 1);
      b.casDamage = AirNavalDesign.num(b.casDamage) + dmg;
      b.casWings = cas.map(w => w.name);
      if (Math.random() < 0.25 && typeof CoreEngine !== 'undefined') {
        CoreEngine.log('💥 ' + cas.map(w => w.name).join('・') + ' の近接航空支援: ' + (MapRenderer.states[sid]?.name || '前線') + ' の敵戦力を削りました (-' + AirNavalDesign.round1(dmg) + ')');
      }
    });
  }

  /** CAS 任務の航空隊は進行中の地上戦へ自動参加する */
  static autoJoinBattles() {
    if (typeof AirForce === 'undefined' || typeof BattleManager === 'undefined') return;
    const battles = BattleManager.battles || [];
    if (!battles.length) return;
    AirForce.wings().forEach(w => {
      if (w.executing || w.mission !== 'ground' || !w.zone || w.autoJoin === false) return;
      const stats = AirNavalDesign.airStatsOf(w);
      if (!stats || !stats.casCapable || w.aircraftCount <= 0) return;
      const sid = AirForce.zoneSid(w);
      const battle = battles.find(b => String(b.stateId) === String(sid));
      if (!battle) return;
      w.executing = true; w.progress = 0;
      if (typeof CoreEngine !== 'undefined') CoreEngine.log('💥 ' + w.name + ' が ' + (MapRenderer.states[sid]?.name || '前線') + ' の地上戦へ自動参加 (CAS)');
    });
  }

  static onTick() {
    const s = typeof CoreEngine !== 'undefined' ? CoreEngine.gameState : null;
    if (!s || typeof MapRenderer === 'undefined' || !MapRenderer.ready) return;
    if (typeof AirForce === 'undefined') return;
    const d = AirNavalDesign.data();
    if (!d) return;
    // 核の再使用待ち
    AirForce.wings().forEach(w => { if (w.nukeCooldown > 0) w.nukeCooldown -= 1; });
    const day = typeof GameTools !== 'undefined' && GameTools.day ? GameTools.day() : Math.floor(Date.now() / 86400000);
    if (d.lastDay === day) return;
    d.lastDay = day;
    AirNavalDesign.autoJoinBattles();
    AirNavalDesign.casStrike();
    AirNavalDesign.applySupplyCut();
  }

  // ==========================================================
  // マップ描画: 作戦半径の円 (半透明グラデーション)
  // ==========================================================
  static drawRangeCircles(ctx, w2s) {
    if (typeof AirForce === 'undefined' || typeof MapRenderer === 'undefined' || !MapRenderer.ready) return;
    const wings = AirForce.wings().filter(w => w.base && w.aircraftCount > 0);
    if (!wings.length) return;
    const selectedId = AirForce.selectedWingId
      || (typeof BattlePlanManager !== 'undefined' && BattlePlanManager.activeForce === 'air' ? BattlePlanManager.selectedUnitId : null)
      || AirNavalDesign.selected.air;
    const focus = wings.filter(w => w.id === selectedId);
    const list = focus.length ? focus : wings.filter(w => w.executing);
    if (!list.length) return;
    const scale = MapRenderer.cam.scale;
    ctx.save();
    list.forEach(w => {
      const center = w2s(w.base[0], w.base[1]);
      const rPx = AirNavalDesign.rangePx(w) * scale;
      if (!(rPx > 2)) return;
      const info = AirNavalDesign.rangeInfo(w);
      const good = info.factor >= 0.85;
      const mid = info.factor >= 0.5;
      const color = good ? [90, 200, 140] : mid ? [230, 190, 70] : [225, 90, 80];
      const gradient = ctx.createRadialGradient(center[0], center[1], 0, center[0], center[1], rPx);
      gradient.addColorStop(0, 'rgba(' + color.join(',') + ',0.20)');
      gradient.addColorStop(0.55, 'rgba(' + color.join(',') + ',0.10)');
      gradient.addColorStop(1, 'rgba(' + color.join(',') + ',0.015)');
      ctx.beginPath(); ctx.arc(center[0], center[1], rPx, 0, Math.PI * 2);
      ctx.fillStyle = gradient; ctx.fill();
      ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(' + color.join(',') + ',0.75)';
      ctx.stroke();
      ctx.setLineDash([]);
      // 半径ラベル
      const km = AirNavalDesign.rangeKm(w);
      const label = '✈ 作戦半径 ' + km + 'km' + (info.factor < 1 ? ' (' + Math.round(info.coverage * 100) + '%)' : '');
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + 10;
      const lx = center[0] - tw / 2, ly = center[1] - rPx - 10;
      ctx.fillStyle = 'rgba(6,12,18,0.82)'; ctx.fillRect(lx, ly, tw, 16);
      ctx.strokeStyle = 'rgba(' + color.join(',') + ',0.9)'; ctx.lineWidth = 1; ctx.strokeRect(lx, ly, tw, 16);
      ctx.fillStyle = 'rgb(' + color.join(',') + ')'; ctx.fillText(label, lx + 5, ly + 8);
      // 空域が円の外へはみ出している場合の警告
      if (info.factor < 1) {
        const zone = w2s(w.zone.x, w.zone.y);
        ctx.strokeStyle = 'rgba(' + color.join(',') + ',0.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(center[0], center[1]); ctx.lineTo(zone[0], zone[1]); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgb(' + color.join(',') + ')';
        ctx.fillText('任務効率 ' + Math.round(info.factor * 100) + '%', (center[0] + zone[0]) / 2, (center[1] + zone[1]) / 2 - 8);
      }
    });
    ctx.restore();
  }

  // ==========================================================
  // UI: スロット (航空隊 / 任務部隊 カードに埋め込む)
  // ==========================================================
  static wingSlotHTML(w) {
    if (!w) return '';
    const design = AirNavalDesign.airDesign(w);
    const stats = AirNavalDesign.airStatsOf(w);
    const card = AirNavalDesign.commanderOf('air', w.id);
    const bonus = AirNavalDesign.cardBonus(card);
    const info = AirNavalDesign.rangeInfo(w);
    const eff = Math.round(AirNavalDesign.efficiency(w) * 100);
    const designLabel = design ? (design.preset ? 'プリセット ' : '') + AirNavalDesign.esc(design.name) : '未設定';
    const frame = stats ? (AirNavalDesign.FRAMES[stats.frame]?.short || stats.frame) : '-';
    return '<div class="and-slots" onclick="event.stopPropagation()">' +
      '<button class="and-slot" onclick="AirNavalDesign.openDesigner(\'air\',\'' + w.id + '\')" title="機体設計 (BBA): 機体・エンジン・武装・補助装備">' +
      '<span class="and-slot-tag">🛠 設計</span><b>' + designLabel + '</b>' +
      '<small>' + frame + ' / ' + (stats ? stats.rangeKm : '-') + 'km / 速度' + (stats ? stats.speed : '-') + 'km/h</small></button>' +
      '<button class="and-slot cmd' + (card ? ' filled' : '') + '" onclick="AirNavalDesign.openCommanderPicker(\'air\',\'' + w.id + '\')" title="司令官スロット: 空軍将軍カードのパッシブをリアルタイム適用">' +
      '<span class="and-slot-tag">🎖 司令官</span><b>' + (card ? AirNavalDesign.esc(card.name) : '＋ 空軍将軍カードを配置') + '</b>' +
      '<small>' + (card ? AirNavalDesign.esc((bonus.labels[0] || 'パッシブ') + (bonus.labels.length > 1 ? ' 他' : '')) : '未配置 — クリックで選択') + '</small></button>' +
      '<span class="and-eff' + (eff < 70 ? ' bad' : eff < 100 ? ' warn' : '') + '" title="空域が作戦半径円に収まっている割合 × 司令官効率">効率 ' + eff + '%' +
      (info.factor < 1 ? '<small>圏外 ' + Math.round((1 - info.coverage) * 100) + '%</small>' : '') + '</span>' +
      '</div>';
  }

  static tfSlotHTML(tf) {
    if (!tf) return '';
    const design = AirNavalDesign.seaDesign(tf);
    const stats = AirNavalDesign.seaStatsOf(tf);
    const card = AirNavalDesign.commanderOf('navy', tf.id);
    const bonus = AirNavalDesign.cardBonus(card);
    return '<div class="and-slots" onclick="event.stopPropagation()">' +
      '<button class="and-slot" onclick="AirNavalDesign.openDesigner(\'sea\',\'' + tf.id + '\')" title="艦艇設計 (MtG): 船体・主砲・魚雷・対空・爆雷・機関・レーダー/ソナー・飛行甲板">' +
      '<span class="and-slot-tag">🛠 設計</span><b>' + (design ? (design.preset ? 'プリセット ' : '') + AirNavalDesign.esc(design.name) : '未設定') + '</b>' +
      '<small>' + (stats ? '火力' + stats.firepower + ' / 魚雷' + stats.torpedo + ' / 速力' + stats.speed + 'kt' : '-') + '</small></button>' +
      '<button class="and-slot cmd' + (card ? ' filled' : '') + '" onclick="AirNavalDesign.openCommanderPicker(\'navy\',\'' + tf.id + '\')" title="提督スロット: 海軍将軍カードのパッシブをリアルタイム適用">' +
      '<span class="and-slot-tag">🎖 提督</span><b>' + (card ? AirNavalDesign.esc(card.name) : '＋ 提督カードを配置') + '</b>' +
      '<small>' + (card ? AirNavalDesign.esc((bonus.labels[0] || 'パッシブ') + (bonus.labels.length > 1 ? ' 他' : '')) : '未配置 — クリックで選択') + '</small></button>' +
      '</div>';
  }

  static supplyBannerHTML() {
    const status = AirNavalDesign.supplyStatus();
    const d = AirNavalDesign.data();
    const warn = status.convoy < 0.6 || status.minSup < 50;
    const cls = status.cut ? 'cut' : warn ? 'warn' : 'ok';
    return '<div class="and-supply ' + cls + '">' +
      '<b>' + (status.cut ? '📉 補給切れ' : warn ? '⚠ 補給注意' : '🚢 海上補給 正常') + '</b>' +
      '<span>輸入効率 ' + Math.round(status.convoy * 100) + '% ／ 最低制海権 ' + Math.round(status.minSup) + '%</span>' +
      (status.cut ? '<span class="and-supply-reason">' + AirNavalDesign.esc(status.reason) + ' — 貿易輸入・前線補給が停止</span>' : '') +
      '</div>';
  }

  // ==========================================================
  // UI: 機体/艦艇 設計モーダル
  // ==========================================================
  static openDesigner(kind, unitId) {
    if (typeof GameUI === 'undefined') return;
    if (!AirNavalDesign.draft[kind] || AirNavalDesign.draft[kind].unitId !== unitId) {
      const current = kind === 'air' ? AirNavalDesign.airDesign(AirForce.wing(unitId)) : AirNavalDesign.seaDesign(NavalForce.tf(unitId));
      AirNavalDesign.draft[kind] = {
        unitId, kind,
        frame: kind === 'air' ? (current?.frame || 'small') : (current?.hull || 'small'),
        modules: JSON.parse(JSON.stringify(current?.modules || { engine: ['single'], weapon: ['heavy_mg'], aux: [] }))
      };
      if (kind === 'sea') AirNavalDesign.draft[kind].modules = JSON.parse(JSON.stringify(current?.modules || { main: ['main_light'] }));
    }
    AirNavalDesign.selected[kind] = unitId;
    AirNavalDesign.renderDesigner(kind, unitId);
  }

  static renderDesigner(kind, unitId) {
    const draft = AirNavalDesign.draft[kind];
    if (!draft) return;
    const isAir = kind === 'air';
    const unit = isAir ? AirForce.wing(unitId) : NavalForce.tf(unitId);
    const unitName = unit ? unit.name : unitId;
    const check = isAir ? AirNavalDesign.validateAir(draft.frame, draft.modules) : AirNavalDesign.validateSea(draft.frame, draft.modules);
    const stats = check.stats || (isAir ? AirNavalDesign.airStats(draft.frame, draft.modules) : AirNavalDesign.seaStats(draft.frame, draft.modules));
    const options = isAir ? AirNavalDesign.FRAME_ORDER : AirNavalDesign.HULL_ORDER;
    const defs = isAir ? AirNavalDesign.FRAMES : AirNavalDesign.HULLS;
    let html = '<div class="and-modal">' +
      '<div class="and-modal-head"><div><h3>' + (isAir ? '🛠 機体設計 — ' : '🛠 艦艇設計 — ') + AirNavalDesign.esc(unitName) + '</h3>' +
      '<small>' + (isAir ? 'BBA 準拠: 機体サイズ × エンジン (速度/ペイロード上限) × 武装 × 補助装備。任務はモジュールから自動導出されます。'
        : 'MtG 準拠: 船体 × 主砲/副砲 × 魚雷 × 対空 × 爆雷 × 機関/ボイラー × レーダー/ソナー × 飛行甲板。') + '</small></div></div>' +
      '<div class="and-frames">' + options.map(id => {
        const def = defs[id];
        const locked = !AirNavalDesign.unlocked(def);
        return '<button class="and-frame' + (draft.frame === id ? ' selected' : '') + (locked ? ' locked' : '') + '" onclick="AirNavalDesign.pickFrame(\'' + kind + '\',\'' + unitId + '\',\'' + id + '\')">' +
          '<b>' + def.icon + ' ' + def.label + '</b><small>' + (isAir ? 'エンジン' + def.slots.engine + ' / 武装' + def.slots.weapon + ' / 補助' + def.slots.aux + ' ／ 基本' + def.rangeKm + 'km' : '速力' + def.speed + 'kt ／ スロット ' + Object.keys(def.slots).length) + '</small>' +
          (locked ? '<em>🔒 要研究</em>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="and-slots-grid">' + AirNavalDesign.slotEditors(kind, draft) + '</div>' +
      '<div class="and-stats">' + AirNavalDesign.statsHTML(isAir, stats) + '</div>' +
      ((check.errors || []).length ? '<div class="and-errors">' + check.errors.map(e => '<div>✖ ' + AirNavalDesign.esc(e) + '</div>').join('') + '</div>' : '') +
      ((check.warnings || []).length ? '<div class="and-warnings">' + check.warnings.map(e => '<div>⚠ ' + AirNavalDesign.esc(e) + '</div>').join('') + '</div>' : '') +
      '<div class="and-mission-preview"><b>実行可能な任務:</b>' + (isAir ? (stats.missions || []).map(m => {
        const def = (typeof AirForce !== 'undefined' && AirForce.MISSIONS[m]) || { label: m, icon: '·' };
        return '<span class="and-mission' + (m === 'nuclear' ? ' nuke' : '') + '">' + def.icon + ' ' + def.label + '</span>';
      }).join('') || '<span class="sn-help">武装がありません</span>' : AirNavalDesign.seaMissionHTML(stats)) + '</div>' +
      '<div class="and-modal-actions">' +
      '<button class="dd-btn primary" ' + (check.ok ? '' : 'disabled') + ' onclick="AirNavalDesign.applyDesign(\'' + kind + '\',\'' + unitId + '\',\'' + draft.frame + '\',AirNavalDesign.draftModules(\'' + kind + '\'))">✔ この設計を適用</button>' +
      '<button class="dd-btn" onclick="AirNavalDesign.clearDesign(\'' + kind + '\',\'' + unitId + '\')">↺ プリセットに戻す</button>' +
      '<button class="dd-btn" onclick="AirNavalDesign.openEquipmentDesigner(\'' + kind + '\')" title="総合設計は上部ナビの「兵器設計」画面で行えます">⚙ 兵器設計を開く</button>' +
      '<button class="dd-btn ghost" onclick="GameUI.closeModal()">閉じる</button>' +
      '</div>' +
      '<p class="and-hint">総合的な装備設計は上部ナビの「🛠️ 兵器設計」画面でも行えます。ここでは部隊に採用する設計と司令官を決めます。</p>' +
      '</div></div>';
    GameUI.openModal((isAir ? '✈️ 機体設計 — ' : '⚓ 艦艇設計 — ') + unitName, html);
  }

  static seaMissionHTML(stats) {
    const list = ['patrol', 'strike', 'raid', 'escort'];
    return list.map(m => {
      const def = (typeof NavalForce !== 'undefined' && NavalForce.MISSIONS[m]) || { label: m, icon: '·' };
      return '<span class="and-mission">' + def.icon + ' ' + def.label + '</span>';
    }).join('');
  }

  /**
   * 既存の「兵器設計」ウィンドウ (上部ナビ 🛠️ 兵器設計) を該当カテゴリで開く。
   * 総合設計画面はそちらが担当し、このモーダルは部隊ごとの設計採用と司令官の割当を担う。
   */
  static openEquipmentDesigner(kind) {
    try {
      if (typeof EquipmentDesigner !== 'undefined' && typeof EquipmentDesigner.setCategory === 'function') {
        EquipmentDesigner.setCategory(kind === 'air' ? 'plane' : 'ship');
      }
    } catch (e) { /* ignore */ }
    try { GameUI.closeModal(); GameUI.switchTab('designer'); } catch (e) { /* ignore */ }
    try { if (typeof EquipmentDesigner !== 'undefined') EquipmentDesigner.render(); } catch (e) { /* ignore */ }
    return true;
  }

  static draftModules(kind) {
    const draft = AirNavalDesign.draft[kind];
    return draft ? JSON.parse(JSON.stringify(draft.modules)) : {};
  }

  static slotEditors(kind, draft) {
    const isAir = kind === 'air';
    const defs = isAir ? AirNavalDesign.FRAMES[draft.frame] : AirNavalDesign.HULLS[draft.frame];
    const slotMap = defs.slots;
    const lib = isAir
      ? { engine: Object.values(AirNavalDesign.ENGINES), weapon: Object.values(AirNavalDesign.AIR_WEAPONS), aux: Object.values(AirNavalDesign.AIR_AUX) }
      : (() => {
        const out = {};
        Object.values(AirNavalDesign.SEA_MODULES).forEach(m => { (out[m.slot] ||= []).push(m); });
        return out;
      })();
    const labels = { engine: 'エンジン', weapon: '武装', aux: '補助装備', main: '主砲', secondary: '副砲', torp: '魚雷', aa: '対空砲', depth: '爆雷', radar: 'レーダー', sonar: 'ソナー', deck: '飛行甲板' };
    const groups = Object.keys(slotMap);
    return groups.map(group => {
      const count = slotMap[group];
      const list = lib[group] || [];
      let html = '<div class="and-slot-group"><div class="and-slot-group-title">' + (labels[group] || group) + ' <small>' + count + ' スロット</small></div>';
      for (let i = 0; i < count; i++) {
        const current = (draft.modules[group] || [])[i] || '';
        html += '<select class="and-select" onchange="AirNavalDesign.setSlot(\'' + kind + '\',\'' + group + '\',' + i + ',this.value)">' +
          '<option value="">— 空き —</option>' +
          list.map(def => {
            const allowed = AirNavalDesign.moduleAllowed(def, draft.frame);
            const unlocked = AirNavalDesign.unlocked(def);
            return '<option value="' + def.id + '"' + (current === def.id ? ' selected' : '') + (allowed && unlocked ? '' : ' disabled') + '>' +
              def.label + (allowed ? '' : ' (不可)') + (unlocked ? '' : ' 🔒') + (def.nuclear ? ' ☢' : '') + '</option>';
          }).join('') + '</select>';
      }
      html += '</div>';
      return html;
    }).join('');
  }

  static pickFrame(kind, unitId, frameId) {
    const draft = AirNavalDesign.draft[kind];
    if (!draft) return;
    draft.frame = frameId;
    if (kind === 'sea') draft.modules = AirNavalDesign.autoLoadout('sea', frameId) || {};
    if (kind === 'air') draft.modules = AirNavalDesign.autoLoadout('air', frameId) || {};
    AirNavalDesign.renderDesigner(kind, unitId);
  }

  static autoLoadout(kind, frameId) {
    if (kind === 'air') {
      const preset = frameId === 'large' ? AirNavalDesign.PRESETS.air.bomber : frameId === 'medium' ? AirNavalDesign.PRESETS.air.cas : AirNavalDesign.PRESETS.air.fighter;
      return JSON.parse(JSON.stringify(preset.modules));
    }
    const preset = frameId === 'large' ? AirNavalDesign.PRESETS.sea.battleship : frameId === 'sub' ? AirNavalDesign.PRESETS.sea.submarine : AirNavalDesign.PRESETS.sea.destroyer;
    return JSON.parse(JSON.stringify(preset.modules));
  }

  static setSlot(kind, group, index, value) {
    const draft = AirNavalDesign.draft[kind];
    if (!draft) return;
    const list = (draft.modules[group] ||= []);
    while (list.length <= index) list.push('');
    list[index] = value;
    draft.modules[group] = list.filter(Boolean).length || value ? list : [];
    // 空きは詰める (スロット数の整合を保つ)
    draft.modules[group] = list.filter(Boolean);
    AirNavalDesign.renderDesigner(kind, draft.unitId);
  }

  static statsHTML(isAir, stats) {
    const rows = isAir ? [
      ['最高速度', stats.speed + ' km/h'], ['作戦半径', stats.rangeKm + ' km'],
      ['対空攻撃', stats.airAttack], ['対地攻撃', stats.groundAttack],
      ['対装甲', stats.hardAttack], ['戦略爆撃', stats.strategic],
      ['対艦攻撃', stats.navalAttack], ['防御', stats.defense],
      ['ペイロード', AirNavalDesign.round1(stats.weight) + ' / ' + stats.payloadCap],
      ['生産コスト', stats.cost + ' IC']
    ] : [
      ['速力', stats.speed + ' kt'], ['火力', stats.firepower], ['貫通', stats.penetration],
      ['魚雷', stats.torpedo], ['対空', stats.aa], ['対潜 (爆雷)', stats.asw],
      ['レーダー', stats.detection], ['ソナー', stats.subDetection], ['視界', stats.visibility],
      ['搭載機', stats.deck], ['重量', AirNavalDesign.round1(stats.weight)]
    ];
    return rows.map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('') +
      (stats.overWeight > 0 ? '<div class="and-stat-warn"><span>⚠ ペイロード超過</span><b>-' + Math.round(stats.overload * 100) + '%</b></div>' : '');
  }

  // ==========================================================
  // UI: 司令官ピッカー
  // ==========================================================
  static openCommanderPicker(kind, unitId) {
    if (typeof GameUI === 'undefined') return;
    const unit = kind === 'air' ? AirForce.wing(unitId) : NavalForce.tf(unitId);
    const pool = AirNavalDesign.commanderPool(kind);
    const current = AirNavalDesign.commanderOf(kind, unitId);
    const label = kind === 'air' ? '空軍将軍' : '提督';
    let html = '<div class="and-modal"><div class="and-modal-head"><div><h3>🎖 ' + label + 'スロット — ' + AirNavalDesign.esc(unit ? unit.name : unitId) + '</h3>' +
      '<small>雇用済みの' + label + 'カードから選択します。パッシブは選択した瞬間に全航空機/全艦艇へ反映されます。</small></div></div>';
    if (!pool.length) {
      html += '<div class="and-empty">雇<strong>用済みの' + label + 'カードがありません。</strong>' +
        '<p>「将軍カード」ウィンドウで ' + (kind === 'air' ? '空軍 (エース / 司令官)' : '海軍 (提督)') + ' カードを雇用してください。' +
        (typeof CardSystem !== 'undefined' && CardSystem.allCards ? '<br><small>カードパック: ' + (kind === 'air' ? 'game/card/air, game/card/' + (CoreEngine.gameState.country || 'GER') : 'game/card/navy') + '</small>' : '') + '</p></div>';
    } else {
      html += '<div class="and-card-list">' + pool.map(card => {
        const bonus = AirNavalDesign.cardBonus(card);
        const active = current && current.id === card.id;
        return '<button class="and-card' + (active ? ' active' : '') + '" onclick="AirNavalDesign.assignCommander(\'' + kind + '\',\'' + unitId + '\',\'' + card.id + '\')">' +
          '<div class="and-card-head"><b>' + AirNavalDesign.esc(card.name) + '</b><small>' + AirNavalDesign.esc(card.nation || card.country || '') + ' / ' + AirNavalDesign.esc(card.rarity || '') + '</small></div>' +
          '<div class="and-card-traits">' + (card.traits || []).map(t => '<span>' + AirNavalDesign.esc(t) + '</span>').join('') + '</div>' +
          '<div class="and-card-bonus">' + (bonus.labels.length ? bonus.labels.map(l => '<div>✔ ' + AirNavalDesign.esc(l) + '</div>').join('') : '<div>✔ 汎用指揮 (+2%)</div>') + '</div>' +
          (active ? '<em class="and-active-tag">配属中</em>' : '') + '</button>';
      }).join('') + '</div>';
    }
    html += '<div class="and-modal-actions">' +
      (current ? '<button class="dd-btn danger" onclick="AirNavalDesign.assignCommander(\'' + kind + '\',\'' + unitId + '\',null)">✖ 司令官を解除</button>' : '') +
      '<button class="dd-btn" onclick="GameUI.closeModal();GameUI.switchTab(\'cards\')">🎴 将軍カードウィンドウ</button>' +
      '<button class="dd-btn ghost" onclick="GameUI.closeModal()">閉じる</button></div></div>';
    GameUI.openModal((kind === 'air' ? '✈ 空軍将軍カード' : '⚓ 提督カード'), html);
  }

  // ==========================================================
  // フック
  // ==========================================================
  static init() {
    if (AirNavalDesign.installed) return;
    AirNavalDesign.installed = true;
    AirNavalDesign.installAirHooks();
    AirNavalDesign.installNavalHooks();
    if (typeof CoreEngine !== 'undefined' && CoreEngine.registerTickCallback) CoreEngine.registerTickCallback(() => AirNavalDesign.onTick());
    if (typeof CoreEngine !== 'undefined' && CoreEngine.log) {
      CoreEngine.log('🛠 BBA 機体設計 / MtG 艦艇設計 有効: 航空隊・任務部隊のカードから設計と司令官を設定できます。');
    }
  }

  static installAirHooks() {
    if (typeof AirForce === 'undefined') return;
    if (AirForce.MISSIONS && !AirForce.MISSIONS.nuclear) {
      AirForce.MISSIONS.nuclear = { id: 'nuclear', label: '核攻撃', icon: '☢️', color: '#ff7a1a', desc: '大型爆弾倉を装備した中型/大型機が、制空権75%以上の空域へ核爆弾を投下します。' };
    }
    if (typeof BattlePlanManager !== 'undefined' && Array.isArray(BattlePlanManager.missions?.air)) {
      if (!BattlePlanManager.missions.air.some(m => m.id === 'nuclear')) BattlePlanManager.missions.air.push({ id: 'nuclear', label: '核攻撃' });
    }
    // 任務効率 (作戦半径 + 司令官)
    if (!AirForce._andEffective) {
      const origEffective = AirForce.effective.bind(AirForce);
      AirForce.effective = (w) => origEffective(w) * AirNavalDesign.efficiency(w);
      AirForce._andEffective = true;
    }
    // 制空権への司令官補正
    if (!AirForce._andSuperiority) {
      const origSup = AirForce.superiority.bind(AirForce);
      AirForce.superiority = (sid) => {
        const r = origSup(sid);
        const bonus = AirNavalDesign.zoneCommandBonus(sid);
        if (!bonus) return r;
        const own = r.own * (1 + bonus);
        const total = own + r.enemy;
        const ratio = total > 0 ? own / total : 0.5;
        return { ...r, own, ratio, percent: Math.round(ratio * 100),
          level: total <= 0 ? 'none' : ratio >= 0.75 ? 'dominant' : ratio >= 0.5 ? 'advantage' : ratio >= 0.25 ? 'contested' : 'lost',
          commanderBonus: bonus };
      };
      AirForce._andSuperiority = true;
    }
    // CAS ボーナスへの司令官補正
    if (!AirForce._andCas) {
      const origCas = AirForce.casBonus.bind(AirForce);
      AirForce.casBonus = (battle) => {
        const base = origCas(battle);
        if (base <= 0) return base;
        const sid = battle.stateId != null ? String(battle.stateId) : String(MapRenderer.stateOf(battle.provId) || '');
        const bonus = AirNavalDesign.casCommandBonus(sid);
        return Math.min(AirForce.CONFIG.casMax * 1.5, base * (1 + bonus));
      };
      AirForce._andCas = true;
    }
    // 作戦半径 (設計 km → px)
    if (typeof BattlePlanManager !== 'undefined' && !BattlePlanManager._andRange) {
      const origRange = BattlePlanManager.airRange.bind(BattlePlanManager);
      BattlePlanManager.airRange = (unit) => {
        if (!unit || unit.type !== 'air') return origRange(unit);
        const design = AirNavalDesign.designOf('air', unit.id);
        if (!design) return origRange(unit) + AirNavalDesign.num(AirNavalDesign.commanderBonus('air', unit.id).rangeKm) * AirNavalDesign.PX_PER_KM;
        return AirNavalDesign.rangePx(unit);
      };
      BattlePlanManager._andRange = true;
    }
    // 任務制限 (核攻撃は設計依存)
    if (!AirForce._andSetMission && typeof AirForce.setMission === 'function') {
      const origSetMission = AirForce.setMission.bind(AirForce);
      AirForce.setMission = (id, mission) => {
        const w = AirForce.wing(id);
        if (!w) return;
        if (mission === 'nuclear') {
          const status = AirNavalDesign.nukeStatus(w);
          if (!status.requires.bay || !status.requires.frame) { GameUI.notify('☢️ 核攻撃には中型/大型機体 + 大型爆弾倉が必要です (設計ウィンドウ)。', 'alert'); return; }
          if (!status.requires.zone) { GameUI.notify('☢️ 先に空域を指定してください。', 'alert'); return; }
          w.mission = 'nuclear'; if (w.zone) w.zone.mission = 'nuclear';
          if (BattlePlanManager.selectedUnitId === id) BattlePlanManager.activeMission.air = 'nuclear';
          AirForce.render();
          return;
        }
        origSetMission(id, mission);
      };
      AirForce._andSetMission = true;
    }
    // 航空隊の選択に追従 (作戦半径円の対象)
    if (!AirForce._andSelect && typeof AirForce.select === 'function') {
      const origSelect = AirForce.select.bind(AirForce);
      AirForce.select = (id) => { AirNavalDesign.selected.air = id; origSelect(id); };
      AirForce._andSelect = true;
    }
    // 描画: 作戦半径の円
    if (!AirForce._andDraw && typeof AirForce.draw === 'function') {
      const origDraw = AirForce.draw.bind(AirForce);
      AirForce.draw = (ctx, w2s) => { AirNavalDesign.drawRangeCircles(ctx, w2s); origDraw(ctx, w2s); };
      AirForce._andDraw = true;
    }
  }

  static installNavalHooks() {
    if (typeof NavalForce === 'undefined') return;
    if (!NavalForce._andStats) {
      const origStats = NavalForce.stats.bind(NavalForce);
      NavalForce.stats = (tf) => {
        const out = origStats(tf);
        const mods = AirNavalDesign.seaMods(tf);
        if (!mods) return out;
        out.gun *= mods.gun;
        out.torpedo *= mods.torpedo;
        out.aa *= mods.aa;
        out.spot *= mods.spot;
        out.speed += mods.speed;
        out.planes *= mods.deck;
        out.asw = (out.asw || 0) + mods.asw;
        out.subDetection = mods.asw;
        out.raid = (out.raid || 1) * mods.raid;
        out.penetration = mods.penetration;
        out.power = out.gun + out.torpedo + out.aa * 0.5 + out.planes * 1.2 + (out.asw || 0) * 0.15;
        return out;
      };
      NavalForce._andStats = true;
    }
    // 海軍ウィンドウに補給バナーを追加
    if (!NavalForce._andRender) {
      const origRender = NavalForce.render.bind(NavalForce);
      NavalForce.render = () => {
        origRender();
        const el = document.getElementById('navy-content');
        if (!el) return;
        const banner = document.createElement('div');
        banner.className = 'and-supply-wrap';
        banner.innerHTML = AirNavalDesign.supplyBannerHTML();
        const root = el.querySelector('.nf-root');
        if (root) root.parentNode.insertBefore(banner, root); else el.appendChild(banner);
      };
      NavalForce._andRender = true;
    }
  }

  /** 強襲上陸に必要な制海権 (MtG: 50%) */
  static INVASION_SUPREMACY = 50;
}

if (typeof window !== 'undefined') window.AirNavalDesign = AirNavalDesign;
