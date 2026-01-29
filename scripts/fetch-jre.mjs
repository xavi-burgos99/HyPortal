#!/usr/bin/env node
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import * as tar from 'tar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const resourcesRoot = path.join(projectRoot, 'resources', 'jre');
const tmpPrefix = path.join(os.tmpdir(), 'hyportal-jre-');

const PLATFORM_MAP = {
  win: { os: 'windows', targetDir: 'win-x64' },
  windows: { os: 'windows', targetDir: 'win-x64' },
  linux: { os: 'linux', targetDir: 'linux-x64' },
  mac: { os: 'mac', targetDir: 'mac-x64' },
  macos: { os: 'mac', targetDir: 'mac-x64' }
};

const DEFAULT_MAJOR = process.env.HYPORTAL_JRE_MAJOR ?? '25';
const DEFAULT_VM = process.env.HYPORTAL_JRE_VM ?? 'hotspot';
const DEFAULT_ARCH = process.env.HYPORTAL_JRE_ARCH ?? 'x64';

const log = (...args) => console.log('[fetch-jre]', ...args);

const collectPlatforms = () => {
  const args = process.argv.slice(2);
  const selected = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--platform') {
      const next = args[i + 1];
      if (!next) {
        throw new Error('Missing value after --platform');
      }
      selected.push(next);
      i += 1;
      continue;
    }
    if (arg.startsWith('--platform=')) {
      selected.push(arg.split('=').slice(1).join('='));
      continue;
    }
  }
  if (!selected.length) {
    return ['win', 'linux', 'mac'];
  }
  return selected;
};

const fetchJson = async (url) => {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to query ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

const downloadToFile = async (url, destination) => {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const fileStream = createWriteStream(destination);
  await pipeline(response.body, fileStream);
};

const copyDir = async (source, destination) => {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
};

const extractArchive = async (archivePath, extension, destinationDir) => {
  const extractDir = `${archivePath}-extract`;
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  if (extension === 'zip') {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(extractDir, true);
  } else if (extension === 'tar.gz') {
    await tar.x({ file: archivePath, cwd: extractDir, strict: true });
  } else {
    throw new Error(`Unsupported archive extension: ${extension}`);
  }
  const entries = await fs.readdir(extractDir);
  let sourceFolder = null;
  for (const entry of entries) {
    const entryPath = path.join(extractDir, entry);
    const stats = await fs.stat(entryPath);
    if (stats.isDirectory()) {
      sourceFolder = entryPath;
      break;
    }
  }
  if (!sourceFolder) {
    throw new Error(`Could not locate extracted directory inside ${archivePath}`);
  }
  await fs.rm(destinationDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destinationDir), { recursive: true });
  try {
    await fs.rename(sourceFolder, destinationDir);
  } catch (error) {
    // Fallback for cross-device rename errors (e.g., Windows runners)
    await copyDir(sourceFolder, destinationDir);
  }
  await fs.rm(extractDir, { recursive: true, force: true });
};

const writeMetadata = async (targetDir, metadata) => {
  const filePath = path.join(targetDir, 'hyportal-jre.json');
  await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
};

const downloadRuntime = async (platformKey) => {
  const platform = PLATFORM_MAP[platformKey.toLowerCase()];
  if (!platform) {
    throw new Error(`Unsupported --platform value: ${platformKey}`);
  }
  const queryUrl = `https://api.adoptium.net/v3/assets/latest/${DEFAULT_MAJOR}/${DEFAULT_VM}?architecture=${DEFAULT_ARCH}&image_type=jre&os=${platform.os}&heap_size=normal`;
  log(`Consulting ${queryUrl}`);
  const payload = await fetchJson(queryUrl);
  if (!Array.isArray(payload) || !payload.length) {
    throw new Error(`No assets available for ${platformKey}`);
  }
  const asset = payload[0];
  const packageInfo = asset?.binary?.package;
  if (!packageInfo?.link) {
    throw new Error(`Invalid asset payload for ${platformKey}`);
  }
  const extension = packageInfo.extension ?? (packageInfo.name?.endsWith('.zip') ? 'zip' : 'tar.gz');
  const tmpDir = await fs.mkdtemp(tmpPrefix);
  const archivePath = path.join(tmpDir, packageInfo.name ?? `runtime.${extension}`);
  log(`Downloading ${platformKey} runtime (${asset.release_name})`);
  await downloadToFile(packageInfo.link, archivePath);
  const destination = path.join(resourcesRoot, platform.targetDir);
  await extractArchive(archivePath, extension, destination);
  await writeMetadata(destination, {
    version: asset.release_name ?? asset.version?.semver,
    updatedAt: new Date().toISOString(),
    source: packageInfo.link
  });
  await fs.rm(path.dirname(archivePath), { recursive: true, force: true });
  log(`Runtime for ${platformKey} stored at ${destination}`);
};

const main = async () => {
  try {
    const targets = collectPlatforms();
    await fs.mkdir(resourcesRoot, { recursive: true });
    for (const target of targets) {
      await downloadRuntime(target);
    }
    log('All requested runtimes downloaded.');
  } catch (error) {
    console.error('[fetch-jre] Failed:', error?.message ?? error);
    process.exitCode = 1;
  }
};

await main();
