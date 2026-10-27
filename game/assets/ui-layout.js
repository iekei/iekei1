/* ui-layout.js — 上部ナビの整理 (グループ化・並べ替え) と、下部の陸軍/海軍/空軍切替から海軍・空軍ウィンドウを開く導線 */
class UILayout {
  /** グループごとの表示順。ここに無いタブは「その他」グループへ */
  static ORDER = {
    internal: ['politics', 'focus', 'research', 'labs', 'superweapons', 'construction', 'production', 'mio', 'trade', 'decisions'],
    military: ['cards', 'traits', 'division', 'designer', 'training', 'logistics', 'doctrine', 'force-doctrine', 'command'],
    world: ['diplomacy', 'intel', 'peace', 'nation', 'multiplayer', 'winsave'],
  };
  static HIDDEN = ['special', 'nuclear', 'navy', 'airforce'];   // 上部から外すタブ (海軍/空軍は下部パネルから開く)
  static init() {
    if (UILayout.installed) return; UILayout.installed = true;
    UILayout.injectCss();
    UILayout.arrange();
    // 後から追加されるボタン (DLC など) も整列
    const nav = document.getElementById('window-nav');
    // 注意: 監視中に arrange() 自身が nav を書き換えると無限ループになるため、
    //       ・arrange 中は observer を切断し、直接の子要素に .win-btn が現れた時だけ再整列する
    //       ・再整列は requestAnimationFrame で 1 フレームにまとめる
    if (nav && typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(records => {
        if (UILayout._busy) return;
        const added = records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.classList?.contains('win-btn') || (n.querySelector && !n.classList?.contains('win-group') && n.querySelector('.win-btn')))));
        if (!added || UILayout._pending) return;
        UILayout._pending = true;
        const run = () => { UILayout._pending = false; UILayout.arrange(); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
      });
      UILayout._observer = mo;
      UILayout._observe = () => { try { mo.observe(nav, { childList: true }); } catch (e) { /* ignore */ } };
      UILayout._observe();
    }
    // 下部パネル: 海軍 / 空軍 を選ぶとそれぞれのウィンドウを開く
    if (typeof BattlePlanManager !== 'undefined' && !BattlePlanManager._ulHooked) {
      BattlePlanManager._ulHooked = true;
      const orig = BattlePlanManager.setForce.bind(BattlePlanManager);
      BattlePlanManager.setForce = (f) => {
        orig(f);
        if (f === 'navy') { WindowManager.open('navy'); if (typeof NavalForce !== 'undefined') NavalForce.render?.(); }
        else if (f === 'air') { WindowManager.open('airforce'); if (typeof AirForce !== 'undefined') AirForce.render?.(); }
        else { ['navy', 'airforce'].forEach(t => { if (WindowManager.isOpen?.(t)) WindowManager.close?.(t); }); }
      };
    }
  }
  static injectCss() {
    if (document.getElementById('ui-layout-css') || !document.head?.appendChild) return;
    const st = document.createElement('style'); st.id = 'ui-layout-css';
    st.textContent = '.win-group{display:inline-flex;gap:3px;align-items:center;padding:2px 6px 2px 4px;border-right:1px solid var(--border-mil);margin-right:4px;position:relative}' +
      '.win-group:last-child{border-right:0}' +
      '.win-group::before{content:attr(data-label);font-size:9px;color:var(--text-secondary);letter-spacing:1px;margin-right:2px;writing-mode:vertical-rl;text-orientation:upright;line-height:1;opacity:.8}' +
      '.win-group[data-group="internal"] .win-btn{border-color:#3a5a7a}.win-group[data-group="military"] .win-btn{border-color:#6a4a2a}.win-group[data-group="world"] .win-btn{border-color:#3a6a4a}.win-group[data-group="other"] .win-btn{border-color:var(--border-mil)}';
    document.head.appendChild(st);
  }
  static arrange() {
    const nav = document.getElementById('window-nav'); if (!nav || !nav.querySelectorAll) return;
    if (UILayout._busy) return;
    UILayout._busy = true;
    if (UILayout._observer) UILayout._observer.disconnect();
    try {
      const labels = { internal: '内政', military: '軍事', world: '外交', other: 'その他' };
      const groups = {};
      ['internal', 'military', 'world', 'other'].forEach(g => {
        let el = nav.querySelector('.win-group[data-group="' + g + '"]');
        if (!el) { el = document.createElement('span'); el.className = 'win-group'; el.dataset.group = g; nav.appendChild(el); }
        el.dataset.label = labels[g]; groups[g] = el;
      });
      // すべての win-btn を収集 (グループ内外問わず)
      const btns = [...nav.querySelectorAll('.win-btn')];
      btns.forEach(b => {
        const tab = b.dataset.tab;
        if (b.hasAttribute('data-open-hoi4') || UILayout.HIDDEN.includes(tab)) { b.remove(); return; }
        let g = 'other'; Object.entries(UILayout.ORDER).forEach(([k, list]) => { if (list.includes(tab)) g = k; });
        if (!tab && /マップ/.test(b.textContent)) g = 'world';
        if (b.parentElement !== groups[g]) groups[g].appendChild(b);
      });
      // 各グループ内を ORDER 順に並べ替え
      Object.entries(groups).forEach(([g, el]) => {
        const list = UILayout.ORDER[g] || [];
        const items = [...el.querySelectorAll('.win-btn')];
        items.sort((a, b) => { const ia = list.indexOf(a.dataset.tab), ib = list.indexOf(b.dataset.tab); const ka = ia < 0 ? (a.dataset.tab ? 900 : 999) : ia, kb = ib < 0 ? (b.dataset.tab ? 900 : 999) : ib; return ka - kb; });
        const changed = items.some((b, i) => el.children[i] !== b) || el.children.length !== items.length;
        if (changed) items.forEach(b => el.appendChild(b));
        if (!items.length && g === 'other') el.style.display = 'none'; else el.style.display = '';
      });
      // グループ自体の順序
      const order = ['internal', 'military', 'world', 'other'];
      const lastChildren = [...nav.children].slice(-order.length);
      if (order.some((g, i) => lastChildren[i] !== groups[g])) order.forEach(g => nav.appendChild(groups[g]));
    } finally {
      UILayout._busy = false;
      if (UILayout._observer) { UILayout._observer.takeRecords(); if (UILayout._observe) UILayout._observe(); }
    }
  }
}
if (typeof window !== 'undefined') window.UILayout = UILayout;
