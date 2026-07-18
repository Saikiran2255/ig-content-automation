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
1. A narration script (90-130 words) written as a MINI STORY, not a list of facts. Structure it with a narrative arc:
   - HOOK (first line): drop the listener into an intriguing moment or mystery - make them need to know what happens next
   - RISING TENSION: build curiosity, raise a question in the listener's mind, use phrases like "but here's what's strange" or "and that's when things get interesting"
   - THE REVEAL: deliver the core insight as a payoff to the tension you built - this should feel like an "aha" moment, not a fact dump
   - CLOSING LINE: a memorable, slightly punchy line that recontextualizes everything, makes them want to rewatch or share

   Write it exactly like you're narrating a story to someone leaning in to listen - not explaining a topic. Use "you" to make it personal ("your body is doing this right now"). Vary sentence length: short sentences for tension/punch, one longer flowing sentence for the reveal. This will be spoken with ElevenLabs' Eleven v3 model, which supports inline emotion/delivery tags in square brackets - use these tags deliberately (4-6 times) to shape the storytelling performance: [curious], [whispers], [excited], [pause], [surprised], [emphasis], [warm]. Place a tag immediately before the phrase it should affect, mirroring how a narrator's voice would actually shift at that story beat.

   Example structure: "[curious] Right now, something strange is happening inside your skull. [pause] Your brain is eating itself. [whispers] That sounds terrifying. [pause] But here's the twist - [excited] it's the reason you're not losing your mind by lunchtime. [emphasis] Every night, it clears out the exact toxins that cause memory loss..."

   THE FIRST LINE IS CRITICAL - it must be a scroll-stopping hook. This is non-negotiable: the very first words spoken must be the hook itself, with zero preamble.
   BANNED opening words/phrases (do not start with these under any circumstance): "Did you know", "Let's talk about", "Have you ever", "So", "Today", "I want to tell you", "Here's the thing", any greeting.
   REQUIRED pattern - pick one and make it punchy and specific to this exact topic:
   - Shock/surprise fact stated as fact, no hedging: "Your brain eats itself every single night."
   - A blunt, provocative question: "Why does your heart never get tired?"
   - Direct contradiction of common belief: "Everything you've been told about cholesterol is wrong."
   - A vivid, specific stat or image: "Right now, your kidneys are filtering a bathtub's worth of blood."
   Write the hook FIRST, make sure it could stand alone as a compelling one-liner, then build the rest of the script around it.

2. Break the narration into exactly 7 sequential chunks (in order, covering the full narration start to finish with no gaps or overlaps) - this is critical: each scene's image must visually match what is being said AT THAT MOMENT in the narration, not just the general topic. For each scene provide:
   - "narration_chunk": the exact words from the script spoken during this scene (used for timing sync)
   - "caption": a short on-screen text phrase (max 6 words) - the key phrase from that chunk
   - "image_prompt": a detailed visual description (20-40 words) for an AI image generator, specifically depicting what is being described in THIS chunk of narration (e.g. if the chunk mentions "toxic proteins being flushed out," show that specific process, not a generic brain image). Keep visual style consistent across all 7 (same rendering style, same color family) so the sequence feels like one coherent piece.
3. A full Instagram caption (100-150 words) for the post itself, ending with 3-5 hashtags on a new line.

Respond ONLY in this exact JSON format, no markdown, no preamble:
{
  "narration": "...",
  "scenes": [
    {"narration_chunk": "...", "caption": "...", "image_prompt": "..."},
    {"narration_chunk": "...", "caption": "...", "image_prompt": "..."},
    {"narration_chunk": "...", "caption": "...", "image_prompt": "..."},
    {"narration_chunk": "...", "caption": "...", "image_prompt": "..."},
    {"narration_chunk": "...", "caption": "...", "image_prompt": "..."},
    {"narration_chunk": "...", "caption": "...", "image_prompt": "..."},
    {"narration_chunk": "...", "caption": "...", "image_prompt": "..."}
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
