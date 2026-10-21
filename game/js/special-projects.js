/**
 * special-projects.js — 特別研究計画（Special Projects）
 *
 * game/eng/tec/special/data/science.json の科学者データと
 * game/assets/special_projects, game/assets/scientists の画像を使用。
 * プロジェクトに科学者を割り当て、研究を進行させる。
 */

import { el } from './util.js';
import { I18N } from './i18n.js';
import { toast } from './util.js';

const SCIENCE_URL = 'game/eng/tec/special/data/science.json';

export class SpecialProjectManager {
  constructor(state) {
    this.state = state;
    this.scientists = []; // {id, name, category, icon, portrait, ...}
    this.projects = {};   // projectId -> {id, name, desc, category, baseDays, progressDays, assignedScientistId, completed}
    this.loaded = false;
  }

  async load() {
    try {
      const res = await fetch(SCIENCE_URL, { cache: 'no-cache' });
      const data = await res.json();
      this.scientists = data.scientists || [];
      // プロジェクト初期化（科学者カテゴリ別にデフォルトプロジェクトを生成）
      const cats = [...new Set(this.scientists.map((s) => s.category))];
      for (const cat of cats) {
        const projId = `sp_${cat}`;
        this.projects[projId] = {
          id: projId,
          name: this._projectName(cat),
          desc: this._projectDesc(cat),
          category: cat,
          baseDays: cat === 'nuclear' ? 120 : 60,
          progressDays: 0,
          assignedScientistId: null,
          completed: false,
        };
      }
      // 保存済み状態があれば復元
      if (this.state.specialProjects) {
        for (const [k, v] of Object.entries(this.state.specialProjects)) {
          if (this.projects[k]) Object.assign(this.projects[k], v);
        }
      }
    } catch (e) {
      console.warn('[special-projects] ロード失敗', e);
    }
    this.loaded = true;
    return this;
  }

  _projectName(cat) {
    const names = { nuclear: 'マンハッタン計画（核開発）', air: 'ジェット・ロケット開発' };
    return names[cat] || cat;
  }
  _projectDesc(cat) {
    const descs = { nuclear: '原子爆弾の開発を目指す特別研究計画です。', air: '次世代航空機の開発を行います。' };
    return descs[cat] || '';
  }

  /** 科学者をプロジェクトに割り当て */
  assignScientist(projectId, scientistId) {
    const proj = this.projects[projectId];
    const sci = this.scientists.find((s) => s.id === scientistId);
    if (!proj || !sci) return false;
    if (sci.category !== proj.category) {
      toast(`${sci.name} は${proj.category}分野の専門外です`, 'bad');
      return false;
    }
    // 他プロジェクトから解除
    for (const p of Object.values(this.projects)) {
      if (p.assignedScientistId === scientistId) p.assignedScientistId = null;
    }
    proj.assignedScientistId = scientistId;
    toast(`${proj.name} に${sci.name} を割り当てました`, 'info');
    this.state.bus.emit('special-project-changed');
    return true;
  }

  /** 科学者を解除 */
  unassignScientist(projectId) {
    const proj = this.projects[projectId];
    if (proj) proj.assignedScientistId = null;
  }

  /** Tick: 1時間ぶん進行 */
  tick(tag, hours) {
    const dayFrac = hours / 24;
    for (const proj of Object.values(this.projects)) {
      if (proj.completed) continue;
      if (!proj.assignedScientistId) continue;
      const sci = this.scientists.find((s) => s.id === proj.assignedScientistId);
      if (!sci) continue;
      // 科学者ボーナス: 分野一致で基礎日数を短縮
      const speed = 1 + (sci.category === proj.category ? 0.5 : 0);
      proj.progressDays += dayFrac * speed;
      if (proj.progressDays >= proj.baseDays) {
        this._complete(proj);
      }
    }
    this._syncState();
  }

  _complete(proj) {
    proj.completed = true;
    if (proj.category === 'nuclear') {
      this.state.nuclearResearched = true;
      this.state.nukes = (this.state.nukes || 0) + 1;
      toast('核開発が完了しました。核弾頭を1つ獲得。', 'good');
    }
    this.state.bus.emit('special-project-completed', proj);
  }

  _syncState() {
    this.state.specialProjects = {};
    for (const [k, v] of Object.entries(this.projects)) {
      this.state.specialProjects[k] = {
        progressDays: v.progressDays,
        assignedScientistId: v.assignedScientistId,
        completed: v.completed,
      };
    }
  }

  isCompleted(projectId) { return !!this.projects[projectId]?.completed; }

  progressPct(projectId) {
    const proj = this.projects[projectId];
    if (!proj) return 0;
    return Math.min(1, proj.progressDays / proj.baseDays);
  }
}

export default SpecialProjectManager;
