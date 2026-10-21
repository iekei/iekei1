/**
 * diplomacy.js — 外交マネージャ（フル実装）
 *
 * - 国家プロファイル表示
 *   関係改善 / 不可侵条約 / 独立保証 / 陣営加盟・招待 / 義勇軍派遣 /
 *   戦争目標正当化 / 宣戦布告 / 講和
 * - 各アクションに政治力(PP)コストと、世界緊張度(World Tension)・
 *   イデオロギーに基づく実行条件判定を組み込む
 */

import { I18N } from './i18n.js';
import { toast } from './util.js';
import { MAJORS, NATIONS, nationName, MINOR_STATES } from './data/nations.js';

const FACTION_NAMES = {
  axis: '枢軸国', allies: '連合国', comintern: 'コミンテルン',
};
const FACTION_LEADERS = { axis: 'GER', allies: 'ENG', comintern: 'SOV' };

export class DiplomacyManager {
  constructor(state) {
    this.state = state;
  }

  /** プレイヤー以外の主要国一覧 */
  others() { return MAJORS.filter((t) => t !== this.state.playerTag); }

  relations(tag) { return this.state.diplomacy.relations[tag] ?? 0; }

  isAtWar(tag) { return this.state.atWarWith.has(tag); }

  /** 陣営所属状態 */
  factionOf(tag) {
    for (const [id, f] of Object.entries(this.state.factions)) {
      if (f.members.includes(tag)) return id;
    }
    return null;
  }

  isInSameFaction(tag) {
    const p = this.factionOf(this.state.playerTag);
    const t = this.factionOf(tag);
    return p && t && p === t;
  }

  factionLeader(factionId) {
    const f = this.state.factions[factionId];
    return f ? f.leader : null;
  }

  /** 外交モーダルで初期選択する国を指定 */
  select(tag) { this._selected = tag; }

  /* ================= 関係変更 ================= */

  addRelations(tag, amount) {
    const r = this.state.diplomacy.relations;
    r[tag] = Math.max(-100, Math.min(100, (r[tag] ?? 0) + amount));
    this.state.bus.emit('diplomacy-changed', { tag });
  }

  /** 武官派遣（10 PP: 関係+15, 諜報価値+5） */
  sendAttache(tag) {
    if (this.state.pp < 10) return { ok: false, msg: '政治力不足' };
    if (this.isAtWar(tag)) return { ok: false, msg: '開戦中は派遣不可' };
    this.state.pp -= 10;
    this.addRelations(tag, 15);
    this.state.intel.intelValue[tag] = (this.state.intel.intelValue[tag] || 0) + 5;
    toast(`${nationName(tag)} へ武官を派遣しました`, 'info');
    return { ok: true };
  }

  /** 関係改善（25 PP: 関係+20） */
  improveRelations(tag) {
    if (this.state.pp < 25) return { ok: false, msg: '政治力不足' };
    if (this.isAtWar(tag)) return { ok: false, msg: '開戦中は改善不可' };
    this.state.pp -= 25;
    this.addRelations(tag, 20);
    toast(`${nationName(tag)} との関係が改善しました`, 'good');
    return { ok: true };
  }

  /** 戦争目標の正当化（100 PP: 戦争協力度+10、世界緊張度上昇） */
  justifyWarGoal(tag) {
    if (this.state.pp < 100) return { ok: false, msg: '政治力不足' };
    if (this.isAtWar(tag)) return { ok: false, msg: '既に開戦中' };
    const wt = this.state.worldTension || 0;
    if (wt > 80) return { ok: false, msg: '世界緊張度が高すぎるため正当化不可' };
    this.state.pp -= 100;
    this.state.warSupport = Math.min(100, this.state.warSupport + 10);
    this.state.worldTension = Math.min(100, wt + 5);
    if (!this.state.warGoals) this.state.warGoals = {};
    this.state.warGoals[tag] = { justified: true, at: this.state.dateLabel, type: 'conquest' };
    toast(`${nationName(tag)} への戦争目標を正当化しました（戦争協力度+10%）`, 'info');
    this.state.bus.emit('diplomacy-changed', { tag });
    return { ok: true };
  }

  /** 独立保障（25 PP） */
  guarantee(tag) {
    if (this.state.pp < 25) return { ok: false, msg: '政治力不足' };
    if (this.isAtWar(tag)) return { ok: false, msg: '開戦中は保障不可' };
    this.state.pp -= 25;
    this.state.diplomacy.guarantees.add(tag);
    toast(`${nationName(tag)} の独立を保障しました`, 'info');
    return { ok: true };
  }

  /** 不可侵条約（30 PP: 関係+10、両国不戦。世界緊張度低下） */
  nonAggressionPact(tag) {
    if (this.state.pp < 30) return { ok: false, msg: '政治力不足' };
    if (this.isAtWar(tag)) return { ok: false, msg: '開戦中は締結不可' };
    if (this.isInSameFaction(tag)) return { ok: false, msg: '同陣営国とは不要' };
    this.state.pp -= 30;
    if (!this.state.diplomacy.pacts) this.state.diplomacy.pacts = new Set();
    this.state.diplomacy.pacts.add(tag);
    this.addRelations(tag, 10);
    this.state.worldTension = Math.max(0, (this.state.worldTension || 0) - 2);
    toast(`${nationName(tag)} と不可侵条約を締結しました`, 'info');
    return { ok: true };
  }

  /** 陣営への招待（対象が自国陣営に加わる） */
  inviteToFaction(tag) {
    const myFaction = this.factionOf(this.state.playerTag);
    if (!myFaction) return { ok: false, msg: '自国がどの陣営にも属していません' };
    if (this.factionOf(tag) === myFaction) return { ok: false, msg: '既に同陣営です' };
    if (this.state.factions[myFaction].leader !== this.state.playerTag) {
      return { ok: false, msg: '自国は陣営の盟主ではありません' };
    }
    if (this.state.pp < 50) return { ok: false, msg: '政治力不足' };
    this.state.pp -= 50;
    this.state.worldTension = Math.min(100, (this.state.worldTension || 0) + 3);
    this.state.factions[myFaction].members = [...new Set([...this.state.factions[myFaction].members, tag])];
    toast(`${nationName(tag)} を${FACTION_NAMES[myFaction]}に招待しました`, 'info');
    this.state.bus.emit('faction-changed');
    return { ok: true };
  }

  /** 陣営への加盟（自国が対象陣営に加わる） */
  joinFaction(tag) {
    const f = this.state.factions[tag];
    if (!f) return { ok: false, msg: '陣営が存在しません' };
    if (this.factionOf(this.state.playerTag) === tag) return { ok: false, msg: '既に加盟しています' };
    if (this.isAtWar(tag)) return { ok: false, msg: '敵国陣営には加盟不可' };
    if (this.state.pp < 75) return { ok: false, msg: '政治力不足' };
    const leaderTag = f.leader;
    if (this.relations(leaderTag) < 20) {
      return { ok: false, msg: `盟主(${nationName(leaderTag)})との関係が低すぎます` };
    }
    this.state.pp -= 75;
    this.state.worldTension = Math.min(100, (this.state.worldTension || 0) + 5);
    this.state.faction = tag;
    f.members = [...new Set([...f.members, this.state.playerTag])];
    toast(`${FACTION_NAMES[tag]}に加盟しました（盟主: ${nationName(leaderTag)}）`, 'info');
    this.state.bus.emit('faction-changed');
    return { ok: true };
  }

  /** 義勇軍派遣（50 PP: 対象国に師団を貸与。戦争協力度要25%） */
  sendVolunteers(tag) {
    if (this.state.warSupport < 25) return { ok: false, msg: '戦争協力度が不足' };
    if (this.state.pp < 50) return { ok: false, msg: '政治力不足' };
    if (!this.isAtWar(tag)) return { ok: false, msg: '対象国と開戦中である必要があります' };
    this.state.pp -= 50;
    this.state.units.army = Math.max(0, this.state.units.army - 10);
    toast(`${nationName(tag)} に義勇軍を派遣しました`, 'info');
    return { ok: true };
  }

  /** 宣戦布告（戦争目標正当化済かつ戦争協力度25%消費。世界緊張度上昇） */
  declareWar(tag) {
    if (this.isAtWar(tag)) return { ok: false, msg: '既に開戦中' };
    const cost = 25;
    if (this.state.warSupport < cost) return { ok: false, msg: '戦争協力度不足' };
    const wg = (this.state.warGoals && this.state.warGoals[tag]);
    if (!wg?.justified) {
      return { ok: false, msg: '戦争目標を正当化してから開戦してください' };
    }
    this.state.warSupport -= cost;
    this.state.atWarWith.add(tag);
    this.state.diplomacy.wars.add(tag);
    this.addRelations(tag, -100);
    this.state.worldTension = Math.min(100, (this.state.worldTension || 0) + 10);
    delete this.state.warGoals[tag];
    toast(`${nationName(tag)} に宣戦布告しました！`, 'bad');
    this.state.bus.emit('war-declared', { target: tag });
    return { ok: true };
  }

  /** 講和（戦争協力度10%消費） */
  makePeace(tag) {
    if (!this.isAtWar(tag)) return { ok: false, msg: '開戦していません' };
    if (this.state.warSupport < 10) return { ok: false, msg: '戦争協力度不足' };
    this.state.warSupport -= 10;
    this.state.atWarWith.delete(tag);
    this.state.diplomacy.wars.delete(tag);
    this.addRelations(tag, 30);
    toast(`${nationName(tag)} と講和しました`, 'info');
    this.state.bus.emit('peace-made', { target: tag });
    return { ok: true };
  }

  /** プロファイル（UI用） */
  profile(tag) {
    const n = NATIONS[tag] || MINOR_STATES[tag];
    if (!n) return null;
    return {
      tag, name: n.name, flag: n.flag, ideology: n.ideology,
      leader: n.leader, relations: this.relations(tag),
      atWar: this.isAtWar(tag),
      ideologySupport: n.ideologySupport,
      faction: this.factionOf(tag),
    };
  }

  /** 外交アクション一覧（実行可能性判定付き） */
  actionsFor(tag) {
    const acts = [];
    const atWar = this.isAtWar(tag);
    const sameFac = this.isInSameFaction(tag);
    const rel = this.relations(tag);
    const myFac = this.factionOf(this.state.playerTag);

    acts.push({ id: 'attache', label: '武官派遣', cost: 10,
      ok: this.state.pp >= 10 && !atWar, reason: this.state.pp < 10 ? '政治力不足' : '' });

    acts.push({ id: 'improve', label: '関係改善', cost: 25,
      ok: this.state.pp >= 25 && !atWar, reason: this.state.pp < 25 ? '政治力不足' : '' });

    acts.push({ id: 'nonaggression', label: '不可侵条約', cost: 30,
      ok: this.state.pp >= 30 && !atWar && !sameFac,
      reason: this.state.pp < 30 ? '政治力不足' : sameFac ? '同陣営' : '開戦中' });

    acts.push({ id: 'guarantee', label: '独立保証', cost: 25,
      ok: this.state.pp >= 25 && !atWar, reason: this.state.pp < 25 ? '政治力不足' : '' });

    acts.push({ id: 'justify', label: '戦争目標の正当化', cost: 100,
      ok: this.state.pp >= 100 && !atWar && (this.state.worldTension || 0) <= 80,
      reason: this.state.pp < 100 ? '政治力不足' : atWar ? '開戦中' : '世界緊張度が高すぎる' });

    acts.push({ id: 'inviteFaction', label: `${FACTION_NAMES[myFac || 'axis']}へ招待`, cost: 50,
      ok: !!myFac && this.state.factions[myFac].leader === this.state.playerTag && !sameFac && this.state.pp >= 50,
      reason: !myFac ? '陣営非加盟' : this.state.factions[myFac].leader !== this.state.playerTag ? '盟主ではない' : this.state.pp < 50 ? '政治力不足' : '' });

    if (myFac) {
      acts.push({ id: 'joinFaction', label: `${FACTION_NAMES[myFac]}に加盟`, cost: 75,
        ok: !sameFac && !atWar && this.state.pp >= 75 && this.relations(this.state.factions[myFac].leader) >= 20,
        reason: sameFac ? '既に加盟' : atWar ? '開戦中' : this.state.pp < 75 ? '政治力不足' : '関係不足' });
    }

    acts.push({ id: 'volunteers', label: '義勇軍派遣', cost: 50,
      ok: atWar && this.state.pp >= 50 && this.state.warSupport >= 25,
      reason: !atWar ? '非開戦' : this.state.pp < 50 ? '政治力不足' : '戦争協力度不足' });

    acts.push({ id: 'declareWar', label: '宣戦布告', cost: null, danger: true,
      ok: !atWar && this.state.warSupport >= 25 && !!(this.state.warGoals && this.state.warGoals[tag]?.justified),
      reason: atWar ? '開戦中' : this.state.warSupport < 25 ? '戦争協力度不足' : '戦争目標未正当化' });

    if (atWar) {
      acts.push({ id: 'makePeace', label: '講和', cost: 10,
        ok: this.state.warSupport >= 10, reason: this.state.warSupport < 10 ? '戦争協力度不足' : '' });
    }

    return acts;
  }
}

export { FACTION_NAMES };
