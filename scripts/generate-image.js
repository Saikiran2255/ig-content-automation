const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Simple, clean templated square image (1080x1080) with the headline text.
// Not MediVyn-branded — neutral professional palette for a personal
// medical education account.
function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(" ");
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

async function generateImage(headline, outputPath) {
  const lines = wrapText(headline, 22);
  const lineHeight = 70;
  const startY = 540 - ((lines.length - 1) * lineHeight) / 2;

  const textSvgLines = lines
    .map(
      (line, i) =>
        `<text x="540" y="${startY + i * lineHeight}" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(
          line
        )}</text>`
    )
    .join("\n");

  const svg = `
  <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e3a5f"/>
        <stop offset="100%" stop-color="#2c5f7c"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#bg)"/>
    <circle cx="900" cy="150" r="180" fill="#ffffff" opacity="0.05"/>
    <circle cx="150" cy="950" r="220" fill="#ffffff" opacity="0.05"/>
    ${textSvgLines}
    <text x="540" y="990" font-family="Arial, sans-serif" font-size="28" fill="#ffffff" opacity="0.7" text-anchor="middle">Medical Education • Simplified</text>
  </svg>`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return outputPath;
}

module.exports = { generateImage };

if (require.main === module) {
  const contentPath = path.join(__dirname, "..", "state", "latest-content.json");
  const content = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
  const outPath = path.join(
    __dirname,
    "..",
    "assets",
    "posts",
    `post-${Date.now()}.png`
  );
  generateImage(content.headline, outPath)
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
