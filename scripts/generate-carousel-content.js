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

async function generateCarousel() {
  const topic = pickTopic();
  const strategy = loadStrategy();
  const guidanceLine = strategy?.style_guidance
    ? `\n\nLearned style guidance from past performance data (apply this): ${strategy.style_guidance}`
    : "";

  const prompt = `You are creating a medical education Instagram CAROUSEL post (multiple swipeable slides) for a doctor's personal account. The topic is: "${topic}"${guidanceLine}

Structure it as exactly 6 slides:
1. HOOK slide — a bold, curiosity-driving question or statement (max 10 words) that makes someone stop scrolling
2. Slide 2-5: four content slides that build the explanation step by step, simple and clear, each with a short headline (max 8 words) and a brief supporting line (max 18 words)
3. SUMMARY/CTA slide — a short takeaway line (max 12 words) plus "Follow for more" style closer (max 8 words)

For EACH of the 6 slides, also provide an "image_prompt": a detailed visual description (20-40 words) for an AI image generator to create a realistic, relevant background image that actually depicts what that specific slide is explaining (e.g. if the slide is about kidney stones, describe kidneys/urinary system, not an abstract shape). Style: cinematic professional medical illustration or photorealistic medical visualization, soft lighting, no text or letters in the image, consistent visual style across all 6 slides (same rendering approach, same color grading) so the carousel feels cohesive, educational and reassuring tone, no gore or disturbing imagery.

Also write a full Instagram caption (150-220 words) in a warm, story-style voice that expands on the topic, ending with 3-5 relevant hashtags on a new line.

Respond ONLY in this exact JSON format, no markdown, no preamble:
{
  "slides": [
    {"headline": "...", "subtext": "", "image_prompt": "..."},
    {"headline": "...", "subtext": "...", "image_prompt": "..."},
    {"headline": "...", "subtext": "...", "image_prompt": "..."},
    {"headline": "...", "subtext": "...", "image_prompt": "..."},
    {"headline": "...", "subtext": "...", "image_prompt": "..."},
    {"headline": "...", "subtext": "...", "image_prompt": "..."}
  ],
  "caption": "..."
}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content.find((b) => b.type === "text").text.trim();
  const cleaned = text.replace(/```json|```/g, "").trim();
  const data = JSON.parse(cleaned);

  return { topic, slides: data.slides, caption: data.caption };
}

module.exports = { generateCarousel };

if (require.main === module) {
  generateCarousel()
    .then((result) => {
      fs.writeFileSync(
        path.join(__dirname, "..", "state", "latest-carousel.json"),
        JSON.stringify(result, null, 2)
      );
      console.log("Generated carousel:", result.topic);
    })
    .catch((err) => {
      console.error("Carousel content generation failed:", err);
      process.exit(1);
    });
}
