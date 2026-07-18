const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const GRAPH_BASE = "https://graph.instagram.com";

async function createReelContainer(videoUrl, caption) {
  const url = `${GRAPH_BASE}/${IG_USER_ID}/media`;
  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl,
    caption: caption,
    access_token: IG_ACCESS_TOKEN,
  });
  const res = await fetch(`${url}?${params.toString()}`, { method: "POST" });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Failed to create Reel container: ${JSON.stringify(data)}`);
  }
  return data.id;
}

async function publishMedia(containerId) {
  const url = `${GRAPH_BASE}/${IG_USER_ID}/media_publish`;
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: IG_ACCESS_TOKEN,
  });
  const res = await fetch(`${url}?${params.toString()}`, { method: "POST" });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Failed to publish Reel: ${JSON.stringify(data)}`);
  }
  return data.id;
}

// Video processing takes longer than images - poll for up to ~5 minutes
async function waitForContainerReady(containerId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const url = `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log(`Attempt ${i + 1}: status = ${data.status_code}`);
    if (data.status_code === "FINISHED") return true;
    if (data.status_code === "ERROR") {
      throw new Error(`Container processing failed: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  return false;
}

async function main() {
  const scriptPath = path.join(__dirname, "..", "state", "latest-reel-script.json");
  const videoUrlFile = path.join(__dirname, "..", "state", "reel-video-url.txt");

  const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const videoUrl = fs.readFileSync(videoUrlFile, "utf-8").trim();

  console.log("Publishing Reel with video URL:", videoUrl);

  const containerId = await createReelContainer(videoUrl, script.caption);
  console.log("Reel container created:", containerId);

  const ready = await waitForContainerReady(containerId);
  if (!ready) {
    throw new Error("Reel container did not finish processing in time.");
  }

  const publishedId = await publishMedia(containerId);
  console.log("Reel published successfully. Media ID:", publishedId);

  const historyPath = path.join(__dirname, "..", "state", "post-history.json");
  let history = [];
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
  }
  history.push({
    mediaId: publishedId,
    topic: script.topic,
    format: "reel",
    publishedAt: new Date().toISOString(),
  });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Reel publish failed:", err);
    process.exit(1);
  });
}
