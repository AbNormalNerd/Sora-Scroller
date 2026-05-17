import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
/** Optional: set when MP4s are hosted on a CDN / bucket (no trailing slash). Example: https://pub-xxx.r2.dev */
const mediaBaseUrl = (process.env.MEDIA_BASE_URL ?? "").replace(/\/+$/, "");
const mediaRootName = "Sora Memories";
const mediaRoot = path.join(root, mediaRootName);
const outputPath = path.join(root, "src", "data", "videos.json");
const extensions = new Set([".mp4", ".webm", ".mov", ".m4v"]);

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const titleFromFile = (fileName, index) => {
  const base = path.basename(fileName, path.extname(fileName));
  const short = base.replace(/^gen[_-]?/i, "").slice(0, 10).toUpperCase();
  return `Local clip ${index + 1}${short ? ` / ${short}` : ""}`;
};

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

const channels = (await readdir(mediaRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const videos = [];

for (const channel of channels) {
  const channelPath = path.join(mediaRoot, channel);
  const files = (await walk(channelPath)).sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const fileStat = await stat(file);
    const id = `${slug(channel)}-${slug(path.basename(file, path.extname(file)))}`;

    const encodedPath = relative.split("/").map(encodeURIComponent).join("/");
    const src = mediaBaseUrl ? `${mediaBaseUrl}/${encodedPath}` : `/${encodedPath}`;

    videos.push({
      id,
      src,
      title: titleFromFile(file, videos.length),
      channel,
      aspectRatio: "auto",
      category: "shorts",
      fileName: path.basename(file),
      bytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString()
    });
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(videos, null, 2)}\n`);

const counts = videos.reduce((acc, video) => {
  acc[video.channel] = (acc[video.channel] ?? 0) + 1;
  return acc;
}, {});

if (mediaBaseUrl) {
  console.log(`MEDIA_BASE_URL=${mediaBaseUrl} (remote src in manifest)`);
}
console.log(`Wrote ${videos.length} videos to ${path.relative(root, outputPath)}`);
console.table(counts);
