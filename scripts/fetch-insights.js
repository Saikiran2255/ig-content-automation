const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const GRAPH_BASE = "https://graph.instagram.com";

async function listAllMedia() {
  const fields = "id,caption,media_type,media_product_type,timestamp,permalink";
  let url = `${GRAPH_BASE}/${IG_USER_ID}/media?fields=${fields}&limit=50&access_token=${IG_ACCESS_TOKEN}`;
  const allMedia = [];

  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`Failed to list media: ${JSON.stringify(data)}`);
    }
    allMedia.push(...(data.data || []));
    url = data.paging?.next || null;
  }

  return allMedia;
}

async function getInsights(mediaId, mediaProductType) {
  // Metric availability differs by post type (feed image/carousel vs reel)
  const fields =
    mediaProductType === "REELS"
      ? "reach,saved,shares,likes,comments,plays"
      : "reach,saved,shares,likes,comments";
  const url = `${GRAPH_BASE}/${mediaId}/insights?metric=${fields}&access_token=${IG_ACCESS_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) {
    console.warn(`Could not fetch insights for ${mediaId}:`, data.error?.message);
    return null;
  }
  const metrics = {};
  for (const item of data.data || []) {
    metrics[item.name] = item.values?.[0]?.value ?? item.total_value?.value ?? 0;
  }
  return metrics;
}

async function main() {
  console.log("Fetching all media from Instagram account...");
  const allMedia = await listAllMedia();
  console.log(`Found ${allMedia.length} posts.`);

  const enriched = [];
  for (const media of allMedia) {
    const insights = await getInsights(media.id, media.media_product_type);
    enriched.push({
      mediaId: media.id,
      caption: (media.caption || "").slice(0, 150),
      mediaType: media.media_type,
      productType: media.media_product_type,
      timestamp: media.timestamp,
      permalink: media.permalink,
      insights,
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  const outPath = path.join(__dirname, "..", "state", "post-performance.json");
  fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2));
  console.log(`Wrote performance data for ${enriched.length} posts.`);

  // Print a quick human-readable summary too
  console.log("\n--- Summary ---");
  for (const p of enriched) {
    const r = p.insights?.reach ?? "?";
    const s = p.insights?.saved ?? "?";
    console.log(`${p.timestamp} | ${p.productType} | reach: ${r}, saved: ${s} | ${p.caption.slice(0, 50)}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fetching insights failed:", err);
    process.exit(1);
  });
}

