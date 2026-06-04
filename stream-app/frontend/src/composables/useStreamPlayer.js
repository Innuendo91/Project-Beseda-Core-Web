import { ref, onScopeDispose } from "vue";

function editOffer(sdp) {
  const sections = sdp.split("m=");
  for (let i = 1; i < sections.length; i++) {
    if (sections[i].startsWith("audio")) {
      const lines = sections[i].split("\r\n");
      let opusPt = "";
      for (const line of lines) {
        if (line.startsWith("a=rtpmap:") && line.toLowerCase().includes("opus/")) {
          opusPt = line.slice("a=rtpmap:".length).split(" ")[0];
          break;
        }
      }
      if (opusPt) {
        for (let j = 0; j < lines.length; j++) {
          if (lines[j].startsWith(`a=fmtp:${opusPt} `)) {
            if (!lines[j].includes("stereo")) lines[j] += ";stereo=1";
            if (!lines[j].includes("sprop-stereo")) lines[j] += ";sprop-stereo=1";
          }
        }
      }
      sections[i] = lines.join("\r\n");
      break;
    }
  }
  return sections.join("m=");
}

function parseOffer(sdp) {
  const ret = { iceUfrag: "", icePwd: "", medias: [] };
  for (const line of sdp.split("\r\n")) {
    if (line.startsWith("m=")) ret.medias.push(line.slice(2));
    else if (!ret.iceUfrag && line.startsWith("a=ice-ufrag:")) ret.iceUfrag = line.slice(14);
    else if (!ret.icePwd && line.startsWith("a=ice-pwd:")) ret.icePwd = line.slice(10);
  }
  return ret;
}

function generateSdpFragment(od, candidates) {
  const byMedia = {};
  for (const c of candidates) {
    const mid = c.sdpMLineIndex;
    if (!byMedia[mid]) byMedia[mid] = [];
    byMedia[mid].push(c);
  }
  let frag = `a=ice-ufrag:${od.iceUfrag}\r\na=ice-pwd:${od.icePwd}\r\n`;
  let mid = 0;
  for (const media of od.medias) {
    if (byMedia[mid]) {
      frag += `m=${media}\r\na=mid:${mid}\r\n`;
      for (const c of byMedia[mid]) frag += `a=${c.candidate}\r\n`;
    }
    mid++;
  }
  return frag;
}

function linkToIceServers(linkHeader) {
  if (!linkHeader) return [];
  return linkHeader.split(", ").map((link) => {
    const m = link.match(
      /^<(.+?)>; rel="ice-server"(; username="(.*?)"; credential="(.*?)"; credential-type="password")?/i
    );
    const ret = { urls: [m[1]] };
    if (m[3] !== undefined) {
      ret.username = m[3];
      ret.credential = m[4];
      ret.credentialType = "password";
    }
    return ret;
  });
}

export function useStreamPlayer() {
  const connecting = ref(false);
  const connected = ref(false);
  const error = ref("");
  const streamPath = ref("");

  let pc = null;
  let sessionUrl = null;
  let offerData = null;
  let queuedCandidates = [];
  let restartTimeout = null;
  let closed = false;
  let currentConfig = null;

  async function start(path, config) {
    closed = false;
    currentConfig = config;
    streamPath.value = path;
    connecting.value = true;
    connected.value = false;
    error.value = "";

    const { protocol, streamHost, whepPort, token } = config;
    const cleanPath = path.replace(/^\/+/, "");
    const url = `${protocol}://${streamHost}:${whepPort}/${cleanPath}/whep`;

    try {
      const iceRes = await fetch(url, {
        method: "OPTIONS",
        headers: { Authorization: `Bearer ${token}` },
      });
      const iceServers = linkToIceServers(iceRes.headers.get("Link"));

      pc = new RTCPeerConnection({ iceServers });
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.onicecandidate = (evt) => {
        if (!evt.candidate) return;
        if (!sessionUrl) {
          queuedCandidates.push(evt.candidate);
        } else {
          sendCandidates([evt.candidate]);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          handleError("Соединение разорвано");
        }
      };

      pc.ontrack = (evt) => {
        const videoEl = document.getElementById("streamVideo");
        if (videoEl && evt.streams[0]) {
          videoEl.srcObject = evt.streams[0];
          videoEl.play().catch(() => {});
        }
        connected.value = true;
        connecting.value = false;
        error.value = "";
      };

      const offer = await pc.createOffer();
      offer.sdp = editOffer(offer.sdp);
      offerData = parseOffer(offer.sdp);
      await pc.setLocalDescription(offer);

      const postRes = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (postRes.status === 404) throw new Error("Стрим не найден");
      if (postRes.status !== 201) {
        const errBody = await postRes.json().catch(() => ({}));
        throw new Error(errBody.error || `Ошибка ${postRes.status}`);
      }

      sessionUrl = new URL(postRes.headers.get("location"), url).toString();
      const answer = await postRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

      if (queuedCandidates.length) {
        sendCandidates(queuedCandidates);
        queuedCandidates = [];
      }
    } catch (err) {
      error.value = err.message || "Ошибка подключения";
      connecting.value = false;
    }
  }

  function sendCandidates(candidates) {
    if (!sessionUrl || !offerData) return;
    fetch(sessionUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/trickle-ice-sdpfrag",
        "If-Match": "*",
      },
      body: generateSdpFragment(offerData, candidates),
    }).catch(() => {});
  }

  function handleError(msg) {
    if (restartTimeout) {
      clearTimeout(restartTimeout);
      restartTimeout = null;
    }
    if (pc) { pc.close(); pc = null; }
    if (sessionUrl) {
      fetch(sessionUrl, { method: "DELETE" }).catch(() => {});
      sessionUrl = null;
    }
    offerData = null;
    queuedCandidates = [];
    error.value = msg;
    connected.value = false;

    restartTimeout = setTimeout(() => {
      restartTimeout = null;
      if (closed || !currentConfig) return;
      connecting.value = true;
      connected.value = false;
      error.value = "";
      start(streamPath.value, currentConfig);
    }, 2000);
  }

  function stop() {
    closed = true;
    currentConfig = null;
    streamPath.value = "";
    connecting.value = false;
    connected.value = false;
    error.value = "";

    if (restartTimeout) { clearTimeout(restartTimeout); restartTimeout = null; }
    if (pc) { pc.close(); pc = null; }
    if (sessionUrl) { fetch(sessionUrl, { method: "DELETE" }).catch(() => {}); sessionUrl = null; }
    offerData = null;
    queuedCandidates = [];

    const videoEl = document.getElementById("streamVideo");
    if (videoEl) videoEl.srcObject = null;
  }

  onScopeDispose(() => { stop(); });

  return {
    connecting,
    connected,
    error,
    streamPath,
    start,
    stop,
  };
}
