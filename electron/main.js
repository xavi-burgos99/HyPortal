import { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } from 'electron';
import path from 'node:path';
import { promises as fs, createWriteStream, existsSync, mkdirSync, renameSync } from 'node:fs';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL) || !app.isPackaged;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId('com.hyportal.app');
app.setName('HyPortal');
const appDataPath = app.getPath('appData');
const desiredUserData = path.join(appDataPath, 'HyPortal');
const legacyUserData = path.join(appDataPath, 'hyportal');

const ensureUserDataPath = () => {
  try {
    if (!existsSync(desiredUserData)) {
      if (existsSync(legacyUserData)) {
        mkdirSync(path.dirname(desiredUserData), { recursive: true });
        renameSync(legacyUserData, desiredUserData);
      } else {
        mkdirSync(desiredUserData, { recursive: true });
      }
    }
  } catch {
    // ignore migration errors and fall back to app's default
  }
  app.setPath('userData', desiredUserData);
};

ensureUserDataPath();
const userDataBase = app.getPath('userData');
const dataDir = path.join(userDataBase, 'Data');
const legacyServersPath = path.join(userDataBase, 'servers.json');
const serversDir = path.join(userDataBase, 'Servers');
const versionsDir = path.join(userDataBase, 'Versions');
const serverSettingsPath = path.join(dataDir, 'server-settings.json');
const settingsPath = path.join(dataDir, 'settings.json');
const getUserDataServersPath = () => path.join(dataDir, 'servers.json');
const getBundledServersPath = () => path.join(__dirname, '../resources/data/servers.json');
const downloaderDir = path.join(userDataBase, 'Downloader');
const getDownloaderZipPath = () => path.join(downloaderDir, 'hytale-downloader.zip');
const getDownloaderExtractDir = () => path.join(downloaderDir, 'hytale-downloader');
const getDownloaderFiles = () => {
  const base = getDownloaderExtractDir();
  return {
    linux: path.join(base, 'hytale-downloader-linux-amd64'),
    windows: path.join(base, 'hytale-downloader-windows-amd64.exe'),
    quickstart: path.join(base, 'QUICKSTART.md')
  };
};
const getDownloaderCredentialsPaths = () => [
  path.join(downloaderDir, '.hytale-downloader-credentials.json'),
  path.join(getDownloaderExtractDir(), '.hytale-downloader-credentials.json')
];
const DOWNLOADER_URL = 'https://downloader.hytale.com/hytale-downloader.zip';
const VERSION_METADATA_FILE = 'hyportal.meta.json';
const DEFAULT_MEMORY_STEP = 2;
const DEFAULT_SERVER_SETTINGS = {
  memoryStep: DEFAULT_MEMORY_STEP,
  disableSentry: false,
  useAotCache: true
};
const cachedVersionsPath = path.join(dataDir, 'cached-versions.json');
const DEFAULT_AUTOSTART = true;
const defaultSettingsStore = {
  servers: {},
  preferences: {
    suppressLowRamWarning: false,
    suppressHighRamWarning: false,
    autostart: DEFAULT_AUTOSTART,
    includePreRelease: false,
    welcomeSeen: false,
    confirmOnClose: true,
    language: 'auto'
  }
};
const serverProcesses = new Map();
const serverProcessMeta = new Map();

const resolveResourcePath = (...segments) => {
  const candidates = [];
  if (isDev) {
    candidates.push(path.join(__dirname, '..', 'resources', ...segments));
    candidates.push(path.join(__dirname, 'resources', ...segments));
    candidates.push(path.join(process.cwd(), 'resources', ...segments));
  }
  candidates.push(path.join(process.resourcesPath, ...segments));
  candidates.push(path.join(process.resourcesPath, 'resources', ...segments));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] ?? path.join(__dirname, '..', 'resources', ...segments);
};

const MAIN_ICON_PATH =
  resolveResourcePath('logos', 'icon.ico') || resolveResourcePath('logos', 'icon.png');
const AUTH_WINDOW_ICON_PATH = resolveResourcePath('logos', 'hytale.png');

const getInstallerConfigPath = () => {
  if (process.platform === 'win32') {
    if (process.env.PROGRAMDATA) {
      return path.join(process.env.PROGRAMDATA, 'HyPortal', 'install-config.json');
    }
    return path.join(os.homedir(), 'AppData', 'Local', 'HyPortal', 'install-config.json');
  }
  return resolveResourcePath('install-config.json');
};

const installerConfigPath = getInstallerConfigPath();

const MIN_JAVA_MAJOR = 25;
const platformJavaPaths = {
  win32: ['jre', 'win-x64', 'bin', 'java.exe'],
  linux: ['jre', 'linux-x64', 'bin', 'java'],
  darwin: ['jre', 'mac-x64', 'Contents', 'Home', 'bin', 'java']
};

const getBundledJavaExecutablePath = () => {
  const segments = platformJavaPaths[process.platform];
  if (!segments) {
    throw new Error(`Unsupported platform for bundled Java runtime: ${process.platform}`);
  }
  return resolveResourcePath(...segments);
};

const normalizeJavaMajor = (value) => {
  if (!value) return null;
  const segments = value.split(/[._-]/).filter(Boolean);
  if (!segments.length) return null;
  const first = Number(segments[0]);
  if (Number.isNaN(first)) return null;
  if (first === 1 && segments.length > 1) {
    const legacy = Number(segments[1]);
    return Number.isNaN(legacy) ? null : legacy;
  }
  return first;
};

const parseJavaVersionFromOutput = (text) => {
  const match = text.match(/version\s+"?([0-9]+(?:[._-][0-9]+)*)/i);
  const version = match?.[1] || null;
  return {
    version,
    major: version ? normalizeJavaMajor(version) : null
  };
};

const probeJavaExecutable = async (executablePath, { minimumMajor = MIN_JAVA_MAJOR } = {}) =>
  new Promise((resolve) => {
    let output = '';
    let resolvedPath = executablePath;
    try {
      const child = spawn(executablePath, ['-version']);
      if (child.stdout) {
        child.stdout.on('data', (chunk) => {
          output += chunk.toString();
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          output += chunk.toString();
        });
      }
      child.on('error', (error) => {
        resolve({
          ok: false,
          path: resolvedPath,
          version: null,
          versionMajor: null,
          minimum: minimumMajor,
          reason: error.code === 'ENOENT' ? 'missing' : 'error',
          error: error.message
        });
      });
      child.on('close', (code) => {
        if (child.spawnfile && path.isAbsolute(child.spawnfile)) {
          resolvedPath = child.spawnfile;
        }
        const parsed = parseJavaVersionFromOutput(output);
        const meetsMinimum =
          typeof parsed.major === 'number' ? parsed.major >= minimumMajor : false;
        const ok = code === 0 && meetsMinimum;
        const reason = ok ? null : parsed.major != null && parsed.major < minimumMajor ? 'outdated' : code !== 0 ? 'error' : 'missing';
        resolve({
          ok,
          path: resolvedPath,
          version: parsed.version,
          versionMajor: parsed.major,
          minimum: minimumMajor,
          reason: reason || undefined,
          error: code === 0 ? null : `Exited with code ${code}`
        });
      });
    } catch (error) {
      resolve({
        ok: false,
        path: resolvedPath,
        version: null,
        versionMajor: null,
        minimum: minimumMajor,
        reason: 'error',
        error: error?.message
      });
    }
  });

const readBundledJavaMetadata = async () => {
  try {
    const javaExecutable = getBundledJavaExecutablePath();
    const metaPath = path.join(path.dirname(javaExecutable), '..', 'hyportal-jre.json');
    const raw = await fs.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.version) {
      return {
        version: parsed.version,
        versionMajor: normalizeJavaMajor(parsed.version)
      };
    }
  } catch {
    // ignore missing metadata
  }
  return { version: null, versionMajor: null };
};

const locateJavaOnPath = async () => {
  const command = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    try {
      const child = spawn(command, ['java']);
      let output = '';
      child.stdout?.on('data', (chunk) => {
        output += chunk.toString();
      });
      child.on('error', () => resolve(null));
      child.on('close', (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }
        const first = output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line);
        resolve(first || null);
      });
    } catch {
      resolve(null);
    }
  });
};

let cachedJavaRuntime = null;
const resolveJavaRuntime = async ({ force = false } = {}) => {
  if (cachedJavaRuntime && !force) return cachedJavaRuntime;
  const minimum = MIN_JAVA_MAJOR;
  const bundledPath = getBundledJavaExecutablePath();
  const bundledExists = bundledPath ? existsSync(bundledPath) : false;
  const bundledMetaPromise = bundledExists ? readBundledJavaMetadata() : Promise.resolve({ version: null, versionMajor: null });

  const seen = new Set();
  const candidates = [];
  const pushCandidate = (entry) => {
    if (!entry?.path) return;
    const key = path.normalize(entry.path.toLowerCase ? entry.path.toLowerCase() : entry.path);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(entry);
  };

  if (process.env.HYPORTAL_JAVA_PATH) {
    pushCandidate({ path: process.env.HYPORTAL_JAVA_PATH, source: 'env' });
  }

  const javaHome = process.env.JAVA_HOME || process.env.JDK_HOME;
  if (javaHome) {
    const exeName = process.platform === 'win32' ? 'java.exe' : 'java';
    pushCandidate({ path: path.join(javaHome, 'bin', exeName), source: 'java_home' });
  }

  const locatedJava = await locateJavaOnPath();
  if (locatedJava) {
    pushCandidate({ path: locatedJava, source: 'path' });
  }
  pushCandidate({ path: 'java', source: 'path' });

  let outdated = null;
  for (const candidate of candidates) {
    const probe = await probeJavaExecutable(candidate.path, { minimumMajor: minimum });
    if (probe.ok) {
      const javaHomeDir =
        probe.path && path.isAbsolute(probe.path)
          ? path.dirname(path.dirname(probe.path))
          : candidate.source === 'java_home' && javaHome
            ? javaHome
            : null;
      cachedJavaRuntime = {
        ready: true,
        path: probe.path || candidate.path,
        javaHome: javaHomeDir,
        bundled: false,
        source: candidate.source,
        version: probe.version,
        versionMajor: probe.versionMajor,
        minimum
      };
      return cachedJavaRuntime;
    }
    if (probe.versionMajor != null && probe.versionMajor < minimum) {
      outdated = {
        ready: false,
        bundled: false,
        source: candidate.source,
        version: probe.version,
        versionMajor: probe.versionMajor,
        minimum,
        reason: 'outdated',
        message: `Java ${probe.version ?? 'unknown'} detected. Java ${minimum}+ is required.`
      };
    }
  }

  if (bundledExists) {
    const metadata = await bundledMetaPromise;
    cachedJavaRuntime = {
      ready: true,
      bundled: true,
      source: 'bundled',
      path: bundledPath,
      javaHome: path.dirname(path.dirname(bundledPath)),
      version: metadata.version,
      versionMajor: metadata.versionMajor,
      minimum
    };
    return cachedJavaRuntime;
  }

  cachedJavaRuntime =
    outdated ?? {
      ready: false,
      bundled: false,
      source: null,
      version: null,
      versionMajor: null,
      minimum,
      reason: 'missing',
      message: `Java ${minimum}+ is required. Install a compatible JRE or use the build with the embedded runtime.`
    };
  return cachedJavaRuntime;
};

const ensureJavaRuntime = async () => {
  const runtime = await resolveJavaRuntime();
  if (runtime.ready) return runtime;
  const error =
    runtime.reason === 'outdated'
      ? new Error(`Java ${runtime.minimum} or newer is required.`)
      : new Error('Java runtime not found.');
  error.code = runtime.reason === 'outdated' ? 'OUTDATED_JAVA_RUNTIME' : 'MISSING_JAVA_RUNTIME';
  throw error;
};

const applyInstallerPreferences = async () => {
  if (!installerConfigPath) return;
  let raw;
  try {
    raw = await fs.readFile(installerConfigPath, 'utf-8');
  } catch {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await fs.rm(installerConfigPath, { force: true }).catch(() => {});
    return;
  }
  if (!parsed || typeof parsed !== 'object') {
    await fs.rm(installerConfigPath, { force: true }).catch(() => {});
    return;
  }
  const current = await readSettingsFile();
  const preferences = normalizePreferences(current.preferences);
  let updated = false;
  if (typeof parsed.language === 'string' && parsed.language.trim()) {
    preferences.language = parsed.language.trim();
    updated = true;
  }
  if (typeof parsed.autostart === 'boolean') {
    preferences.autostart = parsed.autostart;
    updated = true;
  }
  if (updated) {
    await updateSettingsFile({ preferences });
  }
  await fs.rm(installerConfigPath, { force: true }).catch(() => {});
};

const getRunningServersSnapshot = () => {
  const running = [];
  for (const [id] of serverProcesses.entries()) {
    const meta = serverProcessMeta.get(id);
    running.push({
      id,
      statusSince: meta?.statusSince ?? Date.now()
    });
  }
  return running;
};

const inspectDirectory = async (targetPath) => {
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      return { exists: true, isDirectory: false, empty: false };
    }
    const entries = await fs.readdir(targetPath);
    return { exists: true, isDirectory: true, empty: entries.length === 0 };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { exists: false, isDirectory: true, empty: true };
    }
    throw error;
  }
};

const copyDirectoryContents = async (source, destination) => {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryContents(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      try {
        const linkTarget = await fs.readlink(srcPath);
        await fs.symlink(linkTarget, destPath);
      } catch {
        const buffer = await fs.readFile(srcPath);
        await fs.writeFile(destPath, buffer);
      }
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
};

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const getWindowsAppDataDirs = (baseDir) => {
  const appDataDir = path.join(baseDir, 'AppData');
  return {
    appDataDir,
    roamingDir: path.join(appDataDir, 'Roaming'),
    localDir: path.join(appDataDir, 'Local')
  };
};

const isValidAuthFile = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile() || stats.size === 0) return false;
    // Avoid treating empty/whitespace files as valid.
    const sample = await fs.readFile(filePath, { encoding: 'utf-8' }).catch(() => null);
    if (typeof sample === 'string' && !sample.trim()) return false;
    return true;
  } catch {
    return false;
  }
};

const buildAuthCandidates = (serverWorkingDir) => [
  path.join(serverWorkingDir, 'auth.enc'),
  path.join(serverWorkingDir, 'auth', 'auth.enc'),
  path.join(serverWorkingDir, '.hytale', 'auth.enc')
];

const findAuthFilePath = async (serverWorkingDir) => {
  const candidates = buildAuthCandidates(serverWorkingDir);
  for (const candidate of candidates) {
    if (await isValidAuthFile(candidate)) {
      return { authFilePath: candidate, exists: true, candidates };
    }
  }
  return { authFilePath: candidates[0], exists: false, candidates };
};

const removeInvalidAuthFiles = async (candidates = []) => {
  await Promise.all(
    candidates.map(async (candidate) => {
      if (!candidate) return;
      const valid = await isValidAuthFile(candidate);
      if (!valid) {
        try {
          await fs.rm(candidate, { force: true });
        } catch {
          // ignore cleanup errors
        }
      }
    })
  );
};

const ensureBaseDirs = async () => {
  await Promise.all(
    [dataDir, downloaderDir, getDownloaderExtractDir(), serversDir, versionsDir].map((dir) => ensureDir(dir))
  );
};

const loadLegacySettings = async () => {
  let legacySettings = null;
  try {
    const contents = await fs.readFile(serverSettingsPath, 'utf-8');
    legacySettings = JSON.parse(contents);
  } catch {
    // ignore legacy settings
  }
  let legacyCache = [];
  try {
    const contents = await fs.readFile(cachedVersionsPath, 'utf-8');
    const parsed = JSON.parse(contents);
    if (Array.isArray(parsed)) {
      legacyCache = parsed;
    }
  } catch {
    legacyCache = [];
  }
  if (!legacySettings && !legacyCache.length) return null;
  const base = typeof legacySettings === 'object' && legacySettings !== null ? { ...legacySettings } : {};
  if (legacyCache.length) {
    base.cachedVersions = legacyCache;
  }
  return base;
};

const cleanupLegacySettings = async () => {
  const candidates = [serverSettingsPath, cachedVersionsPath];
  await Promise.all(
    candidates.map((candidate) =>
      fs.rm(candidate, { force: true, recursive: false }).catch(() => {
        /* ignore */
      })
    )
  );
};

const saveSettingsFile = async (data) => {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(data ?? {}, null, 2), 'utf-8');
};

const readSettingsFile = async () => {
  try {
    const contents = await fs.readFile(settingsPath, 'utf-8');
    const parsed = JSON.parse(contents);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const migrated = await loadLegacySettings();
      if (migrated) {
        await saveSettingsFile(migrated);
        await cleanupLegacySettings();
        return migrated;
      }
      return {};
    }
    return {};
  }
};

const updateSettingsFile = async (changes) => {
  const current = await readSettingsFile();
  const next = { ...current, ...changes };
  await saveSettingsFile(next);
  return next;
};

const isValidCachedEntry = (entry) =>
  entry &&
  typeof entry.id === 'string' &&
  (entry.channel === 'stable' || entry.channel === 'pre-release');

const normalizeCachedVersions = (input) => {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of input) {
    if (!isValidCachedEntry(entry)) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    normalized.push(entry);
  }
  return normalized;
};

const loadCachedVersions = async () => {
  try {
    const data = await readSettingsFile();
    return normalizeCachedVersions(data.cachedVersions);
  } catch {
    return [];
  }
};

const saveCachedVersions = async (versions) => {
  try {
    await updateSettingsFile({ cachedVersions: normalizeCachedVersions(versions) });
  } catch {
    // ignore write failures for now
  }
};

const normalizePreferences = (input = {}) => ({
  suppressLowRamWarning: Boolean(input.suppressLowRamWarning),
  suppressHighRamWarning: Boolean(input.suppressHighRamWarning),
  autostart: typeof input.autostart === 'boolean' ? input.autostart : DEFAULT_AUTOSTART,
  includePreRelease: Boolean(input.includePreRelease),
  welcomeSeen: Boolean(input.welcomeSeen),
  confirmOnClose: input.confirmOnClose !== false,
  language: typeof input.language === 'string' && input.language.trim() ? input.language.trim() : 'auto'
});

const normalizeSettingsStore = (data = {}) => {
  const servers = typeof data.servers === 'object' && data.servers !== null ? data.servers : {};
  const preferences = normalizePreferences(data.preferences);
  return { servers, preferences };
};

const loadServerSettings = async () => {
  try {
    const raw = await readSettingsFile();
    return normalizeSettingsStore(raw);
  } catch {
    return { ...defaultSettingsStore };
  }
};

const saveServerSettings = async (payload) => {
  const normalized = normalizeSettingsStore(payload);
  await updateSettingsFile({ servers: normalized.servers, preferences: normalized.preferences });
  return normalized;
};

const markWelcomeSeen = async () => {
  const current = await readSettingsFile();
  const preferences = normalizePreferences(current.preferences);
  if (!preferences.welcomeSeen) {
    preferences.welcomeSeen = true;
    await updateSettingsFile({ preferences });
  }
  return preferences;
};

const getRuntimeSettings = (store, serverId) => ({
  ...DEFAULT_SERVER_SETTINGS,
  ...(store?.servers?.[serverId] ?? {})
});

const hasDownloaderCredentials = async () => {
  for (const candidate of getDownloaderCredentialsPaths()) {
    try {
      await fs.access(candidate);
      return true;
    } catch {
      // keep checking
    }
  }
  return false;
};

const slugifyName = (input) => {
  const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'server';
};

const ensureUniqueSubfolder = async (baseDir, baseName) => {
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? baseName : `${baseName}-${suffix}`;
    const fullPath = path.join(baseDir, candidate);
    try {
      await fs.access(fullPath);
      suffix += 1;
    } catch {
      return fullPath;
    }
  }
};

const getDownloaderBinary = async () => {
  const files = getDownloaderFiles();
  const binaryPath = process.platform === 'win32' ? files.windows : files.linux;
  await fs.access(binaryPath);
  if (process.platform !== 'win32') {
    await fs.chmod(binaryPath, 0o755).catch(() => {});
  }
  return binaryPath;
};

let currentDownloaderProcess = null;
let currentDownloaderAuthSession = null;

const shouldForceVerifyPage = (url) => {
  if (!url) return false;
  const normalized = url.toLowerCase();
  if (!normalized.startsWith('https://accounts.hytale.com/settings')) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'accounts.hytale.com' && parsed.pathname.startsWith('/settings');
  } catch {
    return true;
  }
};

const createDeviceAuthWindow = ({ url, title, parent, modal = false, onClosed }) => {
  const session = {
    window: new BrowserWindow({
      width: 460,
      height: 720,
      modal,
      parent,
      title: title ?? 'Hytale login',
      resizable: false,
      minimizable: false,
      maximizable: false,
      backgroundColor: '#0b1621',
      icon: AUTH_WINDOW_ICON_PATH || undefined,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true
      }
    }),
    initialUrl: url,
    lastAuthUrl: url
  };

  session.window.setMenuBarVisibility(false);

  const reopen = () => {
    if (!session.window || session.window.isDestroyed()) return;
    const target = session.lastAuthUrl || session.initialUrl;
    if (target) {
      session.window.loadURL(target);
    }
  };

  const handleNavigationRedirect = (event, targetUrl, isMainFrame = true) => {
    if (!isMainFrame || !targetUrl) return;
    if (shouldForceVerifyPage(targetUrl)) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      reopen();
      return;
    }
    session.lastAuthUrl = targetUrl;
  };

  const { webContents } = session.window;
  webContents.on('will-redirect', (event, targetUrl) => handleNavigationRedirect(event, targetUrl, true));
  webContents.on('will-navigate', (event, targetUrl) => handleNavigationRedirect(event, targetUrl, true));
  webContents.on('did-start-navigation', (event, targetUrl, _isInPlace, isMainFrame) =>
    handleNavigationRedirect(event, targetUrl, isMainFrame !== false)
  );
  webContents.on('did-navigate-in-page', (_event, targetUrl, isMainFrame) =>
    handleNavigationRedirect(null, targetUrl, isMainFrame !== false)
  );
  webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (shouldForceVerifyPage(targetUrl)) {
      reopen();
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  session.window.on('closed', () => {
    session.window = null;
    if (typeof onClosed === 'function') {
      onClosed();
    }
  });

  if (url) {
    session.window.loadURL(url);
  }

  return {
    ...session,
    reopen,
    close: () => {
      if (session.window && !session.window.isDestroyed()) {
        session.window.close();
      }
    }
  };
};

const closeDeviceAuthWindow = (session) => {
  if (session?.window && !session.window.isDestroyed()) {
    session.window.close();
  }
};

const parseDownloaderProgress = (text) => {
  const percentMatch = text.match(/([0-9]+(?:\.[0-9]+)?)%\s*\(([^)]+)\)/);
  if (!percentMatch) return null;
  const percent = Number.parseFloat(percentMatch[1]);
  const sizeText = percentMatch[2];
  const [loadedText, totalText] = sizeText.split('/').map((part) => part?.trim());
  const parseSize = (value) => {
    const match = value?.match(/([\d.]+)\s*([A-Za-z]+)/);
    if (!match) return null;
    const num = Number.parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
    const mul = multipliers[unit] ?? 1;
    return Math.round(num * mul);
  };
  const loadedBytes = parseSize(loadedText);
  const totalBytes = parseSize(totalText);
  return { percent, loaded: loadedBytes, total: totalBytes };
};

const sendVersionProgress = (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hyportal:version-progress', payload);
  }
};

const sendServerStatus = (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hyportal:server-status', payload);
  }
};

const sendServerOutput = (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hyportal:server-output', payload);
  }
};

const sendServerAutoInput = (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hyportal:server-auto-input', payload);
  }
};

const stripAnsi = (input) => {
  if (!input) return '';
  return input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
};

// Convert carriage returns sent by the renderer into newline characters the server process expects.
const normalizeTerminalInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x7f/g, '\b');
};

const cleanupServerProcessResources = (id) => {
  const meta = serverProcessMeta.get(id);
  if (!meta) return;
  if (meta.authWindowSession) {
    closeDeviceAuthWindow(meta.authWindowSession);
  }
  serverProcessMeta.delete(id);
};

const openServerDeviceAuthWindow = (id, url) => {
  if (!url) return;
  const meta = serverProcessMeta.get(id);
  if (!meta) return;
  if (meta.authWindowSession && meta.authWindowSession.window && !meta.authWindowSession.window.isDestroyed()) {
    return;
  }
  meta.authWindowSession = createDeviceAuthWindow({
    url,
    parent: mainWindow ?? undefined,
    onClosed: () => {
      const latestMeta = serverProcessMeta.get(id);
      if (latestMeta) {
        latestMeta.authWindowSession = null;
      }
    }
  });
};

const maybeOpenServerDeviceAuthWindow = (id) => {
  const meta = serverProcessMeta.get(id);
  if (!meta || !meta.pendingVisitUrl) return;
  if (meta.authWindowSession && meta.authWindowSession.window && !meta.authWindowSession.window.isDestroyed()) return;
  let targetUrl = meta.pendingVisitUrl;
  if (!/user_code=/i.test(targetUrl)) {
    if (!meta.pendingUserCode) return;
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}user_code=${meta.pendingUserCode}`;
  }
  openServerDeviceAuthWindow(id, targetUrl);
};

const ensureServerDeviceAuthCommand = async (id, child) => {
  const meta = serverProcessMeta.get(id);
  if (!meta || meta.authCommandSent || meta.authCheckPending) return;
  if (!meta.needsDeviceAuth || !meta.authFilePath) return;
  meta.authCheckPending = true;
  let authFileExists = false;
  try {
    await fs.access(meta.authFilePath);
    authFileExists = true;
  } catch {
    authFileExists = false;
  } finally {
    meta.authCheckPending = false;
  }
  if (authFileExists || meta.authCommandSent) {
    meta.needsDeviceAuth = !authFileExists;
    return;
  }
  if (child.stdin && !child.killed) {
    try {
      child.stdin.write('/auth login device\n');
      meta.authCommandSent = true;
      sendServerAutoInput({ id, data: '/auth login device\n' });
    } catch {
      // ignore write errors
    }
  }
};

const handleServerAuthOutput = (id, child, text) => {
  if (!text) return;
  const cleaned = stripAnsi(text);
  const meta = serverProcessMeta.get(id);
  if (!meta || !meta.needsDeviceAuth) return;

  if (
    !meta.authCommandSent &&
    cleaned.includes('No server tokens configured. Use /auth login to authenticate.')
  ) {
    ensureServerDeviceAuthCommand(id, child).catch(() => {});
  }

  if (!meta.authCommandSent) return;

  if (cleaned.includes("Authentication successful! Use '/auth status' to view details.")) {
    if (meta.authWindowSession) {
      closeDeviceAuthWindow(meta.authWindowSession);
      meta.authWindowSession = null;
    }
    meta.needsDeviceAuth = false;
    meta.pendingUserCode = null;
    meta.pendingVisitUrl = null;
    if (child.stdin && !child.killed) {
      try {
        child.stdin.write('/auth persistence Encrypted\n');
        sendServerAutoInput({ id, data: '/auth persistence Encrypted\n' });
      } catch {
        // ignore write errors
      }
    }
    return;
  }

  const codeMatch = cleaned.match(/enter code:\s*([A-Za-z0-9-]+)/i);
  if (codeMatch) {
    meta.pendingUserCode = codeMatch[1];
    maybeOpenServerDeviceAuthWindow(id);
  }

  const visitMatch =
    cleaned.match(/https:\/\/oauth\.accounts\.hytale\.com\/oauth2\/device\/verify[^\s)]+/i) ||
    cleaned.match(/https:\/\/accounts\.hytale\.com\/device[^\s)]+/i);
  if (visitMatch) {
    const normalizedUrl = visitMatch[0].trim();
    meta.pendingVisitUrl = normalizedUrl;
    maybeOpenServerDeviceAuthWindow(id);
  }
};

const isPortAvailable = (port) =>
  new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '0.0.0.0');
  });

const runDownloader = async (args = [], options = {}) => {
  const { onProgress } = options;
  if (currentDownloaderProcess) {
    throw new Error('Downloader is already running a command.');
  }
  const binaryPath = await getDownloaderBinary();
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, { cwd: getDownloaderExtractDir() });
    currentDownloaderProcess = child;
    let stdout = '';
    let stderr = '';
    let authNotified = false;

    const handleAuthUrl = (text) => {
      if (authNotified) return;
      const match = text.match(/https:\/\/oauth\.accounts\.hytale\.com\/oauth2\/device\/verify\?user_code=[^\s]+/i);
      if (!match) return;
      authNotified = true;
      const authUrl = match[0];
      if (mainWindow) {
        mainWindow.webContents.send('hyportal:auth-url', { url: authUrl });
      }
      currentDownloaderAuthSession = createDeviceAuthWindow({
        url: authUrl,
        parent: mainWindow ?? undefined,
        modal: true,
        onClosed: () => {
          currentDownloaderAuthSession = null;
          if (!child.killed) {
            child.kill('SIGTERM');
          }
        }
      });
    };

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      handleAuthUrl(text);
      if (onProgress) {
        const parsed = parseDownloaderProgress(text);
        if (parsed) onProgress(parsed);
      }
    });
    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      handleAuthUrl(text);
      if (onProgress) {
        const parsed = parseDownloaderProgress(text);
        if (parsed) onProgress(parsed);
      }
    });
    child.on('error', (error) => {
      closeDeviceAuthWindow(currentDownloaderAuthSession);
      currentDownloaderAuthSession = null;
      currentDownloaderProcess = null;
      reject(error);
    });
    child.on('close', (code) => {
      closeDeviceAuthWindow(currentDownloaderAuthSession);
      currentDownloaderAuthSession = null;
      currentDownloaderProcess = null;
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Downloader exited with code ${code}`));
      }
    });
  });
};

const validateServerFiles = async (serverPath, useAotCache, versionId) => {
  const jarPath = path.join(serverPath, 'HytaleServer.jar');
  const aotPath = path.join(serverPath, 'HytaleServer.aot');
  const assetsPath = versionId ? path.join(versionsDir, versionId, 'Assets.zip') : path.join(serverPath, 'Assets.zip');

  try {
    await fs.access(jarPath);
  } catch {
    const error = new Error('MISSING_JAR');
    error.code = 'MISSING_JAR';
    throw error;
  }

  try {
    await fs.access(assetsPath);
  } catch {
    const error = new Error('MISSING_ASSETS');
    error.code = 'MISSING_ASSETS';
    throw error;
  }

  if (useAotCache !== false) {
    try {
      await fs.access(aotPath);
    } catch {
      const error = new Error('MISSING_AOT');
      error.code = 'MISSING_AOT';
      throw error;
    }
  }

  return { jarPath, assetsPath, aotPath };
};

const startServerProcess = async ({
  id,
  serverPath,
  port,
  memoryGb,
  disableSentry,
  useAotCache = true,
  versionId,
  aotFallbackAttempted = false
}) => {
  const numericPort = Number(port);
  const numericMemory = Number(memoryGb);
  if (!id || !serverPath || !numericPort || !numericMemory) {
    const error = new Error('MISSING_DATA');
    error.code = 'MISSING_DATA';
    throw error;
  }

  if (serverProcesses.has(id)) {
    const error = new Error('ALREADY_RUNNING');
    error.code = 'ALREADY_RUNNING';
    throw error;
  }

  const available = await isPortAvailable(numericPort);
  if (!available) {
    const error = new Error('PORT_IN_USE');
    error.code = 'PORT_IN_USE';
    throw error;
  }

  const serverWorkingDir = path.resolve(serverPath);
  const serverFolderName = path.basename(serverWorkingDir) || 'server';

  const { jarPath, assetsPath, aotPath } = await validateServerFiles(serverWorkingDir, useAotCache, versionId);
  const { appDataDir, roamingDir, localDir } = getWindowsAppDataDirs(serverWorkingDir);
  await Promise.all([ensureDir(serverWorkingDir), ensureDir(roamingDir), ensureDir(localDir)]);
  const { authFilePath, exists: hasAuthFile, candidates: authCandidates } = await findAuthFilePath(serverWorkingDir);
  await fs.mkdir(path.dirname(authFilePath), { recursive: true }).catch(() => {});
  serverProcessMeta.set(id, {
    needsDeviceAuth: !hasAuthFile,
    authFilePath,
    authCandidates,
    authCommandSent: false,
    authCheckPending: false,
    authWindowSession: null,
    pendingUserCode: null,
    pendingVisitUrl: null,
    statusSince: Date.now()
  });

  const args = [];
  args.push(`-Duser.dir=${serverWorkingDir}`, `-Duser.home=${serverWorkingDir}`);
  if (useAotCache !== false) {
    args.push(`-XX:AOTCache=${aotPath}`);
  }
  args.push(`-Xmx${numericMemory}G`, '-jar', jarPath, '--assets', assetsPath, '--bind', String(numericPort));
  if (disableSentry) {
    args.push('--disable-sentry');
  }

  const javaRuntime = await ensureJavaRuntime();
  const javaExecutable = javaRuntime.path;
  if (!javaExecutable) {
    const error = new Error('Java runtime not resolved.');
    error.code = 'MISSING_JAVA_RUNTIME';
    throw error;
  }
  const javaHome = javaRuntime.javaHome || (javaExecutable ? path.dirname(path.dirname(javaExecutable)) : null);

  return new Promise((resolve, reject) => {
    const child = spawn(javaExecutable, args, {
      cwd: serverWorkingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(javaHome ? { JAVA_HOME: javaHome } : {}),
        HOME: serverWorkingDir,
        USERPROFILE: serverWorkingDir
      }
    });
    let settled = false;
    let lastErrorOutput = '';

    const handleStop = (exitCode, signal, errorMessage) => {
      serverProcesses.delete(id);
      cleanupServerProcessResources(id);
      sendServerStatus({
        id,
        status: 'stopped',
        error:
          errorMessage ||
          (typeof exitCode === 'number' && exitCode !== 0
            ? `Process exited with code ${exitCode}${signal ? ` (signal ${signal})` : ''}${
                lastErrorOutput ? `\n${lastErrorOutput}` : ''
              }`
            : lastErrorOutput || undefined)
      });
    };

    child.once('spawn', () => {
      serverProcesses.set(id, child);
      sendServerStatus({ id, status: 'running' });
      if (child.stdout) {
        child.stdout.on('data', (chunk) => {
          const text = chunk.toString();
          sendServerOutput({ id, stream: 'stdout', data: text });
          handleServerAuthOutput(id, child, text);
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          const text = chunk.toString();
          lastErrorOutput = (lastErrorOutput + text).slice(-4000);
          sendServerOutput({ id, stream: 'stderr', data: text });
          handleServerAuthOutput(id, child, text);
        });
      }
      settled = true;
      resolve({ success: true });
    });

    child.once('error', (error) => {
      if (!settled) {
        reject(error);
        settled = true;
      }
      handleStop(null, null, error?.message);
    });

    child.once('exit', (code, signal) => {
      const aotErrorDetected =
        useAotCache !== false &&
        !aotFallbackAttempted &&
        typeof lastErrorOutput === 'string' &&
        lastErrorOutput.toLowerCase().includes('aotcache');
      if (aotErrorDetected) {
        serverProcesses.delete(id);
        cleanupServerProcessResources(id);
        startServerProcess({
          id,
          serverPath,
          port: numericPort,
          memoryGb: numericMemory,
          disableSentry,
          useAotCache: false,
          versionId,
          aotFallbackAttempted: true
        }).catch((error) => {
          handleStop(code, signal, error?.message || lastErrorOutput);
        });
        return;
      }
      handleStop(code, signal);
    });
  });
};

const stopServerProcess = async (id) => {
  const child = serverProcesses.get(id);
  if (!child) {
    serverProcesses.delete(id);
    cleanupServerProcessResources(id);
    sendServerStatus({ id, status: 'stopped' });
    return { success: true };
  }
  return new Promise((resolve, reject) => {
    const handleExit = () => {
      clearTimeout(forceTimer);
      serverProcesses.delete(id);
      cleanupServerProcessResources(id);
      resolve({ success: true });
    };
    child.once('exit', handleExit);
    const forceTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch (error) {
        // ignore
      }
    }, 5000);
    try {
      child.kill('SIGTERM');
    } catch (error) {
      clearTimeout(forceTimer);
      child.removeListener('exit', handleExit);
      reject(error);
    }
  });
};

const stopAllServers = async () => {
  const ids = Array.from(serverProcesses.keys());
  for (const id of ids) {
    try {
      await stopServerProcess(id);
    } catch {
      // ignore individual stop failures
    }
  }
};

const calculateDirectorySize = async (dirPath) => {
  let total = 0;
  const entries = await fs
    .readdir(dirPath, { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await calculateDirectorySize(fullPath);
    } else {
      const stats = await fs
        .stat(fullPath)
        .catch(() => null);
      if (stats) {
        total += stats.size;
      }
    }
  }
  return total;
};

const listInstalledVersions = async () => {
  await ensureDir(versionsDir);
  const entries = await fs
    .readdir(versionsDir, { withFileTypes: true })
    .catch(() => []);
  const versions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(versionsDir, entry.name);
    let stats;
    try {
      stats = await fs.stat(fullPath);
    } catch {
      continue;
    }
    let channel = 'stable';
    let installedAt = stats.mtimeMs;
    try {
      const metaRaw = await fs.readFile(path.join(fullPath, VERSION_METADATA_FILE), 'utf-8');
      const meta = JSON.parse(metaRaw);
      channel = meta.channel ?? channel;
      installedAt = meta.installedAt ? Date.parse(meta.installedAt) : installedAt;
    } catch {
      // ignore missing metadata
    }
    const sizeBytes = await calculateDirectorySize(fullPath).catch(() => 0);
    versions.push({ id: entry.name, path: fullPath, channel, installedAt, sizeBytes });
  }
  return versions;
};

let mainWindow;
let isQuitting = false;
let currentDownloadController = null;

const createWindow = () => {
  const isWindows = process.platform === 'win32';

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    minWidth: 900,
    minHeight: 540,
    maxWidth: 1580,
    maxHeight: 980,
    minimizable: true,
    maximizable: false,
    title: 'HyPortal',
    backgroundColor: '#0b1621',
    titleBarStyle: isWindows ? 'hidden' : 'default',
    titleBarOverlay: isWindows
      ? {
          color: '#0b1621',
          symbolColor: '#e6f1ff',
          height: 39
        }
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: MAIN_ICON_PATH || undefined
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    if (serverProcesses.size === 0) {
      isQuitting = true;
      app.quit();
      return;
    }
    if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('hyportal:app-close-requested');
    } else {
      isQuitting = true;
      app.quit();
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const focusOrCreateWindow = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  createWindow();
};

app.on('second-instance', () => {
  focusOrCreateWindow();
});

app.whenReady().then(async () => {
  await ensureBaseDirs();
  await applyInstallerPreferences().catch(() => {});
  createWindow();

  app.on('activate', () => {
    focusOrCreateWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  for (const child of serverProcesses.values()) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore shutdown errors
    }
  }
  serverProcesses.clear();
});

ipcMain.handle('hyportal:getTheme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('hyportal:getUserDataPath', () => app.getPath('userData'));

ipcMain.handle('hyportal:getPaths', () => ({
  dataDir,
  serversDir,
  versionsDir,
  downloaderDir
}));
const getAutostartSettings = () => app.getLoginItemSettings({ path: process.execPath });
const ensureAutostart = (enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: []
  });
  return Boolean(getAutostartSettings().openAtLogin);
};
ipcMain.handle('hyportal:getAutostart', () => Boolean(getAutostartSettings().openAtLogin));
ipcMain.handle('hyportal:setAutostart', (_event, enabled) => {
  return ensureAutostart(Boolean(enabled));
});

ipcMain.handle('hyportal:getSystemMemory', () => os.totalmem());

ipcMain.handle('hyportal:checkJavaRuntime', async () => resolveJavaRuntime({ force: true }));

ipcMain.handle('hyportal:openExternal', async (_event, url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('hyportal:loadServerSettings', async () => loadServerSettings());

ipcMain.handle('hyportal:saveServerSettings', async (_event, payload) => saveServerSettings(payload));

ipcMain.handle('hyportal:markWelcomeSeen', async () => markWelcomeSeen());

ipcMain.handle('hyportal:getRunningServers', async () => getRunningServersSnapshot());

ipcMain.handle('hyportal:stopAllServers', async () => {
  await stopAllServers().catch(() => {});
  return true;
});

ipcMain.handle('hyportal:confirmAppClose', async () => {
  isQuitting = true;
  await stopAllServers().catch(() => {});
  app.quit();
  return true;
});

ipcMain.handle('hyportal:selectDirectory', async (_event, initialPath) => {
  const result = await dialog.showOpenDialog({
    title: 'Select folder',
    defaultPath: initialPath,
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('hyportal:generateServerPath', async (_event, name) => {
  await ensureDir(serversDir);
  const slug = slugifyName(name || '');
  const fullPath = await ensureUniqueSubfolder(serversDir, slug);
  return fullPath;
});

ipcMain.handle('hyportal:isDirectoryEmpty', async (_event, payload) => {
  const targetPath = payload?.path;
  if (!targetPath) throw new Error('Missing path');
  let info = await inspectDirectory(targetPath);
  if (!info.exists) {
    try {
      await fs.mkdir(targetPath, { recursive: true });
      info = await inspectDirectory(targetPath);
    } catch (error) {
      return { empty: false, exists: false, isDirectory: false, error: error.message };
    }
  }
  return { empty: info.empty, exists: info.exists, isDirectory: info.isDirectory };
});

ipcMain.handle('hyportal:listVersions', async () => listInstalledVersions());

ipcMain.handle('hyportal:checkDownloader', async () => {
  const zipPath = getDownloaderZipPath();
  const files = getDownloaderFiles();

  const fileExists = async (p) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  };

  const extractedPresent =
    (await fileExists(files.linux)) && (await fileExists(files.windows)) && (await fileExists(files.quickstart));
  if (extractedPresent) {
    const credentials = await hasDownloaderCredentials();
    return { ready: true, exists: true, credentials, path: zipPath };
  }

  const zipExists = await fileExists(zipPath);
  if (zipExists) {
    try {
      await fs.mkdir(getDownloaderExtractDir(), { recursive: true });
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(getDownloaderExtractDir(), true);
      await fs.rm(zipPath, { force: true });
      const nowExtracted =
        (await fileExists(files.linux)) && (await fileExists(files.windows)) && (await fileExists(files.quickstart));
      const credentials = nowExtracted ? await hasDownloaderCredentials() : false;
      return { ready: nowExtracted, exists: true, credentials, path: zipPath };
    } catch {
      return { ready: false, exists: true, credentials: false, path: zipPath };
    }
  }

  return { ready: false, exists: false, credentials: false, path: zipPath };
});

const sendDownloadProgress = (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hyportal:download-progress', payload);
  }
};

const extractZipStreaming = async (zipPath, targetDir) => {
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', `Expand-Archive -Path \"${zipPath}\" -DestinationPath \"${targetDir}\" -Force`], {
        stdio: 'ignore'
      });
      ps.on('error', reject);
      ps.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Expand-Archive exited with code ${code}`));
      });
    });
  } else {
    await new Promise((resolve, reject) => {
      const unzip = spawn('unzip', ['-o', zipPath, '-d', targetDir], { stdio: 'ignore' });
      unzip.on('error', reject);
      unzip.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`unzip exited with code ${code}`));
      });
    });
  }
};

const downloadFile = async (url, targetPath, signal) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const request = https.get(url, { signal }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      const total = Number(response.headers['content-length'] || 0);
      let loaded = 0;
      const fileStream = createWriteStream(targetPath);
      sendDownloadProgress({ loaded, total });
      response.on('data', (chunk) => {
        loaded += chunk.length;
        sendDownloadProgress({ loaded, total });
      });
      response.on('error', (err) => {
        fileStream.close(async () => {
          await fs.rm(targetPath, { force: true }).catch(() => {});
          reject(err);
        });
      });
      fileStream.on('finish', () => {
        fileStream.close(() => {
          sendDownloadProgress({ loaded, total: total || loaded });
          resolve(targetPath);
        });
      });
      response.pipe(fileStream);
    });

    request.on('error', async (err) => {
      await fs.rm(targetPath, { force: true }).catch(() => {});
      reject(err);
    });

    if (signal) {
      signal.addEventListener('abort', async () => {
        request.destroy(new Error('Download aborted'));
        await fs.rm(targetPath, { force: true }).catch(() => {});
      });
    }
  });
};

ipcMain.handle('hyportal:downloadDownloader', async () => {
  if (currentDownloadController) {
    throw new Error('Download already in progress');
  }
  currentDownloadController = new AbortController();
  try {
    const zipPath = getDownloaderZipPath();
    const extractDir = getDownloaderExtractDir();
    await fs.mkdir(extractDir, { recursive: true });
    await downloadFile(DOWNLOADER_URL, zipPath, currentDownloadController.signal);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
    await fs.rm(zipPath, { force: true });

    return { path: zipPath, extractedTo: extractDir };
  } finally {
    currentDownloadController = null;
  }
});

ipcMain.handle('hyportal:cancelDownloader', async () => {
  if (currentDownloadController) {
    currentDownloadController.abort();
    currentDownloadController = null;
  }
  return true;
});

ipcMain.handle('hyportal:checkVersions', async (_event, payload) => {
  const includePreRelease = Boolean(payload?.includePreRelease);
  const tasks = [{ channel: 'stable', args: [] }];
  if (includePreRelease) {
    tasks.push({ channel: 'pre-release', args: ['-patchline', 'pre-release'] });
  }
  const results = [];
  for (const task of tasks) {
    const { stdout } = await runDownloader([...task.args, '-print-version', '-skip-update-check']);
    const version = stdout.trim();
    if (version) {
      results.push({ id: version, channel: task.channel });
    }
  }
  await saveCachedVersions(results);
  return results;
});

ipcMain.handle('hyportal:getCachedVersions', async () => {
  const cached = await loadCachedVersions();
  return cached;
});

ipcMain.handle('hyportal:downloadVersion', async (_event, payload) => {
  const { id, channel } = payload ?? {};
  if (!id) throw new Error('Missing version identifier');
  await ensureDir(versionsDir);
  const tempZip = path.join(app.getPath('temp'), `hyportal-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);
  const channelArgs = channel === 'pre-release' ? ['-patchline', 'pre-release'] : [];
  await runDownloader([...channelArgs, '-download-path', tempZip, '-skip-update-check'], {
    onProgress: (progress) => {
      const payload = {
        id,
        percent: progress.percent,
        loaded: progress.loaded,
        total: progress.total
      };
      sendVersionProgress(payload);
    }
  });
  const targetDir = path.join(versionsDir, id);
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  try {
    await extractZipStreaming(tempZip, targetDir);
  } catch {
    const zip = new AdmZip(tempZip);
    zip.extractAllTo(targetDir, true);
  } finally {
    await fs.rm(tempZip, { force: true });
  }
  const metadata = {
    id,
    channel: channel ?? 'stable',
    installedAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(targetDir, VERSION_METADATA_FILE), JSON.stringify(metadata, null, 2), 'utf-8');
  const installed = await listInstalledVersions();
  return { installed };
});

ipcMain.handle('hyportal:deleteVersion', async (_event, payload) => {
  const { id } = payload ?? {};
  if (!id) throw new Error('Missing version identifier');
  const targetDir = path.join(versionsDir, id);
  await fs.rm(targetDir, { recursive: true, force: true });
  const installed = await listInstalledVersions();
  return { installed };
});

ipcMain.handle('hyportal:createServerFromVersion', async (_event, payload) => {
  const { versionId, targetPath } = payload ?? {};
  if (!versionId || !targetPath) throw new Error('Missing data');
  const templateDir = path.join(versionsDir, versionId, 'Server');
  const templateInfo = await inspectDirectory(templateDir);
  if (!templateInfo.exists || !templateInfo.isDirectory) {
    const error = new Error('MISSING_TEMPLATE');
    error.code = 'MISSING_TEMPLATE';
    throw error;
  }
  const targetInfo = await inspectDirectory(targetPath);
  if (targetInfo.exists && !targetInfo.isDirectory) {
    const error = new Error('TARGET_NOT_DIRECTORY');
    error.code = 'TARGET_NOT_DIRECTORY';
    throw error;
  }
  if (!targetInfo.empty) {
    const error = new Error('TARGET_NOT_EMPTY');
    error.code = 'TARGET_NOT_EMPTY';
    throw error;
  }
  await fs.mkdir(targetPath, { recursive: true });
  await copyDirectoryContents(templateDir, targetPath);
  return { success: true };
});

ipcMain.handle('hyportal:startServer', async (_event, payload) => {
  const { id, path: serverPath, port, memoryGb, disableSentry, useAotCache, versionId } = payload ?? {};
  return startServerProcess({ id, serverPath, port, memoryGb, disableSentry, useAotCache, versionId });
});

ipcMain.handle('hyportal:stopServer', async (_event, payload) => {
  const { id } = payload ?? {};
  if (!id) {
    const error = new Error('MISSING_ID');
    error.code = 'MISSING_ID';
    throw error;
  }
  return stopServerProcess(id);
});

ipcMain.handle('hyportal:writeServerInput', async (_event, payload) => {
  const { id, data } = payload ?? {};
  if (!id || typeof data !== 'string') return false;
  const child = serverProcesses.get(id);
  if (child && child.stdin && !child.killed) {
    try {
      const normalized = normalizeTerminalInput(data);
      child.stdin.write(normalized);
      return true;
    } catch {
      return false;
    }
  }
  return false;
});

ipcMain.handle('hyportal:deleteServerDirectory', async (_event, payload) => {
  const targetPath = payload?.path;
  if (!targetPath) throw new Error('Missing path');
  await fs.rm(targetPath, { recursive: true, force: true });
  return { success: true };
});

ipcMain.handle('hyportal:authenticateDownloader', async () => {
  const alreadyAuthed = await hasDownloaderCredentials();
  if (alreadyAuthed) return { credentials: true };
  await runDownloader(['-print-version', '-skip-update-check']);
  const authed = await hasDownloaderCredentials();
  return { credentials: authed };
});

ipcMain.handle('hyportal:cancelDownloaderProcess', async () => {
  closeDeviceAuthWindow(currentDownloaderAuthSession);
  currentDownloaderAuthSession = null;
  if (currentDownloaderProcess) {
    currentDownloaderProcess.kill('SIGTERM');
    currentDownloaderProcess = null;
  }
  return true;
});

ipcMain.handle('hyportal:loadServers', async () => {
  const userPath = getUserDataServersPath();
  try {
    await fs.mkdir(path.dirname(userPath), { recursive: true });
    const legacyExists = await fs
      .access(legacyServersPath)
      .then(() => true)
      .catch(() => false);
    const newExists = await fs
      .access(userPath)
      .then(() => true)
      .catch(() => false);
    if (legacyExists && !newExists) {
      await fs.copyFile(legacyServersPath, userPath);
    }
  } catch {
    // ignore migration errors
  }
  try {
    const contents = await fs.readFile(userPath, 'utf-8');
    return JSON.parse(contents);
  } catch {
    // fall through to bundled data
  }

  try {
    const bundled = await fs.readFile(getBundledServersPath(), 'utf-8');
    const parsed = JSON.parse(bundled);
    await fs.mkdir(path.dirname(userPath), { recursive: true });
    await fs.writeFile(userPath, JSON.stringify(parsed, null, 2), 'utf-8');
    return parsed;
  } catch {
    return [];
  }
});

ipcMain.handle('hyportal:saveServers', async (_event, payload) => {
  const userPath = getUserDataServersPath();
  try {
    await fs.mkdir(path.dirname(userPath), { recursive: true });
    await fs.writeFile(userPath, JSON.stringify(payload, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save servers.json', error);
    throw error;
  }
});

app.whenReady().then(() => {
  console.log('HyPortal userData path:', app.getPath('userData'));
});
