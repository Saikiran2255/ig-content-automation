const Anthropic = require("@anthropic-ai/sdk");
const topics = require("./topics");
const fs = require("fs");
const path = require("path");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

async function generateReelScript() {
  const topic = pickTopic();
  const strategy = loadStrategy();
  const guidanceLine = strategy?.style_guidance
    ? `\n\nLearned style guidance from past performance data: ${strategy.style_guidance}`
    : "";

  const prompt = `You are writing a spoken narration script for a 35-45 second medical education Instagram Reel, for a doctor's personal account. Topic: "${topic}"${guidanceLine}

Write:
1. A narration script (90-130 words) meant to be SPOKEN aloud - natural spoken rhythm, short sentences, a strong hook in the first line (first 2 seconds matter most for retention), simple language explaining the topic clearly, ending with a memorable closing line. Do not include stage directions, just the words to be spoken.
2. 4-6 short on-screen caption phrases (max 6 words each) that will appear as text overlays synced roughly to different parts of the narration - these should be the key phrases/punchlines from the script, not the full script.
3. A full Instagram caption (100-150 words) for the post itself, ending with 3-5 hashtags on a new line.

Respond ONLY in this exact JSON format, no markdown, no preamble:
{"narration": "...", "on_screen_captions": ["...", "...", "..."], "caption": "..."}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content.find((b) => b.type === "text").text.trim();
  const cleaned = text.replace(/```json|```/g, "").trim();
  const data = JSON.parse(cleaned);

  return { topic, ...data };
}

module.exports = { generateReelScript };

if (require.main === module) {
  generateReelScript()
    .then((result) => {
      fs.writeFileSync(
        path.join(__dirname, "..", "state", "latest-reel-script.json"),
        JSON.stringify(result, null, 2)
      );
      console.log("Generated reel script:", result.topic);
    })
    .catch((err) => {
      console.error("Reel script generation failed:", err);
      process.exit(1);
    });
}
