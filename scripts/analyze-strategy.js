const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");
const topics = require("./topics");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  const perfPath = path.join(__dirname, "..", "state", "post-performance.json");
  if (!fs.existsSync(perfPath)) {
    console.log("No performance data yet. Skipping strategy update.");
    return;
  }
  const performance = JSON.parse(fs.readFileSync(perfPath, "utf-8"));

  if (performance.length < 5) {
    console.log("Not enough posts yet for a meaningful strategy update (need 5+).");
    return;
  }

  const prompt = `You are a social media growth strategist reviewing performance data for a medical education Instagram account (personal brand, doctor sharing health/disease education content, no product promotion).

Here is performance data for recent posts (topic, headline, and Instagram insights - reach, saves, shares, likes, comments):

${JSON.stringify(performance, null, 2)}

Full topic pool available for future posts:
${JSON.stringify(topics, null, 2)}

Based on this data:
1. Identify which topics/headline styles are performing best (prioritize saves and shares over likes - those are the strongest growth signals).
2. Identify any patterns in what's underperforming.
3. Write a short "style guidance" note (2-4 sentences) for future caption writing - things to lean into or avoid based on what's working.
4. Rank the topic pool from most to least promising based on the patterns you see (if a topic hasn't been tried yet, place it based on similarity to what's working).

Respond ONLY in this exact JSON format, no markdown, no preamble:
{
  "style_guidance": "...",
  "prioritized_topics": ["topic1", "topic2", ...],
  "summary": "one sentence on the overall trend"
}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content.find((b) => b.type === "text").text.trim();
  const cleaned = text.replace(/```json|```/g, "").trim();
  const strategy = JSON.parse(cleaned);

  const outPath = path.join(__dirname, "..", "state", "strategy.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ ...strategy, updatedAt: new Date().toISOString() }, null, 2)
  );
  console.log("Strategy updated:", strategy.summary);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Strategy analysis failed:", err);
    process.exit(1);
  });
}
