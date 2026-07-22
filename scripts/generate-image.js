const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function escapeXml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapText(text, maxCharsPerLine) {
  const words = (text || "").split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxCharsPerLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current += " " + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

async function generateBackgroundImage(prompt, outputPath, attempt = 1) {
  const maxAttempts = 3;
  const fullPrompt = `${prompt}. Style: cinematic professional medical illustration, soft moody lighting, square composition, no text or letters anywhere in the image, educational and reassuring tone, high production quality, no gore or disturbing imagery.`;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: fullPrompt,
      size: "1024x1024",
      quality: "high",
      n: 1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const isTransient = res.status >= 500 || res.status === 429;
    if (isTransient && attempt < maxAttempts) {
      const waitMs = attempt * 5000;
      console.warn(
        `Transient error (${res.status}) on attempt ${attempt}, retrying in ${waitMs}ms...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      return generateBackgroundImage(prompt, outputPath, attempt + 1);
    }
    throw new Error(`OpenAI image generation failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const b64 = data.data[0].b64_json;
  fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));
  return outputPath;
}

async function composeImage({ backgroundPath, headline, outputPath }) {
  // Cap headline length so it never needs more than 3 lines - prevents
  // overlap with the footer regardless of how long the AI writes it.
  let fontSize = 54;
  let maxChars = 22;
  let lines = wrapText(headline, maxChars);
  while (lines.length > 3 && fontSize > 36) {
    fontSize -= 4;
    maxChars += 3;
    lines = wrapText(headline, maxChars);
  }

  const lineHeight = fontSize + 14;
  const footerY = 1030;
  const safeBottomMargin = 110; // minimum gap between last headline line and footer
  const blockBottomY = footerY - safeBottomMargin;
  const blockHeight = (lines.length - 1) * lineHeight;
  // Anchor the block so its bottom never crosses into the footer safe zone,
  // but keep it vertically centered when there's room.
  const centeredStartY = 950 - blockHeight / 2;
  const maxStartY = blockBottomY - blockHeight;
  const startY = Math.min(centeredStartY, maxStartY);

  const textSvg = lines
    .map(
      (line, i) =>
        `<text x="540" y="${startY + i * lineHeight}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff" text-anchor="middle">${escapeXml(
          line
        )}</text>`
    )
    .join("\n");

  const overlaySvg = `
  <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="50%" stop-color="#000000" stop-opacity="0.1"/>
        <stop offset="72%" stop-color="#000000" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#scrim)"/>
    <rect x="0" y="0" width="1080" height="6" fill="#ffffff" opacity="0.6"/>
    ${textSvg}
    <text x="540" y="1030" font-family="Arial, sans-serif" font-size="24" fill="#ffffff" opacity="0.65" text-anchor="middle">Medical Education • Simplified</text>
  </svg>`;

  const bg = await sharp(backgroundPath)
    .resize(1080, 1080, { fit: "cover", position: "attention" })
    .toBuffer();

  await sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

async function generateImage(content, outputPath, tmpBgPath) {
  await generateBackgroundImage(content.imagePrompt || content.headline, tmpBgPath);
  await composeImage({ backgroundPath: tmpBgPath, headline: content.headline, outputPath });
  fs.unlinkSync(tmpBgPath);
  return outputPath;
}

module.exports = { generateImage };

if (require.main === module) {
  const contentPath = path.join(__dirname, "..", "state", "latest-content.json");
  const content = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
  const outPath = path.join(__dirname, "..", "assets", "posts", `post-${Date.now()}.png`);
  const tmpBgPath = path.join(__dirname, "..", "assets", "posts", `bg-${Date.now()}.png`);

  generateImage(content, outPath, tmpBgPath)
    .then((p) => {
      fs.writeFileSync(
        path.join(__dirname, "..", "state", "latest-image-path.txt"),
        path.relative(path.join(__dirname, ".."), p)
      );
      console.log("Image generated:", p);
    })
    .catch((err) => {
      console.error("Image generation failed:", err);
      process.exit(1);
    });
}
