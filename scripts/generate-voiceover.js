const fs = require("fs");
const path = require("path");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

async function generateVoiceover(text, outputPath) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${errText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

module.exports = { generateVoiceover };

if (require.main === module) {
  const scriptPath = path.join(__dirname, "..", "state", "latest-reel-script.json");
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const outPath = path.join(__dirname, "..", "assets", "reels", `voiceover-${Date.now()}.mp3`);

  generateVoiceover(script.narration, outPath)
    .then((p) => {
      fs.writeFileSync(
        path.join(__dirname, "..", "state", "latest-voiceover-path.txt"),
        path.relative(path.join(__dirname, ".."), p)
      );
      console.log("Voiceover generated:", p);
    })
    .catch((err) => {
      console.error("Voiceover generation failed:", err);
      process.exit(1);
    });
}
