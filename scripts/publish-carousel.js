const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const GRAPH_BASE = "https://graph.instagram.com";

async function createChildContainer(imageUrl) {
  const url = `${GRAPH_BASE}/${IG_USER_ID}/media`;
  const params = new URLSearchParams({
    image_url: imageUrl,
    is_carousel_item: "true",
    access_token: IG_ACCESS_TOKEN,
  });
  const res = await fetch(`${url}?${params.toString()}`, { method: "POST" });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Failed to create child container: ${JSON.stringify(data)}`);
  }
  return data.id;
}

async function createCarouselContainer(childIds, caption) {
  const url = `${GRAPH_BASE}/${IG_USER_ID}/media`;
  const params = new URLSearchParams({
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption: caption,
    access_token: IG_ACCESS_TOKEN,
  });
  const res = await fetch(`${url}?${params.toString()}`, { method: "POST" });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Failed to create carousel container: ${JSON.stringify(data)}`);
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
    throw new Error(`Failed to publish carousel: ${JSON.stringify(data)}`);
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
  const carouselPath = path.join(__dirname, "..", "state", "latest-carousel.json");
  const urlsPath = path.join(__dirname, "..", "state", "carousel-image-urls.json");

  const carousel = JSON.parse(fs.readFileSync(carouselPath, "utf-8"));
  const imageUrls = JSON.parse(fs.readFileSync(urlsPath, "utf-8"));

  console.log(`Creating ${imageUrls.length} child containers...`);
  const childIds = [];
  for (const url of imageUrls) {
    const id = await createChildContainer(url);
    childIds.push(id);
    console.log("Child container created:", id);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("Creating carousel container...");
  const carouselContainerId = await createCarouselContainer(childIds, carousel.caption);

  const ready = await waitForContainerReady(carouselContainerId);
  if (!ready) {
    throw new Error("Carousel container did not finish processing in time.");
  }

  const publishedId = await publishMedia(carouselContainerId);
  console.log("Carousel published successfully. Media ID:", publishedId);

  const historyPath = path.join(__dirname, "..", "state", "post-history.json");
  let history = [];
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
  }
  history.push({
    mediaId: publishedId,
    topic: carousel.topic,
    format: "carousel",
    publishedAt: new Date().toISOString(),
  });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Carousel publish failed:", err);
    process.exit(1);
  });
}
