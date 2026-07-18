const fs = require("fs");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function generateSceneImage(prompt, outputPath) {
  const fullPrompt = `${prompt}. Style: cinematic flat medical illustration, soft professional color palette with warm-to-cool gradient lighting, vertical composition, consistent art style across a series (clean lines, subtle depth, gentle shadows), no text or letters anywhere in the image, educational and reassuring tone, high production quality, no gore or disturbing imagery.`;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: fullPrompt,
      size: "1024x1536", // portrait, closest supported to 9:16
      quality: "high",
      n: 1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI image generation failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const b64 = data.data[0].b64_json;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));
  return outputPath;
}

async function generateAllSceneImages(scenes, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const paths = [];
  for (let i = 0; i < scenes.length; i++) {
    const outPath = path.join(outputDir, `scene-${i + 1}.png`);
    console.log(`Generating scene ${i + 1}/${scenes.length}: ${scenes[i].image_prompt}`);
    await generateSceneImage(scenes[i].image_prompt, outPath);
    paths.push(outPath);
    // Be polite to rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }
  return paths;
}

module.exports = { generateSceneImage, generateAllSceneImages };

if (require.main === module) {
  const scriptPath = path.join(__dirname, "..", "state", "latest-reel-script.json");
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const outputDir = path.join(__dirname, "..", "assets", "reels", `scenes-${Date.now()}`);

  generateAllSceneImages(script.scenes, outputDir)
    .then((paths) => {
      fs.writeFileSync(
        path.join(__dirname, "..", "state", "latest-scenes-dir.txt"),
        path.relative(path.join(__dirname, ".."), outputDir)
      );
      console.log(`Generated ${paths.length} scene images in ${outputDir}`);
    })
    .catch((err) => {
      console.error("Scene image generation failed:", err);
      process.exit(1);
    });
}
