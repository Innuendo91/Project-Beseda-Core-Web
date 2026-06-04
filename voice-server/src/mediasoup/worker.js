import * as mediasoup from "mediasoup";
import { config } from "../config.js";

let worker = null;

export async function getWorker() {
  if (worker) return worker;

  worker = await mediasoup.createWorker({
    rtcMinPort: config.rtpMinPort,
    rtcMaxPort: config.rtpMaxPort,
    logLevel: "warn",
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"]
  });

  worker.on("died", () => {
    console.error("[mediasoup] worker died, exiting in 2s...");
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
}
