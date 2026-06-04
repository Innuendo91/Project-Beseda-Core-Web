import { csrfFetch } from "./api.js";

export function createBrowserStreamer({ onState, onStatus } = {}) {
  let localStream = null;
  let peerConnection = null;
  let whipSessionUrl = null;
  let whipPubToken = null;
  let isStreaming = false;
  let resizeCleanup = null;

  function emitState() {
    onState?.(isStreaming);
  }

  function status(message) {
    onStatus?.(message || "");
  }

  function getWhipUrl(path) {
    const proto = window.location.protocol === "https:" ? "https" : "http";
    const host = window.location.hostname;
    const whipPort = "8889";
    return `${proto}://${host}:${whipPort}/${encodeURIComponent(path)}/whip`;
  }

  async function getConfig() {
    const res = await csrfFetch("/api/browser-stream-config", { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "stream config failed");
    return { ...data, whipUrl: getWhipUrl(data.path) };
  }

  async function getMediaStream(type, resolution, fps) {
    const resolutions = {
      "480p": { width: 854, height: 480 },
      "720p": { width: 1280, height: 720 },
      "1080p": { width: 1920, height: 1080 },
    };
    const size = resolutions[resolution] || resolutions["720p"];
    const frameRate = fps || 30;

    let stream;
    if (type === "screen") {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: size.width },
          height: { ideal: size.height },
          frameRate: { ideal: frameRate },
        },
        audio: true,
      });
    } else {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: size.width },
          height: { ideal: size.height },
          frameRate: { ideal: frameRate },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    }

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    const origW = settings.width || 0;
    const origH = settings.height || 0;

    const smoothed = await smoothStream(stream, origW, origH, size.width, size.height, Math.min(frameRate, 30), 300);
    return smoothed;
  }

  async function smoothStream(rawStream, origW, origH, targetW, targetH, fps, delayMs) {
    const videoTrack = rawStream.getVideoTracks()[0];
    const audioTracks = rawStream.getAudioTracks();
    if (!videoTrack) return { stream: rawStream, cleanup: null };

    const video = document.createElement("video");
    video.style.display = "none";
    video.srcObject = new MediaStream([videoTrack]);
    video.muted = true;
    document.body.appendChild(video);

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => {
        video.remove();
        reject(new Error("video metadata error"));
      };
      video.play().catch((e) => {
        video.remove();
        reject(e);
      });
    });

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, alpha: false });
    if (!gl) {
      video.srcObject = null;
      video.remove();
      return { stream: rawStream, cleanup: null };
    }

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, "attribute vec2 a_pos;attribute vec2 a_uv;varying vec2 v_uv;void main(){gl_Position=vec4(a_pos,0,1);v_uv=a_uv;}");
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, "precision highp float;varying vec2 v_uv;uniform sampler2D u_tex;uniform vec2 u_uvOff;uniform vec2 u_uvSc;void main(){gl_FragColor=texture2D(u_tex,v_uv*u_uvSc+u_uvOff);}");
    gl.compileShader(fs);

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const aPos = gl.getAttribLocation(prog, "a_pos");
    const aUv = gl.getAttribLocation(prog, "a_uv");
    const uTex = gl.getUniformLocation(prog, "u_tex");
    const uUvOff = gl.getUniformLocation(prog, "u_uvOff");
    const uUvSc = gl.getUniformLocation(prog, "u_uvSc");

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 0,1, 1,-1, 1,1, -1,1, 0,0, 1,1, 1,0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    const srcAspect = origW / origH;
    const tgtAspect = targetW / targetH;
    let uvOffX, uvOffY, uvScX, uvScY;
    if (srcAspect > tgtAspect) {
      uvScX = tgtAspect / srcAspect;
      uvScY = 1;
      uvOffX = (1 - uvScX) / 2;
      uvOffY = 0;
    } else {
      uvScX = 1;
      uvScY = srcAspect / tgtAspect;
      uvOffX = 0;
      uvOffY = (1 - uvScY) / 2;
    }
    gl.uniform2f(uUvOff, uvOffX, uvOffY);
    gl.uniform2f(uUvSc, uvScX, uvScY);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    if (!canvas.captureStream) {
      video.srcObject = null;
      video.remove();
      return { stream: rawStream, cleanup: null };
    }
    const canvasTrack = canvas.captureStream(0).getVideoTracks()[0];

    // Delay buffer: hold frames for delayMs before signaling encoder
    // Smooths out variable frame arrival times and encoding jitter
    const frameQueue = [];
    let lastRenderTime = 0;

    const drawLoop = (ts) => {
      if (ts - lastRenderTime >= 1000 / fps) {
        lastRenderTime = ts;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(uTex, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        frameQueue.push(ts);

        while (frameQueue.length > 0 && ts - frameQueue[0] >= delayMs) {
          frameQueue.shift();
          if (canvasTrack.requestFrame) canvasTrack.requestFrame();
        }
      }
      animFrame = requestAnimationFrame(drawLoop);
    };
    let animFrame;
    drawLoop();

    const newStream = new MediaStream([canvasTrack, ...audioTracks]);

    const cleanup = () => {
      cancelAnimationFrame(animFrame);
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
      video.srcObject = null;
      video.remove();
    };

    return { stream: newStream, cleanup };
  }

  function preferCodec(peer) {
    const caps = RTCRtpSender.getCapabilities?.("video");
    if (!caps?.codecs?.length) return null;

    // H.264 (hw) > VP8 > VP9 — NVIDIA GPUs can only decode VP8/VP9, not encode
    const allH264 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
    // Prefer High profile (640028) first, then any H.264
    const h264High = allH264.find((c) => c.sdpFmtpLine?.includes("640028"));
    const h264 = h264High || allH264[0];
    const vp8 = caps.codecs.find((c) => c.mimeType.toLowerCase() === "video/vp8");
    const vp9 = caps.codecs.find((c) => c.mimeType.toLowerCase() === "video/vp9");
    const preferred = h264 || vp8 || vp9;

    const sender = peer.getSenders().find((s) => s.track?.kind === "video");
    if (sender && preferred && typeof sender.setCodecPreferences === "function") {
      const ordered = [preferred];
      if (h264 && preferred !== h264) ordered.push(h264);
      if (vp8 && preferred !== vp8) ordered.push(vp8);
      if (vp9 && !ordered.includes(vp9)) ordered.push(vp9);
      sender.setCodecPreferences(ordered);
    }
    return preferred;
  }

  async function setBitrate(peer, resolution, bitrate, type) {
    const bitrateMap = { "1080p": 7000000, "720p": 2500000, "480p": 1000000 };
    const maxBitrate = bitrate && bitrate !== "auto" ? Number(bitrate) : bitrateMap[resolution] || 2500000;
    const sender = peer.getSenders().find((s) => s.track?.kind === "video");
    if (!sender) return;

    const params = sender.getParameters();
    params.encodings = params.encodings?.length ? params.encodings : [{}];
    params.encodings.forEach((encoding) => {
      encoding.maxBitrate = maxBitrate;
      encoding.minBitrate = Math.floor(maxBitrate * 0.3);
      encoding.startBitrate = Math.floor(maxBitrate * 0.5);
      if (type === "screen") {
        encoding.contentType = "screen";
        encoding.maxFramerate = 15;
        encoding.active = true;
      } else {
        encoding.contentType = "camera";
      }
    });
    await sender.setParameters(params);
  }

  async function start({ type, resolution, fps, bitrate }) {
    if (isStreaming) return stop();

    status("Подготовка трансляции...");
    const config = await getConfig();
    whipPubToken = config.pubToken;

    const mediaResult = await getMediaStream(type, resolution, fps);
    const stream = mediaResult.stream;
    resizeCleanup = mediaResult.cleanup;
    const peer = new RTCPeerConnection({ iceServers: [] });
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    const preferredCodec = preferCodec(peer);
    const offer = await peer.createOffer({ offerToReceiveVideo: false, offerToReceiveAudio: false });
    await peer.setLocalDescription(offer);
    await setBitrate(peer, resolution, bitrate, type);

    await new Promise((resolve) => {
      peer.onicecandidate = (event) => {
        if (!event.candidate) resolve();
      };
      window.setTimeout(resolve, 5000);
    });

    const sdpToSend = peer.localDescription.sdp;
    const sdpResponse = await fetch(config.whipUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.pubToken}`,
        "Content-Type": "application/sdp",
      },
      body: sdpToSend,
    });

    if (!sdpResponse.ok) throw new Error(`WHIP POST failed: ${sdpResponse.status}`);

    whipSessionUrl = sdpResponse.headers.get("Location") || config.whipUrl;
    const answerSdp = await sdpResponse.text();
    await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });

    peer.oniceconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(peer.iceConnectionState)) {
        status("Соединение потеряно");
        stop();
      }
    };

    stream.getVideoTracks().forEach((track) => {
      track.onended = () => stop();
    });

    localStream = stream;
    peerConnection = peer;
    isStreaming = true;
    status("Трансляция запущена");
    emitState();
  }

  async function stop() {
    if (whipSessionUrl) {
      try {
        const headers = whipPubToken ? { Authorization: `Bearer ${whipPubToken}` } : {};
        await fetch(whipSessionUrl, { method: "DELETE", headers });
      } catch {}
      whipSessionUrl = null;
      whipPubToken = null;
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    if (resizeCleanup) {
      resizeCleanup();
      resizeCleanup = null;
    }

    isStreaming = false;
    status("");
    emitState();
  }

  window.addEventListener("beforeunload", () => {
    if (isStreaming) stop();
  });

  return { start, stop, isStreaming: () => isStreaming };
}
