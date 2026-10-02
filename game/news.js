/* ==========================================================
 * news.js — NewsManager: HoI4風ニュースイベント
 * ----------------------------------------------------------
 * - 世界で何かが起こるとニュースイベントがポップアップする
 * - リアクションボタン (選択肢) で閉じる
 * - プレイヤー国に関係のないニュースは何も変動させない
 * - 史実日付イベントは自動発火、AIの開戦・核投下なども通知
 * ========================================================== */
'use strict';

class NewsManager {
  static queue = [];
  static showing = false;
  static shownIds = new Set();

  // ---- 史実ニュースイベント (純粋な報道: プレイヤーに影響なし) ----
  static HISTORY = [
    { id: 'rhineland', date: [1936, 3, 7], icon: '🎖️', title: 'ドイツ軍、ラインラントに再進駐',
      body: 'ドイツ軍がヴェルサイユ条約で非武装化されたラインラントに進駐しました。フランス・イギリスは抗議するも軍事介入は見送られています。',
      reactions: ['見通しのつかない時代だ', '口だけの抗議だな', '欧州の地図が変わるだろう'] },
    { id: 'spain_civil', date: [1936, 7, 18], icon: '🔥', title: 'スペインで内戦勃発',
      body: 'フランコ将軍率いる国民軍が共和政府に対して反乱を起こしました。各国が義勇軍を派遣し、スペインは新兵器の実験場と化しつつあります。',
      reactions: ['他国の戦争に干渉するな', '新しい兵器が試される', '見守るしかない'] },
    { id: 'zeppelin', date: [1937, 5, 6], icon: '💥', title: 'ヒンデンブルク号爆発事故',
      body: '大型飛行船ヒンデンブルク号が着陸中に爆発・炎上しました。定期飛行船航路は縮小へ。航空の未来は金属の翼にあることを世界は思い知りました。',
      reactions: ['悲劇だ…', '飛行船の時代は終わった', '航空機に投資すべきだ'] },
    { id: 'pact_steel', date: [1937, 11, 6], icon: '🤝', title: '日独伊、防共協定を強化',
      body: '日本・ドイツ・イタリアの3国がコミンテルン対策の協定を強化しました。新しい枢軸の台頭に列強は警戒を強めています。',
      reactions: ['新しい力の台頭だ', '警戒が必要だ', '我々も同盟を模索すべき'] },
    { id: 'munich', date: [1938, 9, 30], icon: '📜', title: 'ミュンヘン会談 — 危機一髪',
      body: '英仏独伊の首脳が会談し、チェコスロバキアのズデーテン地方の割譲が承認されました。「我々の時代の平和」と呼ばれる合意ですが、懐疑の声も上がっています。',
      reactions: ['見通しのつかない時代だ', 'チレン主義だ！', '時間は稼げた'] },
    { id: 'molotov', date: [1939, 8, 24], icon: '🤫', title: '衝撃! 独ソ不可侵条約締結',
      body: '宿敵であったはずの独ソ両国が不可侵条約を締結しました。秘密議定書では東欧の勢力範囲が分断されたと伝えられています。',
      reactions: ['裏切りだ！', '見通しのつかない時代だ', '次はどこの国だ？'] },
    { id: 'midway', date: [1942, 6, 6], icon: '⚓', title: 'ミッドウェー海戦 — 艦隊決戦の顛末',
      body: '太平洋の要衝ミッドウェー沖で日米機動部隊が激突。大規模な航空母艦の損失が報じられており、太平洋の海の覇権は大きく揺らぎました。',
      reactions: ['航空機の時代だ', '艦隊決戦は終わった', '制海権がすべてだ'] },
    { id: 'stalingrad', date: [1943, 2, 3], icon: '❄️', title: 'スターリングラードで包囲軍降伏',
      body: '東部戦線の要衝スターリングラードで包囲された軍が降伏しました。東部戦線の攻守は大きく入れ替わりつつあります。',
      reactions: ['東部の潮目が変わった', '長期戦の代償だ', '見通しのつかない時代だ'] },
    { id: 'normandy', date: [1944, 6, 6], icon: '🌊', title: '決定打! 西部への大規模上陸作戦',
      body: '大規模な連合軍がフランス北部の海岸に上陸しました。「史上最大の作戦」と呼ばれる上陸が成功し、西部にも第二戦線が開かれました。',
      reactions: ['覇権の行方は戦場が決める', '計画は完璧だったか？', '決戦の時だ'] },
    { id: 'yalta', date: [1945, 2, 11], icon: '🗺️', title: '米英ソ首脳、戦後構想で会談',
      body: 'クリミアのヤルタで連合国三巨頭が会談し、戦後世界の勢力分割が話し合われました。新たな世界秩序の輪郭がぼんやりと見え始めています。',
      reactions: ['戦後の地図はこうなるか', '見通しのつかない時代だ', '外交の勝利だ'] },
    { id: 'hiroshima', date: [1945, 8, 6], icon: '☢️', title: '地球揺るがす新型爆弾 — 市街地に投下',
      body: '単一の爆弾が都市一つを消し飛ばしました。この「新型爆弾」の正体は原子力。戦争の概念そのものが書き換えられようとしています。',
      reactions: ['恐怖だ…これが新時代か', '研究を急げ!', 'この戦争は終わるだろう'], nuke: true },
    { id: 'nagasaki', date: [1945, 8, 9], icon: '☢️', title: '再び新型爆弾が投下される',
      body: '昨日に続き、再び原子爆弾が都市に投下されました。世界は「核の影」に震え、各国は秘密裏に原子力計画を加速させ始めています。',
      reactions: ['恐怖だ…これが新時代か', '我々も核を持たねば', '終戦が近い'], nuke: true }
  ];

  static init() {
    const s = CoreEngine.gameState;
    if (!Array.isArray(s.newsShown)) s.newsShown = [];
    s.newsShown.forEach(id => NewsManager.shownIds.add(id));
    NewsManager.injectPopup();
    CoreEngine.registerTickCallback(() => NewsManager.onTick(CoreEngine.gameState.date));
    CoreEngine.log('📰 ニュースイベントシステム起動 — 世界の動きを追います');
  }

  // ---- 史実日付イベントの自動発火 ----
  static onTick(date) {
    NewsManager.HISTORY.forEach(ev => {
      if (NewsManager.shownIds.has(ev.id)) return;
      if (date.getFullYear() === ev.date[0] && (date.getMonth() + 1) === ev.date[1] && date.getDate() === ev.date[2]) {
        NewsManager.fireEvent(ev);
      }
    });
  }

  // ---- 発火 (効果はプレイヤーに関係する場合のみ) ----
  static fireEvent(ev) {
    if (NewsManager.shownIds.has(ev.id)) return;
    NewsManager.shownIds.add(ev.id);
    const s = CoreEngine.gameState;
    s.newsShown.push(ev.id);
    // 核系ニュース: マップにキノコ雲の演出 (見た目のみで数値変動なし)
    if (ev.nuke && typeof MapRenderer !== 'undefined' && MapRenderer.ready) {
      const tag = ev.id === 'hiroshima' ? 'Hiroshima' : 'Nagasaki';
      const entry = Object.entries(MapRenderer.states).find(([sid, st]) =>
        st.name === tag || (st.owner === 'JAP' && st.name.toLowerCase() === tag.toLowerCase()));
      if (entry) MapRenderer.addNukeEffectAtState(entry[0]);
    }
    // 関係国ニュースのみ軽微な世論変動 (関係なければ一切変動なし)
    if (ev.playerEffects && typeof ev.playerEffects === 'function') {
      try { ev.playerEffects(s); } catch (e) { console.error(e); }
    }
    NewsManager.queue.push(ev);
    NewsManager.showNext();
    if (typeof MultiplayerManager !== 'undefined') {
      MultiplayerManager.broadcast({ type: 'news', id: ev.id });
    }
  }

  // ---- AI・システムからの即時ニュース (史実の戦争宣言・占領など) ----
  static fireCustom(opt) {
    NewsManager.fireEvent(Object.assign({
      icon: '📰', reactions: ['見通しのつかない時代だ', '注視するしかない', '次は我が身か']
    }, opt));
  }

  // ---- ポップアップUI ----
  static injectPopup() {
    if (document.getElementById('news-popup-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'news-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:none;align-items:center;justify-content:center;z-index:4000;';
    overlay.innerHTML =
      '<div id="news-popup" style="width:520px;max-width:92vw;background:linear-gradient(#26313d,#1a222c);border:2px solid var(--text-gold,#c9a44a);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,0.8);overflow:hidden;font-family:sans-serif;color:#e8e8e8;">' +
      '<div style="background:linear-gradient(#3a2a10,#241a08);border-bottom:1px solid #c9a44a;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">' +
      '<span style="font-size:11px;letter-spacing:3px;color:#c9a44a;font-weight:bold;">📻 WORLD NEWS</span>' +
      '<span id="news-date" style="font-size:11px;color:#9aa7b4;"></span></div>' +
      '<div id="news-body" style="padding:16px;"></div>' +
      '<div id="news-buttons" style="padding:0 16px 14px;display:flex;gap:8px;flex-wrap:wrap;"></div></div>';
    document.body.appendChild(overlay);
  }

  static showNext() {
    if (NewsManager.showing || !NewsManager.queue.length) return;
    const ev = NewsManager.queue.shift();
    NewsManager.showing = true;
    const overlay = document.getElementById('news-popup-overlay');
    const d = CoreEngine.gameState.date;
    document.getElementById('news-date').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    document.getElementById('news-body').innerHTML =
      '<div style="font-size:40px;text-align:center;margin-bottom:6px;">' + (ev.icon || '📰') + '</div>' +
      '<h3 style="color:#c9a44a;text-align:center;font-size:16px;margin:0 0 10px;border-bottom:1px solid #3a4a5a;padding-bottom:8px;">' + ev.title + '</h3>' +
      '<p style="font-size:13px;line-height:1.9;color:#d5dde5;margin:0;">' + ev.body + '</p>';
    const btns = document.getElementById('news-buttons');
    btns.innerHTML = '';
    (ev.reactions || ['閉じる']).forEach((label, i) => {
      const b = document.createElement('button');
      b.className = 'diplo-btn';
      b.style.cssText = 'background:#2c3a48;border:1px solid #6a7a8a;color:#e8e8e8;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;';
      b.textContent = label;
      b.onmouseenter = () => { b.style.borderColor = '#c9a44a'; };
      b.onmouseleave = () => { b.style.borderColor = '#6a7a8a'; };
      b.onclick = () => NewsManager.react();
      btns.appendChild(b);
    });
    overlay.style.display = 'flex';
    if (typeof CoreEngine !== 'undefined' && CoreEngine.gameState.paused === false) {
      NewsManager._wasSpeed = CoreEngine.gameState.speed;
      CoreEngine.setSpeed(0);   // ニュース表示中は時間停止 (HoI4挙動)
    }
    if (typeof MultiplayerManager !== 'undefined') {
      MultiplayerManager.broadcast({ type: 'news_show', id: ev.id });
    }
  }

  static react() {
    const overlay = document.getElementById('news-popup-overlay');
    if (overlay) overlay.style.display = 'none';
    NewsManager.showing = false;
    // 表示中に停止した時間を再開 (ニュース間だけ止める)
    if (NewsManager._wasSpeed && typeof CoreEngine !== 'undefined') {
      const sp = NewsManager._wasSpeed;
      NewsManager._wasSpeed = null;
      CoreEngine.setSpeed(sp);
    }
    NewsManager.showNext();
  }
}

window.NewsManager = NewsManager;
