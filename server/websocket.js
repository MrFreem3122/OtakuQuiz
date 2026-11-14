// Minimal WebSocket server (RFC 6455) with no dependencies.
// Supports text frames, fragmented messages, ping/pong and close.

const crypto = require("crypto");
const { EventEmitter } = require("events");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024; // 2 MB (quizzes can carry small images)

class WebSocketConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentBytes = 0;
    this.closed = false;
    this.isAlive = true;

    socket.setNoDelay(true);
    socket.on("data", (chunk) => this._onData(chunk));
    socket.on("close", () => this._finish());
    socket.on("end", () => this._finish());
    socket.on("error", () => this._finish());
  }

  send(text) {
    if (this.closed) return;
    this._writeFrame(0x1, Buffer.from(text, "utf8"));
  }

  sendJSON(obj) {
    this.send(JSON.stringify(obj));
  }

  ping() {
    if (this.closed) return;
    this._writeFrame(0x9, Buffer.alloc(0));
  }

  close(code = 1000, reason = "") {
    if (this.closed) return;
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
    payload.writeUInt16BE(code, 0);
    payload.write(reason, 2);
    this._writeFrame(0x8, payload);
    this.socket.end();
    this._finish();
  }

  _finish() {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    this.emit("close");
  }

  _writeFrame(opcode, payload) {
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch (e) {
      this._finish();
    }
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (this.buffer.length < 4) return;
        len = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE_BYTES)) return this.close(1009, "Message too big");
        len = Number(big);
        offset = 10;
      }

      if (!masked) return this.close(1002, "Client frames must be masked");
      if (len > MAX_MESSAGE_BYTES) return this.close(1009, "Message too big");
      if (this.buffer.length < offset + 4 + len) return; // wait for more data

      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      this.buffer = this.buffer.subarray(offset + 4 + len);

      if (opcode === 0x8) return this.close();
      if (opcode === 0x9) { this._writeFrame(0xa, payload); continue; }
      if (opcode === 0xa) { this.isAlive = true; continue; }

      if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        this.fragments.push(payload);
        this.fragmentBytes += payload.length;
        if (this.fragmentBytes > MAX_MESSAGE_BYTES) return this.close(1009, "Message too big");
        if (fin) {
          const message = Buffer.concat(this.fragments).toString("utf8");
          this.fragments = [];
          this.fragmentBytes = 0;
          this.isAlive = true;
          this.emit("message", message);
        }
      }
    }
  }
}

// Attach to an http.Server. Calls onConnection(ws, req) for each upgrade on `path`.
function attachWebSocketServer(server, path, onConnection) {
  const connections = new Set();

  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url, "http://localhost");
    const key = req.headers["sec-websocket-key"];
    if (url.pathname !== path || !key || (req.headers.upgrade || "").toLowerCase() !== "websocket") {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const ws = new WebSocketConnection(socket);
    connections.add(ws);
    ws.on("close", () => connections.delete(ws));
    onConnection(ws, req);
  });

  // Heartbeat: drop dead connections, keep proxies from closing idle ones.
  const timer = setInterval(() => {
    for (const ws of connections) {
      if (!ws.isAlive) { ws.close(1001, "Timeout"); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000);
  timer.unref();

  return { connections };
}

module.exports = { attachWebSocketServer };
