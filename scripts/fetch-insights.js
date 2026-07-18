const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const GRAPH_BASE = "https://graph.instagram.com";

async function getInsights(mediaId) {
  // reach, saved and shares are the strongest signals for what's
  // actually driving growth (far more than likes).
  const fields = "reach,saved,shares,likes,comments";
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
  const historyPath = path.join(__dirname, "..", "state", "post-history.json");
  if (!fs.existsSync(historyPath)) {
    console.log("No post history yet. Nothing to analyze.");
    return;
  }
  const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));

  const enriched = [];
  for (const post of history) {
    const insights = await getInsights(post.mediaId);
    enriched.push({ ...post, insights });
    // Be polite to the API
    await new Promise((r) => setTimeout(r, 500));
  }

  const outPath = path.join(__dirname, "..", "state", "post-performance.json");
  fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2));
  console.log(`Wrote performance data for ${enriched.length} posts.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fetching insights failed:", err);
    process.exit(1);
  });
}
