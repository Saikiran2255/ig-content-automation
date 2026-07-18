const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

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

// Rotating palette so consecutive carousels don't all look identical.
const PALETTES = [
  { from: "#1e3a5f", to: "#2c5f7c", accent: "#5fb8d6" },
  { from: "#2d1b4e", to: "#4a2f7a", accent: "#b794f6" },
  { from: "#1a3c34", to: "#2d6a4f", accent: "#74c69d" },
  { from: "#4a1942", to: "#7a2f6b", accent: "#e0a3d0" },
];

function pickPalette(seed) {
  const idx = seed % PALETTES.length;
  return PALETTES[idx];
}

function renderSlideSvg({ headline, subtext, slideIndex, totalSlides, palette, isHook, isCta }) {
  const headlineSize = isHook ? 72 : 60;
  const maxChars = isHook ? 16 : 20;
  const headlineLines = wrapText(headline, maxChars);
  const lineHeight = headlineSize + 12;

  const subtextLines = subtext ? wrapText(subtext, 34) : [];

  const headlineStartY = subtext
    ? 420 - ((headlineLines.length - 1) * lineHeight) / 2
    : 540 - ((headlineLines.length - 1) * lineHeight) / 2;

  const headlineSvg = headlineLines
    .map(
      (line, i) =>
        `<text x="540" y="${headlineStartY + i * lineHeight}" font-family="Arial, sans-serif" font-size="${headlineSize}" font-weight="800" fill="#ffffff" text-anchor="middle">${escapeXml(
          line
        )}</text>`
    )
    .join("\n");

  const subtextStartY = headlineStartY + headlineLines.length * lineHeight + 50;
  const subtextSvg = subtextLines
    .map(
      (line, i) =>
        `<text x="540" y="${subtextStartY + i * 44}" font-family="Arial, sans-serif" font-size="34" font-weight="400" fill="#ffffff" opacity="0.85" text-anchor="middle">${escapeXml(
          line
        )}</text>`
    )
    .join("\n");

  // Progress dots showing slide position
  const dotSpacing = 28;
  const dotsStartX = 540 - ((totalSlides - 1) * dotSpacing) / 2;
  const dotsSvg = Array.from({ length: totalSlides })
    .map((_, i) => {
      const isActive = i === slideIndex;
      return `<circle cx="${dotsStartX + i * dotSpacing}" cy="1000" r="${
        isActive ? 8 : 5
      }" fill="#ffffff" opacity="${isActive ? 1 : 0.35}"/>`;
    })
    .join("\n");

  const cornerLabel = isHook
    ? "SWIPE →"
    : isCta
    ? ""
    : `${slideIndex + 1} / ${totalSlides}`;

  const cornerLabelSvg = cornerLabel
    ? `<text x="540" y="120" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="${palette.accent}" text-anchor="middle" letter-spacing="3">${cornerLabel}</text>`
    : "";

  return `
  <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette.from}"/>
        <stop offset="100%" stop-color="${palette.to}"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#bg)"/>
    <circle cx="950" cy="130" r="200" fill="${palette.accent}" opacity="0.08"/>
    <circle cx="100" cy="980" r="240" fill="${palette.accent}" opacity="0.08"/>
    <rect x="0" y="0" width="1080" height="6" fill="${palette.accent}"/>
    ${cornerLabelSvg}
    ${headlineSvg}
    ${subtextSvg}
    ${dotsSvg}
    <text x="540" y="1050" font-family="Arial, sans-serif" font-size="22" fill="#ffffff" opacity="0.5" text-anchor="middle">Medical Education • Simplified</text>
  </svg>`;
}

async function generateCarouselImages(carousel, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const seed = carousel.topic.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const palette = pickPalette(seed);
  const total = carousel.slides.length;
  const paths = [];

  for (let i = 0; i < total; i++) {
    const slide = carousel.slides[i];
    const svg = renderSlideSvg({
      headline: slide.headline,
      subtext: slide.subtext,
      slideIndex: i,
      totalSlides: total,
      palette,
      isHook: i === 0,
      isCta: i === total - 1,
    });
    const outPath = path.join(outputDir, `slide-${i + 1}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    paths.push(outPath);
  }

  return paths;
}

module.exports = { generateCarouselImages };

if (require.main === module) {
  const carouselPath = path.join(__dirname, "..", "state", "latest-carousel.json");
  const carousel = JSON.parse(fs.readFileSync(carouselPath, "utf-8"));
  const outputDir = path.join(__dirname, "..", "assets", "carousels", `carousel-${Date.now()}`);

  generateCarouselImages(carousel, outputDir)
    .then((paths) => {
      fs.writeFileSync(
        path.join(__dirname, "..", "state", "latest-carousel-dir.txt"),
        path.relative(path.join(__dirname, ".."), outputDir)
      );
      console.log(`Generated ${paths.length} carousel slides in ${outputDir}`);
    })
    .catch((err) => {
      console.error("Carousel image generation failed:", err);
      process.exit(1);
    });
}
