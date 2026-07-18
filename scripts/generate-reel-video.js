const sharp = require("sharp");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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

async function prepareSceneImage(inputPath, outputPath) {
  await sharp(inputPath)
    .resize(1080, 1920, { fit: "cover", position: "attention" })
    .png()
    .toFile(outputPath);
  return outputPath;
}

async function assembleReel({ scenes, audioPath, outputPath, tmpDir }) {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const duration = getAudioDuration(audioPath);

  // Time each scene proportionally to its narration chunk's word count,
  // so visuals actually change roughly in sync with what's being said,
  // rather than dividing the video into equal-length blind segments.
  const wordCounts = scenes.map((s) => (s.narrationChunk || "").trim().split(/\s+/).filter(Boolean).length || 1);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0) || scenes.length;
  const sceneDurations = wordCounts.map((wc) => (wc / totalWords) * duration);

  const fontfile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

  const preparedPaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const prepped = path.join(tmpDir, `prepped-${i}.png`);
    await prepareSceneImage(scenes[i].imagePath, prepped);
    preparedPaths.push(prepped);
  }

  const clipPaths = [];
  const fps = 30;
  for (let i = 0; i < scenes.length; i++) {
    const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
    const thisDuration = sceneDurations[i];
    const frames = Math.round(thisDuration * fps);
    const zoomExpr =
      i % 2 === 0 ? "zoom+0.0015" : "if(eq(on,0),1.15,max(1.0,zoom-0.0015))";

    const caption = escapeForFfmpeg(scenes[i].caption);
    const drawtext = `drawtext=fontfile=${fontfile}:text='${caption}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=h-260:box=1:boxcolor=black@0.45:boxborderw=18`;

    const cmd = [
      "ffmpeg -y",
      `-loop 1 -i "${preparedPaths[i]}"`,
      `-vf "scale=1350:2400,zoompan=z='${zoomExpr}':d=${frames}:s=1080x1920:fps=${fps},${drawtext}"`,
      `-t ${thisDuration.toFixed(2)}`,
      "-c:v libx264 -pix_fmt yuv420p",
      `"${clipPath}"`,
    ].join(" ");

    execSync(cmd, { stdio: "inherit" });
    clipPaths.push(clipPath);
  }

  // Concat clips with crossfade transitions instead of hard cuts, using xfade
  const transitionDuration = 0.4;
  let silentVideoPath;
  if (clipPaths.length === 1) {
    silentVideoPath = clipPaths[0];
  } else {
    silentVideoPath = path.join(tmpDir, "silent-combined.mp4");
    const inputs = clipPaths.map((p) => `-i "${p}"`).join(" ");
    let filterChain = "";
    let lastLabel = "0:v";
    let cumulativeOffset = 0;
    for (let i = 1; i < clipPaths.length; i++) {
      cumulativeOffset += sceneDurations[i - 1] - transitionDuration;
      const outLabel = i === clipPaths.length - 1 ? "outv" : `v${i}`;
      filterChain += `[${lastLabel}][${i}:v]xfade=transition=fade:duration=${transitionDuration}:offset=${cumulativeOffset.toFixed(
        2
      )}[${outLabel}];`;
      lastLabel = outLabel;
    }
    filterChain = filterChain.slice(0, -1); // remove trailing semicolon

    execSync(
      `ffmpeg -y ${inputs} -filter_complex "${filterChain}" -map "[outv]" -c:v libx264 -pix_fmt yuv420p "${silentVideoPath}"`,
      { stdio: "inherit" }
    );
  }

  execSync(
    `ffmpeg -y -i "${silentVideoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`,
    { stdio: "inherit" }
  );

  return outputPath;
}

module.exports = { assembleReel };

if (require.main === module) {
  const scriptPath = path.join(__dirname, "..", "state", "latest-reel-script.json");
  const voiceoverPathFile = path.join(__dirname, "..", "state", "latest-voiceover-path.txt");
  const scenesDirFile = path.join(__dirname, "..", "state", "latest-scenes-dir.txt");

  const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const audioPath = path.join(__dirname, "..", fs.readFileSync(voiceoverPathFile, "utf-8").trim());
  const scenesDir = path.join(__dirname, "..", fs.readFileSync(scenesDirFile, "utf-8").trim());

  const scenes = script.scenes.map((s, i) => ({
    caption: s.caption,
    narrationChunk: s.narration_chunk,
    imagePath: path.join(scenesDir, `scene-${i + 1}.png`),
  }));

  const timestamp = Date.now();
  const outputPath = path.join(__dirname, "..", "assets", "reels", `reel-${timestamp}.mp4`);
  const tmpDir = path.join(__dirname, "..", "assets", "reels", `tmp-${timestamp}`);

  assembleReel({ scenes, audioPath, outputPath, tmpDir })
    .then((p) => {
      fs.writeFileSync(
        path.join(__dirname, "..", "state", "latest-reel-video-path.txt"),
        path.relative(path.join(__dirname, ".."), p)
      );
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log("Reel video assembled:", p);
    })
    .catch((err) => {
      console.error("Reel video assembly failed:", err);
      process.exit(1);
    });
}
