/* multiplayer-hub.js — マルチプレイ・ラウンジ / 時間権限 / インゲームチャット / 右クリック外交 / 陣営タブ
 *
 *  A. ロビー         : 「マルチ」ウィンドウでルームコード発行 → 参加者テーブル → 国家選択 → 開始
 *  B. 時間権限       : ホストのみ速度/停止。ゲストはロック + 「一時停止を要請」ボタン
 *  C. 通信状態       : Ping / 同期ハッシュを 1 行インジケーター (緑=正常 / 黄=遅延 / 赤=Desync)
 *  D. チャット       : 左下の半透明パネル (全体 / 陣営)。システムイベントも同じログに流す
 *  E. 右クリック外交 : マップ上の他国を右クリック → 外交コンテキストメニュー
 *  F. 陣営           : 政治画面の「陣営」タブ (PP を消費して自由命名で創設) + 参戦要請ポップアップ
 *
 *  トランスポートは PeerJS (クロスデバイス) と BroadcastChannel (同一ブラウザの別タブ) を
 *  自動で切り替える。どちらも MultiplayerManager の接続辞書と onData を共有する。
 */
class MPLocalConnection {
  constructor(peerId, bus) {
    this.peer = peerId;
    this.bus = bus;
    this.open = true;
    // authOk はホスト側の attachHostConnection で false にする
    // (ゲスト側で false にすると認証メッセージ自体が破棄されてしまう)
    this.handlers = {};
    this.closed = false;
  }
  on(evt, cb) {
    (this.handlers[evt] = this.handlers[evt] || []).push(cb);
    // 既に開いている接続の 'open' は非同期で 1 回だけ発火させる (PeerJS 互換)
    if (evt === 'open' && this.open) setTimeout(() => { if (!this.closed) cb(); }, 0);
    return this;
  }
  emit(evt, arg) { (this.handlers[evt] || []).forEach(cb => { try { cb(arg); } catch (e) { console.error('MP conn handler error:', e); } }); }
  send(data) { if (this.closed) return false; this.bus.post(this.peer, data); return true; }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.bus.post(this.peer, null, 'bye');
    this.emit('close');
  }
}

/** BroadcastChannel を使った PeerJS 互換の最小ピア (同一ブラウザ・別タブ用) */
class MPLocalPeer {
  constructor(opts) {
    MPLocalPeer.instances = (MPLocalPeer.instances || 0) + 1;
    this.role = opts.role;
    this.room = opts.room;
    this.id = opts.role === 'host' ? ('room-' + opts.room) : ('p' + Math.random().toString(36).slice(2, 8));
    this.conns = {};
    this.handlers = { open: [], connection: [], error: [] };
    const Ctor = (typeof BroadcastChannel === 'function') ? BroadcastChannel : null;
    this.channel = Ctor ? new Ctor('hoi4mp-' + opts.room) : null;
    if (this.channel) this.channel.onmessage = (ev) => this.onMessage(ev.data);
    setTimeout(() => this.handlers.open.forEach(cb => { try { cb(this.id); } catch (e) { console.error(e); } }), 0);
    if (opts.role === 'guest') this.post('room-' + opts.room, null, 'hello');
  }
  on(evt, cb) { (this.handlers[evt] = this.handlers[evt] || []).push(cb); return this; }
  connect() { return this.conn('room-' + this.room); }
  conn(remoteId) { return (this.conns[remoteId] = this.conns[remoteId] || new MPLocalConnection(remoteId, this)); }
  post(to, data, kind) {
    if (!this.channel) return;
    try { this.channel.postMessage({ mp: 'hoi4', kind: kind || 'msg', from: this.id, to: to, data: data }); } catch (e) { /* ignore */ }
  }
  onMessage(msg) {
    if (!msg || msg.mp !== 'hoi4' || msg.from === this.id) return;
    if (msg.to !== this.id && msg.to !== '*') return;
    if (this.role === 'host') {
      const isNew = !this.conns[msg.from];
      const conn = this.conn(msg.from);
      if (isNew) this.handlers.connection.forEach(cb => { try { cb(conn); } catch (e) { console.error(e); } });
      if (msg.kind === 'msg') { this.deliver(conn, msg.data); }
      else if (msg.kind === 'bye') conn.emit('close');
    } else {
      const conn = this.conn(msg.from);
      if (msg.kind === 'msg') this.deliver(conn, msg.data);
      else if (msg.kind === 'bye') conn.emit('close');
    }
  }
  deliver(conn, data) { setTimeout(() => { if (!conn.closed) conn.emit('data', data); }, 0); }
  destroy() {
    if (this.channel) { this.post('*', null, 'bye'); try { this.channel.close(); } catch (e) { /* ignore */ } }
    this.channel = null;
  }
}

/** インゲームチャット (全体 / 陣営) */
class MPChat {
  static messages = [];
  static tab = 'global';
  static folded = false;
  static unread = { global: 0, faction: 0 };
  static MAX = 200;
  static seq = 0;

  static esc(s) { return MPHub.esc(s); }
  static flag(tag) {
    try { return (typeof DataFetcher !== 'undefined' && DataFetcher.getCountryFlagImage) ? DataFetcher.getCountryFlagImage(tag) : ''; } catch (e) { return ''; }
  }
  static nameOf(tag) {
    try { return (typeof DiplomacyManager !== 'undefined' && DiplomacyManager.nameOf(tag)) || tag; } catch (e) { return tag || ''; }
  }
  static allyOf(tag) {
    if (typeof FactionSystem === 'undefined' || !tag) return false;
    return FactionSystem.sameFaction(CoreEngine.gameState.country, tag);
  }

  /** 送信 */
  static send(text) {
    const body = String(text || '').trim().slice(0, 240);
    if (!body) return false;
    if (MPChat.tab === 'faction' && (typeof FactionSystem === 'undefined' || !FactionSystem.mine())) {
      MPChat.system('陣営チャットは陣営に所属すると使えます (政治 → 陣営 / 外交 → 陣営)', 'warn');
      return false;
    }
    const s = CoreEngine.gameState;
    const msg = {
      id: 'c' + (++MPChat.seq) + '_' + Date.now().toString(36),
      ch: MPChat.tab, tag: s.country, name: MPHub.myName(), peer: MultiplayerManager.playerId,
      text: body, ts: Date.now()
    };
    MPChat.append(msg, false);
    if (!MultiplayerManager.connected) {
      // ローカル閲覧用にログは残すが、警告は 1 回だけ出す
      if (!MPChat._offlineWarned) {
        MPChat._offlineWarned = true;
        MPChat.system('未接続のため、このメッセージはまだ誰にも届いていません (マルチに接続すると送信できます)', 'warn');
      }
      return false;
    }
    const out = { type: 'MP_CHAT', msg: msg };
    if (MultiplayerManager.isHost) {
      MPHub.relayChat(out.msg, null);
    } else {
      MPHub.sendToHost(out);
    }
    return true;
  }

  /** 受信 (ホストの転送 / ゲストの受信) */
  static receive(msg) {
    if (!msg || !msg.text) return false;
    if (msg.ch === 'faction' && !MPChat.allyOf(msg.tag)) return false;   // 陣営チャットは同盟国のみ
    if (MPChat.messages.some(m => m.id === msg.id)) return false;
    MPChat.append(msg, true);
    return true;
  }

  static system(text, tone) {
    MPChat.append({ id: 's' + (++MPChat.seq) + '_' + Date.now().toString(36), system: true, tone: tone || 'info', text: String(text || ''), ts: Date.now() }, false);
  }

  static append(msg, incoming) {
    MPChat.messages.push(msg);
    if (MPChat.messages.length > MPChat.MAX) MPChat.messages.splice(0, MPChat.messages.length - MPChat.MAX);
    if (incoming && msg.ch && msg.ch !== MPChat.tab && MPChat.folded) MPChat.unread[msg.ch] = (MPChat.unread[msg.ch] || 0) + 1;
    MPChat.render();
  }

  static setTab(tab) {
    MPChat.tab = tab === 'faction' ? 'faction' : 'global';
    MPChat.unread[MPChat.tab] = 0;
    MPChat.render();
  }
  static toggleFold() { MPChat.folded = !MPChat.folded; MPChat.render(); }

  static visible() {
    return MPChat.messages.filter(m => m.system || m.ch === MPChat.tab);
  }

  static html() {
    const list = MPChat.visible();
    if (!list.length) {
      return '<div class="mph-chat-empty">' + (MPChat.tab === 'faction'
        ? '陣営チャット — 同じ陣営のプレイヤーにだけ届きます'
        : 'ルーム内の全プレイヤーに届きます') + '</div>';
    }
    return list.map(m => {
      if (m.system) {
        return '<div class="mph-chat-msg sys ' + MPHub.esc(m.tone || 'info') + '">' + MPHub.esc(m.text) + '</div>';
      }
      const isMine = m.tag === CoreEngine.gameState.country;
      return '<div class="mph-chat-msg' + (isMine ? ' mine' : '') + '"><span class="mph-chat-flag">' + MPChat.flag(m.tag) + '</span>' +
        '<span class="mph-chat-who">' + MPHub.esc(MPChat.nameOf(m.tag)) + (m.name ? '<small>' + MPHub.esc(m.name) + '</small>' : '') + ':</span>' +
        '<span class="mph-chat-text">' + MPHub.esc(m.text) + '</span></div>';
    }).join('');
  }

  static render() {
    const root = document.getElementById('mp-chat');
    if (!root) return;
    root.classList.toggle('folded', MPChat.folded);
    const log = document.getElementById('mp-chat-log');
    if (log) { log.innerHTML = MPChat.html(); log.scrollTop = log.scrollHeight; }
    const tabs = root.querySelectorAll('[data-chat-tab]');
    tabs.forEach(btn => {
      const ch = btn.getAttribute('data-chat-tab');
      btn.classList.toggle('on', ch === MPChat.tab);
      if (ch === MPChat.tab) btn.classList.remove('unread');
      else btn.classList.toggle('unread', (MPChat.unread[ch] || 0) > 0);
    });
    const badge = document.getElementById('mp-chat-badge');
    if (badge) {
      const n = (MPChat.unread.global || 0) + (MPChat.unread.faction || 0);
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = n ? '' : 'none';
    }
  }

  /** Enter キーでチャットへフォーカス / Enter で送信してフォーカスを外す */
  static installKeys() {
    if (MPChat.keysInstalled) return;
    MPChat.keysInstalled = true;
    document.addEventListener('keydown', (e) => {
      const input = document.getElementById('mp-chat-input');
      if (!input) return;
      const inField = (() => {
        const t = e.target;
        if (!t) return false;
        const tag = (t.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
      })();
      if (e.key === 'Escape' && e.target === input) { input.blur(); return; }
      if (e.key === 'Enter' && !inField) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const ss = document.getElementById('start-screen');
        if (ss && !ss.classList.contains('hidden')) return;
        if (typeof NewsManager !== 'undefined' && NewsManager.showing) return;
        if (typeof IntelOperations !== 'undefined' && IntelOperations.challenge) return;
        const overlay = document.getElementById('generic-modal-overlay');
        if (overlay && !overlay.classList.contains('hidden')) return;
        e.preventDefault();
        if (MPChat.folded) MPChat.toggleFold();
        input.focus();
        input.select && input.select();
      }
    }, true);
  }

  static installUI() {
    if (document.getElementById('mp-chat')) return;
    const host = document.body;
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.id = 'mp-chat';
    wrap.className = 'mph-chat';
    wrap.innerHTML =
      '<div class="mph-chat-head">' +
        '<span class="mph-chat-title">💬 チャット <b id="mp-chat-badge" class="mph-chat-badge" style="display:none">0</b></span>' +
        '<div class="mph-chat-tabs">' +
          '<button type="button" data-chat-tab="global" class="on">全体</button>' +
          '<button type="button" data-chat-tab="faction">陣営</button>' +
        '</div>' +
        '<button type="button" class="mph-chat-fold" title="折りたたむ / 展開">▾</button>' +
      '</div>' +
      '<div id="mp-chat-log" class="mph-chat-log" aria-live="polite"></div>' +
      '<form id="mp-chat-form" class="mph-chat-form" autocomplete="off">' +
        '<input id="mp-chat-input" type="text" maxlength="240" placeholder="Enter で入力 / 送信" aria-label="チャットメッセージ">' +
        '<button type="submit" title="送信">送信</button>' +
      '</form>';
    host.appendChild(wrap);
    wrap.querySelectorAll('[data-chat-tab]').forEach(btn => {
      btn.addEventListener('click', () => MPChat.setTab(btn.getAttribute('data-chat-tab')));
    });
    const fold = wrap.querySelector('.mph-chat-fold');
    if (fold) fold.addEventListener('click', () => MPChat.toggleFold());
    const form = document.getElementById('mp-chat-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('mp-chat-input');
      if (!input) return;
      MPChat.send(input.value);
      input.value = '';
      input.blur();
    });
    MPChat.installKeys();
    MPChat.render();
  }
}

/** 右クリック外交コンテキストメニュー */
class DiploMenu {
  static tag = null;
  static installed = false;

  static esc(s) { return MPHub.esc(s); }
  static nameOf(tag) { try { return DiplomacyManager.nameOf(tag) || tag; } catch (e) { return tag; } }
  static flag(tag) { try { return DataFetcher.getCountryFlagImage(tag); } catch (e) { return ''; } }
  static ideology(tag) {
    try { return (typeof FactionSystem !== 'undefined' && FactionSystem.IDEOLOGY_NAME[FactionSystem.ideologyOf(tag)]) || '中道'; } catch (e) { return '中道'; }
  }
  static leader(tag) {
    try { return (CountryDossier.LEADERS[tag] || [null, DiploMenu.nameOf(tag) + ' の指導者'])[1]; } catch (e) { return DiploMenu.nameOf(tag) + ' の指導者'; }
  }
  static relation(tag) {
    try { return Number((DiplomacyManager.countries || []).find(c => c.id === tag)?.relation || 0); } catch (e) { return 0; }
  }
  static faction(tag) { try { return FactionSystem.factionOf(tag); } catch (e) { return null; } }
  static atWar(tag) { try { return FactionSystem.atWar(CoreEngine.gameState.country, tag); } catch (e) { return false; } }

  /** 各アクションの可否と理由 */
  static actions(tag) {
    const s = CoreEngine.gameState, me = s.country;
    const mineFaction = (typeof FactionSystem !== 'undefined') ? FactionSystem.mine() : null;
    const targetFaction = DiploMenu.faction(tag);
    const iLead = !!mineFaction && mineFaction.leader === me;
    const targetLeads = !!targetFaction && targetFaction.leader === tag;
    const pp = Math.floor(Number(s.politicalPower) || 0);
    const war = DiploMenu.atWar(tag);
    const out = [];

    // ---- 陣営へ招待 ----
    let inviteWhy = null;
    if (!mineFaction) inviteWhy = '自国が陣営を創設してください (政治 → 陣営)';
    else if (!iLead) inviteWhy = '陣営を主導している国のみ招待できます';
    else if (targetFaction) inviteWhy = DiploMenu.nameOf(tag) + ' は既に陣営「' + targetFaction.name + '」に所属しています';
    else if (war) inviteWhy = '交戦中の国は招待できません';
    else if (pp < 25) inviteWhy = '政治力が不足しています (必要 25)';
    else if (typeof FactionSystem !== 'undefined' && FactionSystem.democracyBlock(me)) inviteWhy = FactionSystem.democracyBlock(me);
    out.push({ id: 'invite', icon: '🏰', label: '陣営へ招待', hint: '政治力 25', disabled: !!inviteWhy, reason: inviteWhy });

    // ---- 加入申請 ----
    let joinWhy = null;
    if (!targetFaction) joinWhy = DiploMenu.nameOf(tag) + ' は陣営を主導していません';
    else if (!targetLeads) joinWhy = '盟主ではない国には申請できません';
    else if (mineFaction) joinWhy = '既に陣営「' + mineFaction.name + '」に所属しています';
    else if (war) joinWhy = '交戦中の陣営には加入できません';
    else if (pp < 25) joinWhy = '政治力が不足しています (必要 25)';
    else if (typeof FactionSystem !== 'undefined' && FactionSystem.democracyBlock(me)) joinWhy = FactionSystem.democracyBlock(me);
    out.push({ id: 'join', icon: '📝', label: '陣営への加入申請', hint: '政治力 25', disabled: !!joinWhy, reason: joinWhy });

    // ---- 参戦要請 ----
    const same = !!mineFaction && !!targetFaction && mineFaction.name === targetFaction.name;
    let callWhy = null;
    if (!same) callWhy = '同じ陣営の国にのみ参戦を要請できます';
    else if (tag === me) callWhy = '自国には要請できません';
    else if (!((s.atWar || []).length || DiploMenu._factionAtWar(mineFaction))) callWhy = 'どちらかが開戦している必要があります';
    out.push({ id: 'call', icon: '📯', label: '参戦要請 (Call to Arms)', hint: '陣営盟約', disabled: !!callWhy, reason: callWhy });

    // ---- 宣戦布告 ----
    let warWhy = null;
    if (war) warWhy = '既に交戦中です';
    else if (tag === me) warWhy = '自国には宣戦布告できません';
    else if (pp < 50) warWhy = '政治力が不足しています (必要 50)';
    else if (typeof FactionSystem !== 'undefined' && FactionSystem.democracyBlock && FactionSystem.democracyBlock(me)) warWhy = FactionSystem.democracyBlock(me);
    out.push({ id: 'declare', icon: '⚔', label: '宣戦布告', hint: '政治力 50 / 緊張度 +', disabled: !!warWhy, reason: warWhy });

    return out;
  }
  static _factionAtWar(f) {
    if (!f) return false;
    const s = CoreEngine.gameState;
    return f.members.some(m => (s.atWar || []).includes(m) || (typeof AIManager !== 'undefined' && (AIManager.state?.wars || []).some(w => w.a === m || w.b === m)));
  }

  static open(tag, x, y) {
    if (!tag || tag === CoreEngine.gameState.country) return DiploMenu.close();
    DiploMenu.tag = tag;
    let el = document.getElementById('diplo-menu');
    if (!el) {
      el = document.createElement('div');
      el.id = 'diplo-menu';
      el.className = 'mph-diplo-menu';
      el.addEventListener('mousedown', (e) => e.stopPropagation());
      document.body.appendChild(el);
    }
    el.innerHTML = DiploMenu.html(tag);
    el.style.display = 'block';
    // 画面端で切れないように位置を補正する
    const w = el.offsetWidth || 300, h = el.offsetHeight || 320;
    const maxX = (window.innerWidth || 1280) - w - 8, maxY = (window.innerHeight || 800) - h - 8;
    el.style.left = Math.max(6, Math.min(x, maxX)) + 'px';
    el.style.top = Math.max(6, Math.min(y, maxY)) + 'px';
    DiploMenu.installGlobalClose();
    return el;
  }

  static close() {
    const el = document.getElementById('diplo-menu');
    if (el) el.style.display = 'none';
    DiploMenu.tag = null;
  }

  static installGlobalClose() {
    if (DiploMenu.installed) return;
    DiploMenu.installed = true;
    document.addEventListener('mousedown', (e) => {
      const el = document.getElementById('diplo-menu');
      if (!el || el.style.display === 'none') return;
      if (!el.contains(e.target)) DiploMenu.close();
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') DiploMenu.close(); }, true);
    window.addEventListener('wheel', () => DiploMenu.close(), { passive: true });
    window.addEventListener('resize', () => DiploMenu.close());
  }

  static html(tag) {
    const s = CoreEngine.gameState;
    const rel = DiploMenu.relation(tag), f = DiploMenu.faction(tag), war = DiploMenu.atWar(tag);
    const acts = DiploMenu.actions(tag);
    return '<div class="mph-dm-head">' + DiploMenu.flag(tag) +
        '<div class="mph-dm-title"><b>' + DiploMenu.esc(DiploMenu.nameOf(tag)) + '</b>' +
        '<small>' + DiploMenu.esc(DiploMenu.leader(tag)) + ' ／ ' + DiploMenu.esc(DiploMenu.ideology(tag)) + '</small></div>' +
        (war ? '<span class="mph-dm-war">⚔ 交戦中</span>' : '') + '</div>' +
      '<div class="mph-dm-meta">' +
        '<span class="mph-dm-rel ' + (rel > 0 ? 'pos' : rel < -30 ? 'neg' : '') + '">関係 ' + (rel > 0 ? '+' : '') + rel + '</span>' +
        '<span class="mph-dm-fac">' + (f ? '🏰 ' + DiploMenu.esc(f.name) + (f.leader === tag ? ' (盟主)' : '') : '無所属') + '</span>' +
        (typeof FactionSystem !== 'undefined' ? '<span class="mph-dm-tension">🌡️ ' + Math.round(Number(s.worldTension) || 0) + '%</span>' : '') +
      '</div>' +
      '<div class="mph-dm-actions">' + acts.filter(a => !a.hidden).map(a =>
        '<button type="button" class="mph-dm-act' + (a.disabled ? ' off' : '') + '" ' +
          (a.disabled ? 'disabled ' : '') + 'data-diplo-act="' + a.id + '" title="' + DiploMenu.esc(a.reason || a.label + (a.hint ? ' (' + a.hint + ')' : '')) + '">' +
          '<span class="mph-dm-ic">' + a.icon + '</span>' + DiploMenu.esc(a.label) + (a.hint ? '<small>' + DiploMenu.esc(a.hint) + '</small>' : '') +
        '</button>').join('') + '</div>' +
      '<div class="mph-dm-foot">' +
        '<button type="button" class="mph-dm-link" data-diplo-act="dossier">🏛 政府情報</button>' +
        '<button type="button" class="mph-dm-link" data-diplo-act="window">🌐 外交画面</button>' +
      '</div>';
  }

  /** メニュー内ボタンの実行 */
  static run(action) {
    const tag = DiploMenu.tag;
    DiploMenu.close();
    if (!tag) return false;
    if (action === 'invite') { try { FactionSystem.invite(tag); } catch (e) { GameUI.notify('招待できません: ' + e.message, 'alert'); } return true; }
    if (action === 'join') {
      const f = DiploMenu.faction(tag);
      try { f ? FactionSystem.apply(f.name) : GameUI.notify('対象国は陣営を主導していません。', 'alert'); } catch (e) { GameUI.notify('加入申請できません: ' + e.message, 'alert'); }
      return true;
    }
    if (action === 'call') { return MPHub.callToArms(tag); }
    if (action === 'declare') { return MPHub.declareWar(tag); }
    if (action === 'dossier') { try { CountryDossier.open(tag); } catch (e) { /* ignore */ } return true; }
    if (action === 'window') { DiplomacyManager.selectedTag = tag; GameUI.switchTab('diplomacy'); return true; }
    return false;
  }

  static onClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest('[data-diplo-act]') : null;
    if (!btn) return;
    const el = document.getElementById('diplo-menu');
    if (!el || !el.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    DiploMenu.run(btn.getAttribute('data-diplo-act'));
  }
}

/**
 * MPHub — マルチプレイのロビー / 時間権限 / 通信状態 / チャット / 右クリック外交 / 陣営タブ
 */
class MPHub {
  static installed = false;
  static peerToPlayer = {};          // conn.peer -> MultiplayerManager.playerId
  static pending = {};               // peerId -> {name, tag} (認証前の登録待ち)
  static net = { ping: null, desync: false, lastPong: 0, peers: 0, errors: 0 };
  static pausedBy = null;
  static politicsTab = 'cabinet';
  static name = null;
  static callSeq = 0;

  static esc(s) {
    if (typeof GameTools !== 'undefined' && GameTools.escape) return GameTools.escape(String(s == null ? '' : s));
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  static el(id) { try { return document.getElementById(id); } catch (e) { return null; } }
  static gs() { return CoreEngine.gameState; }
  static isGuest() { return !!(MultiplayerManager.connected && !MultiplayerManager.isHost); }
  static day() { return (typeof GameTools !== 'undefined' && GameTools.day) ? GameTools.day() : 0; }

  // ==========================================================
  // 初期化
  // ==========================================================
  static init() {
    if (MPHub.installed) return;
    MPHub.installed = true;
    MPHub.installWindow();
    MPHub.installNetwork();
    MPHub.lockSpeedAuthority();
    MPHub.installTimeControls();
    MPHub.installChat();
    MPHub.installDiplo();
    MPHub.installPoliticsTab();
    MPHub.installAutoPause();
    MPHub.installNetStatus();
    CoreEngine.registerTickCallback(() => MPHub.onTick());
    setInterval(() => MPHub.pingTick(), 4000);
    MPHub.name = MPHub.myName();
    MPHub.render();
    CoreEngine.log('🌐 マルチプレイ・ラウンジ / チャット / 右クリック外交 が有効になりました。');
  }

  /** MultiplayerTimeManager.init() の後に呼ぶ (時間操作の権限を確定する) */
  static afterTimeManagerInit() {
    MPHub.lockSpeedAuthority();
    if (typeof MultiplayerTimeManager !== 'undefined' && !MultiplayerTimeManager._mphHostConn) {
      MultiplayerTimeManager._mphHostConn = true;
      // 既存実装は connections[roomId] を前提にしており、PeerJS 接続では解決できなかった
      MultiplayerTimeManager.sendToHost = (data) => MPHub.sendToHost(data);
    }
    MPHub.refreshTimeUI();
  }

  // ==========================================================
  // ウィンドウ (ロビー)
  // ==========================================================
  static installWindow() {
    const tpl = MPHub.el('tpl-multiplayer');
    if (tpl && tpl.dataset) { tpl.dataset.title = '👥 マルチプレイ — Multiplayer Lobby'; tpl.dataset.w = '1040'; tpl.dataset.h = '720'; }
    const nav = document.querySelector('.win-btn[data-tab="multiplayer"]');
    if (nav) { nav.classList.add('mph-nav-btn'); nav.title = 'マルチプレイ (ルーム作成 / 参加 / ロビー)'; }
    const render = MultiplayerManager.render.bind(MultiplayerManager);
    MultiplayerManager.render = () => MPHub.render();
    MultiplayerManager._legacyRender = render;
  }

  static myId() { return MultiplayerManager.playerId || 'local'; }
  static myName() {
    try {
      const saved = localStorage.getItem('hoi4_mp_name');
      if (saved) return saved;
      const name = 'プレイヤー' + Math.floor(100 + Math.random() * 900);
      localStorage.setItem('hoi4_mp_name', name);
      return name;
    } catch (e) { return 'プレイヤー'; }
  }
  static setName(v) {
    const name = String(v || '').trim().slice(0, 16);
    if (!name) return false;
    MPHub.name = name;
    try { localStorage.setItem('hoi4_mp_name', name); } catch (e) { /* ignore */ }
    if (MultiplayerManager.connected) {
      if (MultiplayerManager.isHost) MPHub.setHostEntry(MPHub.myId(), { name });
      else MPHub.sendToHost({ type: 'MP_REGISTER', playerId: MultiplayerManager.playerId, name: name, tag: MPHub.myTag() });
      MPHub.render();
    }
    return true;
  }
  static myTag() {
    const r = MPHub.roster();
    return (r.players[MPHub.myId()] || {}).tag || CoreEngine.gameState.country;
  }

  /**
   * ルームのロスター (メモリ上)。gameState.strategy は StrategyGame.prepare() が
   * 初期化するため、ここでは絶対に触らない (先に {} を作ると初期化が壊れる)。
   */
  static roster() {
    const m = (MPHub._lobby = MPHub._lobby || { players: {}, order: [] });
    m.players = m.players || {};
    m.order = m.order || [];
    return m;
  }
  static setHostEntry(id, patch) {
    const r = MPHub.roster();
    const entry = (r.players[id] = r.players[id] || { id, name: 'プレイヤー', tag: null, host: false, connected: true });
    Object.assign(entry, patch || {});
    if (!r.order.includes(id)) r.order.push(id);
    return entry;
  }
  static codeOf() { return MPHub.roster().code || MultiplayerManager.roomId || null; }

  static genCode() {
    const used = new Set(((MPHub._lobby && MPHub._lobby.history) || []));
    for (let i = 0; i < 40; i++) {
      const code = 'HOI4-' + Math.floor(1000 + Math.random() * 9000);
      if (!used.has(code)) { used.add(code); return code; }
    }
    return 'HOI4-' + Date.now().toString().slice(-4);
  }

  static render() {
    const el = MPHub.el('multiplayer-content');
    if (!el) return;
    MPHub.name = MPHub.name || MPHub.myName();
    const r = MPHub.roster();
    const connected = !!MultiplayerManager.connected;
    const host = !!MultiplayerManager.isHost;
    const code = connected ? (MultiplayerManager.roomId || r.code) : null;
    const started = !!r.started;

    let html = '<div class="mph-root">';
    html += '<div class="mph-hero"><div class="mph-hero-mark">👥</div><div class="mph-hero-body">' +
      '<h3>マルチプレイ <small>MULTIPLAYER LOBBY</small></h3>' +
      '<p>ルームコードを共有して対戦します。ホストが時間 (停止 / 速度) を管理し、ゲストは一時停止を要請できます。</p>' +
      '<div class="mph-hero-chips">' +
        '<span class="mph-chip ' + (connected ? 'on' : 'off') + '">' + (connected ? (host ? '👑 ホスト' : '🔗 ゲスト') : '⚪ 未接続') + '</span>' +
        (code ? '<span class="mph-chip code">' + MPHub.esc(code) + '</span>' : '') +
        '<span class="mph-chip">' + (MPHub.transportLabel()) + '</span>' +
        '<span class="mph-chip">' + MPHub.esc(MPHub.name) + '</span>' +
      '</div></div></div>';

    if (!connected) {
      html += '<div class="mph-connect">' +
        '<div class="mph-card"><h4>🏠 ルームを作成 (ホスト)</h4>' +
          '<p class="mph-help">ルームコードを自動発行します。コードをコピーして仲間へ送ってください。</p>' +
          '<div class="mph-field"><label>プレイヤー名</label><input id="mph-name" class="mph-input" maxlength="16" value="' + MPHub.esc(MPHub.name) + '" onchange="MPHub.setName(this.value)"></div>' +
          '<div class="mph-field"><label>パスワード (任意)</label><input id="mph-pass" class="mph-input" type="password" maxlength="24" placeholder="空欄可"></div>' +
          '<button class="mph-btn primary big" onclick="MPHub.hostRandom()">🏠 ルームを作成 (ホスト)</button>' +
        '</div>' +
        '<div class="mph-card"><h4>🚪 ルームに参加 (ゲスト)</h4>' +
          '<p class="mph-help">ホストから受け取ったルームコードを入力してください (例: HOI4-8821)。</p>' +
          '<div class="mph-field"><label>ルームコード</label><input id="mph-code" class="mph-input code" maxlength="24" placeholder="HOI4-0000" value="' + MPHub.esc(MPHub.prefillCode || '') + '"></div>' +
          '<div class="mph-field"><label>パスワード (任意)</label><input id="mph-join-pass" class="mph-input" type="password" maxlength="24" placeholder="空欄可"></div>' +
          '<button class="mph-btn big" onclick="MPHub.joinFromForm()">🔗 接続</button>' +
          '<div class="mph-status" id="mph-status"></div>' +
        '</div></div>' +
        '<div class="mph-note">' + MPHub.transportNote() + '</div>';
    } else {
      // ---- ロビー ----
      html += '<div class="mph-lobby"><div class="mph-code-box"><div><small>ルームコード</small><b id="mph-room-code">' + MPHub.esc(code || '-') + '</b></div>' +
        '<button class="mph-btn small" onclick="MPHub.copyCode()">📋 コピー</button>' +
        '<button class="mph-btn small" onclick="MPHub.requestResync()" title="全クライアントの状態を突き合わせ直します">🔄 再同期</button>' +
        '<button class="mph-btn small danger" onclick="MPHub.leave()">切断</button></div>';
      html += '<div class="mph-table-wrap"><table class="mph-table"><thead><tr><th>プレイヤー</th><th>接続</th><th>国家</th><th>役割</th><th></th></tr></thead><tbody>';
      const order = r.order.filter(id => r.players[id]);
      if (!order.length) order.push(MPHub.myId());
      order.forEach(id => {
        const p = r.players[id] || { id, name: id, tag: null };
        const isMe = id === MPHub.myId();
        const isHostRow = !!p.host;
        const state = isMe ? '自分' : (p.connected === false ? '切断' : '接続中');
        html += '<tr class="' + (isMe ? 'me' : '') + '">' +
          '<td><div class="mph-pname">' + (isHostRow ? '👑 ' : '') + MPHub.esc(p.name || id) + '<small>' + MPHub.esc(id) + '</small></div></td>' +
          '<td><span class="mph-dot ' + (p.connected === false ? 'off' : 'on') + '"></span>' + state + '</td>' +
          '<td>' + MPHub.countryCell(p, isMe, host, started) + '</td>' +
          '<td>' + (isHostRow ? 'ホスト' : 'ゲスト') + '</td>' +
          '<td>' + (host && !isMe ? '<button class="mph-btn tiny" onclick="MPHub.kick(\'' + MPHub.esc(id) + '\')">追放</button>' : '') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
      html += '<div class="mph-lobby-foot">';
      if (host) {
        const missing = order.filter(id => !(r.players[id] || {}).tag);
        html += '<button class="mph-btn primary big" ' + ((started || missing.length) ? 'disabled' : '') + ' onclick="MPHub.startGame()" title="' +
          (missing.length ? '全員が国家を選択すると開始できます' : 'マルチプレイを開始') + '">▶ マルチプレイ開始</button>' +
          (missing.length ? '<span class="mph-warn">国家未選択: ' + missing.map(id => MPHub.esc((r.players[id] || {}).name || id)).join(' / ') + '</span>' : '<span class="mph-ok">全員の国家が決定しています</span>');
      } else {
        html += '<span class="mph-help">ホストの「マルチプレイ開始」を待っています…</span>';
      }
      html += '</div>';
      if (started) html += '<div class="mph-started">▶ マルチプレイ開始済み — 時間はホストが管理します</div>';
      html += '<div class="mph-note">' + MPHub.transportNote() + '</div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
    const nav = document.querySelector('.win-btn[data-tab="multiplayer"]');
    if (nav) nav.classList.toggle('connected', connected);
    MPHub.centerWindow();
    MPHub.refreshTimeUI();
  }

  static centerWindow() {
    const tpl = MPHub.el('tpl-multiplayer');
    const win = tpl && tpl.closest ? tpl.closest('.os-window') : null;
    if (!win) return;
    win.classList.add('mph-window');
    if (win.dataset.mphCentered) return;
    win.dataset.mphCentered = '1';
    const layer = MPHub.el('window-layer');
    if (!layer) return;
    const W = layer.offsetWidth || window.innerWidth || 1280;
    const H = layer.offsetHeight || window.innerHeight || 800;
    const w = win.offsetWidth || parseInt(tpl.dataset.w, 10) || 1040;
    const h = win.offsetHeight || parseInt(tpl.dataset.h, 10) || 720;
    win.style.left = Math.max(8, Math.round((W - w) / 2)) + 'px';
    win.style.top = Math.max(8, Math.round((H - h) / 2)) + 'px';
  }

  static countryCell(p, isMe, isHost, started) {
    const s = MPHub.gs();
    const countries = MPHub.countryOptions();
    const me = p.tag || (isMe ? s.country : '');
    const select = (handler, value) =>
      '<select class="mph-select" onchange="' + handler + '">' +
        '<option value="">— 国家を選択 —</option>' +
        countries.map(c => '<option value="' + c.tag + '"' + (c.tag === value ? ' selected' : '') + '>' + c.name + '</option>').join('') +
      '</select>';
    if (started) return me ? MPHub.flagHtml(me) : '<span class="mph-help">未選択</span>';
    if (isMe) return select('MPHub.pickCountry(this.value)', me);
    // ホストは他プレイヤーの国家も割り当てられる
    if (isHost) return select('MPHub.assignCountry(\'' + MPHub.esc(p.id) + '\', this.value)', p.tag || '');
    return me ? MPHub.flagHtml(me) : '<span class="mph-help">未選択</span>';
  }

  static flagHtml(tag) {
    return '<span class="mph-country">' + MPHub.flag(tag) + ' ' + MPHub.esc(MPHub.countryName(tag)) + '</span>';
  }

  /** ホストが他プレイヤーの国家を割り当てる */
  static assignCountry(id, tag) {
    if (!MultiplayerManager.isHost) return false;
    const r = MPHub.roster();
    if (!r.players[id]) return false;
    if (tag) {
      const taken = Object.values(r.players).find(p => p && p.id !== id && p.tag === tag);
      if (taken) {
        GameUI.notify('その国家は既に ' + (taken.name || taken.id) + ' が選択しています。', 'alert');
        MPHub.render();
        return false;
      }
    }
    MPHub.setHostEntry(id, { tag: tag || null });
    MPHub.broadcastLobby();
    MPHub.render();
    return true;
  }

  static countryOptions() {
    const me = MPHub.gs().country;
    const list = [{ tag: me, name: MPHub.countryName(me) }];
    try {
      (DiplomacyManager.countries || []).forEach(c => {
        if (!c || !c.id || c.id === me || list.some(x => x.tag === c.id)) return;
        list.push({ tag: c.id, name: c.name || MPHub.countryName(c.id) });
      });
    } catch (e) { /* ignore */ }
    if (list.length < 4) {
      [['GER', 'ドイツ'], ['SOV', 'ソ連'], ['JAP', '日本'], ['USA', 'アメリカ'], ['ENG', 'イギリス'], ['FRA', 'フランス'], ['ITA', 'イタリア']]
        .forEach(([tag, name]) => { if (!list.some(x => x.tag === tag)) list.push({ tag, name: MPHub.countryName(tag) !== tag ? MPHub.countryName(tag) : name }); });
    }
    return list;
  }
  static countryName(tag) {
    try { return (DiplomacyManager && DiplomacyManager.nameOf(tag)) || tag; } catch (e) { return tag; }
  }
  static flag(tag) {
    try { return DataFetcher.getCountryFlagImage(tag) || ''; } catch (e) { return ''; }
  }
  static transportLabel() { return (typeof window !== 'undefined' && typeof window.Peer === 'function') ? 'P2P (PeerJS)' : 'ローカル (同ブラウザ)'; }
  static transportNote() {
    if (typeof window !== 'undefined' && typeof window.Peer === 'function') {
      return '🌐 PeerJS による P2P 接続です。ルームコードを知っているプレイヤーだけが参加できます。';
    }
    return '💻 PeerJS (unpkg) を読み込めないため、<b>同じブラウザの別タブ</b>で動作するローカル通信モードです。' +
      '別タブで game/index.html を開き、同じルームコードで参加すると対戦できます。';
  }

  // ==========================================================
  // 接続 (PeerJS / ローカル)
  // ==========================================================
  static makePeer(role, code) {
    if (typeof window !== 'undefined' && typeof window.Peer === 'function') {
      return role === 'host' ? new window.Peer('hoi4game-' + code, { debug: 1 }) : new window.Peer({ debug: 1 });
    }
    return new MPLocalPeer({ role: role, room: code });
  }

  static hostRandom() {
    const nameEl = MPHub.el('mph-name');
    if (nameEl && nameEl.value.trim()) MPHub.setName(nameEl.value);
    const pass = (MPHub.el('mph-pass') || {}).value || '';
    const code = MPHub.genCode();
    MPHub.roster();
    return MPHub.host(code, pass);
  }

  static joinFromForm() {
    const codeEl = MPHub.el('mph-code');
    const code = codeEl ? codeEl.value.trim().toUpperCase() : '';
    if (!code) { GameUI.notify('ルームコードを入力してください。', 'alert'); return false; }
    const pass = (MPHub.el('mph-join-pass') || {}).value || '';
    return MPHub.join(code, pass);
  }

  static status(msg, tone) {
    const el = MPHub.el('mph-status');
    if (el) el.textContent = msg;
    if (msg && tone !== 'silent') CoreEngine.log(msg);
  }

  static host(code, password) {
    const M = MultiplayerManager;
    if (M.connected) M.disconnect();
    M.playerId = M.playerId || ('p' + Math.random().toString(36).slice(2, 8));
    M.roomId = code; M.isHost = true; M.connected = false; M.remoteCountries = {}; M.connections = {};
    M.peer = null;
    M.roomHash = M.hashPassword(password || '');
    MPHub.peerToPlayer = {}; MPHub.pending = {};
    const r = MPHub.roster();
    r.code = code; r.started = false; r.players = {}; r.order = [];
    r.history = r.history || []; r.history.push(code); r.history = r.history.slice(-20);
    MPHub.setHostEntry(M.playerId, { id: M.playerId, name: MPHub.myName(), tag: MPHub.gs().country, host: true, connected: true });

    let peer;
    try { peer = MPHub.makePeer('host', code); } catch (e) { GameUI.notify('ルームを作成できません: ' + e.message, 'alert'); return false; }
    M.peer = peer;
    const ready = (id) => {
      M.connected = true;
      MPHub.status('👑 ホスト開始 — ルームコード ' + code);
      GameUI.notify('ルームを作成しました: ' + code, 'success');
      MPHub.systemMessage('ルーム「' + code + '」を作成しました (' + MPHub.transportLabel() + ')', 'info');
      const ind = MPHub.el('mp-indicator'); if (ind) ind.textContent = '👥 ホスト';
      if (typeof MultiplayerTimeManager !== 'undefined') { try { MultiplayerTimeManager.startHostBroadcast(); } catch (e) { /* ignore */ } }
      MPHub.render(); MPHub.refreshTimeUI(); MPHub.renderNetStatus();
    };
    peer.on('open', ready);
    peer.on('error', (err) => MPHub.onPeerError(err));
    peer.on('connection', (conn) => MPHub.attachHostConnection(conn));
    return true;
  }

  static join(code, password) {
    const M = MultiplayerManager;
    if (M.connected) M.disconnect();
    M.playerId = M.playerId || ('p' + Math.random().toString(36).slice(2, 8));
    M.roomId = code; M.isHost = false; M.connected = false; M.remoteCountries = {}; M.connections = {};
    M.joinPassword = password || '';
    MPHub.peerToPlayer = {}; MPHub.pending = {};
    let peer;
    try { peer = MPHub.makePeer('guest', code); } catch (e) { GameUI.notify('接続できません: ' + e.message, 'alert'); return false; }
    M.peer = peer;
    MPHub.status('接続中… ' + code);
    peer.on('open', () => {
      let conn;
      try { conn = typeof window !== 'undefined' && typeof window.Peer === 'function' ? peer.connect('hoi4game-' + code, { reliable: true }) : peer.connect(); }
      catch (e) { MPHub.status('接続に失敗しました: ' + e.message); return; }
      M.connections[conn.peer] = conn;
      conn.on('open', () => {
        M.connected = true;
        MPHub.aliasHostConn(conn);
        MPHub.status('接続完了 — ホストの承認を待っています…');
        const ind = MPHub.el('mp-indicator'); if (ind) ind.textContent = '👥 接続中';
        GameUI.notify('ルームに接続しました: ' + code, 'success');
        MPHub.render(); MPHub.refreshTimeUI();
      });
      conn.on('data', (data) => M.onData(data, conn.peer));
      conn.on('close', () => MPHub.onHostClosed());
    });
    peer.on('error', (err) => MPHub.onPeerError(err));
    return true;
  }

  static attachHostConnection(conn) {
    const M = MultiplayerManager;
    M.connections[conn.peer] = conn;
    conn.on('open', () => { conn.authOk = false; try { conn.send({ type: 'auth_req' }); } catch (e) { /* ignore */ } });
    conn.on('data', (data) => M.onData(data, conn.peer));
    conn.on('close', () => MPHub.onPeerClosed(conn.peer));
  }

  static onPeerError(err) {
    MPHub.net.errors++;
    const type = (err && (err.type || err.message)) || 'unknown';
    MPHub.status('接続エラー: ' + type);
    if (type === 'peer-unavailable' || type === 'unavailable-id' || type === 'network') {
      GameUI.notify('接続できませんでした (' + type + ')。ルームコードを確認してください。', 'alert');
    }
    MPHub.render(); MPHub.renderNetStatus();
  }

  static onHostClosed() {
    GameUI.notify('ホストとの接続が切れました。ローカル進行に切り替えます。', 'alert');
    const r = MPHub.roster();
    r.players = {}; r.order = []; r.started = false;
    MPHub.systemMessage('ホストとの接続が切れました', 'warn');
    try { MultiplayerManager.handleDisconnect(MultiplayerManager.roomId); } catch (e) { /* ignore */ }
    MultiplayerManager.connected = false;
    MPHub.render(); MPHub.refreshTimeUI(); MPHub.renderNetStatus();
  }

  static onPeerClosed(peerId) {
    const r = MPHub.roster();
    const pid = MPHub.peerToPlayer[peerId];
    const entry = pid ? r.players[pid] : null;
    if (entry) { entry.connected = false; MPHub.systemMessage((entry.name || pid) + ' が切断されました', 'warn'); }
    delete MPHub.peerToPlayer[peerId];
    delete MultiplayerManager.connections[peerId];
    try { MultiplayerManager.handleDisconnect(peerId, entry ? entry.tag : null); } catch (e) { /* ignore */ }
    if (MultiplayerManager.isHost) MPHub.broadcastLobby();
    MPHub.render();
  }

  static leave() {
    const r = MPHub.roster();
    if (MultiplayerManager.isHost) MPHub.systemMessage('ルームを解散しました', 'warn');
    r.players = {}; r.order = []; r.started = false; r.code = null;
    MPHub.peerToPlayer = {};
    MPHub.net = { ping: null, desync: false, lastPong: 0, peers: 0, errors: 0 };
    try { MultiplayerManager.disconnect(); } catch (e) { /* ignore */ }
    const ind = MPHub.el('mp-indicator'); if (ind) ind.textContent = '👥 単独';
    MPHub.render(); MPHub.refreshTimeUI(); MPHub.renderNetStatus();
  }

  static copyCode() {
    const code = MultiplayerManager.roomId || MPHub.codeOf();
    if (!code) return false;
    const done = () => GameUI.notify('ルームコードをコピーしました: ' + code, 'success');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(code).then(done, () => MPHub.copyFallback(code, done)); return true; }
    } catch (e) { /* fall through */ }
    MPHub.copyFallback(code, done);
    return true;
  }
  static copyFallback(code, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      done();
    } catch (e) { GameUI.notify('コピーできませんでした。コード: ' + code, 'alert'); }
  }

  // ==========================================================
  // ロビー同期 (ホストが正)
  // ==========================================================
  static broadcastLobby() {
    if (!MultiplayerManager.isHost || !MultiplayerManager.connected) return;
    const r = MPHub.roster();
    r.code = MultiplayerManager.roomId;
    const payload = { type: 'MP_LOBBY', lobby: { code: r.code, started: !!r.started, players: r.players, order: r.order } };
    MultiplayerManager.broadcast(payload);
    MPHub.render();
  }

  static applyLobby(lobby) {
    if (!lobby || !lobby.players) return false;
    const r = MPHub.roster();
    r.code = lobby.code || r.code;
    r.started = !!lobby.started;
    r.players = lobby.players;
    r.order = Array.isArray(lobby.order) ? lobby.order : Object.keys(lobby.players);
    // 自分の国家が決定していれば反映する
    const me = r.players[MPHub.myId()];
    if (r.started && me && me.tag && me.tag !== CoreEngine.gameState.country) MPHub.switchCountry(me.tag);
    MPHub.render();
    return true;
  }

  static pickCountry(tag) {
    const r = MPHub.roster();
    const meId = MPHub.myId();
    const taken = Object.values(r.players).find(p => p && p.id !== meId && p.tag === tag);
    if (taken) { GameUI.notify('その国家は既に ' + (taken.name || taken.id) + ' が選択しています。', 'alert'); MPHub.render(); return false; }
    if (MultiplayerManager.isHost) {
      MPHub.setHostEntry(meId, { tag: tag });
      MPHub.broadcastLobby();
    } else {
      MPHub.sendToHost({ type: 'MP_REGISTER', playerId: MultiplayerManager.playerId, name: MPHub.myName(), tag: tag });
    }
    MPHub.render();
    return true;
  }

  static startGame() {
    if (!MultiplayerManager.isHost) return false;
    const r = MPHub.roster();
    const missing = Object.values(r.players).filter(p => p && !p.tag);
    if (missing.length) { GameUI.notify('国家が未選択のプレイヤーがいます: ' + missing.map(p => p.name || p.id).join(' / '), 'alert'); return false; }
    r.started = true;
    MPHub.broadcastLobby();
    MultiplayerManager.broadcast({ type: 'MP_START', lobby: { code: r.code, started: true, players: r.players, order: r.order } });
    MPHub.systemMessage('マルチプレイを開始しました (' + Object.keys(r.players).length + ' 人)', 'info');
    GameUI.notify('▶ マルチプレイ開始', 'success');
    MPHub.render();
    return true;
  }

  static kick(id) {
    if (!MultiplayerManager.isHost) return false;
    const conn = Object.values(MultiplayerManager.connections).find(c => MPHub.peerToPlayer[c.peer] === id);
    if (conn) { try { conn.send({ type: 'MP_KICK' }); } catch (e) { /* ignore */ } try { conn.close(); } catch (e) { /* ignore */ } }
    const r = MPHub.roster();
    const name = (r.players[id] || {}).name || id;
    delete r.players[id];
    r.order = r.order.filter(x => x !== id);
    MPHub.systemMessage(name + ' を追放しました', 'warn');
    MPHub.broadcastLobby();
    MPHub.render();
    return true;
  }

  static switchCountry(tag) {
    const s = MPHub.gs();
    if (!tag || tag === s.country) return false;
    s.country = tag;
    try { DiplomacyManager.rebuildCountries(); } catch (e) { /* ignore */ }
    try { ProductionManager.ensure(); } catch (e) { /* ignore */ }
    try { MapRenderer.invalidateModes && MapRenderer.invalidateModes(); } catch (e) { /* ignore */ }
    try { CoreEngine.renderStats(); } catch (e) { /* ignore */ }
    GameUI.notify('国家を ' + MPHub.countryName(tag) + ' に設定しました。', 'success');
    return true;
  }

  /** ゲスト側: ホストへの接続を解決する (PeerJS は接続辞書のキーがピアIDになるため) */
  static hostConn() {
    if (MultiplayerManager.isHost) return null;
    const direct = MultiplayerManager.connections[MultiplayerManager.roomId];
    if (direct && direct.open !== false) return direct;
    const list = Object.values(MultiplayerManager.connections).filter(c => c && c.open !== false);
    return list.length ? list[0] : null;
  }

  /**
   * ゲスト側の接続辞書に roomId の別名を張る (列挙されないので二重送信は起きない)。
   * PeerJS の接続キーは 'hoi4game-<code>' で roomId と異なるため、既存コードの
   * connections[roomId] 参照 (認証応答・時間同期など) を解決するために必要。
   */
  static aliasHostConn(conn) {
    const C = MultiplayerManager.connections;
    if (!C || !conn) return;
    if (C[conn.peer] !== conn) C[conn.peer] = conn;
    try {
      Object.defineProperty(C, MultiplayerManager.roomId || conn.peer, {
        value: conn, enumerable: false, configurable: true, writable: true
      });
    } catch (e) { /* ignore */ }
  }

  static sendToHost(data) {
    const host = MPHub.hostConn();
    if (!host) { GameUI.notify('ホストとの接続がありません。', 'alert'); return false; }
    try { host.send(data); return true; } catch (e) { return false; }
  }

  /** ホスト: 認証済みの全員へ / ゲスト: ホストへ転送 */
  static broadcastAll(data) {
    if (MultiplayerManager.isHost) {
      Object.values(MultiplayerManager.connections).forEach(conn => {
        if (!conn || conn.authOk === false || conn.open === false) return;
        try { conn.send(data); } catch (e) { /* ignore */ }
      });
      return true;
    }
    return MPHub.sendToHost(data);
  }

  /** 右クリック外交: 宣戦布告 (政治力 50 / 世界緊張度 +) */
  static declareWar(tag) {
    const s = MPHub.gs();
    if (!tag || tag === s.country) return false;
    if ((s.atWar || []).includes(tag)) { GameUI.notify('既に ' + MPHub.countryName(tag) + ' と交戦中です。', 'alert'); return false; }
    const cost = 50;
    if (Number(s.politicalPower) < cost) { GameUI.notify('宣戦布告には政治力 ' + cost + ' が必要です。', 'alert'); return false; }
    s.politicalPower = Math.max(0, Number(s.politicalPower) - cost);
    s.atWar = s.atWar || [];
    if (!s.atWar.includes(tag)) s.atWar.push(tag);
    try { if (typeof FactionSystem !== 'undefined' && FactionSystem.makeWar) FactionSystem.makeWar(s.country, tag); } catch (e) { /* ignore */ }
    try {
      if (typeof CoreEngine.addWorldTension === 'function') CoreEngine.addWorldTension(6, MPHub.countryName(s.country) + ' が ' + MPHub.countryName(tag) + ' に宣戦布告', s.country);
    } catch (e) { /* ignore */ }
    try { if (typeof FactionSystem !== 'undefined' && FactionSystem.onWarStart) FactionSystem.onWarStart(s.country, tag); } catch (e) { /* ignore */ }
    try { CoreEngine.renderStats(); } catch (e) { /* ignore */ }
    try { DiplomacyManager.render && DiplomacyManager.render(); } catch (e) { /* ignore */ }
    MPHub.broadcastAll({ type: 'declare_war', by: s.country, target: tag });
    MPHub.systemMessage('⚔ ' + MPHub.countryName(s.country) + ' が ' + MPHub.countryName(tag) + ' に宣戦布告しました', 'war');
    GameUI.notify('⚔ ' + MPHub.countryName(tag) + ' に宣戦布告しました (政治力 -' + cost + ')', 'alert');
    try { CoreEngine.log('⚔ 宣戦布告: ' + MPHub.countryName(s.country) + ' → ' + MPHub.countryName(tag)); } catch (e) { /* ignore */ }
    return true;
  }

  /** ホスト側: プレイヤーID → 接続 */
  static connOfPlayer(playerId) {
    const peer = Object.keys(MPHub.peerToPlayer).find(p => MPHub.peerToPlayer[p] === playerId);
    return peer ? MultiplayerManager.connections[peer] : null;
  }

  static registerSelf() {
    if (MultiplayerManager.isHost) return;
    MPHub.sendToHost({ type: 'MP_REGISTER', playerId: MultiplayerManager.playerId, name: MPHub.myName(), tag: MPHub.gs().country });
  }

  // ==========================================================
  // 時間権限 (ホストのみ操作可 / ゲストは要請)
  // ==========================================================
  static installTimeControls() {
    // 一時停止要請ボタン (トップバー) は onclick="MPHub.requestPause()" で配線済み
    MPHub.refreshTimeUI();
  }

  /** MultiplayerTimeManager の後で呼び、ゲストの直接操作を確実に禁止する */
  static lockSpeedAuthority() {
    if (CoreEngine._mphSpeedHooked) return;
    CoreEngine._mphSpeedHooked = true;
    const inner = CoreEngine.setSpeed.bind(CoreEngine);
    CoreEngine.setSpeed = (speed) => {
      if (MPHub.isGuest()) {
        GameUI.notify('時間の操作はホストのみ可能です。⏸ 一時停止を要請 を使ってください。', 'alert');
        MPHub.flashTimeLock();
        return false;
      }
      return inner(speed);
    };
  }

  static flashTimeLock() {
    const box = MPHub.el('speed-buttons');
    if (!box) return;
    box.classList.add('mph-shake');
    setTimeout(() => box.classList.remove('mph-shake'), 500);
  }

  static refreshTimeUI() {
    const guest = MPHub.isGuest();
    const box = MPHub.el('speed-buttons');
    if (box) {
      box.classList.toggle('mph-locked', guest);
      box.querySelectorAll('button[data-speed]').forEach(b => {
        b.disabled = guest;
        b.setAttribute('aria-disabled', guest ? 'true' : 'false');
        if (guest) b.title = 'ゲストは時間を操作できません (ホストのみ)';
      });
    }
    const ind = MPHub.el('mp-indicator');
    if (ind && MultiplayerManager.connected) ind.textContent = MultiplayerManager.isHost ? '👥 ホスト' : '👥 ゲスト';
    const nav = document.querySelector('.win-btn[data-tab="multiplayer"]');
    if (nav) nav.classList.toggle('connected', !!MultiplayerManager.connected);
    const req = MPHub.el('pause-req-btn');
    if (req) req.style.display = guest ? '' : 'none';
    MPHub.renderNetStatus();
  }

  static requestPause() {
    if (!MPHub.isGuest()) {
      // ソロ / ホストは通常の停止トグル
      if (typeof MultiplayerTimeManager !== 'undefined' && MultiplayerTimeManager.requestPauseToggle) MultiplayerTimeManager.requestPauseToggle();
      else CoreEngine.setSpeed(CoreEngine.gameState.paused ? 1 : 0);
      return true;
    }
    MPHub.sendToHost({ type: 'MP_PAUSE_REQ', name: MPHub.myName(), tag: MPHub.gs().country });
    MPHub.systemMessage('⏸ 一時停止を要請しました', 'warn');
    GameUI.notify('ホストへ一時停止を要請しました。', 'success');
    return true;
  }

  static receivePauseRequest(data, fromPeer) {
    if (!MultiplayerManager.isHost) return false;
    const conn = MultiplayerManager.connections[fromPeer];
    if (!conn || conn.authOk !== true) return false;
    const name = String(data.name || 'ゲスト');
    MPHub.systemMessage('⏸ ' + name + ' が一時停止を要求しています', 'warn');
    GameUI.notify('⏸ ' + name + ' が一時停止を要求しています', 'alert');
    MPHub.pauseBanner(name + ' が一時停止を要求しています — 時間を停止しました');
    MPHub.pauseGame('pause-request');
    MultiplayerManager.broadcast({ type: 'MP_SYS', text: '⏸ ' + name + ' が一時停止を要求しています', tone: 'warn' });
    try { conn.send({ type: 'MP_PAUSE_ACK', name: name }); } catch (e) { /* ignore */ }
    return true;
  }

  static pauseGame(reason) {
    const s = MPHub.gs();
    if (s.paused || !s.speed) { MPHub.pausedBy = MPHub.pausedBy || reason; return false; }
    if (MPHub.isGuest()) {
      // ゲストは時間を操作できないため、ホストへ停止を要請する
      MPHub.sendToHost({ type: 'MP_PAUSE_REQ', name: MPHub.myName(), tag: s.country, reason: reason });
      MPHub.pausedBy = reason;
      return true;
    }
    try {
      if (typeof StrategyGame !== 'undefined' && s.speed) StrategyGame.lastSpeed = s.speed;
      if (typeof MultiplayerTimeManager !== 'undefined' && MultiplayerTimeManager.lastSpeed == null) MultiplayerTimeManager.lastSpeed = s.speed;
      CoreEngine.setSpeed(0);
    } catch (e) { /* ignore */ }
    MPHub.pausedBy = reason;
    return true;
  }

  static pauseBanner(text) {
    let el = MPHub.el('mph-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mph-banner';
      el.className = 'mph-banner';
      document.body.appendChild(el);
    }
    el.innerHTML = '<span class="mph-banner-ic">⏸</span><span>' + MPHub.esc(text) + '</span><button class="mph-banner-x" title="閉じる">✕</button>';
    el.style.display = 'flex';
    const x = el.querySelector('.mph-banner-x');
    if (x) x.addEventListener('click', () => { el.style.display = 'none'; });
    clearTimeout(MPHub._bannerTimer);
    MPHub._bannerTimer = setTimeout(() => { el.style.display = 'none'; }, 9000);
  }

  // ==========================================================
  // チャット / システムメッセージ
  // ==========================================================
  static installChat() {
    // 旧 WarSystems のチャット (マルチ画面内に固定表示していた) は本パネルへ統合する
    if (typeof WarSystems !== 'undefined' && !WarSystems._mphMerged) {
      WarSystems._mphMerged = true;
      WarSystems.mountChat = () => {};
      WarSystems.renderChat = () => {};
    }
    MPChat.installUI();
    MPChat.render();
  }

  static systemMessage(text, tone) {
    MPChat.system(text, tone);
    if (MultiplayerManager.connected) MultiplayerManager.broadcast({ type: 'MP_SYS', text: text, tone: tone || 'info' });
    return true;
  }

  static relayRaw(data, excludePeer) {
    if (!MultiplayerManager.isHost) return;
    Object.entries(MultiplayerManager.connections).forEach(([peerId, conn]) => {
      if (peerId === excludePeer) return;
      if (!conn || conn.authOk !== true) return;
      try { conn.send(data); } catch (e) { /* ignore */ }
    });
  }

  static relayChat(msg, fromPeer) {
    if (!msg) return;
    const players = MPHub.roster().players || {};
    Object.entries(MultiplayerManager.connections).forEach(([peerId, conn]) => {
      if (peerId === fromPeer) return;
      if (!conn || conn.authOk !== true) return;
      const pid = MPHub.peerToPlayer[peerId];
      const tag = (players[pid] || {}).tag;
      if (msg.ch === 'faction' && !(tag && MPHub.sameFaction(msg.tag, tag))) return;
      try { conn.send({ type: 'MP_CHAT', msg: msg }); } catch (e) { /* ignore */ }
    });
  }

  static sameFaction(a, b) {
    if (!a || !b) return false;
    if (typeof FactionSystem !== 'undefined') { try { return FactionSystem.sameFaction(a, b); } catch (e) { /* ignore */ } }
    return false;
  }

  // ==========================================================
  // Ping / Desync (通信状態インジケーター)
  // ==========================================================
  static installNetStatus() {
    const cal = MPHub.el('calendar-display');
    if (!cal || MPHub.el('mp-net-status')) return;
    const btn = document.createElement('button');
    btn.id = 'mp-net-status';
    btn.className = 'mph-net offline';
    btn.type = 'button';
    btn.title = '通信状態 — 未接続';
    btn.innerHTML = '<i class="mph-net-dot"></i><span class="mph-net-text">オフライン</span>';
    btn.addEventListener('click', () => {
      if (MPHub.net.desync) MPHub.requestResync();
      else GameUI.switchTab('multiplayer');
    });
    if (cal.parentNode) cal.parentNode.insertBefore(btn, cal.nextSibling);
  }

  /** 全クライアントで比較可能な「共有世界の状態」ハッシュ (自分の国固有値は含めない) */
  static stateSig() {
    const s = MPHub.gs();
    const tick = (typeof MultiplayerTimeManager !== 'undefined') ? Number(MultiplayerTimeManager.currentTick) || 0 : 0;
    const date = s.date && typeof s.date.toISOString === 'function' ? s.date.toISOString().slice(0, 13) : '';
    let factions = '';
    let wars = '';
    try {
      factions = (DiplomacyManager.factions || [])
        .map(f => f.name + ':' + f.leader + ':' + (f.members || []).slice().sort().join('/'))
        .sort().join('|');
    } catch (e) { /* ignore */ }
    try {
      wars = (typeof AIManager !== 'undefined' && AIManager.state && AIManager.state.wars ? AIManager.state.wars : [])
        .map(w => w.a + '>' + w.b).sort().join(',');
    } catch (e) { /* ignore */ }
    const parts = [tick, date, factions, wars].join('#');
    let h = 2166136261;
    for (let i = 0; i < parts.length; i++) { h ^= parts.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }

  static pingTick() {
    if (!MultiplayerManager.connected) { MPHub.renderNetStatus(); return; }
    const t = Date.now();
    if (MultiplayerManager.isHost) {
      Object.values(MultiplayerManager.connections).forEach(conn => {
        if (conn.authOk !== true) return;
        try { conn.send({ type: 'MP_PING', t: t, sig: MPHub.stateSig() }); } catch (e) { /* ignore */ }
      });
    } else {
      MPHub.sendToHost({ type: 'MP_PING', t: t, sig: MPHub.stateSig() });
    }
    MPHub.renderNetStatus();
  }

  static onPing(data, fromPeer) {
    const reply = { type: 'MP_PONG', t: Number(data.t) || Date.now(), sig: MPHub.stateSig() };
    if (MultiplayerManager.isHost) {
      const conn = MultiplayerManager.connections[fromPeer];
      if (conn) { try { conn.send(reply); } catch (e) { /* ignore */ } }
    } else {
      MPHub.sendToHost(reply);
    }
    // 相手のハッシュを比較して Desync を検出 / 解消
    MPHub.compareSig(data.sig);
    return true;
  }

  static compareSig(sig) {
    if (!sig) return;
    if (sig !== MPHub.stateSig()) { MPHub.markDesync('peer'); return; }
    if (MPHub.net.desync) {
      MPHub.net.desync = false;
      MPChat.system('✅ 状態が一致しました — 再同期が完了しました', 'info');
      MPHub.renderNetStatus();
    }
  }

  static onPong(data) {
    const rtt = Math.max(0, Date.now() - (Number(data.t) || Date.now()));
    MPHub.net.ping = MPHub.net.ping == null ? rtt : Math.round(MPHub.net.ping * 0.6 + rtt * 0.4);
    MPHub.net.lastPong = Date.now();
    MPHub.compareSig(data.sig);
    MPHub.renderNetStatus();
    return true;
  }

  static markDesync(peer) {
    if (MPHub.net.desync) return;
    MPHub.net.desync = true;
    MPHub.systemMessage('⚠ 同期ズレ (Desync) を検出しました — 再同期してください', 'error');
    GameUI.notify('⚠ 同期ズレを検出しました。マルチプレイ画面から再同期してください。', 'alert');
    MPHub.renderNetStatus();
    if (MultiplayerManager.isHost) MPHub.broadcastLobby();
  }

  static requestResync() {
    if (MultiplayerManager.isHost) {
      // ホストは全ゲストへ完全な状態を配る
      Object.values(MultiplayerManager.connections).forEach(conn => {
        try { conn.send({ type: 'sync', state: CoreEngine.getSyncState(), date: CoreEngine.gameState.date.toISOString() }); } catch (e) { /* ignore */ }
      });
      MPHub.broadcastLobby();
      MPHub.net.desync = false;
      GameUI.notify('ゲストへ同期状態を再送しました。', 'success');
    } else {
      MPHub.sendToHost({ type: 'MP_RESYNC_REQ' });
      GameUI.notify('ホストへ再同期を要求しました。', 'success');
    }
    MPHub.renderNetStatus();
  }

  /** 通信状態インジケーターの表示内容 (緑=正常 / 黄=遅延 / 赤=Desync) */
  static netState() {
    const connected = !!MultiplayerManager.connected;
    const ping = MPHub.net.ping;
    if (!connected) return { cls: 'offline', text: 'オフライン', tip: '通信状態 — 未接続 (マルチプレイを開始すると表示されます)' };
    if (MPHub.net.desync) return { cls: 'desync', text: 'Desync', tip: '同期ズレを検出 — 再同期してください' };
    if (ping == null) return { cls: 'wait', text: '同期中', tip: 'ホストと同期しています…' };
    if (ping <= 150) return { cls: 'ok', text: ping + 'ms', tip: '通信状態 良好 (' + ping + ' ms) — 同期 OK' };
    if (ping <= 450) return { cls: 'warn', text: ping + 'ms', tip: '遅延しています (' + ping + ' ms) — 同期 OK' };
    return { cls: 'bad', text: ping + 'ms', tip: '著しい遅延 (' + ping + ' ms)' };
  }

  static renderNetStatus() {
    const btn = MPHub.el('mp-net-status');
    if (!btn) return;
    const { cls, text, tip } = MPHub.netState();
    btn.className = 'mph-net ' + cls;
    btn.innerHTML = '<i class="mph-net-dot"></i><span class="mph-net-text">' + text + '</span>';
    btn.title = tip;
    const req = MPHub.el('pause-req-btn');
    if (req) req.style.display = MPHub.isGuest() ? '' : 'none';
  }

  static onTick() {
    if (!MPHub.installed) return;
    // 接続が切れているのに行が残らないようにする (5 秒ごと)
    const now = Date.now();
    if (MPHub._lastTickAt && now - MPHub._lastTickAt < 5000) return;
    MPHub._lastTickAt = now;
    MPHub.renderNetStatus();
    if (MPHub.net.ping != null && MultiplayerManager.connected && MPHub.net.lastPong && now - MPHub.net.lastPong > 20000 && !MPHub.net.desync) {
      MPHub.net.ping = null;   // 応答が止まったら「同期中」に戻す
    }
  }

  // ==========================================================
  // ネットワーク受信 (MultiplayerManager.onData の前段)
  // ==========================================================
  static installNetwork() {
    if (MultiplayerManager._mphHooked) return;
    MultiplayerManager._mphHooked = true;
    const orig = MultiplayerManager.onData.bind(MultiplayerManager);
    MultiplayerManager.onData = (data, peerId) => {
      // ゲスト側は接続辞書のキーがホストのピアID (hoi4game-<code>) になるため、
      // 既存コードが期待する roomId に正規化してから渡す。
      const from = (!MultiplayerManager.isHost && MultiplayerManager.roomId) ? MultiplayerManager.roomId : peerId;
      if (MPHub.handleData(data, from, peerId)) return;
      orig(data, from);
      MPHub.afterData(data, from);
    };
  }

  static afterData(data, peerId) {
    if (!data) return;
    // ホスト: 認証完了 → ロビー登録待ち
    if (data.type === 'auth_resp' && MultiplayerManager.isHost) {
      const conn = MultiplayerManager.connections[peerId];
      if (conn && conn.authOk === true) {
        // 認証 OK — ロビー登録 (MP_REGISTER) を待つ
        MPHub.status('プレイヤー認証 OK — ロビー登録待ち (' + peerId + ')', 'silent');
      }
    }
    // ゲスト: 初期同期を受け取ったら自分を登録する
    if (data.type === 'sync' && !MultiplayerManager.isHost) {
      MPHub.registerSelf();
      MPHub.render();
    }
    if (data.type === 'declare_war' && data.target) {
      const me = MPHub.gs().country;
      if (data.target === me || !MultiplayerManager.isHost) {
        MPHub.systemMessage('⚔ 宣戦布告 — ' + MPHub.countryName(data.target) + ' が戦争状態に入りました', 'error');
        if (data.target === me) MPHub.autoPause('宣戦布告');
      }
      try { MapRenderer.invalidateModes(); } catch (e) { /* ignore */ }
    }
    if (data.type === 'faction_create' && data.faction) {
      MPHub.applyFactionCreate(data.faction);
      MPHub.systemMessage('🏰 陣営「' + (data.faction.name || '') + '」が創設されました', 'info');
      MPHub.refreshPolitics();
    }
    if (data.type === 'faction_join') {
      MPHub.applyFactionJoin(data.countryId, data.factionName);
      MPHub.systemMessage('🏰 ' + MPHub.countryName(data.countryId) + ' が陣営「' + data.factionName + '」に加盟しました', 'info');
      MPHub.refreshPolitics();
    }
  }

  static handleData(data, fromPeer, rawPeer) {
    if (!data || !data.type) return false;
    const host = !!MultiplayerManager.isHost;
    // ゲストはホスト以外からの制御メッセージを無視する
    const fromHost = fromPeer === MultiplayerManager.roomId;
    const authed = host ? (MultiplayerManager.connections[fromPeer] || {}).authOk === true : fromHost;
    switch (data.type) {
      case 'MP_REGISTER':
        if (!host || !authed) return true;
        MPHub.pending[fromPeer] = { playerId: data.playerId || fromPeer, name: String(data.name || '').slice(0, 16) || 'ゲスト', tag: data.tag || null };
        {
          const pid = MPHub.pending[fromPeer].playerId;
          MPHub.peerToPlayer[fromPeer] = pid;
          const r = MPHub.roster();
          const existing = r.players[pid] || {};
          // 認証直後に peerId で仮登録されていた行があれば取り除く
          if (pid !== fromPeer && r.players[fromPeer]) {
            delete r.players[fromPeer];
            r.order = r.order.filter(x => x !== fromPeer);
          }
          if (!existing.id) MPHub.systemMessage(MPHub.pending[fromPeer].name + ' が参加しました', 'info');
          const taken = Object.values(r.players).some(p => p && p.id !== pid && data.tag && p.tag === data.tag);
          MPHub.setHostEntry(pid, { id: pid, name: MPHub.pending[fromPeer].name, tag: taken ? existing.tag || null : (data.tag || existing.tag || null), host: false, connected: true });
          if (taken && data.tag) { try { MultiplayerManager.connections[fromPeer].send({ type: 'MP_NOTICE', text: 'その国家は他のプレイヤーが選択済みです' }); } catch (e) { /* ignore */ } }
          MPHub.broadcastLobby();
        }
        return true;
      case 'MP_LOBBY':
        if (host) return true;
        MPHub.applyLobby(data.lobby);
        return true;
      case 'MP_START':
        if (host) return true;
        MPHub.applyLobby(data.lobby);
        MPHub.systemMessage('マルチプレイが開始されました', 'info');
        GameUI.notify('▶ マルチプレイ開始', 'success');
        return true;
      case 'declare_war': {
        if (!data.by || !data.target) return false;   // FactionSystem の旧形式は無視 (自国以外への宣戦は反映しない)
        if (host) MPHub.broadcastAll(data);
        const s = MPHub.gs();
        if (data.target === s.country) {
          s.atWar = s.atWar || [];
          if (!s.atWar.includes(data.by)) s.atWar.push(data.by);
          GameUI.notify('⚔ ' + MPHub.countryName(data.by) + ' が自国に宣戦布告しました。', 'alert');
          MPHub.systemMessage('⚔ ' + MPHub.countryName(data.by) + ' が ' + MPHub.countryName(s.country) + ' に宣戦布告', 'war');
          try { CoreEngine.renderStats(); } catch (e) { /* ignore */ }
        } else {
          MPHub.systemMessage('⚔ ' + MPHub.countryName(data.by) + ' が ' + MPHub.countryName(data.target) + ' に宣戦布告', 'war');
        }
        return true;
      }
      case 'MP_CHAT':
        if (!authed) return true;
        MPChat.receive(data.msg);
        if (host) MPHub.relayChat(data.msg, fromPeer);
        return true;
      case 'MP_SYS':
        if (!authed) return true;
        MPChat.system(data.text, data.tone);
        if (host) MPHub.relayRaw({ type: 'MP_SYS', text: data.text, tone: data.tone }, fromPeer);
        return true;
      case 'chat': {
        // 既存 WarSystems チャット互換 (全体 / 陣営)
        if (!authed || !data.text) return true;
        MPChat.receive({ id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ch: data.channel === 'faction' ? 'faction' : 'global', tag: data.from || '???', name: '', text: String(data.text).slice(0, 240), ts: Date.now() });
        if (host) MPHub.relayRaw({ ...data, from: data.from }, fromPeer);
        return true;
      }
      case 'MP_NOTICE':
        if (!authed) return true;
        GameUI.notify(MPHub.esc(data.text), 'alert');
        return true;
      case 'MP_PAUSE_REQ':
        return MPHub.receivePauseRequest(data, fromPeer);
      case 'MP_PAUSE_ACK':
        if (host) return true;
        MPChat.system('ホストが一時停止を承認しました', 'warn');
        return true;
      case 'MP_KICK':
        if (host) return true;
        GameUI.notify('ホストによりルームから切断されました。', 'alert');
        setTimeout(() => MPHub.leave(), 200);
        return true;
      case 'MP_PING':
        if (!authed) return true;
        return MPHub.onPing(data, fromPeer);
      case 'MP_PONG':
        if (!authed) return true;
        return MPHub.onPong(data, fromPeer);
      case 'MP_RESYNC_REQ':
        if (!host || !authed) return true;
        MPHub.requestResync();
        return true;
      case 'MP_CALL_TO_ARMS':
        if (!authed) return true;
        if (!host) { MPHub.receiveCallToArms(data); return true; }
        {
          const call = data.call || {};
          const human = MPHub.humanTag(call.target);
          const conn = human ? MPHub.connOfPlayer(human.id) : null;
          if (conn) {
            try { conn.send({ type: 'MP_CALL_TO_ARMS', call: call }); } catch (e) { /* ignore */ }
          } else {
            const accept = Math.random() < 0.7;
            if (accept) {
              MPHub.applyWar(call.target, call.from);
              (call.enemies || []).forEach(e => { try { if (typeof FactionSystem !== 'undefined') FactionSystem.makeWar(call.target, e); } catch (err) { /* ignore */ } });
              MPHub.relayRaw({ type: 'MP_SYS', text: '⚔ ' + MPHub.countryName(call.target) + ' が参戦要請を承諾しました', tone: 'info' }, null);
            } else {
              MPHub.relayRaw({ type: 'MP_SYS', text: '✖ ' + MPHub.countryName(call.target) + ' が参戦要請を拒否しました', tone: 'warn' }, null);
            }
          }
        }
        return true;
      case 'MP_CALL_ANSWER':
        if (!host || !authed) return true;
        MPHub.resolveCallAnswer(data, fromPeer);
        return true;
      case 'MP_WAR':
        // 宣戦布告は全クライアントで即時反映 (StrategyGame.onMessage の declare_war とは別経路)
        if (!authed) return true;
        MPHub.applyWar(data.target, data.by);
        if (host) MPHub.relayRaw(data, fromPeer);
        return true;
      default:
        return false;
    }
  }

  // ==========================================================
  // 戦争 / 参戦要請
  // ==========================================================
  /** 陣営イベントのローカル反映 (全クライアントで同じ構造にする) */
  static applyFactionCreate(faction) {
    if (!faction || !faction.name) return false;
    const list = (typeof DiplomacyManager !== 'undefined') ? DiplomacyManager.factions : null;
    if (!list) return false;
    if (!list.some(f => f.name === faction.name)) {
      list.push({ name: faction.name, leader: faction.leader, members: (faction.members || [faction.leader]).slice(), ideology: faction.ideology, founded: faction.founded });
    }
    try { if (typeof FactionSystem !== 'undefined') FactionSystem.refresh(); } catch (e) { /* ignore */ }
    return true;
  }

  static applyFactionJoin(countryId, factionName) {
    if (!countryId || !factionName) return false;
    const list = (typeof DiplomacyManager !== 'undefined') ? DiplomacyManager.factions : null;
    if (!list) return false;
    const f = list.find(x => x.name === factionName);
    if (!f) return false;
    list.forEach(x => { if (x !== f) x.members = (x.members || []).filter(m => m !== countryId); });
    if (!f.members.includes(countryId)) f.members.push(countryId);
    try { if (typeof FactionSystem !== 'undefined') FactionSystem.refresh(); } catch (e) { /* ignore */ }
    return true;
  }

  static applyWar(target, by) {
    if (!target) return false;
    const s = MPHub.gs(), me = s.country;
    let changed = false;
    if (target === me && by && by !== me && !s.atWar.includes(by)) { s.atWar.push(by); changed = true; }
    if (by === me && !s.atWar.includes(target)) { s.atWar.push(target); changed = true; }
    if (!changed && by !== me && target !== me) {
      // 他国同士の戦争: ログのみ
      MPHub.systemMessage('⚔ ' + MPHub.countryName(by || target) + ' が ' + MPHub.countryName(target) + ' に宣戦布告しました', 'warn');
      return true;
    }
    if (changed) {
      MPHub.systemMessage('⚔ ' + MPHub.countryName(by || me) + ' と ' + MPHub.countryName(target === me ? by : target) + ' が戦争状態に入りました', 'error');
      GameUI.notify('⚔ 宣戦布告: ' + MPHub.countryName(target === me ? by : target), 'alert');
      MPHub.autoPause('宣戦布告');
    }
    try { DiplomacyManager.render(); } catch (e) { /* ignore */ }
    try { CoreEngine.renderStats(); } catch (e) { /* ignore */ }
    try { MapRenderer.invalidateModes(); } catch (e) { /* ignore */ }
    // 前線・攻撃線・軍配置を全プレイヤーへ再同期
    try { if (typeof StrategyGame !== 'undefined' && StrategyGame.publish) StrategyGame.publish(); } catch (e) { /* ignore */ }
    return true;
  }

  static humanTag(tag) {
    const r = MPHub.roster();
    const p = Object.values(r.players).find(x => x && x.tag === tag && x.id !== MPHub.myId());
    return p || null;
  }

  /** 陣営として交戦中の敵国 (自国 + 同盟国の戦争を集計) */
  static factionEnemies(f, me) {
    const s = MPHub.gs();
    const set = new Set((s.atWar || []).slice());
    try {
      const wars = (typeof AIManager !== 'undefined' && AIManager.state && AIManager.state.wars) ? AIManager.state.wars : [];
      wars.forEach(w => {
        const a = f.members.includes(w.a), b = f.members.includes(w.b);
        if (a && !b) set.add(w.b);
        if (b && !a) set.add(w.a);
      });
    } catch (e) { /* ignore */ }
    set.delete(me);
    (f.members || []).forEach(m => set.delete(m));
    return [...set].filter(Boolean);
  }

  static callToArms(tag) {
    const s = MPHub.gs(), me = s.country;
    if (!tag || tag === me) return false;
    const mine = (typeof FactionSystem !== 'undefined') ? FactionSystem.mine() : null;
    if (!mine || !mine.members.includes(tag)) { GameUI.notify('同じ陣営の国にのみ参戦要請できます。', 'alert'); return false; }
    const enemies = MPHub.factionEnemies(mine, me);
    const call = { id: 'call' + (++MPHub.callSeq) + Date.now().toString(36), from: me, target: tag, enemies: enemies, ts: Date.now() };
    MPHub.systemMessage('📯 ' + MPHub.countryName(tag) + ' へ参戦を要請しました', 'warn');

    if (MultiplayerManager.connected) {
      if (MultiplayerManager.isHost) {
        const human = MPHub.humanTag(tag);
        const conn = human ? MPHub.connOfPlayer(human.id) : null;
        if (conn) {
          try { conn.send({ type: 'MP_CALL_TO_ARMS', call: call }); } catch (e) { /* ignore */ }
          GameUI.notify('📯 ' + MPHub.countryName(tag) + ' の応答を待っています…', 'success');
          return true;
        }
      } else {
        // ゲストはホスト経由で対象プレイヤーへ転送される
        MPHub.sendToHost({ type: 'MP_CALL_TO_ARMS', call: call, to: tag });
        GameUI.notify('📯 ' + MPHub.countryName(tag) + ' へ要請を送信しました…', 'success');
        return true;
      }
    }

    // AI / 未接続: 自動判定
    const accept = (typeof FactionSystem !== 'undefined' && FactionSystem.aiJoins)
      ? FactionSystem.aiJoins(tag, me, enemies[0] || me, mine)
      : Math.random() < 0.7;
    if (accept) {
      const joinEnemies = enemies.length ? enemies.slice() : [tag];
      joinEnemies.forEach(e => MPHub.applyWar(e, me));
      MPHub.broadcastWar(enemies[0] || tag, me);
      MPHub.systemMessage('⚔ ' + MPHub.countryName(tag) + ' が参戦要請を承諾しました', 'info');
      if (typeof FactionSystem !== 'undefined') {
        enemies.forEach(e => { try { FactionSystem.makeWar(tag, e); } catch (err) { /* ignore */ } });
        (mine.members || []).forEach(m => { if (m !== tag && m !== me) enemies.forEach(e => { try { FactionSystem.makeWar(m, e); } catch (err) { /* ignore */ } }); });
      }
    } else {
      MPHub.systemMessage('✖ ' + MPHub.countryName(tag) + ' は参戦要請を拒否しました (関係 −30)', 'warn');
      if (typeof FactionSystem !== 'undefined') FactionSystem.adjustRelation(tag, -30);
    }
    MPHub.render();
    return true;
  }

  static broadcastWar(target, by) {
    if (!MultiplayerManager.connected) return;
    MultiplayerManager.broadcast({ type: 'MP_WAR', target: target, by: by || MPHub.gs().country });
  }

  static receiveCallToArms(data) {
    const call = data && data.call;
    if (!call) return false;
    MPHub._lastCall = call;
    MPHub.autoPause('参戦要請');
    MPHub.systemMessage('📯 ' + MPHub.countryName(call.from) + ' から参戦要請が届きました', 'warn');
    GameUI.openModal('📯 参戦要請 — Call to Arms',
      '<div class="mph-modal"><div class="mph-modal-head">' + MPHub.flag(call.from) +
        '<div><b>' + MPHub.esc(MPHub.countryName(call.from)) + '</b><small>同盟国からの参戦要請</small></div></div>' +
      '<p>' + MPHub.esc(MPHub.countryName(call.from)) + ' は ' + (call.enemies && call.enemies.length ? call.enemies.map(e => MPHub.esc(MPHub.countryName(e))).join('・') : '敵国') + ' と交戦中です。陣営の盟約に基づき、参戦が求められています。</p>' +
      '<ul class="mph-modal-list">' + (call.enemies || []).map(e => '<li>' + MPHub.flag(e) + ' ' + MPHub.esc(MPHub.countryName(e)) + ' と即時交戦</li>').join('') + '</ul>' +
      '<p class="mph-help">承諾すると即座に戦争状態に入り、前線・攻撃線・マップ・チャットが全プレイヤーへ同期されます。拒否すると陣営内の関係が悪化します (−30)。</p>' +
      '<div class="mph-modal-actions"><button class="mph-btn primary" onclick="MPHub.answerCall(\'accept\',\'' + MPHub.esc(call.from) + '\')">⚔ 承諾する</button>' +
      '<button class="mph-btn" onclick="MPHub.answerCall(\'decline\',\'' + MPHub.esc(call.from) + '\')">拒否する</button></div></div>');
    return true;
  }

  static answerCall(answer, fromTag) {
    try { GameUI.closeModal(); } catch (e) { /* ignore */ }
    const s = MPHub.gs();
    const call = MPHub._lastCall || {};
    const enemies = (call.enemies && call.enemies.length) ? call.enemies : (fromTag ? [fromTag] : []);
    if (answer === 'accept') {
      enemies.forEach(e => { if (!s.atWar.includes(e)) s.atWar.push(e); });
      MPHub.systemMessage('⚔ 参戦要請を承諾しました' + (enemies.length ? ' — ' + enemies.map(e => MPHub.countryName(e)).join('・') : ''), 'error');
      GameUI.notify('⚔ 参戦要請を承諾しました', 'alert');
      if (typeof FactionSystem !== 'undefined') {
        const f = FactionSystem.mine();
        (f ? f.members : []).forEach(m => { if (m !== s.country) enemies.forEach(e => { try { FactionSystem.makeWar(m, e); } catch (err) { /* ignore */ } }); });
      }
      if (!MultiplayerManager.isHost) MPHub.sendToHost({ type: 'MP_CALL_ANSWER', answer: 'accept', from: fromTag, enemies: enemies });
      MPHub.broadcastWar(enemies[0] || fromTag, s.country);
      if (MultiplayerManager.isHost) MPHub.relayRaw({ type: 'MP_WAR', target: enemies[0] || fromTag, by: s.country }, null);
      try { MapRenderer.invalidateModes(); } catch (e) { /* ignore */ }
      try { if (typeof StrategyGame !== 'undefined' && StrategyGame.publish) StrategyGame.publish(); } catch (e) { /* ignore */ }
    } else {
      if (typeof FactionSystem !== 'undefined') FactionSystem.adjustRelation(fromTag, -30);
      s.stability = Math.max(0, (s.stability || 0) - 5);
      MPHub.systemMessage('✖ 参戦要請を拒否しました (関係 −30・安定度 −5)', 'warn');
      if (!MultiplayerManager.isHost) MPHub.sendToHost({ type: 'MP_CALL_ANSWER', answer: 'decline', from: fromTag, enemies: enemies });
    }
    try { DiplomacyManager.render(); } catch (e) { /* ignore */ }
    try { CoreEngine.renderStats(); } catch (e) { /* ignore */ }
    MPHub.refreshPolitics();
    MPHub.render();
    return true;
  }

  static resolveCallAnswer(data, fromPeer) {
    const name = (MPHub.roster().players[MPHub.peerToPlayer[fromPeer]] || {}).name || 'ゲスト';
    if (data.answer === 'accept') {
      MPHub.systemMessage('⚔ ' + name + ' が参戦要請を承諾しました', 'info');
      MPHub.relayRaw({ type: 'MP_SYS', text: '⚔ ' + name + ' が参戦要請を承諾しました', tone: 'info' }, fromPeer);
    } else {
      MPHub.systemMessage('✖ ' + name + ' が参戦要請を拒否しました', 'warn');
    }
    return true;
  }

  // ==========================================================
  // 自動一時停止 (外交ポップアップ)
  // ==========================================================
  static installAutoPause() {
    if (typeof FactionSystem !== 'undefined' && !FactionSystem._mphPause) {
      FactionSystem._mphPause = true;
      const origCall = FactionSystem.openCallModal.bind(FactionSystem);
      FactionSystem.openCallModal = (call) => { MPHub.autoPause('参戦要請'); return origCall(call); };
      const origWar = FactionSystem.onWarStart.bind(FactionSystem);
      FactionSystem.onWarStart = (a, b) => { const res = origWar(a, b); if (a === CoreEngine.gameState.country || b === CoreEngine.gameState.country) MPHub.autoPause('宣戦布告'); return res; };
    }
    if (typeof WarGoals !== 'undefined' && !WarGoals._mphPause) {
      WarGoals._mphPause = true;
      const orig = WarGoals.start.bind(WarGoals);
      WarGoals.start = (tag) => { const ok = orig(tag); if (ok) { MPHub.systemMessage('⚔ ' + MPHub.countryName(CoreEngine.gameState.country) + ' が ' + MPHub.countryName(tag) + ' に宣戦布告しました', 'error'); MPHub.broadcastWar(tag, CoreEngine.gameState.country); } return ok; };
    }
  }

  static autoPause(reason) {
    if (!MPHub.gs().speed && MPHub.gs().paused) { MPHub.pauseBanner(reason + ' — 時間は停止中です'); return false; }
    const paused = MPHub.pauseGame(reason);
    MPHub.pauseBanner(reason + ' — ゲーム内時間を自動停止しました');
    if (paused) MPHub.systemMessage('⏸ ' + reason + ' のため自動停止しました', 'warn');
    return paused;
  }

  // ==========================================================
  // 右クリック外交
  // ==========================================================
  static installDiplo() {
    if (MPHub._diploInstalled) return;
    MPHub._diploInstalled = true;
    document.addEventListener('click', (e) => DiploMenu.onClick(e), false);
  }

  /** マップ右クリックから呼ばれる (index.html の map mouseup) */
  static openDiplo(tag, x, y) {
    if (!tag) return false;
    DiploMenu.open(tag, x, y);
    return true;
  }

  static closeDiplo() {
    try { DiploMenu.close(); } catch (e) { /* ignore */ }
    return true;
  }

  // ==========================================================
  // 政治画面の「陣営」タブ
  // ==========================================================
  static installPoliticsTab() {
    if (typeof PoliticsSystem === 'undefined' || PoliticsSystem._mphHooked) return;
    PoliticsSystem._mphHooked = true;
    const orig = PoliticsSystem.render.bind(PoliticsSystem);
    PoliticsSystem.render = () => {
      const el = MPHub.el('politics-content');
      if (!el) return orig();
      if (MPHub.politicsTab === 'faction') { el.innerHTML = MPHub.factionTabHTML(); return; }
      orig();
      try { el.insertAdjacentHTML('afterbegin', MPHub.politicsTabsHTML()); } catch (e) { /* ignore */ }
    };
  }

  static politicsTabsHTML() {
    const faction = (typeof FactionSystem !== 'undefined') ? FactionSystem.mine() : null;
    return '<div class="mph-tabbar">' +
      '<button class="mph-tab' + (MPHub.politicsTab === 'cabinet' ? ' on' : '') + '" onclick="MPHub.setPoliticsTab(\'cabinet\')">🏛 内閣・法案</button>' +
      '<button class="mph-tab' + (MPHub.politicsTab === 'faction' ? ' on' : '') + '" onclick="MPHub.setPoliticsTab(\'faction\')">🏰 陣営' + (faction ? ' <b>' + MPHub.esc(faction.name) + '</b>' : '') + '</button>' +
      '<span class="mph-tabbar-note">🌡️ 世界緊張度 ' + Math.round(Number(CoreEngine.gameState.worldTension) || 0) + '%</span></div>';
  }

  static setPoliticsTab(tab) {
    MPHub.politicsTab = tab === 'faction' ? 'faction' : 'cabinet';
    try { (typeof PoliticsSystem !== 'undefined' ? PoliticsSystem.render.bind(PoliticsSystem) : PoliticsManager.render.bind(PoliticsManager))(); } catch (e) { /* ignore */ }
    return true;
  }

  static refreshPolitics() {
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen && WindowManager.isOpen('politics')) {
      try { PoliticsSystem.render(); } catch (e) { /* ignore */ }
    }
  }

  static factionTabHTML() {
    const s = MPHub.gs(), me = s.country;
    const mine = (typeof FactionSystem !== 'undefined') ? FactionSystem.mine() : null;
    let html = '<div class="mph-fac-root"><div class="mph-tabbar">' +
      '<button class="mph-tab" onclick="MPHub.setPoliticsTab(\'cabinet\')">🏛 内閣・法案</button>' +
      '<button class="mph-tab on" onclick="MPHub.setPoliticsTab(\'faction\')">🏰 陣営</button>' +
      '<span class="mph-tabbar-note">🌡️ 世界緊張度 ' + Math.round(Number(s.worldTension) || 0) + '%</span></div>';
    html += '<div class="mph-card fac-create"><h4>🏰 新陣営の設立</h4>';
    if (mine) {
      html += '<p class="mph-help">自国は陣営「<b>' + MPHub.esc(mine.name) + '</b>」' +
        (mine.leader === me ? ' を主導しています (盟主)。' : ' に加盟しています (盟主: ' + MPHub.esc(MPHub.countryName(mine.leader)) + ')。') + '</p>';
    } else {
      const cost = (typeof FactionSystem !== 'undefined' && FactionSystem.unlocked()) ? 0 : 50;
      const block = (typeof FactionSystem !== 'undefined' && FactionSystem.democracyBlock) ? FactionSystem.democracyBlock(me) : null;
      html += '<p class="mph-help">政治力を消費して自由な名前で陣営を創設できます (コスト: <b>政治力 ' + cost + '</b>)。創設後は盟主として他国を招待できます。</p>' +
        (block ? '<p class="mph-warn">⛔ ' + MPHub.esc(block) + '</p>' : '') +
        '<div class="mph-field-row"><input id="mph-faction-name" class="mph-input" maxlength="24" placeholder="陣営名 (例: 新秩序同盟)" ' +
        'onkeydown="if(event.key===\'Enter\'){event.preventDefault();MPHub.createFaction();}">' +
        '<button class="mph-btn primary" ' + (block ? 'disabled ' : '') + 'onclick="MPHub.createFaction()">🏰 設立する</button></div>' +
        '<div class="mph-faction-ideas">' + ((typeof FactionSystem !== 'undefined' && FactionSystem.NAME_IDEAS[FactionSystem.ideologyOf(me)]) || []).map(n => '<button class="mph-btn tiny" onclick="MPHub.suggestFactionName(\'' + MPHub.esc(n) + '\')">' + MPHub.esc(n) + '</button>').join('') + '</div>' +
        '<p class="mph-help">現在の政治力: <b>' + Math.floor(Number(s.politicalPower) || 0) + '</b></p>';
    }
    html += '</div>';
    if (typeof FactionSystem !== 'undefined' && FactionSystem.factionTabHTML) {
      try { html += '<div class="mph-fac-body">' + MPHub.factionBodyHTML() + '</div>'; } catch (e) { /* ignore */ }
    }
    html += '</div>';
    return html;
  }

  /** 既存の陣営タブ (FactionSystem) を再利用する。未所属時の創設パネルは
   *  このタブ独自の創設カードと重複するため取り除く。 */
  static factionBodyHTML() {
    const raw = FactionSystem.factionTabHTML();
    if (typeof FactionSystem.mine === 'function' && FactionSystem.mine()) return raw;
    try {
      const box = document.createElement('div');
      box.innerHTML = raw;
      box.querySelectorAll('button[onclick*="FactionSystem.create("]').forEach(b => {
        const panel = b.closest ? b.closest('.fs-panel') : null;
        if (panel) panel.remove(); else b.remove();
      });
      return box.innerHTML;
    } catch (e) { return raw; }
  }

  static suggestFactionName(name) {
    const el = MPHub.el('mph-faction-name');
    if (el) el.value = name;
    return true;
  }

  static createFaction() {
    const el = MPHub.el('mph-faction-name');
    const name = el ? String(el.value || '').trim() : '';
    if (!name) { GameUI.notify('陣営名を入力してください。', 'alert'); return false; }
    if (typeof FactionSystem === 'undefined') return false;
    const ok = FactionSystem.create(name);
    if (ok) MPHub.systemMessage('🏰 陣営「' + name + '」を創設しました', 'info');
    MPHub.refreshPolitics();
    return !!ok;
  }

  /** デバッグ / テスト用: ロビー状態の要約 */
  static summary() {
    const r = MPHub.roster();
    return {
      connected: !!MultiplayerManager.connected,
      host: !!MultiplayerManager.isHost,
      code: MultiplayerManager.roomId || r.code || null,
      started: !!r.started,
      players: Object.values(r.players || {}).map(p => ({ id: p.id, name: p.name, tag: p.tag, host: !!p.host, connected: p.connected !== false })),
      ping: MPHub.net.ping,
      desync: !!MPHub.net.desync,
      transport: (typeof window !== 'undefined' && typeof window.Peer === 'function') ? 'peerjs' : 'local'
    };
  }
}

if (typeof window !== 'undefined') {
  window.MPHub = MPHub;
  window.MPChat = MPChat;
  window.DiploMenu = DiploMenu;
  window.MPLocalPeer = MPLocalPeer;
  window.MPLocalConnection = MPLocalConnection;
}
if (typeof module !== 'undefined') module.exports = { MPHub, MPChat, DiploMenu, MPLocalPeer };
