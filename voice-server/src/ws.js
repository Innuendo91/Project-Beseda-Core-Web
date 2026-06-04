import crypto from "crypto";
import { WebSocketServer } from "ws";
import { nanoid } from "nanoid";
import { verifyVoiceToken } from "./jwt.js";
import { getOrCreateRoom } from "./rooms.js";
import { config } from "./config.js";

function constantTimeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function startWsServer({ server }) {
  const wss = new WebSocketServer({
    server,
    path: "/voice/",
    verifyClient: (info, cb) => {
      const provided = info.req.headers["x-voice-proxy-secret"];
      const remoteAddr = info.req.socket.remoteAddress;

      if (config.voiceServerSecret && provided) {
        if (constantTimeCompare(provided, config.voiceServerSecret)) {
          return cb(true);
        }
        console.warn(`[voice] bad proxy secret from ${remoteAddr}`);
      }

      if (config.voiceServerSecret && !provided) {
        const trusted = remoteAddr && (
          remoteAddr.startsWith("127.") ||
          remoteAddr === "::1" ||
          remoteAddr.startsWith("172.") ||
          remoteAddr.startsWith("10.")
        );
        if (!trusted) {
          console.warn(`[voice] rejected direct WS from ${remoteAddr}`);
          return cb(false, 401, "Unauthorized");
        }
        console.log(`[voice] direct WS from ${remoteAddr} (no proxy secret)`);
      }

      cb(true);
    }
  });

  wss.on("connection", (ws) => {
    const peerId = nanoid(10);
    let peer = null;
    let room = null;

    function send(type, data) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type, data }));
    }

    ws.on("message", async (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString("utf8")); }
      catch { return send("error", { code: "BAD_JSON" }); }

      const { type, data } = msg || {};

      try {
        if (type === "auth") {
          if (peer) throw new Error("Already authed");

          const payload = verifyVoiceToken(data?.token);
          room = await getOrCreateRoom({ roomSlug: payload.roomSlug, isPermanent: payload.isPermanent });

          peer = room.createPeer({
            peerId,
            userId: Number(String(payload.sub).split(":")[1] || 0),
            username: payload.username,
            ws
          });

          send("authed", {
            roomSlug: room.slug,
            peerId,
            peers: room.getPeersSnapshot()
          });

          room.broadcast("peerJoined", { peerId, username: peer.username }, peerId);
          return;
        }

        if (!peer || !room) throw new Error("Not authed");

        if (type === "getRouterRtpCapabilities") {
          send("routerRtpCapabilities", room.router.rtpCapabilities);
          return;
        }

        if (type === "createWebRtcTransport") {
          const transport = await room.createWebRtcTransport();
          peer.addTransport(transport);

          send("webRtcTransportCreated", {
            direction: data?.direction,
            transportOptions: {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters
            }
          });
          return;
        }

        if (type === "connectWebRtcTransport") {
          const transport = peer.getTransport(data.transportId);
          await transport.connect({ dtlsParameters: data.dtlsParameters });
          send("webRtcTransportConnected", { transportId: transport.id });
          return;
        }

        if (type === "produce") {
          const transport = peer.getTransport(data.transportId);
          const producer = await transport.produce({
            kind: data.kind,
            rtpParameters: data.rtpParameters,
            appData: data.appData || {}
          });

          peer.addProducer(producer);
          send("produced", { producerId: producer.id });

          room.broadcast("newProducer", {
            producerId: producer.id,
            peerId: peer.peerId,
            kind: producer.kind
          }, peer.peerId);

          return;
        }

        if (type === "consume") {
          const transport = peer.getTransport(data.transportId);
          const { producerId, rtpCapabilities } = data;

          if (!room.router.canConsume({ producerId, rtpCapabilities })) {
            throw new Error("Cannot consume");
          }

          const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true
          });

          peer.addConsumer(consumer);

          send("consuming", {
            consumerOptions: {
              id: consumer.id,
              producerId,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters
            }
          });
          return;
        }

        if (type === "resume") {
          const consumer = peer.consumers.get(data.consumerId);
          if (!consumer) throw new Error("Consumer not found");
          await consumer.resume();
          send("resumed", { consumerId: consumer.id });
          return;
        }

        if (type === "ping") return send("pong", {});

        send("error", { code: "UNKNOWN_TYPE", type });
      } catch (e) {
        send("error", { code: "ERR", message: String(e?.message || e) });
      }
    });

    ws.on("close", () => {
      if (room && peer) {
        const leftPeerId = peer.peerId;
        room.removePeer(leftPeerId);
        room.broadcast("peerLeft", { peerId: leftPeerId });
      }
    });
  });

  console.log("[voice] ws server started at /voice/");
}
