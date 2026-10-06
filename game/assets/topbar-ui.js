/** Topbar presentation only. Values and tooltip explanations stay in CoreEngine. */
const TopbarUI = {
  stats: [
    { key: 'pp', icon: 'politicalPower', label: '政治力', value: s => Math.floor(s.politicalPower) },
    { key: 'stab', icon: 'stability', label: '安定度', value: s => Number(s.stability).toFixed(1) + '%', gauge: s => s.stability, tone: 'green' },
    { key: 'ws', icon: 'warSupport', label: '戦争協力度', value: s => Number(s.warSupport).toFixed(1) + '%', gauge: s => s.warSupport, tone: 'amber' },
    { key: 'mp', icon: 'manpower', label: '人的資源', value: s => (s.manpower / 1000).toFixed(0) + 'K' },
    { key: 'xp', icon: 'armyXp', label: '経験値', value: s => '陸' + Math.floor(s.armyExperience || 0) + ' / 海' + Math.floor(s.navyExperience || 0) + ' / 空' + Math.floor(s.airExperience || 0) },
    { key: 'fac', icon: 'factories', label: '民需 / 軍需', value: s => s.civilianFactories + 'C / ' + s.militaryFactories + 'M' },
    { key: 'fuel', icon: 'fuel', label: '燃料', value: s => Math.floor(s.fuel) + '/' + s.maxFuel, gauge: s => s.maxFuel > 0 ? s.fuel / s.maxFuel * 100 : 0, tone: 'amber' },
    { key: 'convoy', icon: 'convoys', label: '輸送船', value: s => s.convoys }
  ],

  render(state) {
    const container = document.getElementById('stats-icons');
    if (!container) return;
    if (!container.children.length) {
      container.innerHTML = this.stats.map(stat =>
        '<div class="stat-item" tabindex="0" role="group" data-tip-key="' + stat.key + '">' +
        '<img class="stat-icon" data-icon-key="' + stat.icon + '" data-asset-category="topbar_icons" src="' + TopbarIcons.get(stat.icon) + '" alt="">' +
        '<div class="stat-content"><span class="stat-label">' + stat.label + '</span><span class="stat-val"></span>' +
        (stat.gauge ? '<div class="stat-bar" aria-hidden="true"><div class="stat-bar-fill ' + stat.tone + '"></div></div>' : '') +
        '</div></div>'
      ).join('');
    }
    this.stats.forEach(stat => {
      const item = container.querySelector('[data-tip-key="' + stat.key + '"]');
      const value = String(stat.value(state));
      item.querySelector('.stat-val').textContent = value;
      item.setAttribute('aria-label', stat.label + ': ' + value);
      if (stat.gauge) item.querySelector('.stat-bar-fill').style.width = Math.max(0, Math.min(100, stat.gauge(state))) + '%';
    });
    // Refresh an open tooltip without replacing the focused/hovered instrument.
    if (this.activeItem?.isConnected) this.showTooltip(this.activeItem);
  },

  initTooltips(generators) {
    this.generators = generators;
    const bar = document.getElementById('top-bar');
    const tip = document.getElementById('stat-tooltip');
    if (!bar || !tip) return;
    tip.setAttribute('role', 'tooltip');
    bar.addEventListener('mouseover', event => {
      const item = event.target.closest('[data-tip-key]');
      if (item) this.showTooltip(item);
      else this.hideTooltip();
    });
    bar.addEventListener('mouseout', event => {
      if (this.activeItem && !this.activeItem.contains(event.relatedTarget)) this.hideTooltip();
    });
    bar.addEventListener('focusin', event => {
      const item = event.target.closest('[data-tip-key]');
      if (item) this.showTooltip(item);
    });
    // Touch users can inspect the same status explanations by tapping.
    bar.addEventListener('click', event => {
      const item = event.target.closest('.stat-item[data-tip-key]');
      if (item) this.showTooltip(item);
      else this.hideTooltip();
    });
    bar.addEventListener('focusout', () => this.hideTooltip());
    bar.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.hideTooltip();
    });
    window.addEventListener('resize', () => this.hideTooltip());
    bar.addEventListener('scroll', () => this.hideTooltip(), true);
  },

  showTooltip(item) {
    const generate = this.generators?.[item.dataset.tipKey];
    const tip = document.getElementById('stat-tooltip');
    if (!generate || !tip) return;
    if (this.activeItem && this.activeItem !== item) this.activeItem.removeAttribute('aria-describedby');
    this.activeItem = item;
    const data = generate();
    tip.innerHTML = '<div class="stt-title">' + data.title + '</div>' +
      data.rows.map(row => '<div class="stt-row">' + row + '</div>').join('');
    tip.classList.remove('hidden');
    item.setAttribute('aria-describedby', tip.id);
    const rect = item.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - tip.offsetWidth - 8));
    const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - tip.offsetHeight - 8));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  },

  hideTooltip() {
    document.getElementById('stat-tooltip')?.classList.add('hidden');
    this.activeItem?.removeAttribute('aria-describedby');
    this.activeItem = null;
  }
};
window.TopbarUI = TopbarUI;
