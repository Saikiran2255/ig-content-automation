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

async function generateBackgroundImage(prompt, outputPath) {
  const fullPrompt = `${prompt}. Style: cinematic professional medical illustration, soft moody lighting, vertical composition, no text or letters anywhere in the image, educational and reassuring tone, high production quality, no gore or disturbing imagery.`;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: fullPrompt,
      size: "1024x1536",
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
  fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));
  return outputPath;
}

// Overlay a dark gradient scrim (for text readability) + headline/subtext/progress dots
// on top of the AI-generated background image.
async function composeSlide({ backgroundPath, headline, subtext, slideIndex, totalSlides, isHook, isCta, outputPath }) {
  const headlineSize = isHook ? 64 : 54;
  const maxChars = isHook ? 18 : 22;
  const headlineLines = wrapText(headline, maxChars);
  const lineHeight = headlineSize + 12;

  const subtextLines = subtext ? wrapText(subtext, 34) : [];
  const headlineStartY = subtext
    ? 680 - ((headlineLines.length - 1) * lineHeight) / 2
    : 780 - ((headlineLines.length - 1) * lineHeight) / 2;

  const headlineSvg = headlineLines
    .map(
      (line, i) =>
        `<text x="540" y="${headlineStartY + i * lineHeight}" font-family="Arial, sans-serif" font-size="${headlineSize}" font-weight="800" fill="#ffffff" text-anchor="middle">${escapeXml(
          line
        )}</text>`
    )
    .join("\n");

  const subtextStartY = headlineStartY + headlineLines.length * lineHeight + 45;
  const subtextSvg = subtextLines
    .map(
      (line, i) =>
        `<text x="540" y="${subtextStartY + i * 40}" font-family="Arial, sans-serif" font-size="30" font-weight="400" fill="#ffffff" opacity="0.9" text-anchor="middle">${escapeXml(
          line
        )}</text>`
    )
    .join("\n");

  const dotSpacing = 26;
  const dotsStartX = 540 - ((totalSlides - 1) * dotSpacing) / 2;
  const dotsSvg = Array.from({ length: totalSlides })
    .map((_, i) => {
      const isActive = i === slideIndex;
      return `<circle cx="${dotsStartX + i * dotSpacing}" cy="1850" r="${
        isActive ? 7 : 4.5
      }" fill="#ffffff" opacity="${isActive ? 1 : 0.4}"/>`;
    })
    .join("\n");

  const cornerLabel = isHook ? "SWIPE →" : isCta ? "" : `${slideIndex + 1} / ${totalSlides}`;
  const cornerLabelSvg = cornerLabel
    ? `<text x="540" y="100" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="3" opacity="0.9">${cornerLabel}</text>`
    : "";

  // Dark gradient scrim over the bottom ~55% of the image so white text stays readable
  // regardless of what the AI-generated background looks like underneath.
  const overlaySvg = `
  <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="40%" stop-color="#000000" stop-opacity="0.15"/>
        <stop offset="65%" stop-color="#000000" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.9"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#scrim)"/>
    <rect x="0" y="0" width="1080" height="6" fill="#ffffff" opacity="0.6"/>
    ${cornerLabelSvg}
    ${headlineSvg}
    ${subtextSvg}
    ${dotsSvg}
    <text x="540" y="1890" font-family="Arial, sans-serif" font-size="20" fill="#ffffff" opacity="0.6" text-anchor="middle">Medical Education • Simplified</text>
  </svg>`;

  const bg = await sharp(backgroundPath)
    .resize(1080, 1920, { fit: "cover", position: "attention" })
    .toBuffer();

  await sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

async function generateCarouselImages(carousel, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const total = carousel.slides.length;
  const paths = [];

  for (let i = 0; i < total; i++) {
    const slide = carousel.slides[i];
    const bgPath = path.join(outputDir, `bg-${i + 1}.png`);
    console.log(`Generating background ${i + 1}/${total}: ${slide.image_prompt}`);
    await generateBackgroundImage(slide.image_prompt, bgPath);

    const outPath = path.join(outputDir, `slide-${i + 1}.png`);
    await composeSlide({
      backgroundPath: bgPath,
      headline: slide.headline,
      subtext: slide.subtext,
      slideIndex: i,
      totalSlides: total,
      isHook: i === 0,
      isCta: i === total - 1,
      outputPath: outPath,
    });

    fs.unlinkSync(bgPath); // keep only the final composed slide
    paths.push(outPath);
    await new Promise((r) => setTimeout(r, 1000)); // be polite to rate limits
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
