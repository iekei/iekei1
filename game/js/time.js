/**
 * time.js — 時間エンジン + マルチプレイ時間同期
 *
 * TimeEngine: ゲーム内時間（1 Tick = 1時間）の進行・一時停止・倍速を管理。
 * TimeSync:   WebSocket / BroadcastChannel 経由で HOST の Tick を全 Client へ配信。
 *             - HOST: TIME_SYNC_TICK を毎 Tick ブロードキャスト
 *             - CLIENT: 受信 Tick とローカルを比較し、遅延時は Catch-up 補正
 *             メッセージ: TIME_SYNC_TICK / TIME_SYNC_STATE / TIME_SYNC_REQUEST
 */

import { Bus } from './util.js';

/** 倍速ごとの1Tick間隔（ミリ秒）: 1速=1時間/秒 */
export const SPEED_MS = { 1: 1000, 2: 500, 3: 300, 4: 200, 5: 100 };
export const SPEEDS = [1, 2, 3, 4, 5];

export class TimeEngine {
  constructor(state) {
    this.state = state;
    this.bus = new Bus();
    this._timer = null;
    this.onTickHooks = [];
  }

  onTick(fn) { this.onTickHooks.push(fn); return () => { this.onTickHooks = this.onTickHooks.filter((f) => f !== fn); }; }

  get intervalMs() { return SPEED_MS[this.state.speed] || 1000; }

  start() {
    this.stop();
    if (this.state.paused) return;
    this._timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  pause() { this.state.paused = true; this.stop(); this.bus.emit('state', { paused: true, speed: this.state.speed }); }

  resume() { this.state.paused = false; this.start(); this.bus.emit('state', { paused: false, speed: this.state.speed }); }

  togglePause() { this.state.paused ? this.resume() : this.pause(); }

  setSpeed(s) {
    this.state.speed = s;
    if (!this.state.paused) this.start(); // インターバル再設定
    this.bus.emit('state', { paused: this.state.paused, speed: s });
  }

  /** 1 Tick（1時間）進める */
  tick(muted = false) {
    this.state.advanceHour();
    if (!muted) {
      for (const fn of this.onTickHooks) { try { fn(this.state, 1); } catch (e) { console.error(e); } }
      this.bus.emit('tick', this.state);
    }
  }

  /** Catch-up: 指定回数だけ音なしでTickを進めて遅延を解消 */
  catchUp(n) {
    for (let i = 0; i < n; i++) this.tick(true);
    this.bus.emit('catchup', n);
  }
}

/**
 * マルチプレイ時間同期
 *  mode: 'local' | 'host' | 'client'
 *  同一ブラウザ内の別タブ間では BroadcastChannel、クロスデバイスでは WebSocket サーバ
 *  （server/timesync-server.js, 既定ポート 8787）を利用する。
 */
export class TimeSync {
  constructor(engine, { mode = 'local', room = 'default', wsUrl = null } = {}) {
    this.engine = engine;
    this.mode = mode;
    this.room = room;
    this.wsUrl = wsUrl || `ws://${location.hostname}:8787`;
    this.bus = new Bus();
    this.ws = null;
    this.bc = null;
    this.lastServerTick = -1;
    this.lastServerTs = 0;
    this._offTick = null;
  }

  get isMultiplayer() { return this.mode !== 'local'; }

  connect() {
    if (!this.isMultiplayer) return;
    // BroadcastChannel（同一ブラウザの別タブ）
    try {
      this.bc = new BroadcastChannel(`hoi4-timesync-${this.room}`);
      this.bc.onmessage = (ev) => this._onMessage(ev.data);
    } catch { /* 非対応環境 */ }
    // WebSocket（クロスデバイス）
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => this._send({ type: 'HELLO', role: this.mode, room: this.room });
      this.ws.onmessage = (ev) => { try { this._onMessage(JSON.parse(ev.data)); } catch { /* ignore */ } };
      this.ws.onclose = () => { this.bus.emit('disconnect'); };
      this.ws.onerror = () => { /* BroadcastChannel があれば継続 */ };
    } catch { /* WebSocket 非対応でも BC で継続 */ }

    if (this.mode === 'host') {
      // HOST: 自エンジンの Tick をブロードキャスト
      this._offTick = this.engine.onTick(() => {
        this._send({ type: 'TIME_SYNC_TICK', tick: this.engine.state.tickCount, ts: Date.now() });
      });
      this.engine.bus.on('state', (st) => this._send({ type: 'TIME_SYNC_STATE', ...st }));
    } else {
      // CLIENT: HOST へ同期リクエスト
      this._send({ type: 'TIME_SYNC_REQUEST', room: this.room });
      this.engine.bus.on('state', () => { /* クライアントの速度変更は無効化される */ });
      // クライアント側のローカル進行は止め、サーバ駆動にする
      this.engine.pause();
      this.engine.onTick(() => {}); // フックはサーバ駆動のみ
    }
  }

  _send(payload) {
    const msg = { ...payload, room: this.room };
    if (this.bc) { try { this.bc.postMessage(msg); } catch { /* ignore */ } }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
    }
  }

  _onMessage(msg) {
    if (!msg || msg.room !== this.room) return;
    if (msg.type === 'TIME_SYNC_TICK' && this.mode === 'client') {
      const local = this.engine.state.tickCount;
      const lag = msg.tick - local;
      if (lag > 0) {
        // Catch-up補正: 遅れている分を一気に進める（最大200Tick）
        const n = Math.min(lag, 200);
        this.engine.state.tickCount = msg.tick - n;
        this.engine.catchUp(n);
        this.bus.emit('synced', { tick: msg.tick, caughtUp: n });
      }
      this.lastServerTick = msg.tick;
      this.lastServerTs = msg.ts;
    } else if (msg.type === 'TIME_SYNC_STATE' && this.mode === 'client') {
      this.engine.state.paused = !!msg.paused;
      if (msg.speed) this.engine.state.speed = msg.speed; // 倍速も同期
      if (msg.paused) this.engine.pause(); else this.engine.resume();
      this.bus.emit('state', msg);
    } else if (msg.type === 'TIME_SYNC_REQUEST' && this.mode === 'host') {
      // 新規クライアントへ現状を即時配信
      this._send({ type: 'TIME_SYNC_TICK', tick: this.engine.state.tickCount, ts: Date.now() });
      this._send({ type: 'TIME_SYNC_STATE', paused: this.engine.state.paused, speed: this.engine.state.speed });
    }
  }

  disconnect() {
    if (this._offTick) this._offTick();
    try { this.bc?.close(); } catch { /* ignore */ }
    try { this.ws?.close(); } catch { /* ignore */ }
    this.bus.emit('disconnect');
  }
}
