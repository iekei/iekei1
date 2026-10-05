/** Dependency-tree view and click details. ResearchManager owns all game rules. */
const ResearchTreeUI = {
  width: 154,
  height: 116,
  selectedId: null,
  anchor: null,
  detail: null,

  // Longest prerequisite depth with separate lanes for disconnected branches.
  // Data coordinates only order branches; wrapping a long chain never reverses its arrows.
  layout(techs) {
    const byId = new Map(techs.map(tech => [tech.id, tech]));
    const adjacency = new Map(techs.map(tech => [tech.id, new Set()]));
    techs.forEach(tech => (tech.prerequisites || []).forEach(id => {
      if (!byId.has(id)) return;
      adjacency.get(tech.id).add(id);
      adjacency.get(id).add(tech.id);
    }));
    const depth = new Map();
    const visiting = new Set();
    const rank = id => {
      if (depth.has(id)) return depth.get(id);
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const parents = (byId.get(id).prerequisites || []).filter(parent => byId.has(parent));
      const value = parents.length ? Math.max(...parents.map(rank)) + 1 : 0;
      visiting.delete(id);
      depth.set(id, value);
      return value;
    };
    techs.forEach(tech => rank(tech.id));
    const positions = new Map();
    const seen = new Set();
    const lanes = [];
    let column = 0;
    [...techs].sort((a, b) => (a.x || 0) - (b.x || 0) || (a.y || 0) - (b.y || 0)).forEach(tech => {
      if (seen.has(tech.id)) return;
      const stack = [tech.id];
      const component = [];
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        component.push(byId.get(id));
        adjacency.get(id).forEach(other => stack.push(other));
      }
      const rows = new Map();
      component.sort((a, b) => (a.x || 0) - (b.x || 0) || a.id.localeCompare(b.id)).forEach(item => {
        const row = depth.get(item.id);
        if (!rows.has(row)) rows.set(row, []);
        rows.get(row).push(item);
      });
      const columns = Math.max(...[...rows.values()].map(row => row.length));
      rows.forEach((items, row) => items.forEach((item, index) => {
        positions.set(item.id, { x: 54 + (column + index) * 190, y: 64 + row * 150 });
      }));
      const root = component.filter(item => !(item.prerequisites || []).some(id => byId.has(id)))
        .sort((a, b) => (a.x || 0) - (b.x || 0))[0] || component[0];
      lanes.push({ x: 54 + column * 190, width: columns * 190 - 36, title: root.title });
      column += columns;
    });
    return { positions, lanes, width: Math.max(420, 72 + column * 190),
      height: Math.max(360, 64 + (Math.max(0, ...depth.values()) + 1) * 150), depth };
  },

  status(tech) {
    if (ResearchManager.researchedTech.has(tech.id)) return { className: 'researched', text: '研究済み' };
    const active = Object.values(ResearchManager.researching).find(entry => entry.techId === tech.id);
    if (active) return { className: 'researching', text: '研究中 ' + Math.floor(active.progress / active.total * 100) + '%' };
    const available = (tech.prerequisites || []).every(id => ResearchManager.researchedTech.has(id));
    const penalty = ResearchManager.researchPenalty(tech);
    let text = available ? '研究可能' : '前提技術が必要';
    if (available && penalty.percent > 0) text += ' (先取り+' + penalty.percent + '%)';
    return { className: available ? 'available' : 'locked', text, penalty };
  },

  image(tech, category) {
    const asset = ResearchIcons.resolve(tech, category);
    const image = document.createElement('img');
    image.className = 'tech-icon';
    image.alt = '';
    image.dataset.iconKey = asset.key;
    image.dataset.assetCategory = asset.source;
    image.dataset.weaponCategory = category;
    image.decoding = 'async';
    // 失敗時: ローカル未収録ならGitHub URLにリトライ → それでも無駄ならカテゴリ描画へ
    let githubTried = false;
    image.addEventListener('error', () => {
      if (asset.github && !githubTried) {
        githubTried = true;
        image.src = asset.github;
      } else {
        image.src = ResearchIcons.fallback(category);
      }
    });
    if (asset.src.startsWith('data:')) image.src = asset.src;
    else {
      image.dataset.src = asset.src;
      ImageLoader.observe(image);
    }
    return image;
  },

  render() {
    const category = ResearchManager.currentCategory;
    const techs = ResearchManager.techData[category] || [];
    const nodes = document.getElementById('research-nodes');
    const viewport = document.getElementById('research-tree-viewport');
    const lines = document.getElementById('research-svg-lines');
    const definition = ResearchIcons.categories[category];
    document.getElementById('research-category-title').textContent = definition.label + ' 技術ツリー';
    document.getElementById('research-category-summary').textContent = techs.length + ' 技術 · 接続線は前提技術を示します · クリックで詳細';
    const focusedId = nodes.contains(document.activeElement) ? document.activeElement.dataset.techId : null;
    nodes.querySelectorAll('img').forEach(image => ImageLoader.observer?.unobserve(image));
    nodes.replaceChildren();
    lines.replaceChildren();
    const layout = this.layout(techs);
    viewport.style.minWidth = layout.width + 'px';
    viewport.style.minHeight = layout.height + 'px';
    lines.setAttribute('width', layout.width);
    lines.setAttribute('height', layout.height);
    lines.style.width = layout.width + 'px';
    lines.style.height = layout.height + 'px';
    layout.lanes.forEach(lane => {
      const label = document.createElement('div');
      label.className = 'research-lane-label';
      label.style.left = lane.x + 'px';
      label.style.width = lane.width + 'px';
      label.textContent = lane.title;
      nodes.appendChild(label);
    });
    if (!techs.length) {
      const empty = document.createElement('p');
      empty.textContent = '技術データがありません。';
      empty.style.padding = '24px';
      nodes.appendChild(empty);
    }
    techs.forEach(tech => {
      const position = layout.positions.get(tech.id);
      (tech.prerequisites || []).forEach(id => {
        const parent = layout.positions.get(id);
        if (!parent) return;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const x1 = parent.x + this.width / 2, y1 = parent.y + this.height;
        const x2 = position.x + this.width / 2, y2 = position.y;
        const mid = (y1 + y2) / 2;
        path.setAttribute('d', `M${x1},${y1} V${mid} H${x2} V${y2}`);
        path.setAttribute('fill', 'none');
        path.dataset.prerequisite = id;
        path.dataset.techId = tech.id;
        path.dataset.ready = String(ResearchManager.researchedTech.has(id));
        lines.appendChild(path);
      });
      const state = this.status(tech);
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'tech-node ' + state.className + (this.selectedId === tech.id ? ' selected' : '');
      node.dataset.techId = tech.id;
      node.setAttribute('aria-label', tech.title + '、' + (tech.year || '年代未設定') + '年、' + state.text + '、詳細を開く');
      node.setAttribute('aria-haspopup', 'dialog');
      node.setAttribute('aria-expanded', String(this.selectedId === tech.id));
      node.style.left = position.x + 'px';
      node.style.top = position.y + 'px';
      node.appendChild(this.image(tech, category));
      const title = document.createElement('span');
      title.className = 'tn-title';
      title.textContent = tech.title;
      const meta = document.createElement('span');
      meta.className = 'tn-meta';
      const penalty = state.penalty;
      let metaText = (tech.year || '—') + '年 · ' + (tech.research_time || 100) + '日';
      if (tech.firepower && tech.firepower > 0) metaText += ' · 火力' + tech.firepower;
      if (penalty && penalty.percent > 0) metaText += ' · 先取り+' + penalty.percent + '%';
      meta.textContent = metaText;
      const status = document.createElement('span');
      status.className = 'tn-status';
      status.textContent = state.text;
      node.append(title, meta, status);
      node.addEventListener('click', () => this.showDetail(tech, node));
      nodes.appendChild(node);
      if (focusedId === tech.id) node.focus({ preventScroll: true });
      if (this.selectedId === tech.id) this.anchor = node;
    });
    if (this.selectedId && this.detail && !this.detail.classList.contains('hidden')) {
      const selected = techs.find(tech => tech.id === this.selectedId);
      if (selected) this.populateDetail(selected);
      else this.closeDetail();
    }
    // Load secondary mappings only when the research window is actually opened.
    if (viewport.closest('.os-window') && !this.assetsLoaded && !this.loadingAssets) {
      this.loadingAssets = true;
      ResearchIcons.load().then(() => {
        this.assetsLoaded = true;
        this.loadingAssets = false;
        if (viewport.closest('.os-window')) this.render();
      });
    }
  },

  ensureDetail() {
    if (this.detail) return;
    this.detail = document.createElement('section');
    this.detail.id = 'research-detail';
    this.detail.className = 'hidden';
    this.detail.setAttribute('role', 'dialog');
    this.detail.setAttribute('aria-labelledby', 'tech-detail-title');
    this.detail.innerHTML = '<button type="button" class="tech-detail-close" aria-label="技術詳細を閉じる">×</button>' +
      '<div class="tech-detail-header"><div class="tech-detail-image"></div><div><h3 id="tech-detail-title"></h3><p class="tech-detail-subtitle"></p></div></div>' +
      '<p class="tech-detail-desc"></p><h4>技術の効果</h4><ul class="tech-detail-effects"></ul>' +
      '<h4>前提技術</h4><div class="tech-detail-prerequisites"></div><button type="button" class="tech-detail-action"></button>';
    document.body.appendChild(this.detail);
    this.detail.querySelector('.tech-detail-close').addEventListener('click', () => this.closeDetail(true));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !this.detail.classList.contains('hidden')) this.closeDetail(true);
    });
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest('#research-detail, .tech-node')) this.closeDetail();
    });
    window.addEventListener('resize', () => this.closeDetail());
    document.getElementById('research-tree-container').addEventListener('scroll', () => this.closeDetail(), { passive: true });
  },

  populateDetail(tech) {
    const category = ResearchManager.currentCategory;
    const state = this.status(tech);
    const detail = this.detail;
    detail.dataset.techId = tech.id;
    detail.querySelector('#tech-detail-title').textContent = tech.title;
    const imageContainer = detail.querySelector('.tech-detail-image');
    imageContainer.querySelectorAll('img').forEach(image => ImageLoader.observer?.unobserve(image));
    imageContainer.replaceChildren(this.image(tech, category));
    const penalty = ResearchManager.researchPenalty(tech);
    let subtitle = ResearchIcons.categories[category].label + ' / ' + (tech.year || '—') + '年 / 研究 ' + (tech.research_time || 100) + '日';
    if (penalty.percent > 0) subtitle += ' / 先取りペナルティ +' + penalty.percent + '% (' + Math.round((tech.research_time || 100) * penalty.multiplier) + '日)';
    detail.querySelector('.tech-detail-subtitle').textContent = subtitle;
    detail.querySelector('.tech-detail-desc').textContent = tech.desc || '説明はまだ登録されて��ません。';
    const effects = detail.querySelector('.tech-detail-effects');
    effects.replaceChildren();
    (tech.effects && tech.effects.length ? tech.effects : ['効果データ未登録']).forEach(effect => {
      const item = document.createElement('li');
      item.textContent = effect;
      effects.appendChild(item);
    });
    // 火力表示 (戦闘の優劣に影響)
    if (tech.firepower && tech.firepower > 0) {
      const fpItem = document.createElement('li');
      fpItem.style.color = 'var(--accent-red, #c44a4a)';
      fpItem.textContent = '火力: ' + tech.firepower + ' (高いほどプロヴィンス戦闘で優勢)';
      effects.appendChild(fpItem);
    }
    if (penalty.percent > 0) {
      const item = document.createElement('li');
      item.style.color = 'var(--accent-orange, #e8923c)';
      item.textContent = '先取り研究ペナルティ: +' + penalty.percent + '% (研究時間 ' + Math.round((tech.research_time || 100) * penalty.multiplier) + '日)';
      effects.appendChild(item);
    } else if (tech.year) {
      const item = document.createElement('li');
      item.style.color = 'var(--text-green, #6a9c5a)';
      item.textContent = '先取り研究ペナルティ: なし (適正年度)';
      effects.appendChild(item);
    }
    const prerequisites = detail.querySelector('.tech-detail-prerequisites');
    prerequisites.replaceChildren();
    if (!(tech.prerequisites || []).length) prerequisites.textContent = 'なし';
    (tech.prerequisites || []).forEach(id => {
      const item = document.createElement('p');
      const done = ResearchManager.researchedTech.has(id);
      item.className = 'tech-detail-prerequisite' + (done ? ' done' : '');
      item.textContent = (done ? '✓ ' : '○ ') + (ResearchManager.findTech(id)?.title || id);
      prerequisites.appendChild(item);
    });
    const button = detail.querySelector('.tech-detail-action');
    const s = CoreEngine.gameState;
    const free = Array.from({ length: s.researchSlots }, (_, i) => i + 1).some(i => !ResearchManager.researching[i]);
    button.disabled = state.className !== 'available' || !free;
    button.textContent = state.className === 'available' ? (free ? '研究を開始する' : '研究スロットが満杯です') : state.text;
    button.onclick = () => { ResearchManager.selectTech(tech); this.closeDetail(true); };
  },

  showDetail(tech, anchor) {
    this.ensureDetail();
    this.closeDetail();
    this.selectedId = tech.id;
    this.anchor = anchor;
    anchor.classList.add('selected');
    anchor.setAttribute('aria-expanded', 'true');
    this.populateDetail(tech);
    this.detail.classList.remove('hidden');
    const rect = anchor.getBoundingClientRect();
    const width = this.detail.offsetWidth, height = this.detail.offsetHeight;
    const left = rect.right + width + 16 < window.innerWidth ? rect.right + 12 : rect.left - width - 12;
    this.detail.style.left = Math.max(12, Math.min(left, window.innerWidth - width - 12)) + 'px';
    this.detail.style.top = Math.max(12, Math.min(rect.top, window.innerHeight - height - 12)) + 'px';
    this.detail.querySelector('.tech-detail-close').focus({ preventScroll: true });
  },

  closeDetail(restoreFocus = false) {
    if (this.detail) this.detail.classList.add('hidden');
    if (this.anchor) {
      this.anchor.classList.remove('selected');
      this.anchor.setAttribute('aria-expanded', 'false');
      if (restoreFocus && this.anchor.isConnected) this.anchor.focus({ preventScroll: true });
    }
    this.selectedId = null;
    this.anchor = null;
  }
};
if (typeof window !== 'undefined') window.ResearchTreeUI = ResearchTreeUI;
