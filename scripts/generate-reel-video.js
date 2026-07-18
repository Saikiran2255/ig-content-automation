const sharp = require("sharp");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PALETTES = [
  { from: "#1e3a5f", to: "#2c5f7c" },
  { from: "#2d1b4e", to: "#4a2f7a" },
  { from: "#1a3c34", to: "#2d6a4f" },
  { from: "#4a1942", to: "#7a2f6b" },
];

function pickPalette(seed) {
  return PALETTES[seed % PALETTES.length];
}

async function makeBackgroundImage(topic, outPath) {
  const seed = Buffer.from(topic).reduce((a, c) => a + c.charCodeAt(0), 0);
  const palette = pickPalette(seed);
  const svg = `
  <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette.from}"/>
        <stop offset="100%" stop-color="${palette.to}"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <circle cx="900" cy="300" r="260" fill="#ffffff" opacity="0.05"/>
    <circle cx="150" cy="1600" r="300" fill="#ffffff" opacity="0.05"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  return outPath;
}

function getAudioDuration(audioPath) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
  )
    .toString()
    .trim();
  return parseFloat(out);
}

function escapeForFfmpeg(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/,/g, "\\,");
}

function buildDrawtextFilters(captions, duration) {
  const fontfile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const segmentLength = duration / captions.length;
  return captions
    .map((cap, i) => {
      const start = i * segmentLength;
      const end = start + segmentLength;
      const safeText = escapeForFfmpeg(cap);
      return `drawtext=fontfile=${fontfile}:text='${safeText}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=30:enable='between(t,${start.toFixed(
        2
      )},${end.toFixed(2)})'`;
    })
    .join(",");
}

async function assembleReel({ topic, onScreenCaptions, audioPath, outputPath }) {
  const bgPath = path.join(path.dirname(outputPath), "bg.png");
  await makeBackgroundImage(topic, bgPath);

  const duration = getAudioDuration(audioPath);
  const drawtextChain = buildDrawtextFilters(onScreenCaptions, duration);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const cmd = [
    "ffmpeg -y",
    `-loop 1 -i "${bgPath}"`,
    `-i "${audioPath}"`,
    `-vf "${drawtextChain}"`,
    `-t ${duration.toFixed(2)}`,
    "-c:v libx264 -pix_fmt yuv420p -r 30",
    "-c:a aac -b:a 192k",
    "-shortest",
    `"${outputPath}"`,
  ].join(" ");

  execSync(cmd, { stdio: "inherit" });
  return outputPath;
}

module.exports = { assembleReel };

if (require.main === module) {
  const scriptPath = path.join(__dirname, "..", "state", "latest-reel-script.json");
  const voiceoverPathFile = path.join(__dirname, "..", "state", "latest-voiceover-path.txt");

  const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const audioPath = path.join(
    __dirname,
    "..",
    fs.readFileSync(voiceoverPathFile, "utf-8").trim()
  );
  const outputPath = path.join(
    __dirname,
    "..",
    "assets",
    "reels",
    `reel-${Date.now()}.mp4`
  );

  assembleReel({
    topic: script.topic,
    onScreenCaptions: script.on_screen_captions,
    audioPath,
    outputPath,
  })
    .then((p) => {
      fs.writeFileSync(
        path.join(__dirname, "..", "state", "latest-reel-video-path.txt"),
        path.relative(path.join(__dirname, ".."), p)
      );
      console.log("Reel video assembled:", p);
    })
    .catch((err) => {
      console.error("Reel video assembly failed:", err);
      process.exit(1);
    });
}
