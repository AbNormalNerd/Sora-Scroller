import { createReadStream, readFileSync } from "node:fs";
import { mkdir, open, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

const root = process.cwd();
const outputPath = path.join(root, "src", "data", "videos.json");
const extensions = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const videoMime = new Map([
  [".mp4", "video/mp4"],
  [".m4v", "video/mp4"],
  [".mov", "video/quicktime"],
  [".webm", "video/webm"]
]);

const args = parseArgs(process.argv.slice(2));
const sourceDir = path.resolve(
  root,
  args.source ?? process.env.VIDEO_SOURCE_DIR ?? path.join("..", "Sora Memories")
);
const blobPrefix = trimSlashes(args.prefix ?? process.env.BLOB_VIDEO_PREFIX ?? "videos");
const overwrite = args.overwrite !== "false";

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(sourceDir, ".env.local"));
loadEnvFile(path.join(sourceDir, ".env.local.txt"));

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error(
    "Missing BLOB_READ_WRITE_TOKEN. Add it to .env.local in this project or in the video source folder."
  );
}

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const titleFromFile = (fileName, index) => {
  const base = path.basename(fileName, path.extname(fileName));
  const short = base.replace(/^gen[_-]?/i, "").slice(0, 10).toUpperCase();
  return `Clip ${index + 1}${short ? ` / ${short}` : ""}`;
};

function parseArgs(values) {
  return values.reduce((acc, value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    acc[key] = rest.length ? rest.join("=") : "true";
    return acc;
  }, {});
}

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

function loadEnvFile(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (process.env[key]) continue;
      process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // The token can also come from the shell or Vercel environment.
  }
}

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

async function readBoxHeader(handle, offset) {
  const buffer = Buffer.alloc(16);
  const { bytesRead } = await handle.read(buffer, 0, 16, offset);
  if (bytesRead < 8) return null;

  const size32 = buffer.readUInt32BE(0);
  const type = buffer.toString("ascii", 4, 8);
  let headerSize = 8;
  let size = size32;

  if (size32 === 1) {
    size = Number(buffer.readBigUInt64BE(8));
    headerSize = 16;
  }

  if (size === 0) return { type, size: Number.POSITIVE_INFINITY, headerSize };
  if (size < headerSize) return null;
  return { type, size, headerSize };
}

async function parseTkhd(handle, start, size, headerSize) {
  const contentStart = start + headerSize;
  const buffer = Buffer.alloc(Math.min(size - headerSize, 128));
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, contentStart);
  if (bytesRead < 92) return null;

  const version = buffer.readUInt8(0);
  const widthOffset = version === 1 ? 96 : 84;
  const heightOffset = widthOffset + 4;
  if (bytesRead < heightOffset + 4) return null;

  const width = buffer.readUInt32BE(widthOffset) / 65536;
  const height = buffer.readUInt32BE(heightOffset) / 65536;
  if (!width || !height) return null;

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

async function scanMp4Boxes(handle, start, end, depth = 0) {
  const dimensions = [];
  let offset = start;

  while (offset < end && depth < 8) {
    const header = await readBoxHeader(handle, offset);
    if (!header) break;

    const boxEnd = Math.min(offset + header.size, end);
    if (header.type === "tkhd") {
      const dimension = await parseTkhd(handle, offset, header.size, header.headerSize);
      if (dimension) dimensions.push(dimension);
    } else if (["moov", "trak", "mdia", "minf", "stbl"].includes(header.type)) {
      dimensions.push(...(await scanMp4Boxes(handle, offset + header.headerSize, boxEnd, depth + 1)));
    }

    offset = boxEnd;
  }

  return dimensions;
}

async function detectDimensions(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (![".mp4", ".mov", ".m4v"].includes(ext)) return null;

  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    const dimensions = await scanMp4Boxes(handle, 0, size);
    return dimensions.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
  } finally {
    await handle.close();
  }
}

function aspectFromDimensions(dimensions) {
  if (!dimensions) {
    return { aspectRatio: "auto", category: "shorts" };
  }

  const ratio = dimensions.width / dimensions.height;
  if (ratio >= 1.2) return { aspectRatio: "16:9", category: "videos" };
  if (ratio <= 0.9) return { aspectRatio: "9:16", category: "shorts" };
  return { aspectRatio: "1:1", category: "shorts" };
}

const channels = (await readdir(sourceDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const videos = [];
const existingBlobs = await listExistingBlobs(`${blobPrefix}/`);

for (const channel of channels) {
  const channelPath = path.join(sourceDir, channel);
  const files = (await walk(channelPath)).sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const fileStat = await stat(file);
    const baseId = `${slug(channel)}-${slug(path.basename(file, ext))}`;
    const id = videos.some((video) => video.id === baseId) ? `${baseId}-${videos.length + 1}` : baseId;
    const dimensions = await detectDimensions(file);
    const { aspectRatio, category } = aspectFromDimensions(dimensions);
    const blobPath = `${blobPrefix}/${slug(channel)}/${id}${ext}`;

    const existingBlob = existingBlobs.get(blobPath);
    const blob = existingBlob ?? (await uploadVideo(file, blobPath, ext));

    videos.push({
      id,
      src: blob.url,
      title: titleFromFile(file, videos.length),
      channel,
      aspectRatio,
      category,
      fileName: path.basename(file),
      bytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      width: dimensions?.width,
      height: dimensions?.height
    });
  }
}

await writeManifest(videos);

async function uploadVideo(file, blobPath, ext) {
  console.log(`Uploading ${path.relative(sourceDir, file)} -> ${blobPath}`);
  try {
    return await put(blobPath, createReadStream(file), {
      access: "public",
      allowOverwrite: overwrite,
      addRandomSuffix: false,
      contentType: videoMime.get(ext) ?? "application/octet-stream",
      multipart: true,
      cacheControlMaxAge: 31536000
    });
  } catch (error) {
    await writeManifest(videos);
    throw error;
  }
}

async function listExistingBlobs(prefix) {
  const blobs = new Map();
  let cursor;

  do {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      blobs.set(blob.pathname, blob);
    }
    cursor = page.cursor;
  } while (cursor);

  if (blobs.size) {
    console.log(`Found ${blobs.size} existing Blob uploads under ${prefix}`);
  }

  return blobs;
}

async function writeManifest(sourceVideos) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(sourceVideos, null, 2)}\n`);

  const counts = sourceVideos.reduce((acc, video) => {
    const stats = acc[video.channel] ?? { shorts: 0, videos: 0 };
    stats[video.category] += 1;
    acc[video.channel] = stats;
    return acc;
  }, {});

  console.log(`Wrote ${sourceVideos.length} Blob-backed videos to ${path.relative(root, outputPath)}`);
  console.table(counts);
}
