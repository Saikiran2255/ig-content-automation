const Anthropic = require("@anthropic-ai/sdk");
const topics = require("./topics");
const fs = require("fs");
const path = require("path");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tracks which topics have already been used so we don't repeat until
// the whole pool is exhausted. State is stored in the repo itself.
const STATE_FILE = path.join(__dirname, "..", "state", "used-topics.json");

function loadStrategy() {
  const strategyPath = path.join(__dirname, "..", "state", "strategy.json");
  if (fs.existsSync(strategyPath)) {
    try {
      return JSON.parse(fs.readFileSync(strategyPath, "utf-8"));
    } catch {
      return null;
    }
  }
  return null;
}

function pickTopic() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  let used = [];
  if (fs.existsSync(STATE_FILE)) {
    used = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  }
  let remaining = topics.filter((t) => !used.includes(t));
  if (remaining.length === 0) {
    used = [];
    remaining = topics;
  }

  const strategy = loadStrategy();
  let topic;
  if (strategy?.prioritized_topics?.length) {
    // Bias toward the highest-ranked remaining topic most of the time,
    // but keep some randomness so we don't get stuck in a narrow loop.
    const rankedRemaining = strategy.prioritized_topics.filter((t) =>
      remaining.includes(t)
    );
    if (rankedRemaining.length && Math.random() < 0.7) {
      topic = rankedRemaining[0];
    }
  }
  if (!topic) {
    topic = remaining[Math.floor(Math.random() * remaining.length)];
  }

  used.push(topic);
  fs.writeFileSync(STATE_FILE, JSON.stringify(used, null, 2));
  return topic;
}

async function generate() {
  const topic = pickTopic();
  const strategy = loadStrategy();
  const guidanceLine = strategy?.style_guidance
    ? `\n\nLearned style guidance from past performance data (apply this): ${strategy.style_guidance}`
    : "";

  const prompt = `You are writing a short Instagram caption for a medical education account run by a doctor (MBBS/MD). The topic is: "${topic}"${guidanceLine}

Write:
1. A short punchy headline (max 8 words) for the image slide itself.
2. An Instagram caption (150-220 words) in a warm, clear, story-style voice explaining the topic simply for a general audience. No jargon without explanation. End with 3-5 relevant hashtags on a new line.

Respond ONLY in this exact JSON format, no markdown, no preamble:
{"headline": "...", "caption": "..."}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content.find((b) => b.type === "text").text.trim();
  const cleaned = text.replace(/```json|```/g, "").trim();
  const data = JSON.parse(cleaned);

  return { topic, headline: data.headline, caption: data.caption };
}

module.exports = { generate };

// Allow running directly: node scripts/generate-content.js
if (require.main === module) {
  generate()
    .then((result) => {
      fs.writeFileSync(
        path.join(__dirname, "..", "state", "latest-content.json"),
        JSON.stringify(result, null, 2)
      );
      console.log("Generated:", result);
    })
    .catch((err) => {
      console.error("Content generation failed:", err);
      process.exit(1);
    });
}
