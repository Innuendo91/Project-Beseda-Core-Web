import { getWorker } from "./worker.js";
import { config } from "../config.js";
import { Peer } from "./peer.js";
import { removeRoom } from "../rooms.js";

export class Room {
  constructor(slug, router, isPermanent = false) {
    this.slug = slug;
    this.router = router;
    this.peers = new Map();
    this.isPermanent = isPermanent;
    this._cleanupTimer = null;
  }

  static async create(slug, isPermanent = false) {
    const worker = await getWorker();

    const mediaCodecs = [
      { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
      { kind: "video", mimeType: "video/VP8", clockRate: 90000 }
    ];

    const router = await worker.createRouter({ mediaCodecs });
    console.log(`[room] created slug=${slug} permanent=${isPermanent}`);
    return new Room(slug, router, isPermanent);
  }

  createPeer({ peerId, userId, username, ws }) {
    this.cancelCleanupTimer();
    const peer = new Peer({ peerId, userId, username, ws, room: this });
    this.peers.set(peerId, peer);
    return peer;
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.close();
    this.peers.delete(peerId);

    if (this.peers.size === 0) {
      if (this.isPermanent) {
        console.log(`[room] empty, keeping permanent room slug=${this.slug}`);
      } else {
        this.scheduleCleanup();
      }
    }
  }

  cancelCleanupTimer() {
    if (this._cleanupTimer) {
      clearTimeout(this._cleanupTimer);
      this._cleanupTimer = null;
      const secs = config.roomCleanupDelayMs / 1000;
      console.log(`[room] cleanup cancelled slug=${this.slug} (peer rejoined before ${secs}s)`);
    }
  }

  scheduleCleanup() {
    const delay = config.roomCleanupDelayMs;
    const secs = delay / 1000;
    console.log(`[room] empty, scheduling cleanup slug=${this.slug} in ${secs}s`);

    this._cleanupTimer = setTimeout(async () => {
      this._cleanupTimer = null;
      console.log(`[room] cleanup fired, deleting slug=${this.slug}`);
      try { this.router.close(); } catch {}
      removeRoom(this.slug);
      await this.notifyStreamAppCleanup();
    }, delay);
  }

  async notifyStreamAppCleanup() {
    try {
      const url = `${config.streamAppUrl.replace(/ws:/, "http:").replace(/\/$/, "")}/api/voice/rooms/${encodeURIComponent(this.slug)}/cleanup`;
      const headers = { "Content-Type": "application/json" };
      if (config.voiceServerSecret) {
        headers["x-voice-secret"] = config.voiceServerSecret;
      }
      const res = await fetch(url, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        console.log(`[room] DB cleanup ok slug=${this.slug}`);
      } else {
        console.warn(`[room] DB cleanup failed slug=${this.slug} status=${res.status}`);
      }
    } catch (err) {
      console.warn(`[room] DB cleanup error slug=${this.slug} err=${err.message}`);
    }
  }

  broadcast(type, payload, exceptPeerId = null) {
    for (const [pid, peer] of this.peers) {
      if (exceptPeerId && pid === exceptPeerId) continue;
      peer.send(type, payload);
    }
  }

  getPeersSnapshot() {
    return [...this.peers.values()].map(p => ({
      peerId: p.peerId,
      userId: p.userId,
      username: p.username,
      producers: [...p.producers.keys()]
    }));
  }

  async createWebRtcTransport() {
    return await this.router.createWebRtcTransport({
      listenIps: [{ ip: "0.0.0.0", announcedIp: config.announcedIp || undefined }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 800000
    });
  }

  close() {
    this.cancelCleanupTimer();
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    try { this.router.close(); } catch {}
  }
}
