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

OPTIMIZE FOR SHAREABILITY, not just information. Shares (not likes) are what actually drive an account to grow, because a share puts the post in front of someone else's entire network. Before writing, pick ONE of these angles for this topic, whichever fits best:
- MYTH-BUST: contradicts something almost everyone believes ("Everyone tells you to do X. Here's why that's wrong.")
- RELATABLE: frames the medical fact around a universal experience people will tag a friend on ("Send this to someone who always...")
- HIGH-STAKES USEFUL: information specific enough that someone would screenshot and save it for later, not just read once

Structure it as exactly 6 slides:
1. HOOK slide — a bold, curiosity-driving statement (max 10 words) built on the angle above. It must work as a standalone screenshot - compelling even with zero context.
2. Slide 2-5: four content slides that build the explanation step by step, simple and clear, each with a short headline (max 8 words) and a brief supporting line (max 18 words)
3. SUMMARY/CTA slide — a short, quotable takeaway line (max 12 words, written so it works as a standalone quote someone might screenshot) plus "Follow for more" style closer (max 8 words)

For EACH of the 6 slides, also provide an "image_prompt": a detailed visual description (20-40 words) for an AI image generator to create a realistic, relevant background image that actually depicts what that specific slide is explaining (e.g. if the slide is about kidney stones, describe kidneys/urinary system, not an abstract shape). Style: cinematic professional medical illustration or photorealistic medical visualization, soft lighting, no text or letters in the image, consistent visual style across all 6 slides (same rendering approach, same color grading) so the carousel feels cohesive, educational and reassuring tone, no gore or disturbing imagery.

Write a full Instagram caption (150-220 words) in a warm, story-style voice. End the caption with an explicit, natural share/save prompt (e.g. "Save this for later" or "Tag someone who needs to see this" - match it to the angle you picked), then a hashtag block on new lines.

HASHTAG STRATEGY (critical for reach) - use exactly 12 hashtags, mixed across three tiers:
- 3 BROAD/high-volume tags (millions of posts) for maximum discovery pool, e.g. #health #wellness #medicine
- 6 MID-SIZE niche tags (tens of thousands to low millions) specific to the topic, e.g. #guthealth #sleepscience #kidneyhealth - these are where most real discovery happens since competition is lower
- 3 SPECIFIC/long-tail tags directly matching the exact topic, e.g. #kidneystonesymptoms - low competition, but reaches people actively searching this exact thing
Do not repeat generic tags across posts every time - vary them based on the specific topic.

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
