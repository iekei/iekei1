'use strict';

class MultiplayerTimeManager {
  static initialized = false;
  static currentTick = 0;
  static lastSpeed = 1;
  static lastBroadcastAt = 0;
  static broadcastIntervalMs = 100;
  static timer = null;

  static init() {
    if (MultiplayerTimeManager.initialized) return;
    MultiplayerTimeManager.currentTick = MultiplayerTimeManager.readTick();
    MultiplayerTimeManager.lastSpeed = CoreEngine.gameState.speed || 1;
    MultiplayerTimeManager.installTickAuthority();
    MultiplayerTimeManager.installSpeedAuthority();
    MultiplayerTimeManager.installNetworkHandlers();
    MultiplayerTimeManager.initialized = true;
    if (MultiplayerManager.isHost && MultiplayerManager.connected) {
      MultiplayerTimeManager.startHostBroadcast();
    }
  }

  static readTick() {
    const saved = Number(CoreEngine.gameState.currentTick);
    if (Number.isSafeInteger(saved) && saved >= 0) return saved;
    const start = new Date(1936, 0, 1).getTime();
    return Math.max(0, Math.floor((CoreEngine.gameState.date.getTime() - start) / 3600000));
  }

  static state() {
    const game = CoreEngine.gameState;
    return {
      currentTick: MultiplayerTimeManager.currentTick,
      gameSpeed: Number(game.speed) || 0,
      isPaused: Boolean(game.paused),
      timestamp: Date.now(),
      date: game.date.toISOString()
    };
  }

  static installTickAuthority() {
    const tick = CoreEngine.tick.bind(CoreEngine);
    CoreEngine.tick = function (remote = false) {
      const onlineClient = MultiplayerManager.connected && !MultiplayerManager.isHost;
      if (onlineClient && !remote) return false;
      if (CoreEngine.gameState.paused && !remote) return false;
      const hostAuthority = MultiplayerManager.connected && MultiplayerManager.isHost && !remote;
      tick(hostAuthority || remote);
      MultiplayerTimeManager.currentTick++;
      CoreEngine.gameState.currentTick = MultiplayerTimeManager.currentTick;
      if (hostAuthority) MultiplayerTimeManager.queueBroadcast();
      return true;
    };
  }

  static installSpeedAuthority() {
    const setSpeed = CoreEngine.setSpeed.bind(CoreEngine);
    CoreEngine.setSpeed = speed => {
      if (!Number.isInteger(speed) || speed < 0 || speed > 5) return false;
      if (MultiplayerManager.connected && !MultiplayerManager.isHost) {
        MultiplayerTimeManager.requestSpeed(speed);
        return false;
      }
      if (speed > 0 && (NewsManager.showing || IntelOperations.challenge)) return false;
      const changed = setSpeed(speed);
      if (MultiplayerManager.connected && MultiplayerManager.isHost) {
        if (speed > 0) MultiplayerTimeManager.lastSpeed = speed;
        MultiplayerManager.broadcast({
          type: speed === 0 ? 'BROADCAST_PAUSE_STATE' : 'UPDATE_GAME_SPEED',
          ...MultiplayerTimeManager.state()
        });
      }
      return changed;
    };
    const remoteSetSpeed = CoreEngine.remoteSetSpeed.bind(CoreEngine);
    CoreEngine.remoteSetSpeed = speed => {
      if (!Number.isInteger(speed) || speed < 0 || speed > 5) return false;
      const result = remoteSetSpeed(speed);
      if (speed > 0) MultiplayerTimeManager.lastSpeed = speed;
      return result;
    };
  }

  static installNetworkHandlers() {
    const onData = MultiplayerManager.onData.bind(MultiplayerManager);
    MultiplayerManager.onData = (data, peerId) => {
      if (data?.type === 'UPDATE_GAME_SPEED' && MultiplayerManager.isHost) {
        MultiplayerTimeManager.receiveRequest(data, peerId);
        return;
      }
      if (data?.type === 'TIME_SYNC_TICK' || data?.type === 'BROADCAST_PAUSE_STATE' ||
          data?.type === 'UPDATE_GAME_SPEED') {
        MultiplayerTimeManager.receive(data, peerId);
        return;
      }
      if (data?.type === 'REQUEST_PAUSE_TOGGLE' || data?.type === 'REQUEST_GAME_SPEED') {
        MultiplayerTimeManager.receiveRequest(data, peerId);
        return;
      }
      onData(data, peerId);
    };

    const broadcast = MultiplayerManager.broadcast.bind(MultiplayerManager);
    MultiplayerManager.broadcast = data => {
      if (data?.type === 'tick' || data?.type === 'speed') return;
      return broadcast(data);
    };

    const hostRoom = MultiplayerManager.hostRoom.bind(MultiplayerManager);
    MultiplayerManager.hostRoom = (...args) => {
      const result = hostRoom(...args);
      MultiplayerTimeManager.startHostBroadcast();
      return result;
    };
    const disconnect = MultiplayerManager.disconnect.bind(MultiplayerManager);
    MultiplayerManager.disconnect = (...args) => {
      MultiplayerTimeManager.stopHostBroadcast();
      return disconnect(...args);
    };
    const handleDisconnect = MultiplayerManager.handleDisconnect.bind(MultiplayerManager);
    MultiplayerManager.handleDisconnect = (...args) => {
      const result = handleDisconnect(...args);
      if (!MultiplayerManager.connected) MultiplayerTimeManager.stopHostBroadcast();
      return result;
    };
  }

  static startHostBroadcast() {
    if (MultiplayerTimeManager.timer !== null) return;
    MultiplayerTimeManager.timer = setInterval(() => {
      if (MultiplayerManager.connected && MultiplayerManager.isHost) {
        MultiplayerTimeManager.broadcastTick();
      }
    }, MultiplayerTimeManager.broadcastIntervalMs);
  }

  static stopHostBroadcast() {
    if (MultiplayerTimeManager.timer === null) return;
    clearInterval(MultiplayerTimeManager.timer);
    MultiplayerTimeManager.timer = null;
  }

  static queueBroadcast() {
    const now = Date.now();
    if (now - MultiplayerTimeManager.lastBroadcastAt >= MultiplayerTimeManager.broadcastIntervalMs) {
      MultiplayerTimeManager.broadcastTick();
    }
  }

  static broadcastTick() {
    if (!MultiplayerManager.isHost || !MultiplayerManager.connected) return;
    MultiplayerTimeManager.lastBroadcastAt = Date.now();
    MultiplayerManager.broadcast({
      type: 'TIME_SYNC_TICK',
      ...MultiplayerTimeManager.state()
    });
  }

  static requestPauseToggle() {
    if (!MultiplayerManager.connected || MultiplayerManager.isHost) {
      const speed = CoreEngine.gameState.paused
        ? Math.max(1, MultiplayerTimeManager.lastSpeed)
        : 0;
      return CoreEngine.setSpeed(speed);
    }
    MultiplayerTimeManager.sendToHost({
      type: 'REQUEST_PAUSE_TOGGLE',
      isPaused: !CoreEngine.gameState.paused
    });
    return true;
  }

  static requestSpeed(speed) {
    if (!Number.isInteger(speed) || speed < 0 || speed > 5) return false;
    if (!MultiplayerManager.connected || MultiplayerManager.isHost) return CoreEngine.setSpeed(speed);
    MultiplayerTimeManager.sendToHost({ type: 'UPDATE_GAME_SPEED', gameSpeed: speed });
    return true;
  }

  static sendToHost(data) {
    const host = MultiplayerManager.connections[MultiplayerManager.roomId];
    if (!host || host.open === false) {
      GameUI.notify('ホストとの接続がありません。速度変更を送信できません。', 'alert');
      return false;
    }
    host.send(data);
    return true;
  }

  static receiveRequest(data, peerId) {
    if (!MultiplayerManager.isHost || !MultiplayerManager.connected) return false;
    const connection = MultiplayerManager.connections[peerId];
    if (!connection || connection.authOk !== true) return false;
    if (data.type === 'REQUEST_PAUSE_TOGGLE') {
      if (typeof data.isPaused !== 'boolean') return false;
      const currentlyPaused = Boolean(CoreEngine.gameState.paused);
      const desiredPaused = data.isPaused;
      if (desiredPaused !== currentlyPaused) {
        CoreEngine.setSpeed(desiredPaused ? 0 : Math.max(1, MultiplayerTimeManager.lastSpeed));
      }
      return true;
    }
    if (data.type === 'REQUEST_GAME_SPEED' || data.type === 'UPDATE_GAME_SPEED') {
      const speed = data.gameSpeed;
      if (!Number.isInteger(speed) || speed < 0 || speed > 5) return false;
      CoreEngine.setSpeed(speed);
      return true;
    }
    return false;
  }

  static receive(data, peerId) {
    if (MultiplayerManager.isHost || peerId !== MultiplayerManager.roomId) return false;
    const tick = Number(data.currentTick);
    const speed = Number(data.gameSpeed);
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isInteger(speed) || speed < 0 || speed > 5 ||
        typeof data.isPaused !== 'boolean') return false;
    MultiplayerTimeManager.syncTo(tick, data.date);
    if (data.state) CoreEngine.applySyncState(data.state);
    if (data.type === 'BROADCAST_PAUSE_STATE' || data.type === 'UPDATE_GAME_SPEED' ||
        data.type === 'TIME_SYNC_TICK') {
      MultiplayerTimeManager.applySpeed(speed, data.isPaused);
    }
    return true;
  }

  static syncTo(targetTick, date) {
    const local = MultiplayerTimeManager.currentTick;
    const lag = targetTick - local;
    if (lag < 0) return lag;
    if (lag > 0) {
      for (let count = 0; count < lag; count++) CoreEngine.tick(true);
    }
    if (targetTick >= MultiplayerTimeManager.currentTick) {
      MultiplayerTimeManager.currentTick = targetTick;
      CoreEngine.gameState.currentTick = targetTick;
    }
    if (date) {
      const hostDate = new Date(date);
      if (Number.isFinite(hostDate.getTime())) CoreEngine.gameState.date = hostDate;
    }
    CoreEngine.updateCalendar();
    CoreEngine.renderStats();
    return lag;
  }

  static applySpeed(speed, paused) {
    const game = CoreEngine.gameState;
    game.speed = paused ? 0 : speed;
    game.paused = paused || speed === 0;
    if (game.speed > 0) MultiplayerTimeManager.lastSpeed = game.speed;
    if (CoreEngine.timer !== null) {
      clearInterval(CoreEngine.timer);
      CoreEngine.timer = null;
    }
    CoreEngine.updateSpeedUI();
  }
}

if (typeof window !== 'undefined') window.MultiplayerTimeManager = MultiplayerTimeManager;
if (typeof module !== 'undefined') module.exports = MultiplayerTimeManager;
