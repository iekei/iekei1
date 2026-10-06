/* ==========================================================
 * ai.js — AIManager: 非プレイヤー国の自動操作 (史実準拠AI)
 * ----------------------------------------------------------
 * - 人間がプレイしていない国をAIが自動操作する
 * - 国家方針は史実通りの順序でAIが選択する
 * - 研究・建設・スパイもAIが自律的に進める
 * - 史実日付の開戦・併合イベントを自動実行し、ニュースで通知
 * - AI vs AI の戦争はマップで州が徐々に移動していく
 * - プレイヤーとの戦争は既存の戦闘システム (BattleManager) を利用
 * ========================================================== */
'use strict';

class AIManager {
  // ---- 史実フォーカス順序 ----
  static FOCUSES = {
    GER: [
      { id: 'ger_rhineland', name: 'ラインラント進駐', days: 60 },
      { id: 'ger_four_year', name: '四カ年計画', days: 70 },
      { id: 'ger_wehrmacht', name: '国防軍の拡張', days: 60 },
      { id: 'ger_anschluss', name: 'アンシュルス', days: 60 },
      { id: 'ger_czech', name: 'プラハへの進軍', days: 60 },
      { id: 'ger_danzig', name: 'ダンツィヒか戦争か', days: 70 },
      { id: 'ger_west', name: '西部政策', days: 70 },
      { id: 'ger_barbarossa', name: 'バルバロッサ', days: 90 },
      { id: 'ger_total', name: '総力戦', days: 90 }
    ],
    SOV: [
      { id: 'sov_plan', name: '五カ年計画', days: 70 },
      { id: 'sov_purge', name: '大粛清', days: 70 },
      { id: 'sov_army', name: '赤軍の再編', days: 70 },
      { id: 'sov_industry', name: '重工業の発展', days: 70 },
      { id: 'sov_baltic', name: 'バルト諸国への要求', days: 60 },
      { id: 'sov_reform', name: '軍の改革', days: 80 },
      { id: 'sov_great', name: '大祖国戦争の準備', days: 90 }
    ],
    JAP: [
      { id: 'jap_army_navy', name: '陸海軍の対立調整', days: 60 },
      { id: 'jap_manchu', name: '満洲国の強化', days: 60 },
      { id: 'jap_china', name: '支那事変への備え', days: 70 },
      { id: 'jap_industry', name: '重工業育成', days: 70 },
      { id: 'jap_navy', name: '連合艦隊の拡張', days: 70 },
      { id: 'jap_south', name: '南進論', days: 70 },
      { id: 'jap_pearl', name: 'Z作戦 (真珠湾)', days: 90 }
    ],
    DEFAULT: [
      { id: 'gen_industry', name: '工業化促進', days: 70 },
      { id: 'gen_military', name: '軍事の拡張', days: 70 },
      { id: 'gen_intel', name: '諜報網の構築', days: 60 },
      { id: 'gen_diplomacy', name: '外交の再編', days: 60 },
      { id: 'gen_research', name: '科学の振興', days: 70 }
    ]
  };

  // ---- 史実イベント (開戦 / 併合 / 降伏) — 日付で自動発火 ----
  static EVENTS = [
    { id: 'jap_chi_war', date: [1937, 7, 7], kind: 'war', a: 'JAP', b: 'CHI',
      news: { icon: '🌉', title: '盧溝橋事件 — 日中間で戦闘発生',
        body: '北京郊外の盧溝橋で日本軍と中国軍が衝突しました。両軍の増派が続き、日中の全面戦争への懸念が高まっています。',
        reactions: ['見通しのつかない時代だ', '現地の偶発的衝突だ', '大陸は不穏だ'] } },
    { id: 'ger_czech_annex', date: [1939, 3, 15], kind: 'annex', a: 'GER', b: 'CZE',
      news: { icon: '🏰', title: 'ドイツ、チェコスロバキアを併合',
        body: 'ドイツ軍がチェコスロバキア全土に進駐し、併合を宣言しました。ミュンヘンの「平和」はわずか半年で崩れ去りました。',
        reactions: ['見通しのつかない時代だ', '次はどこだ？', '抗議すべきだ'] } },
    { id: 'ger_pol_war', date: [1939, 9, 1], kind: 'war', a: 'GER', b: 'POL',
      news: { icon: '⚔️', title: 'ドイツ、ポーランドに侵攻 — 欧州大戦勃発',
        body: 'ドイツ軍がポーランド国境を越えました。イギリス・フランスは宣戦を布告する構えで、欧州の大戦争が始まりました。',
        reactions: ['ついに始まったか', '見通しのつかない時代だ', '塹壕戦の二の舞になれ'] } },
    { id: 'sov_fin_war', date: [1939, 11, 30], kind: 'war', a: 'SOV', b: 'FIN',
      news: { icon: '❄️', title: 'ソ連、フィンランドに侵攻 (冬戦争)',
        body: 'ソ連軍がフィンランド国境を越えました。極寒のカレリアで予想以上の苦戦が伝えられています。',
        reactions: ['寒波が味方するかもな', '小国の抵抗だ', '見通しのつかない時代だ'] } },
    { id: 'ger_north', date: [1940, 4, 9], kind: 'war', a: 'GER', b: 'DEN',
      news: { icon: '⚓', title: 'ドイツ軍、デンマーク・ノルウェーへ侵攻',
        body: 'ドイツ軍が北欧に進駐を開始しました。鉄鉱石の輸送路を確保する目的と見られています。',
        reactions: ['資源が狙いだ', '北の海が戦場に', '見通しのつかない時代だ'] } },
    { id: 'ger_west_war', date: [1940, 5, 10], kind: 'war', a: 'GER', b: 'FRA',
      also: [{ kind: 'war', a: 'GER', b: 'BEL' }, { kind: 'war', a: 'GER', b: 'ENG' }, { kind: 'war', a: 'GER', b: 'NED' }],
      news: { icon: '⚔️', title: 'ドイツ、西部戦線で総攻撃開始',
        body: 'ドイツ軍がベネルクス三国を突破しフランスへ侵攻を開始しました。電撃的な装甲部隊の進撃が報じられています。',
        reactions: ['電撃戦か！', 'マジノ線は無意味か', '見通しのつかない時代だ'] } },
    { id: 'fra_fall', date: [1940, 6, 22], kind: 'fall', a: 'GER', b: 'FRA',
      news: { icon: '🏳️', title: 'フランス、ドイツに休戦協定を締結',
        body: 'フランス政府が休戦協定に調印しました。北部と大西洋岸はドイツの占領下に入ります。世界は衝撃を受けています。',
        reactions: ['観艦式の国家も落ちたか', '見通しのつかない時代だ', '次はイギリスか'] } },
    { id: 'ita_gre_war', date: [1940, 10, 28], kind: 'war', a: 'ITA', b: 'GRE',
      news: { icon: '⛰️', title: 'イタリア、ギリシャに侵攻',
        body: 'イタリア軍がアルバニアからギリシャに侵攻しました。山岳地帯で予想外の苦戦が伝えられています。',
        reactions: ['ギリシャ頑張れ', 'バルカンも戦場に', '見通しのつかない時代だ'] } },
    { id: 'barbarossa', date: [1941, 6, 22], kind: 'war', a: 'GER', b: 'SOV',
      news: { icon: '🔥', title: '独ソ戦開戦 — バルバロッサ作戦発動',
        body: 'ドイツ軍が突如ソ連に全面侵攻を開始しました。数百キロの戦線で最大級の陸戦が始まりました。世界の歴史が動いています。',
        reactions: ['見通しのつかない時代だ', 'ロシアの冬が来る', '両敗だろう'] } },
    { id: 'pearl_harbor', date: [1941, 12, 8], kind: 'war', a: 'JAP', b: 'USA',
      also: [{ kind: 'war', a: 'JAP', b: 'ENG' }],
      news: { icon: '💥', title: '日本軍、真珠湾を奇襲 — 太平洋戦争勃発',
        body: '日本海軍機動部隊がハワイの真珠湾を奇襲攻撃しました。米太平洋艦隊に大損害が出たとの報道。太平洋も戦場となりました。',
        reactions: ['見通しのつかない時代だ', '寝ている巨人を起こしたな', '工場を持つ国は強い'] } },
    { id: 'berlin_fall', date: [1945, 4, 30], kind: 'fall', a: 'SOV', b: 'GER',
      news: { icon: '🚩', title: 'ソ連軍、ベルリンに突入',
        body: 'ソ連軍がドイツの首都ベルリン市街に突入しました。ヨーロッパの戦争は終焉に向かっています。',
        reactions: ['欧州の戦争が終わる', '見通しのつかない時代だ', '後は誰が?'] } },
    { id: 'sov_jap_war', date: [1945, 8, 8], kind: 'war', a: 'SOV', b: 'JAP',
      news: { icon: '⚔️', title: 'ソ連、日本に宣戦布告 — 満洲へ侵攻',
        body: 'ソ連軍が満洲国へ全面侵攻を開始しました。日本は二正面の戦争を強いられています。',
        reactions: ['背後からの一撃', '見通しのつかない時代だ', '終わりの始まりだ'] } }
  ];

  static init() {
    const s = CoreEngine.gameState;
    if (!s.ai) s.ai = { focus: {}, doneEvents: [], wars: [], tech: {}, spyDay: 0 };
    AIManager.state = s.ai;
    CoreEngine.registerTickCallback(() => AIManager.onTick());
    CoreEngine.log('🤖 AI各国が歴史に従って動き始めます');
  }

  static aiOf(tag) {
    if (!AIManager.state.focus[tag]) {
      AIManager.state.focus[tag] = { idx: 0, prog: 0, research: 0, tech: 0 };
    }
    return AIManager.state.focus[tag];
  }

  static focusList(tag) {
    return AIManager.FOCUSES[tag] || AIManager.FOCUSES.DEFAULT;
  }

  static isPlayer(tag) {
    return tag === CoreEngine.gameState.country || Object.values(CoreEngine.gameState.strategy?.peers||{}).includes(tag);
  }

  // ---- 毎ゲーム日のAI処理 ----
  static onTick() {
    if (!MapRenderer.ready) return;
    const date = CoreEngine.gameState.date;
    AIManager.runEvents(date);
    AIManager.tickFocuses();
    AIManager.tickResearch();
    AIManager.tickWars();
    AIManager.tickSpy();
  }

  // ---- 史実イベントの発火 (全クライアントで同日なら同時に発火) ----
  static runEvents(date) {
    AIManager.EVENTS.forEach(ev => {
      if (AIManager.state.doneEvents.includes(ev.id)) return;
      if (date.getFullYear() === ev.date[0] && (date.getMonth() + 1) === ev.date[1] && date.getDate() === ev.date[2]) {
        AIManager.state.doneEvents.push(ev.id);
        const all = [{ kind: ev.kind, a: ev.a, b: ev.b }].concat(ev.also || []);
        all.forEach(w => AIManager.applyEvent(w));
        if (ev.news && typeof NewsManager !== 'undefined') NewsManager.fireCustom(ev.news);
      }
    });
  }

  static applyEvent(w) {
    const player = CoreEngine.gameState.country;
    if (w.kind === 'annex' || w.kind === 'fall') {
      // 併合/降伏: 防衛国の全州を攻撃国へ (防衛国がプレイヤーの場合は自動占領しない)
      if (AIManager.isPlayer(w.b)) return;
      Object.entries(MapRenderer.states).forEach(([sid, st]) => {
        if (st.owner === w.b) MapRenderer.captureState(sid, w.a);
      });
      if (w.kind === 'annex') AIManager.endWar(w.a, w.b);
      CoreEngine.log('🗺️ 史実イベント: ' + w.a + 'が' + w.b + 'を' + (w.kind === 'annex' ? '併合' : '占領') + 'しました');
      return;
    }
    if (w.kind === 'war') AIManager.startWar(w.a, w.b);
  }

  // ---- 開戦処理 ----
  static startWar(a, b) {
    if (a === b) return;
    const player = CoreEngine.gameState.country;
    const s = CoreEngine.gameState;
    if (s.strategy) s.strategy.tensionByCountry[a] = (s.strategy.tensionByCountry[a] || 0) + 15;
    // プレイヤーが関与する戦争: プレイヤーの atWar に登録 (戦闘は既存システムで解決)
    if (b === player && !s.atWar.includes(a)) {
      s.atWar.push(a);
      GameUI.notify('⚔️ ' + DataFetcher.getCountryFlag(a) + ' ' + a + 'が宣戦布告してきました！', 'alert');
      CoreEngine.renderStats();
      if (typeof PoliticsManager !== 'undefined') PoliticsManager.render();
    } else if (a === player && !s.atWar.includes(b)) {
      s.atWar.push(b);
      GameUI.notify('📜 史実の流れに従い ' + DataFetcher.getCountryFlag(b) + ' ' + b + 'と開戦しました', 'alert');
      CoreEngine.renderStats();
    } else {
      // AI vs AI の戦争: 汎用戦争リストで管理 (マップ上で領土が動く)
      if (!AIManager.warActive(a, b)) AIManager.state.wars.push({ a: a, b: b, day: 0 });
    }
    MultiplayerManager.broadcast({ type: 'ai_war', a: a, b: b });
    MultiplayerManager.broadcast({ type: 'sync', state: CoreEngine.getSyncState(), date: CoreEngine.gameState.date.toISOString() });
  }

  static warActive(a, b) {
    return AIManager.state.wars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
  }

  static endWar(a, b) {
    AIManager.state.wars = AIManager.state.wars.filter(w => !(w.a === a && w.b === b));
  }

  static takeoverCountry(tag, reason = '接続切断') {
    if (!tag || tag === CoreEngine.gameState.country) return false;
    if (!AIManager.state) AIManager.state = CoreEngine.gameState.ai || { focus: {}, doneEvents: [], wars: [], tech: {}, spyDay: 0 };
    if (!CoreEngine.gameState.ai) CoreEngine.gameState.ai = AIManager.state;
    AIManager.aiOf(tag);
    if (CoreEngine.gameState.strategy?.peers) {
      Object.entries(CoreEngine.gameState.strategy.peers).forEach(([peer, country]) => {
        if (country === tag) delete CoreEngine.gameState.strategy.peers[peer];
      });
    }
    if (CoreEngine.gameState.strategy?.publicCountries) delete CoreEngine.gameState.strategy.publicCountries[tag];
    CoreEngine.log('🤖 ' + tag + ' が' + reason + 'によりAIへ引き継がれました');
    if (typeof GameUI !== 'undefined') GameUI.notify('🤖 ' + tag + ' の接続が切れたため、AIが継承しました。', 'alert');
    return true;
  }

  // ---- AI vs AI 戦争の進行: 国境州が徐々に攻側へ移る ----
  static tickWars() {
    MapRenderer.buildStateAdjacency();
    AIManager.state.wars.forEach(w => {
      w.day += 1 / 24;
      if (w.day < 5 || Math.floor(w.day) % 5 !== 0) return;   // 5日に1度、戦線が動く
      AIManager.advanceWar(w);
    });
  }

  static advanceWar(w) {
    const defStates = Object.keys(MapRenderer.states).filter(sid => MapRenderer.states[sid].owner === w.b);
    if (defStates.length === 0) { AIManager.endWar(w.a, w.b); return; }
    const frontier=Object.keys(MapRenderer.provinces.p).map(Number).filter(p=>OffensivePlanner.isLand(p)&&MapRenderer.ownerOf(p)===w.b&&[...(MapRenderer.provNeighbors.get(p)||[])].some(n=>MapRenderer.ownerOf(n)===w.a));
    if(!frontier.length)return;
    frontier.sort((a,b)=>a-b);
    const pid=frontier[0],sid=MapRenderer.stateOf(pid),st=MapRenderer.states[sid];
    OffensivePlanner.capture(pid,w.a);
    if(st)CoreEngine.log('⚔️ '+st.name+'のプロビンス '+pid+'を'+w.a+'軍が占領しました。');
    if (!Object.keys(MapRenderer.provinces.p).some(p=>OffensivePlanner.isLand(p)&&MapRenderer.ownerOf(Number(p))===w.b)) {
      AIManager.endWar(w.a, w.b);
      if (typeof NewsManager !== 'undefined') {
        NewsManager.fireCustom({ icon: '🏳️', title: w.b + '、' + w.a + 'に降伏', body: w.a + '軍が' + w.b + '全土を占領しました。同国は降伏し、勢力範囲は再編されています。',
          reactions: ['見通しのつかない時代だ', '次は我が身か', '歴史は動いた'] });
      }
    }
  }

  // ---- AIの国家方針 (史実順) ----
  static AI_TAGS = ['GER', 'SOV', 'JAP', 'USA', 'ENG', 'FRA', 'ITA', 'POL', 'CHI'];
  static tickFocuses() {
    AIManager.AI_TAGS.forEach(tag => {
      if (AIManager.isPlayer(tag)) return;
      const ai = AIManager.aiOf(tag);
      const list = AIManager.focusList(tag);
      if (ai.idx >= list.length) return;   // 史実方針をすべて完了
      ai.prog += 1 / 24;
      if (ai.prog >= list[ai.idx].days) {
        const f = list[ai.idx];
        ai.prog = 0;
        ai.idx++;
        ai.research += 30;   // 方針完了で研究が進む
        // 一部の方針は国際緊張度に影響
        if (/戦|侵|進軍|作戦/.test(f.name)) {
          CoreEngine.gameState.worldTension = Math.min(100, CoreEngine.gameState.worldTension + 3);
          if (CoreEngine.gameState.strategy) CoreEngine.gameState.strategy.tensionByCountry[tag] = (CoreEngine.gameState.strategy.tensionByCountry[tag] || 0) + 3;
          CoreEngine.renderWorldTension();
        }
        CoreEngine.log('🤖 ' + DataFetcher.getCountryFlag(tag) + ' ' + tag + 'の方針「' + f.name + '」が完了しました');
        if (tag !== CoreEngine.gameState.country) {
          // 完了はプレイヤーにも見える (通知は大方針のみ)
          if (/アンシュルス|プラハ|ダンツィヒ|バルバロッサ|真珠湾|南進|粛清/.test(f.name)) {
            GameUI.notify('🤖 ' + DataFetcher.getCountryFlag(tag) + ' ' + tag + ': 方針「' + f.name + '」を完了', 'alert');
          }
        }
      }
    });
  }

  // ---- AIの研究 (自律的に技術を完成させる) ----
  static tickResearch() {
    // tickFocuses内で研究点を蓄積し、120点ごとに技術完成
    Object.entries(AIManager.state.focus).forEach(([tag, ai]) => {
      if (AIManager.isPlayer(tag)) return;
      while (ai.research >= 120) {
        ai.research -= 120;
        ai.tech++;
      }
    });
  }

  // ---- AIのスパイ活動 (プレイヤーを標的にすることもある) ----
  static tickSpy() {
    AIManager.state.spyDay++;
    if (AIManager.state.spyDay < 45 || Math.random() > 0.4) return;
    AIManager.state.spyDay = 0;
    const s = CoreEngine.gameState;
    const player = s.country;
    const intel = s.intel;
    const attackers = ['GER', 'SOV', 'JAP', 'ENG'].filter(tag => tag !== player && s.atWar?.includes(tag));
    if (!attackers.length) return;
    // プレイヤーが諜報機関を持っていれば発見されやすい
    const agencyLevel = intel && intel.agency ? intel.level || 0 : 0;
    if (Math.random() < Math.max(0.05, 0.5 - agencyLevel * 0.05 - IntelOperations.counterPower() * 0.1)) {
      const spy = attackers[Math.floor(Math.random() * attackers.length)];
      const what = Math.random() < 0.5 ? '設計図の盗難' : '工場の破壊工作';
      if (what === '設計図の盗難') {
        s.politicalPower = Math.max(0, s.politicalPower - 20);
      } else {
        s.militaryFactories = Math.max(0, s.militaryFactories - 1);
      }
      CoreEngine.renderStats();
      GameUI.notify('🕵️ ' + DataFetcher.getCountryFlag(spy) + ' ' + spy + 'のスパイによる' + what + 'を検知！ (諜報機関の強化で防げます)', 'alert');
      CoreEngine.log('🚨 敵スパイ (' + spy + ') による' + what + 'が発生しました。');
      if (typeof IntelligenceManager !== 'undefined') IntelligenceManager.render();
    }
  }
}

window.AIManager = AIManager;
