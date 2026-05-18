import { createReadStream, readFileSync } from "node:fs";
import { mkdir, open, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import existingManifest from "../public/data/videos.json" with { type: "json" };

const root = process.cwd();
const outputPath = path.join(root, "public", "data", "videos.json");
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

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(sourceDir, ".env.local"));
loadEnvFile(path.join(sourceDir, ".env.local.txt"));

const endpoint =
  args.endpoint ??
  process.env.R2_ENDPOINT ??
  "https://440b6dc4c4aaeab741ea7f371577c770.r2.cloudflarestorage.com";
const bucket = args.bucket ?? process.env.R2_BUCKET;
const defaultPublicUrl = "https://pub-6fc2e0c8179c462f8073797b71b4e0c7.r2.dev";
const publicUrl = trimTrailingSlash(args.publicUrl ?? process.env.R2_PUBLIC_URL ?? defaultPublicUrl);
const accessKeyId = args.accessKeyId ?? process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = args.secretAccessKey ?? process.env.R2_SECRET_ACCESS_KEY;
const prefix = trimSlashes(args.prefix ?? process.env.R2_VIDEO_PREFIX ?? "videos");
const skipChannels = new Set((args.skip ?? process.env.R2_SKIP_CHANNELS ?? "abnormalnerd").split(",").map((item) => item.trim()).filter(Boolean));
const onlyChannels = new Set((args.only ?? process.env.R2_ONLY_CHANNELS ?? "").split(",").map((item) => item.trim()).filter(Boolean));

if (!bucket || !accessKeyId || !secretAccessKey || !publicUrl) {
  throw new Error(
    [
      "Missing R2 config.",
      "Add R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_PUBLIC_URL to .env.local.",
      "R2_PUBLIC_URL must be a public playback URL, usually your r2.dev public bucket URL or a custom domain."
    ].join(" ")
  );
}

const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

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
    // Optional local env file.
  }
}

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/g, "");
}

function publicObjectUrl(key) {
  return `${publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
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

async function uploadFile(file, key, ext) {
  const label = `${path.relative(sourceDir, file)} -> r2://${bucket}/${key}`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      console.log(`Uploading ${label}${attempt > 1 ? ` (attempt ${attempt})` : ""}`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: createReadStream(file),
          ContentType: videoMime.get(ext) ?? "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable"
        })
      );
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2500));
    }
  }
}

async function listExistingKeys() {
  const keys = new Set();
  let ContinuationToken;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${prefix}/`,
        ContinuationToken
      })
    );

    for (const item of response.Contents ?? []) {
      if (item.Key) keys.add(item.Key);
    }

    ContinuationToken = response.NextContinuationToken;
  } while (ContinuationToken);

  if (keys.size) {
    console.log(`Found ${keys.size} existing R2 uploads under ${prefix}/`);
  }

  return keys;
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

  console.log(`Wrote ${sourceVideos.length} mixed Blob/R2 videos to ${path.relative(root, outputPath)}`);
  console.table(counts);
}

const videos = existingManifest.filter((video) => skipChannels.has(video.channel) || (onlyChannels.size && !onlyChannels.has(video.channel)));
const existingKeys = await listExistingKeys();
const channels = (await readdir(sourceDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !skipChannels.has(entry.name))
  .filter((entry) => !onlyChannels.size || onlyChannels.has(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

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
    const key = `${prefix}/${slug(channel)}/${id}${ext}`;

    if (!existingKeys.has(key)) {
      try {
        await uploadFile(file, key, ext);
        existingKeys.add(key);
      } catch (error) {
        await writeManifest(videos);
        throw error;
      }
    }

    videos.push({
      id,
      src: publicObjectUrl(key),
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

    await writeManifest(videos);
  }
}

await writeManifest(videos);
