#!/usr/bin/env node
/**
 * timesync-server.js — マルチプレイ時間同期用 WebSocket サーバ（依存パッケージなし）
 *
 *  HOST の Tick タイマーを標準軸とし、全 Client へ TIME_SYNC_TICK を配信するリレー。
 *  - 一時停止/倍速変更は TIME_SYNC_STATE でブロードキャスト
 *  - 後続クライアントは TIME_SYNC_REQUEST を送ると現状Tickが即時配信される（Catch-up補正用）
 *
 *  起動: node server/timesync-server.js [port]   （既定 8787）
 *  使い方（クライアント側）:
 *    - ホスト:   hoi4.html?mp=host&room=room1
 *    - クライアント: hoi4.html?mp=client&room=room1
 *  同一ブラウザ内の別タブ間では BroadcastChannel でも同期される（サーバ不要）。
 */

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.argv[2] || process.env.PORT || 8787);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('hoi4 timesync server: WebSocket endpoint is /ws\n');
});

const rooms = new Map(); // room -> Set<ws>

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}

function encodeFrame(opcode, payload) {
  const data = Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, data]);
}

// 最小限のフレームデコーダ（テキストフレームのみ対応）
function makeDecoder(onMessage, onClose) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
      let mask = null;
      if (masked) { if (buf.length < offset + 4) return; mask = buf.slice(offset, offset + 4); offset += 4; }
      if (buf.length < offset + len) return;
      let payload = buf.slice(offset, offset + len);
      if (mask) payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
      buf = buf.slice(offset + len);
      if (opcode === 0x8) { onClose(); return; }
      if (opcode === 0x9) { /* ping → pong は簡易に無視 */ continue; }
      if (opcode === 0x1 || opcode === 0x0) onMessage(payload.toString('utf8'));
    }
  };
}

server.on('upgrade', (req, socket) => {
  if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`
  );
  socket.setNoDelay(true);

  const ws = {
    socket,
    room: null,
    send(obj) {
      try { socket.write(encodeFrame(0x1, JSON.stringify(obj))); } catch { /* ignore */ }
    },
  };

  const decoder = makeDecoder((text) => {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.type === 'HELLO') {
      ws.room = msg.room || 'default';
      if (!rooms.has(ws.room)) rooms.set(ws.room, new Set());
      rooms.get(ws.room).add(ws);
      ws.send({ type: 'WELCOME', role: msg.role, room: ws.room, peers: rooms.get(ws.room).size });
      return;
    }
    // ルーム内にブロードキャスト（送信者含む。クライアント側で重複は問題なし）
    const peers = rooms.get(msg.room) || rooms.get(ws.room);
    if (!peers) return;
    for (const peer of peers) peer.send(msg);
  }, () => cleanup());

  const cleanup = () => {
    if (ws.room && rooms.has(ws.room)) {
      rooms.get(ws.room).delete(ws);
      if (rooms.get(ws.room).size === 0) rooms.delete(ws.room);
    }
  };

  socket.on('data', decoder);
  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[timesync] WebSocket server listening on ws://0.0.0.0:${PORT}/ws`);
});
