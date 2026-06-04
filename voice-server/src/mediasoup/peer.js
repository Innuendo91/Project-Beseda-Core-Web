export class Peer {
  constructor({ peerId, userId, username, ws, room }) {
    this.peerId = peerId;
    this.userId = userId;
    this.username = username;
    this.ws = ws;
    this.room = room;

    this.transports = new Map(); // id -> WebRtcTransport
    this.producers = new Map();  // id -> Producer
    this.consumers = new Map();  // id -> Consumer
    this.closed = false;
  }

  send(type, data) {
    if (this.closed) return;
    if (this.ws.readyState !== 1) return; // OPEN
    this.ws.send(JSON.stringify({ type, data }));
  }

  close() {
    if (this.closed) return;
    this.closed = true;

    for (const c of this.consumers.values()) { try { c.close(); } catch {} }
    for (const p of this.producers.values()) { try { p.close(); } catch {} }
    for (const t of this.transports.values()) { try { t.close(); } catch {} }

    this.consumers.clear();
    this.producers.clear();
    this.transports.clear();
  }

  addTransport(t) {
    this.transports.set(t.id, t);

    t.on("dtlsstatechange", (state) => {
      if (state === "closed") {
        try { t.close(); } catch {}
        this.transports.delete(t.id);
      }
    });

    t.on("close", () => this.transports.delete(t.id));
  }

  getTransport(id) {
    const t = this.transports.get(id);
    if (!t) throw new Error("Transport not found");
    return t;
  }

  addProducer(p) {
    this.producers.set(p.id, p);
    p.on("transportclose", () => this.producers.delete(p.id));
    p.on("close", () => this.producers.delete(p.id));
  }

  addConsumer(c) {
    this.consumers.set(c.id, c);
    c.on("transportclose", () => this.consumers.delete(c.id));
    c.on("close", () => this.consumers.delete(c.id));
  }
}
