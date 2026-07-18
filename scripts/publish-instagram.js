const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const GRAPH_BASE = "https://graph.instagram.com";

async function createMediaContainer(imageUrl, caption) {
  const url = `${GRAPH_BASE}/${IG_USER_ID}/media`;
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption: caption,
    access_token: IG_ACCESS_TOKEN,
  });
  const res = await fetch(`${url}?${params.toString()}`, { method: "POST" });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Failed to create media container: ${JSON.stringify(data)}`);
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
    throw new Error(`Failed to publish media: ${JSON.stringify(data)}`);
  }
  return data.id;
}

async function waitForContainerReady(containerId, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const url = `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status_code === "FINISHED") return true;
    if (data.status_code === "ERROR") {
      throw new Error(`Container processing failed: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function main() {
  const contentPath = path.join(__dirname, "..", "state", "latest-content.json");
  const imagePathFile = path.join(__dirname, "..", "state", "latest-image-path.txt");
  const repoUrlFile = path.join(__dirname, "..", "state", "raw-image-url.txt");

  const content = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
  const imageUrl = fs.readFileSync(repoUrlFile, "utf-8").trim();

  console.log("Publishing with image URL:", imageUrl);

  const containerId = await createMediaContainer(imageUrl, content.caption);
  console.log("Container created:", containerId);

  const ready = await waitForContainerReady(containerId);
  if (!ready) {
    throw new Error("Container did not finish processing in time.");
  }

  const publishedId = await publishMedia(containerId);
  console.log("Published successfully. Media ID:", publishedId);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Publish failed:", err);
    process.exit(1);
  });
}

module.exports = { createMediaContainer, publishMedia, waitForContainerReady };
