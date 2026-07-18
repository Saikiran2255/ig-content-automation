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

  const prompt = `You are writing content for a 35-45 second medical education Instagram Reel, for a doctor's personal account. Topic: "${topic}"${guidanceLine}

Write:
1. A narration script (90-130 words) meant to be SPOKEN aloud - natural spoken rhythm, short sentences, simple language explaining the topic clearly, ending with a memorable closing line. Do not include stage directions, just the words to be spoken.

   THE FIRST LINE IS CRITICAL - it must be a scroll-stopping hook, not a gentle intro. Use one of these patterns:
   - A surprising/counter-intuitive claim ("Your brain eats itself every single night.")
   - A direct question that creates a knowledge gap ("Why does your heart never get tired?")
   - A bold statement that challenges assumption ("Everything you know about cholesterol is wrong.")
   Avoid soft openers like "Did you know" or "Let's talk about" - open with the hook itself, immediately, no preamble.
2. 7 scenes that divide the narration into a visual sequence, faster-paced (shorter per scene) for better retention. For each scene provide:
   - "caption": a short on-screen text phrase (max 6 words) - the key phrase/punchline for that moment
   - "image_prompt": a detailed visual description (20-40 words) for an AI image generator to create a clean, professional medical illustration for this scene (e.g. anatomical diagram style, clean flat illustration, soft color palette, no text in the image, no gore, educational and reassuring tone, suitable for a general audience). Keep visual style consistent across all 7 (same rendering style, same color family) so the sequence feels like one coherent piece, not disconnected images.
3. A full Instagram caption (100-150 words) for the post itself, ending with 3-5 hashtags on a new line.

Respond ONLY in this exact JSON format, no markdown, no preamble:
{
  "narration": "...",
  "scenes": [
    {"caption": "...", "image_prompt": "..."},
    {"caption": "...", "image_prompt": "..."},
    {"caption": "...", "image_prompt": "..."},
    {"caption": "...", "image_prompt": "..."},
    {"caption": "...", "image_prompt": "..."},
    {"caption": "...", "image_prompt": "..."},
    {"caption": "...", "image_prompt": "..."}
  ],
  "caption": "..."
}`;

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
