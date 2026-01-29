import React, { useCallback, useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  faAngleLeft,
  faCodeBranch,
  faCirclePlay,
  faCircleStop,
  faDownload,
  faGear,
  faPlus,
  faServer
} from '@fortawesome/free-solid-svg-icons';
import AppShell from './components/layout/AppShell/AppShell';
import Sidebar from './components/layout/Sidebar/Sidebar';
import HeroPanel from './components/servers/HeroPanel';
import Section from './components/common/Section/Section';
import Button from './components/common/Button/Button';
import TerminalPanel from './components/terminal/TerminalPanel';
import ServerCard, { type Server, type ImageAsset } from './components/servers/ServerCard';
import VersionCard, { type Version } from './components/versions/VersionCard';
import SettingsPanel from './components/settings/SettingsPanel';
import TitleBar from './components/layout/TitleBar/TitleBar';
import ServerDetail from './components/servers/ServerDetail';
import Modal from './components/common/Modal/Modal';
import ServerForm, { type ServerFormValues } from './components/servers/ServerForm';
import ToggleSwitch from './components/common/ToggleSwitch/ToggleSwitch';
import Card from './components/common/Card/Card';
import BlockingOverlay from './components/common/BlockingOverlay/BlockingOverlay';
import { DEFAULT_MEMORY_STEP, LOW_MEMORY_STEP, clampMemoryStep, memoryLabel, memoryStepToGb } from './utils/serverSettings';
import './App.scss';
import WelcomeScreen from './components/welcome/WelcomeScreen';

const sidebarLogoSrc = './logos/icon.png';

type StoredServer = (Omit<Server, 'statusSince'> & Partial<Pick<Server, 'statusSince'>>) & { createdAt?: string };

type CheckedVersion = {
  id: string;
  channel: 'stable' | 'pre-release';
};

declare global {
  interface Window {
    hyportal?: {
      getTheme: () => Promise<string>;
      loadServers: () => Promise<StoredServer[]>;
      saveServers: (servers: StoredServer[]) => Promise<void>;
      getPaths: () => Promise<AppPaths>;
      generateServerPath: (name: string) => Promise<string>;
      selectDirectory: (initialPath?: string) => Promise<string | null>;
      isDirectoryEmpty: (payload: { path: string }) => Promise<{ empty: boolean; exists: boolean; isDirectory: boolean }>;
      listVersions: () => Promise<InstalledVersion[]>;
      checkVersions: (payload: { includePreRelease: boolean }) => Promise<Array<{ id: string; channel: 'stable' | 'pre-release' }>>;
      getSystemMemory: () => Promise<number>;
      checkJavaRuntime: () => Promise<JavaRuntimeCheck>;
      openExternal: (url: string) => Promise<boolean>;
      getCachedVersions: () => Promise<CheckedVersion[]>;
      downloadVersion: (payload: { id: string; channel: 'stable' | 'pre-release' }) => Promise<{ installed: InstalledVersion[] }>;
      createServerFromVersion: (payload: { versionId: string; targetPath: string }) => Promise<{ success: boolean }>;
      deleteServerDirectory: (payload: { path: string }) => Promise<{ success: boolean }>;
      deleteVersion: (payload: { id: string }) => Promise<{ installed: InstalledVersion[] }>;
      checkDownloader: () => Promise<{ ready: boolean; exists?: boolean; credentials?: boolean }>;
      downloadDownloader: () => Promise<{ path: string; extractedTo?: string }>;
      cancelDownloader: () => Promise<boolean>;
      getUserDataPath: () => Promise<string>;
      authenticateDownloader: () => Promise<{ credentials: boolean }>;
      cancelDownloaderProcess: () => Promise<boolean>;
      loadServerSettings: () => Promise<ServerSettingsStore>;
      saveServerSettings: (settings: ServerSettingsStore) => Promise<ServerSettingsStore>;
      markWelcomeSeen: () => Promise<void>;
      getRunningServers: () => Promise<Array<{ id: string; statusSince?: number }>>;
      stopAllServers: () => Promise<void>;
      confirmAppClose: () => Promise<void>;
      onAppCloseRequested?: (callback: () => void) => () => void;
      startServer: (payload: { id: string; path: string; port: number; memoryGb: number; disableSentry?: boolean; useAotCache?: boolean; versionId?: string }) => Promise<{ success: boolean }>;
      stopServer: (payload: { id: string }) => Promise<{ success: boolean }>;
      writeServerInput: (payload: { id: string; data: string }) => Promise<boolean>;
      getAutostart: () => Promise<boolean>;
      setAutostart: (enabled: boolean) => Promise<boolean>;
      onAuthUrl?: (callback: (payload: { url: string }) => void) => () => void;
      onDownloadProgress?: (callback: (payload: { loaded: number; total: number }) => void) => () => void;
      onVersionProgress?: (callback: (payload: { id: string; percent?: number; loaded?: number; total?: number }) => void) => () => void;
      onServerStatus?: (callback: (payload: { id: string; status: Server['status']; error?: string }) => void) => () => void;
      onServerOutput?: (callback: (payload: { id: string; data: string; stream?: 'stdout' | 'stderr' }) => void) => () => void;
      onServerAutoInput?: (callback: (payload: { id: string; data: string }) => void) => () => void;
    };
  }
}

type Tab = 'servers' | 'versions' | 'settings';

type ModalState =
  | { mode: 'create'; open: true }
  | { mode: 'delete'; open: true; targetId: string }
  | { open: false };

type InstalledVersion = {
  id: string;
  path: string;
  channel?: 'stable' | 'pre-release' | 'unknown';
  installedAt?: number;
  sizeBytes?: number;
};

type AvailableDownload = {
  id: string;
  channel: 'stable' | 'pre-release';
  status: 'idle' | 'pending' | 'error' | 'cancelling';
  progress?: number | null;
};

type AppPaths = {
  dataDir: string;
  serversDir: string;
  versionsDir: string;
  downloaderDir: string;
};

type JavaRuntimeCheck = {
  ready: boolean;
  bundled?: boolean;
  source?: string | null;
  path?: string | null;
  javaHome?: string | null;
  version?: string | null;
  versionMajor?: number | null;
  minimum: number;
  reason?: 'missing' | 'outdated' | 'error';
  message?: string | null;
};

type DownloaderStatus = 'checking' | 'missing' | 'auth' | 'ready';

type VersionDeleteState =
  | { mode: 'idle' }
  | { mode: 'blocked'; version: InstalledVersion; servers: string[] }
  | { mode: 'confirm'; version: InstalledVersion };

type ServerRuntimeSettings = {
  memoryStep: number;
  disableSentry: boolean;
  useAotCache: boolean;
};

type ServerSettingsStore = {
  servers: Record<string, ServerRuntimeSettings>;
  preferences: {
    suppressLowRamWarning?: boolean;
    suppressHighRamWarning?: boolean;
    autostart?: boolean;
    includePreRelease?: boolean;
    welcomeSeen?: boolean;
    confirmOnClose?: boolean;
    language?: string;
  };
};

const AVAILABLE_VERSIONS = ['0.18.0-beta', '0.17.3', '0.17.0'];
const TERMINAL_HISTORY_LIMIT = 64 * 1024;
const defaultRuntimeSettings: ServerRuntimeSettings = {
  memoryStep: DEFAULT_MEMORY_STEP,
  disableSentry: false,
  useAotCache: false
};
const DEFAULT_AUTOSTART = true;
const defaultSettingsStore: ServerSettingsStore = {
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
const normalizeSettingsStore = (input?: Partial<ServerSettingsStore>): ServerSettingsStore => {
  const servers = input?.servers && typeof input.servers === 'object' ? input.servers : {};
  const preferencesInput =
    input?.preferences && typeof input.preferences === 'object' ? input.preferences : {};
  return {
    servers,
    preferences: {
      suppressLowRamWarning: Boolean(preferencesInput.suppressLowRamWarning),
      suppressHighRamWarning: Boolean(preferencesInput.suppressHighRamWarning),
      autostart:
        typeof preferencesInput.autostart === 'boolean'
          ? preferencesInput.autostart
          : DEFAULT_AUTOSTART,
      includePreRelease: Boolean(preferencesInput.includePreRelease),
      welcomeSeen: Boolean(preferencesInput.welcomeSeen),
      confirmOnClose: preferencesInput.confirmOnClose !== false,
      language:
        typeof preferencesInput.language === 'string' && preferencesInput.language.trim()
          ? preferencesInput.language.trim()
          : 'auto'
    }
  };
};

const hydrateServer = (srv: StoredServer): Server => {
  const parsedCreatedAt = srv.createdAt ? Date.parse(srv.createdAt) : NaN;
  const statusSince = srv.statusSince ?? (Number.isNaN(parsedCreatedAt) ? Date.now() : parsedCreatedAt);
  return {
    ...srv,
    imageKey: srv.imageKey || 'Rock_Cobblestone_Mossy',
    statusSince
  };
};

const formatFileSize = (bytes?: number | null) => {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const parseVersionIdentifier = (value: string) => {
  const [core, preRelease] = (value || '').split('-', 2);
  const numericParts = core
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((num) => (Number.isNaN(num) ? 0 : num));
  return {
    parts: numericParts,
    preRelease: preRelease || null
  };
};

const compareVersionIds = (a: string, b: string) => {
  const parsedA = parseVersionIdentifier(a);
  const parsedB = parseVersionIdentifier(b);
  const maxLength = Math.max(parsedA.parts.length, parsedB.parts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const partA = parsedA.parts[index] ?? 0;
    const partB = parsedB.parts[index] ?? 0;
    if (partA !== partB) {
      return partA - partB;
    }
  }
  if (parsedA.preRelease && !parsedB.preRelease) return -1;
  if (!parsedA.preRelease && parsedB.preRelease) return 1;
  if (parsedA.preRelease && parsedB.preRelease) {
    return parsedA.preRelease.localeCompare(parsedB.preRelease);
  }
  return 0;
};

const findHighestVersionId = (versions: CheckedVersion[], filter?: (entry: CheckedVersion) => boolean) => {
  let best: string | null = null;
  for (const entry of versions) {
    if (!entry || typeof entry.id !== 'string') continue;
    if (filter && !filter(entry)) continue;
    const candidate = entry.id;
    if (!candidate) continue;
    if (!best || compareVersionIds(candidate, best) > 0) {
      best = candidate;
    }
  }
  return best;
};

const isStableVersionString = (value: string) => parseVersionIdentifier(value).preRelease === null;
const BYTES_PER_GB = 1024 ** 3;
const SUPPORTED_LANGUAGES = ['de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'ru', 'zh'];
const REQUIRED_JAVA_MAJOR = 25;
const JAVA_DOWNLOAD_URL = 'https://www.oracle.com/java/technologies/downloads/#java25';
const EMBEDDED_RELEASE_URL = 'https://github.com/xavi-burgos99/hyportal/releases/latest';

const resolveLanguagePreference = (preference?: string): string => {
  const normalized = (preference || 'auto').toLowerCase();
  const pickSystem = () => {
    if (typeof navigator === 'undefined') return 'en';
    const candidates: string[] = [];
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
    for (const lang of candidates) {
      const value = (lang || '').toLowerCase();
      if (!value) continue;
      if (SUPPORTED_LANGUAGES.includes(value)) return value;
      const short = value.split('-')[0];
      if (SUPPORTED_LANGUAGES.includes(short)) return short;
    }
    return 'en';
  };

  if (normalized === 'auto') {
    return pickSystem();
  }
  if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
  const short = normalized.split('-')[0];
  if (SUPPORTED_LANGUAGES.includes(short)) return short;
  return 'en';
};

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('servers');
  const [languagePreference, setLanguagePreference] = useState<string>('auto');
  const [language, setLanguage] = useState<string>(resolveLanguagePreference('auto'));
  const [autostart, setAutostart] = useState<boolean>(() => defaultSettingsStore.preferences.autostart ?? DEFAULT_AUTOSTART);
  const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');
  const [servers, setServers] = useState<Server[]>([]);
  const [serversLoaded, setServersLoaded] = useState<boolean>(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [serverView, setServerView] = useState<'list' | 'detail'>('list');
  const [isEditingDetail, setIsEditingDetail] = useState<boolean>(false);
  const [editDraft, setEditDraft] = useState<Server | null>(null);
  const [javaStatus, setJavaStatus] = useState<'checking' | 'ready' | 'missing' | 'outdated' | 'error'>('checking');
  const [javaRuntime, setJavaRuntime] = useState<JavaRuntimeCheck | null>(null);
  const [downloaderStatus, setDownloaderStatus] = useState<DownloaderStatus>('checking');
  const [appPaths, setAppPaths] = useState<AppPaths | null>(null);
  const [terminalRefreshToken, setTerminalRefreshToken] = useState(0);
  const [installedVersions, setInstalledVersions] = useState<InstalledVersion[]>([]);
  const [availableDownloads, setAvailableDownloads] = useState<AvailableDownload[]>([]);
  const [cachedVersions, setCachedVersions] = useState<CheckedVersion[]>([]);
  const [includePreRelease, setIncludePreRelease] = useState<boolean>(
    () => defaultSettingsStore.preferences.includePreRelease ?? false
  );
  const [checkingVersions, setCheckingVersions] = useState<boolean>(false);
  const [blocking, setBlocking] = useState<{ active: true; message: string; onCancel?: () => void } | { active: false }>({
    active: false
  });
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [downloadButtonWidth, setDownloadButtonWidth] = useState<number | null>(null);
  const downloadButtonRef = useRef<HTMLButtonElement | null>(null);
  const [downloadPhase, setDownloadPhase] = useState<'idle' | 'downloading'>('idle');
  const [versionDeleteState, setVersionDeleteState] = useState<VersionDeleteState>({ mode: 'idle' });
  const [versionDeleting, setVersionDeleting] = useState<boolean>(false);
  const cancelledVersionDownloadsRef = useRef<Set<string>>(new Set());
  const [versionRequirementModalOpen, setVersionRequirementModalOpen] = useState<boolean>(false);
  const [deleteCountdown, setDeleteCountdown] = useState<number>(5);
  const [serverSettings, setServerSettings] = useState<ServerSettingsStore>(defaultSettingsStore);
  const [serverSettingsLoaded, setServerSettingsLoaded] = useState<boolean>(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const finishWelcomePendingRef = useRef(false);
  const [runtimeDraft, setRuntimeDraft] = useState<ServerRuntimeSettings | null>(null);
  const [lowMemoryModalOpen, setLowMemoryModalOpen] = useState<boolean>(false);
  const [highMemoryModalOpen, setHighMemoryModalOpen] = useState<boolean>(false);
  const [portInUseModal, setPortInUseModal] = useState<{ open: boolean; port?: number; serverName?: string }>({
    open: false
  });
  const [serverActionError, setServerActionError] = useState<string | null>(null);
  const [terminalErrorModal, setTerminalErrorModal] = useState<{ open: boolean; message?: string }>({ open: false });
  const [serverProcessErrorModal, setServerProcessErrorModal] = useState<{ open: boolean; message?: string }>({ open: false });
  const [closeAppModalOpen, setCloseAppModalOpen] = useState(false);
  const [shutdownModalOpen, setShutdownModalOpen] = useState(false);
  const shuttingDownRef = useRef(false);
  const [serverStatusChanging, setServerStatusChanging] = useState<Record<string, boolean>>({});
  const manualStopPendingRef = useRef<Set<string>>(new Set());
  const [systemMemoryBytes, setSystemMemoryBytes] = useState<number | null>(null);
  const manualStopSuppressionRef = useRef<Record<string, number>>({});
  const runningServersRef = useRef<Set<string>>(new Set());
  const autoRestartQueuedRef = useRef<Set<string>>(new Set());
  const [runningSyncReadyFlag, setRunningSyncReadyFlag] = useState(false);
  const MANUAL_STOP_SUPPRESSION_MS = 2000;

  const clearManualStopSuppression = React.useCallback((id: string) => {
    const timer = manualStopSuppressionRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete manualStopSuppressionRef.current[id];
    }
  }, []);

  const suppressManualStopError = React.useCallback(
    (id: string) => {
      clearManualStopSuppression(id);
      manualStopSuppressionRef.current[id] = window.setTimeout(() => {
        delete manualStopSuppressionRef.current[id];
      }, MANUAL_STOP_SUPPRESSION_MS);
    },
    [clearManualStopSuppression]
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('welcome', welcomeVisible);
    return () => {
      document.body.classList.remove('welcome');
    };
  }, [welcomeVisible]);
  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null;
  const detailViewActive = activeTab === 'servers' && serverView === 'detail' && Boolean(selectedServer);
  const detailViewRef = React.useRef<HTMLDivElement | null>(null);
  const prevDetailActiveRef = React.useRef(false);
  React.useEffect(() => {
    const wasActive = prevDetailActiveRef.current;
    prevDetailActiveRef.current = detailViewActive;
    if (!detailViewActive) return;

    const element = detailViewRef.current;
    let triggered = false;
    const triggerRefresh = () => {
      if (triggered) return;
      triggered = true;
      setTerminalRefreshToken((prev) => prev + 1);
    };

    if (wasActive) {
      triggerRefresh();
      return;
    }

    if (!element) {
      triggerRefresh();
      return;
    }

    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== element) return;
      triggerRefresh();
    };
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== element) return;
      triggerRefresh();
    };
    element.addEventListener('transitionend', handleTransitionEnd);
    element.addEventListener('animationend', handleAnimationEnd);
    const fallbackTimer = window.setTimeout(triggerRefresh, 400);
    return () => {
      element.removeEventListener('transitionend', handleTransitionEnd);
      element.removeEventListener('animationend', handleAnimationEnd);
      window.clearTimeout(fallbackTimer);
    };
  }, [detailViewActive, selectedServerId]);

  React.useEffect(() => {
    const handleResize = () => setTerminalRefreshToken((prev) => prev + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    setIncludePreRelease(
      serverSettings.preferences.includePreRelease ?? defaultSettingsStore.preferences.includePreRelease ?? false
    );
  }, [serverSettings.preferences.includePreRelease]);
  const getRuntimeSettings = React.useCallback(
    (id: string | null) => {
      if (!id) return { ...defaultRuntimeSettings };
      return { ...defaultRuntimeSettings, ...(serverSettings.servers[id] ?? {}) };
    },
    [serverSettings]
  );
  const selectedRuntimeSettings = selectedServer ? getRuntimeSettings(selectedServer.id) : null;
  const combinedVersionSources = React.useMemo(() => {
    const copy = [...cachedVersions];
    const seen = new Set(copy.map((entry) => entry.id));
    installedVersions.forEach((version) => {
      if (!version?.id) return;
      if (seen.has(version.id)) return;
      const channel = version.channel === 'pre-release' ? 'pre-release' : 'stable';
      copy.push({ id: version.id, channel });
      seen.add(version.id);
    });
    return copy;
  }, [cachedVersions, installedVersions]);
  const highestStableVersion = React.useMemo(
    () => findHighestVersionId(combinedVersionSources, (entry) => entry.channel === 'stable'),
    [combinedVersionSources]
  );
  const highestAnyVersion = React.useMemo(
    () => findHighestVersionId(combinedVersionSources),
    [combinedVersionSources]
  );
  const hasNewVersion = React.useCallback(
    (server: Server) => {
      if (!server.version) return false;
      const target = isStableVersionString(server.version) ? highestStableVersion : highestAnyVersion;
      return typeof target === 'string' && compareVersionIds(target, server.version) > 0;
    },
    [highestAnyVersion, highestStableVersion]
  );
  const serverLogsRef = React.useRef<Record<string, string>>({});
  const getServerLog = React.useCallback(
    (id: string | null) => (id ? serverLogsRef.current[id] ?? '' : ''),
    []
  );
  React.useEffect(() => {
    const handleOutput = (payload: { id: string; data: string }) => {
      if (!payload?.id) return;
      const data = payload.data ?? '';
      if (!data) return;
      const logs = serverLogsRef.current;
      const previous = logs[payload.id] ?? '';
      const combined = `${previous}${data}`;
      logs[payload.id] =
        combined.length > TERMINAL_HISTORY_LIMIT ? combined.slice(-TERMINAL_HISTORY_LIMIT) : combined;
    };
    const unsubscribe = window.hyportal?.onServerOutput?.(handleOutput);
    return () => {
      unsubscribe?.();
    };
  }, []);
  const updateRuntimeSettings = (id: string, changes: Partial<ServerRuntimeSettings>) => {
    setServerSettings((prev) => ({
      ...prev,
      servers: {
        ...prev.servers,
        [id]: {
          ...defaultRuntimeSettings,
          ...(prev.servers[id] ?? {}),
          ...changes
        }
      }
    }));
  };
  const removeRuntimeSettings = (id: string) => {
    setServerSettings((prev) => {
      if (!prev.servers[id]) return prev;
      const next = { ...prev.servers };
      delete next[id];
      return { ...prev, servers: next };
    });
  };
  const handleIncludePreReleaseToggle = useCallback((value: boolean) => {
    setIncludePreRelease(value);
    setServerSettings((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, includePreRelease: value }
    }));
  }, [setServerSettings]);
  const handleGeneratePath = useCallback((name: string) => {
    return window.hyportal?.generateServerPath?.(name) ?? Promise.resolve('');
  }, []);
  const handleBrowsePath = useCallback(() => {
    return window.hyportal?.selectDirectory?.(appPaths?.serversDir) ?? Promise.resolve(null);
  }, [appPaths?.serversDir]);
  const handleLanguageChange = useCallback((value: string) => {
    const pref = value && value.trim() ? value.trim() : 'auto';
    setLanguagePreference(pref);
    setLanguage(resolveLanguagePreference(pref));
    setServerSettings((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, language: pref }
    }));
  }, [setServerSettings]);
  const handleConfirmOnCloseToggle = useCallback((value: boolean) => {
    setServerSettings((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, confirmOnClose: value }
    }));
  }, []);
  const handleFinishWelcome = useCallback(() => {
    const waitingForSettings = !serverSettingsLoaded;
    const alreadySeen = Boolean(serverSettings.preferences.welcomeSeen);
    finishWelcomePendingRef.current = waitingForSettings;
    setWelcomeVisible(false);
    setServerSettings((prev) => {
      if (prev.preferences.welcomeSeen) return prev;
      const next = {
        ...prev,
        preferences: { ...prev.preferences, welcomeSeen: true }
      };
      if (!waitingForSettings) {
        window.hyportal?.saveServerSettings?.(next).catch(() => {});
      }
      return next;
    });
    if (!alreadySeen) {
      window.hyportal?.markWelcomeSeen?.().catch(() => {});
    }
  }, [serverSettings.preferences.welcomeSeen, serverSettingsLoaded]);
  const lowMemoryWarningDismissed = Boolean(serverSettings.preferences?.suppressLowRamWarning);
  const highMemoryWarningDismissed = Boolean(serverSettings.preferences?.suppressHighRamWarning);
  const confirmOnCloseEnabled = serverSettings.preferences?.confirmOnClose !== false;

  useEffect(() => {
    if (!serverSettingsLoaded) return;
    const pref = serverSettings.preferences?.language || 'auto';
    setLanguagePreference(pref);
    setLanguage(resolveLanguagePreference(pref));
    setWelcomeVisible(!Boolean(serverSettings.preferences?.welcomeSeen));
  }, [serverSettingsLoaded, serverSettings.preferences?.welcomeSeen, serverSettings.preferences?.language]);

  const sidebarItems = useMemo(
    () => [
      { id: 'servers', label: t('nav.servers'), icon: faServer },
      { id: 'versions', label: t('nav.versions'), icon: faCodeBranch },
      { id: 'settings', label: t('nav.settings'), icon: faGear }
    ],
    [t]
  );
  const languageOptions = useMemo(
    () => [
      { value: 'auto', label: t('settings.languageAuto', { defaultValue: 'Automatic' }) },
      { value: 'de', label: 'Deutsch' },
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Español' },
      { value: 'fr', label: 'Français' },
      { value: 'it', label: 'Italiano' },
      { value: 'ja', label: '日本語' },
      { value: 'pt', label: 'Português' },
      { value: 'ru', label: 'Русский' },
      { value: 'zh', label: '中文' }
    ],
    [t]
  );

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language, i18n]);

  useEffect(() => {
    const fallbackTheme = 'dark';
    const applyTheme = (value: string) => document.documentElement.setAttribute('data-theme', value);

    window.hyportal
      ?.getTheme()
      .then(applyTheme)
      .catch(() => applyTheme(fallbackTheme));
  }, []);

  useEffect(() => {
    fetch('images/manifest.json')
      .then((res) => res.json())
      .then((data: ImageAsset[]) => setImages(data))
      .catch(() =>
        setImages([
          {
            key: 'Rock_Cobblestone_Mossy',
            src: 'images/blocks/Rock_Cobblestone_Mossy.png',
            label: 'Mossy Cobblestone'
          }
        ])
      );
  }, []);

  useEffect(() => {
    if (!window.hyportal?.getPaths) return;
    window.hyportal
      .getPaths()
      .then((paths) => setAppPaths(paths))
      .catch(() => setAppPaths(null));
  }, []);

  React.useEffect(() => {
    setAutostart(serverSettings.preferences.autostart ?? DEFAULT_AUTOSTART);
  }, [serverSettings.preferences.autostart]);

  React.useEffect(() => {
    let mounted = true;
    const loadAutostart = async () => {
      if (!window.hyportal?.getAutostart) return;
      try {
        const enabled = await window.hyportal.getAutostart();
        if (mounted && typeof enabled === 'boolean') {
          setAutostart(enabled);
        }
      } catch {
        // ignore
      }
    };
    loadAutostart();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadMemory = async () => {
      if (!window.hyportal?.getSystemMemory) return;
      try {
        const total = await window.hyportal.getSystemMemory();
        if (mounted && typeof total === 'number' && total > 0) {
          setSystemMemoryBytes(total);
        }
      } catch {
        // ignore memory detection failures
      }
    };
    loadMemory();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadCache = async () => {
      if (!window.hyportal?.getCachedVersions) return;
      try {
        const versions = await window.hyportal.getCachedVersions();
        if (!mounted || !Array.isArray(versions)) return;
        setCachedVersions(
          versions.filter(
            (entry) =>
              entry &&
              typeof entry.id === 'string' &&
              (entry.channel === 'stable' || entry.channel === 'pre-release')
          )
        );
      } catch {
        // ignore cache loading failures
      }
    };
    loadCache();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      if (!window.hyportal?.loadServerSettings) {
        if (!cancelled) {
          setServerSettings(defaultSettingsStore);
          setServerSettingsLoaded(true);
        }
        return;
      }
      try {
        const loaded = await window.hyportal.loadServerSettings();
        if (!cancelled) {
          const normalized = normalizeSettingsStore(loaded);
          if (finishWelcomePendingRef.current) {
            normalized.preferences.welcomeSeen = true;
            finishWelcomePendingRef.current = false;
          }
          setServerSettings(normalized);
          setServerSettingsLoaded(true);
        }
      } catch {
        if (!cancelled) {
          const fallback = { ...defaultSettingsStore };
          if (finishWelcomePendingRef.current) {
            fallback.preferences.welcomeSeen = true;
            finishWelcomePendingRef.current = false;
          }
          setServerSettings(fallback);
          setServerSettingsLoaded(true);
        }
      }
    };
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshJavaStatus = React.useCallback(async () => {
    if (!window.hyportal?.checkJavaRuntime) {
      const fallback: JavaRuntimeCheck = {
        ready: true,
        bundled: false,
        source: 'unknown',
        path: null,
        javaHome: null,
        version: null,
        versionMajor: null,
        minimum: REQUIRED_JAVA_MAJOR
      };
      setJavaRuntime(fallback);
      setJavaStatus('ready');
      return;
    }
    try {
      const result = await window.hyportal.checkJavaRuntime();
      const normalized: JavaRuntimeCheck = {
        ready: Boolean(result?.ready),
        bundled: Boolean(result?.bundled),
        source: result?.source ?? null,
        path: result?.path ?? null,
        javaHome: result?.javaHome ?? null,
        version: result?.version ?? null,
        versionMajor: typeof result?.versionMajor === 'number' ? result.versionMajor : null,
        minimum: result?.minimum ?? REQUIRED_JAVA_MAJOR,
        reason: result?.reason,
        message: result?.message ?? null
      };
      setJavaRuntime(normalized);
      if (normalized.ready) {
        setJavaStatus('ready');
      } else if (normalized.reason === 'outdated') {
        setJavaStatus('outdated');
      } else if (normalized.reason === 'error') {
        setJavaStatus('error');
      } else {
        setJavaStatus('missing');
      }
    } catch (error) {
      setJavaRuntime({
        ready: false,
        bundled: false,
        source: 'unknown',
        path: null,
        javaHome: null,
        version: null,
        versionMajor: null,
        minimum: REQUIRED_JAVA_MAJOR,
        reason: 'error',
        message: (error as Error)?.message ?? null
      });
      setJavaStatus('error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refreshJavaStatus();
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshJavaStatus]);

  const refreshDownloaderStatus = React.useCallback(async () => {
    if (!window.hyportal?.checkDownloader) {
      setDownloaderStatus('ready');
      return;
    }
    try {
      const result = await window.hyportal.checkDownloader();
      if (result.ready) {
        setDownloaderStatus(result.credentials ? 'ready' : 'auth');
      } else {
        setDownloaderStatus('missing');
      }
    } catch {
      setDownloaderStatus('missing');
    }
  }, []);

  useEffect(() => {
    refreshDownloaderStatus();
  }, [refreshDownloaderStatus]);

  useEffect(() => {
    const unsubscribe = window.hyportal?.onAuthUrl?.(({ url }) => {
      setBlocking((prev) => {
        const cancelPrev = prev.active ? prev.onCancel : undefined;
        const handleCancel = async () => {
          if (cancelPrev) {
            try {
              await cancelPrev();
            } catch {
              // ignore cancel errors
            }
          }
          await window.hyportal?.cancelDownloaderProcess?.();
          setBlocking({ active: false });
        };
        return {
          active: true,
          message: t('downloader.authVisit', { url }),
          onCancel: handleCancel
        };
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, [t]);

  useEffect(() => {
    const unsubscribe = window.hyportal?.onDownloadProgress?.((payload) => {
      setDownloadPhase('downloading');
      setDownloadProgress(payload);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useLayoutEffect(() => {
    if (downloadPhase === 'idle') return;
    if (downloadButtonRef.current && downloadButtonWidth === null) {
      const baseWidth = downloadButtonRef.current.getBoundingClientRect().width;
      setDownloadButtonWidth(baseWidth + 64);
    }
  }, [downloadPhase, downloadButtonWidth]);

  useEffect(() => {
    const unsubscribe = window.hyportal?.onVersionProgress?.((payload) => {
      setAvailableDownloads((prev) =>
        prev.map((item) =>
          item.id === payload.id
            ? {
                ...item,
                status: 'pending',
                progress: payload.percent != null ? Math.round(payload.percent) : item.progress
              }
            : item
        )
      );
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const refreshInstalledVersions = React.useCallback(async () => {
    if (!window.hyportal?.listVersions) return;
    try {
      const list = await window.hyportal.listVersions();
      setInstalledVersions(list);
    } catch {
      setInstalledVersions([]);
    }
  }, []);

  useEffect(() => {
    refreshInstalledVersions();
  }, [refreshInstalledVersions]);

  useEffect(() => {
    let isMounted = true;

    const applyServers = (data: StoredServer[]) => {
      if (!isMounted) return;
      const hydrated = data.map((srv) => hydrateServer(srv));
      setServers(hydrated);
      setSelectedServerId(hydrated[0]?.id ?? null);
      setServersLoaded(true);
    };

    const persistServers = async (data: Server[]) => {
      try {
        await window.hyportal?.saveServers(data);
      } catch {
        // ignore persistence errors in dev
      }
    };

    const loadServers = async () => {
      if (window.hyportal?.loadServers) {
        try {
          const loaded = await window.hyportal.loadServers();
          if (Array.isArray(loaded) && loaded.length > 0) {
            applyServers(loaded);
            return;
          }
        } catch {
          // ignore and fall through to bundled data
        }
      }

      try {
        const res = await fetch('data/servers.json');
        const data: StoredServer[] = await res.json();
        if (data.length > 0) {
          applyServers(data);
          await persistServers(data.map((srv) => hydrateServer(srv)));
          return;
        }
      } catch {
        // ignore and leave state empty
      }

      applyServers([]);
      await persistServers([]);
    };

    loadServers();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setServerSettings((prev) => {
      const nextServers = { ...prev.servers };
      let changed = false;
      servers.forEach((srv) => {
        if (!nextServers[srv.id]) {
          nextServers[srv.id] = { ...defaultRuntimeSettings };
          changed = true;
        }
      });
      Object.keys(nextServers).forEach((id) => {
        if (!servers.find((srv) => srv.id === id)) {
          delete nextServers[id];
          changed = true;
        }
      });
      if (!changed) return prev;
      return { ...prev, servers: nextServers };
    });
  }, [servers]);

  useEffect(() => {
    if (!serversLoaded) return;
    window.hyportal?.saveServers(servers).catch(() => {});
  }, [servers, serversLoaded]);

  useEffect(() => {
    if (!serversLoaded) return;
    let cancelled = false;
    const now = Date.now();
    const markAllStopped = () => {
      setServers((prev) => {
        let changed = false;
        const next = prev.map((server) => {
          if (server.status === 'stopped') return server;
          changed = true;
          return { ...server, status: 'stopped' as Server['status'], statusSince: now };
        });
        return changed ? next : prev;
      });
      runningServersRef.current = new Set();
    };

    const syncRunning = async () => {
      if (!window.hyportal?.getRunningServers) {
        markAllStopped();
        setRunningSyncReadyFlag(true);
        return;
      }
      try {
        const entries = await window.hyportal.getRunningServers();
        if (cancelled) return;
        const runningIds = new Set<string>();
        const statusSinceMap = new Map<string, number>();
        if (Array.isArray(entries)) {
          entries.forEach((entry) => {
            if (entry?.id) {
              runningIds.add(entry.id);
              if (typeof entry.statusSince === 'number') {
                statusSinceMap.set(entry.id, entry.statusSince);
              }
            }
          });
        }
        setServers((prev) => {
          let changed = false;
          const next = prev.map((server) => {
            const isRunning = runningIds.has(server.id);
            if (isRunning) {
              const statusSince = statusSinceMap.get(server.id) ?? now;
              if (server.status === 'running' && server.statusSince === statusSince) return server;
              changed = true;
              return { ...server, status: 'running' as Server['status'], statusSince };
            }
            if (server.status !== 'stopped') {
              changed = true;
              return { ...server, status: 'stopped' as Server['status'], statusSince: now };
            }
            return server;
          });
          return changed ? next : prev;
        });
        runningServersRef.current = runningIds;
      } catch {
        if (!cancelled) {
          markAllStopped();
        }
      } finally {
        if (!cancelled) {
          setRunningSyncReadyFlag(true);
        }
      }
    };
    syncRunning();
    return () => {
      cancelled = true;
    };
  }, [serversLoaded]);

  useEffect(() => {
    if (!serverSettingsLoaded) return;
    window.hyportal?.saveServerSettings?.(serverSettings).catch(() => {});
  }, [serverSettings, serverSettingsLoaded]);

  useEffect(() => {
    setIsEditingDetail(false);
    setEditDraft(selectedServer ?? null);
    setRuntimeDraft(selectedServer ? getRuntimeSettings(selectedServer.id) : null);
  }, [getRuntimeSettings, selectedServer, selectedServerId, serverView]);

  useEffect(() => {
    setServerActionError(null);
  }, [selectedServerId, serverView]);

  useEffect(() => {
    if (!(modalState.open && modalState.mode === 'delete')) {
      setDeleteCountdown(5);
      return;
    }
    setDeleteCountdown(5);
    const timer = window.setInterval(() => {
      setDeleteCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [modalState]);

  const heroCopy = useMemo(
    () => ({
      eyebrow: t('hero.eyebrow'),
      title: t('hero.title'),
      subtitle: t('hero.subtitle')
    }),
    [t]
  );

  const randomImageKey = () => {
    if (!images.length) return 'Rock_Cobblestone_Mossy';
    const choice = images[Math.floor(Math.random() * images.length)];
    return choice.key;
  };

  const javaReady = javaStatus === 'ready';
  const downloaderReady = downloaderStatus === 'ready';
  const downloaderNeedsAuth = downloaderStatus === 'auth';
  const requirementsReady = javaReady && downloaderReady;
  const openExternalLink = React.useCallback(async (url: string | null | undefined) => {
    if (!url) return;
    try {
      await window.hyportal?.openExternal?.(url);
    } catch {
      // best-effort: if IPC fails, do nothing to avoid opening an in-app window
    }
  }, []);
  const handleOpenJavaDownload = () => openExternalLink(JAVA_DOWNLOAD_URL);
  const handleOpenEmbeddedRelease = () => openExternalLink(EMBEDDED_RELEASE_URL);

  useEffect(() => {
    if (!downloaderReady) {
      setServerView('list');
    }
  }, [downloaderReady]);
  useEffect(() => {
    if (!javaReady) {
      setServerView('list');
    }
  }, [javaReady]);

  const sortedInstalledVersions = useMemo(
    () => [...installedVersions].sort((a, b) => compareVersionIds(b.id, a.id)),
    [installedVersions]
  );

  const installedVersionCards = useMemo<Version[]>(
    () =>
      sortedInstalledVersions.map((version) => {
        const channelKey: Version['channelKey'] =
          version.channel === 'pre-release'
            ? 'pre-release'
            : version.channel === 'stable'
              ? 'stable'
              : 'unknown';
        const channelLabel =
          channelKey === 'pre-release'
            ? t('versions.channel.preRelease')
            : channelKey === 'stable'
              ? t('versions.channel.stable')
              : t('versions.channel.unknown', { defaultValue: 'Unknown' });
        return {
          id: version.id,
          name: version.id,
          channel: channelLabel,
          channelKey,
          size: formatFileSize(version.sizeBytes),
          date: version.installedAt ? new Date(version.installedAt).toLocaleDateString() : '—'
        };
      }),
    [sortedInstalledVersions, t]
  );

  const installedVersionOptions = useMemo(() => sortedInstalledVersions.map((version) => version.id), [sortedInstalledVersions]);
  const deleteTargetServer =
    modalState.open && modalState.mode === 'delete'
      ? servers.find((server) => server.id === modalState.targetId) ?? null
      : null;

  const handleOpenCreateModal = () => {
    if (!requirementsReady) return;
    if (!installedVersionOptions.length) {
      setVersionRequirementModalOpen(true);
      return;
    }
    setModalState({ mode: 'create', open: true });
  };

  const handleGoToVersionsForDownload = () => {
    setVersionRequirementModalOpen(false);
    setActiveTab('versions');
    setServerView('list');
    handleCheckVersions().catch(() => {});
  };

  const validateServerPath = React.useCallback(
    async (path: string) => {
      if (!path) {
        return t('serversErrors.pathRequired');
      }
      if (!window.hyportal?.isDirectoryEmpty) return null;
      try {
        const result = await window.hyportal.isDirectoryEmpty({ path });
        if (result && !result.isDirectory) {
          return t('serversErrors.pathValidationFailed');
        }
        if (result && !result.empty) {
          return t('serversErrors.pathNotEmpty');
        }
        return null;
      } catch {
        return t('serversErrors.pathValidationFailed');
      }
    },
    [t]
  );

  const handleSubmitCreateServer = async (values: ServerFormValues): Promise<{ success: boolean; error?: string }> => {
    if (!window.hyportal?.createServerFromVersion) {
      return { success: false, error: t('serversErrors.createFailed') };
    }
    try {
      await runBlockingAction({
        message: t('servers.creating', { defaultValue: 'Creating server...' }),
        action: async () => {
          await window.hyportal?.createServerFromVersion?.({
            versionId: values.version,
            targetPath: values.path
          });
        }
      });
    } catch (error) {
      console.error('Failed to create server', error);
      const message =
        (error as Error)?.message === 'TARGET_NOT_EMPTY'
          ? t('serversErrors.pathNotEmpty')
          : (error as Error)?.message === 'MISSING_TEMPLATE'
            ? t('serversErrors.missingVersionFiles')
            : t('serversErrors.createFailed');
      return { success: false, error: message };
    }
    const newServer: Server = {
      id: `srv-${Date.now()}`,
      status: 'stopped',
      statusSince: Date.now(),
      name: values.name,
      version: values.version,
      port: values.port,
      path: values.path,
      imageKey: randomImageKey()
    };
    updateRuntimeSettings(newServer.id, {
      memoryStep: clampMemoryStep(values.memoryStep ?? DEFAULT_MEMORY_STEP),
      disableSentry: false,
      useAotCache: false
    });
    setServers((prev) => [...prev, newServer]);
    setSelectedServerId(newServer.id);
    setModalState({ open: false });
    return { success: true };
  };

  type BlockingActionOptions = {
    message: string;
    action: () => Promise<void> | void;
    onCancel?: () => Promise<void> | void;
    timeoutMs?: number;
  };

  const runBlockingAction = React.useCallback(
    async ({ message, action, onCancel, timeoutMs }: BlockingActionOptions) => {
      if (blocking.active) return;

      let cancelled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const handleCancel = async () => {
        if (cancelled) return;
        cancelled = true;
        if (timeoutId) clearTimeout(timeoutId);
        if (onCancel) {
          try {
            await onCancel();
          } catch {
            // ignore cancel errors
          }
        }
        setBlocking({ active: false });
      };

      setBlocking({ active: true, message, onCancel: onCancel ? handleCancel : undefined });

      if (timeoutMs) {
        timeoutId = setTimeout(handleCancel, timeoutMs);
      }

      try {
        await action();
      } catch (error) {
        console.error('Blocking action failed', error);
      } finally {
        if (!cancelled) {
          if (timeoutId) clearTimeout(timeoutId);
          setBlocking({ active: false });
        }
      }
    },
    [blocking.active]
  );

  const ensureDownloaderAuthenticated = React.useCallback(async () => {
    if (!window.hyportal?.authenticateDownloader) return true;
    const status = await window.hyportal
      .checkDownloader?.()
      .catch(() => null);
    if (status?.credentials && status.ready) {
      setDownloaderStatus('ready');
      return true;
    }

    await runBlockingAction({
      message: t('downloader.authenticating'),
      action: async () => {
        await window.hyportal?.authenticateDownloader?.();
        await refreshDownloaderStatus();
      },
      onCancel: async () => {
        await window.hyportal?.cancelDownloaderProcess?.();
        await refreshDownloaderStatus();
      }
    });

    const refreshed = await window.hyportal
      .checkDownloader?.()
      .catch(() => null);
    const ok = Boolean(refreshed?.credentials && refreshed?.ready);
    setDownloaderStatus(ok ? 'ready' : 'auth');
    return ok;
  }, [refreshDownloaderStatus, runBlockingAction, t]);

  const handleDownloadManager = async () => {
    if (blocking.active) return;
    if (!window.hyportal?.downloadDownloader) {
      setDownloaderStatus('missing');
      return;
    }
    if (downloadButtonRef.current) {
      const baseWidth = downloadButtonRef.current.getBoundingClientRect().width;
      setDownloadButtonWidth(baseWidth + 64);
    }
    setDownloadProgress({ loaded: 0, total: 0 });
    setDownloadPhase('downloading');

    await runBlockingAction({
      message: t('downloader.downloading'),
      action: async () => {
        await window.hyportal?.downloadDownloader();
        await refreshDownloaderStatus();
        const latest = await window.hyportal?.checkDownloader?.().catch(() => null);
        if (latest?.ready && !latest.credentials) {
          await ensureDownloaderAuthenticated();
        }
      },
      onCancel: async () => {
        await window.hyportal?.cancelDownloader?.();
        await refreshDownloaderStatus();
      }
    });

    setDownloadProgress(null);
    setDownloadButtonWidth(null);
    setDownloadPhase('idle');
  };

  const handleAuthenticateDownloader = async () => {
    await ensureDownloaderAuthenticated();
  };

  const renderJavaBlock = () => {
    const minimum = javaRuntime?.minimum ?? REQUIRED_JAVA_MAJOR;
    const detected = javaRuntime?.version;
    const unknownVersion = t('java.unknownVersion', { defaultValue: 'unknown' });
    const body =
      javaStatus === 'outdated'
        ? t('java.bodyOutdated', { version: minimum, detected: detected || unknownVersion })
        : t('java.bodyMissing', { version: minimum });
    const downloadJavaLabel = t('java.downloadJava', { defaultValue: 'Download Java 25' });
    const embeddedLabel = t('java.getEmbedded', { defaultValue: 'Get installer with Java included' });
    return (
      <div className="hp-downloader-block">
        <div className="hp-downloader-block__text">
          <p className="hp-downloader-block__title">
            {t('java.title', { defaultValue: 'Java requerido' })}
          </p>
          <p className="hp-downloader-block__body">{body}</p>
        </div>
        <div className="hp-downloader-block__actions">
          <Button
            label={downloadJavaLabel}
            variant="primary"
            onClick={handleOpenJavaDownload}
            iconLeft={faDownload}
          />
          <Button
            label={embeddedLabel}
            variant="surface"
            onClick={handleOpenEmbeddedRelease}
            iconLeft={faServer}
          />
        </div>
      </div>
    );
  };

  const renderDownloaderBlock = () => {
    const needsAuth = downloaderNeedsAuth;
    const percent =
      downloadProgress && (downloadProgress.total ?? 0) > 0
        ? Math.min(100, Math.round((downloadProgress.loaded / downloadProgress.total) * 100))
        : null;
    const downloadingText = t('downloader.downloadingShort', { defaultValue: 'Downloading...' }) || 'Downloading...';
    let label: string;
    if (downloadPhase === 'downloading') {
      label = percent !== null ? `${downloadingText} ${percent}%` : downloadingText;
    } else {
      label =
        needsAuth
          ? t('downloader.connect')
          : t('downloader.download');
    }
    const fixedWidth = downloadButtonWidth ?? undefined;
    return (
      <div className="hp-downloader-block">
        <div className="hp-downloader-block__text">
          <p className="hp-downloader-block__title">
            {needsAuth ? t('downloader.authTitle') : t('downloader.title')}
          </p>
          <p className="hp-downloader-block__body">
            {needsAuth ? t('downloader.authBody') : t('downloader.body')}
          </p>
        </div>
        <div className="hp-downloader-block__actions">
          <Button
            label={label}
            variant="primary"
            onClick={needsAuth ? handleAuthenticateDownloader : handleDownloadManager}
            disabled={blocking.active || downloadPhase !== 'idle'}
            buttonRef={downloadButtonRef}
            style={fixedWidth ? { width: fixedWidth, minWidth: fixedWidth } : undefined}
            iconLeft={faDownload}
          />
          {blocking.active && <p className="hp-downloader-block__hint">{blocking.message}</p>}
        </div>
      </div>
    );
  };

  const renderRequirementsBlock = () => {
    if (!javaReady) return renderJavaBlock();
    if (!downloaderReady) return renderDownloaderBlock();
    return null;
  };

  const requirementsBlock = useMemo(
    () => renderRequirementsBlock(),
    [
      javaReady,
      javaStatus,
      javaRuntime,
      downloaderReady,
      downloaderNeedsAuth,
      downloadPhase,
      downloadProgress,
      downloadButtonWidth
    ]
  );

  const handleCheckVersions = async () => {
    if (!window.hyportal?.checkVersions) return;
    if (!javaReady) return;
    if (!downloaderReady && !downloaderNeedsAuth) return;
    if (downloaderNeedsAuth) {
      const ok = await ensureDownloaderAuthenticated();
      if (!ok) return;
    }
    setCheckingVersions(true);
    try {
      const results = await window.hyportal.checkVersions({ includePreRelease });
      setCachedVersions(Array.isArray(results) ? results : []);
      const unique = results.filter(
        (item) => !installedVersions.some((installed) => installed.id === item.id)
      );
      setAvailableDownloads(unique.map((item) => ({ ...item, status: 'idle' })));
    } catch {
      setAvailableDownloads([]);
    } finally {
      setCheckingVersions(false);
    }
  };

  const handleDownloadVersion = async (id: string, channel: 'stable' | 'pre-release') => {
    if (!window.hyportal?.downloadVersion) return;
    if (!javaReady) return;
    if (!downloaderReady && !downloaderNeedsAuth) return;
    if (downloaderNeedsAuth) {
      const ok = await ensureDownloaderAuthenticated();
      if (!ok) return;
    }
    setAvailableDownloads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'pending', progress: null } : item))
    );
    try {
      cancelledVersionDownloadsRef.current.delete(id);
      const result = await window.hyportal.downloadVersion({ id, channel });
      if (result?.installed) {
        setInstalledVersions(result.installed);
      } else {
        await refreshInstalledVersions();
      }
      setAvailableDownloads((prev) => prev.filter((item) => item.id !== id));
    } catch {
      const wasCancelled = cancelledVersionDownloadsRef.current.has(id);
      if (wasCancelled) {
        cancelledVersionDownloadsRef.current.delete(id);
        setAvailableDownloads((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: 'idle', progress: null } : item
          )
        );
      } else {
        setAvailableDownloads((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: 'error', progress: null } : item))
        );
      }
    }
  };

  const handleCancelDownloadVersion = async (id: string) => {
    if (!window.hyportal?.cancelDownloaderProcess) return;
    cancelledVersionDownloadsRef.current.add(id);
    setAvailableDownloads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'cancelling' } : item))
    );
    try {
      await window.hyportal.cancelDownloaderProcess();
    } catch (error) {
      console.error('Failed to cancel version download', error);
    }
  };

  const handleRequestDeleteVersion = (id: string) => {
    const target = installedVersions.find((version) => version.id === id);
    if (!target) return;
    const serversUsing = servers.filter((server) => server.version === id).map((server) => server.name);
    if (serversUsing.length > 0) {
      setVersionDeleteState({ mode: 'blocked', version: target, servers: serversUsing });
    } else {
      setVersionDeleteState({ mode: 'confirm', version: target });
    }
  };

  const handleCloseVersionDeleteModal = () => {
    if (versionDeleting) return;
    setVersionDeleteState({ mode: 'idle' });
  };

  const handleConfirmDeleteVersion = async () => {
    if (versionDeleteState.mode !== 'confirm') return;
    if (!window.hyportal?.deleteVersion) return;
    setVersionDeleting(true);
    try {
      const result = await window.hyportal.deleteVersion({ id: versionDeleteState.version.id });
      if (result?.installed) {
        setInstalledVersions(result.installed);
      } else {
        await refreshInstalledVersions();
      }
      setVersionDeleteState({ mode: 'idle' });
    } catch (error) {
      console.error('Failed to delete version', error);
    } finally {
      setVersionDeleting(false);
    }
  };

  const applyServerUpdates = (current: Server, updates: Partial<Server>): Server => {
    const nextStatus = updates.status ?? current.status;
    const hasStatusChanged = updates.status !== undefined && updates.status !== current.status;
    const statusSince = updates.statusSince ?? (hasStatusChanged ? Date.now() : current.statusSince);

    return {
      ...current,
      ...updates,
      status: nextStatus,
      statusSince
    };
  };

  const handleUpdateServer = React.useCallback((id: string, updates: Partial<Server>) => {
    setServers((prev) => prev.map((s) => (s.id === id ? applyServerUpdates(s, updates) : s)));
    setEditDraft((prev) => (prev && prev.id === id ? applyServerUpdates(prev, updates) : prev));
  }, []);

  const handleDeleteServer = async (id: string) => {
    const target = servers.find((s) => s.id === id);
    if (!target) return;
    await runBlockingAction({
      message: t('servers.deleting', { defaultValue: 'Deleting server...' }),
      action: async () => {
        try {
          await window.hyportal?.deleteServerDirectory?.({ path: target.path });
        } catch {
          // ignore deletion errors for now
        }
        setServers((prev) => {
          const next = prev.filter((s) => s.id !== id);
          const fallbackId = next[0]?.id ?? null;
          setSelectedServerId((current) => (current === id ? fallbackId : current));
          return next;
        });
        removeRuntimeSettings(id);
      }
    });
    setServerView('list');
    setModalState({ open: false });
  };

  const handleDraftChange = (changes: Partial<Server>) => {
    setEditDraft((prev) => (prev ? { ...prev, ...changes } : prev));
  };

  const handleRuntimeDraftChange = (changes: Partial<ServerRuntimeSettings>) => {
    setRuntimeDraft((prev) =>
      prev ? { ...prev, ...changes } : { ...defaultRuntimeSettings, ...changes }
    );
  };

  const handleAutostartChange = React.useCallback(async () => {
    const next = !autostart;
    try {
      await window.hyportal?.setAutostart?.(next);
    } catch {
      // ignore failures
    }
    setAutostart(next);
    setServerSettings((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, autostart: next }
    }));
  }, [autostart]);

  const handleMemorySliderCommit = React.useCallback(
    (memoryStep: number) => {
      if (memoryStep === LOW_MEMORY_STEP && !lowMemoryWarningDismissed) {
        setLowMemoryModalOpen(true);
      }
      if (
        typeof memoryStep === 'number' &&
        systemMemoryBytes &&
        !highMemoryWarningDismissed
      ) {
        const nextBytes = memoryStepToGb(memoryStep) * BYTES_PER_GB;
        if (nextBytes / systemMemoryBytes > 0.75) {
          setHighMemoryModalOpen(true);
        }
      }
    },
    [highMemoryWarningDismissed, lowMemoryWarningDismissed, systemMemoryBytes]
  );

  const handleCloseLowMemoryModal = (suppress: boolean) => {
    if (suppress) {
      setServerSettings((prev) => ({
        ...prev,
        preferences: { ...prev.preferences, suppressLowRamWarning: true }
      }));
    }
    setLowMemoryModalOpen(false);
  };

  const handleCloseHighMemoryModal = (suppress: boolean) => {
    if (suppress) {
      setServerSettings((prev) => ({
        ...prev,
        preferences: { ...prev.preferences, suppressHighRamWarning: true }
      }));
    }
    setHighMemoryModalOpen(false);
  };

  const handleStartEditDetail = () => {
    if (!selectedServer) return;
    setIsEditingDetail(true);
    setEditDraft(selectedServer);
    setRuntimeDraft(getRuntimeSettings(selectedServer.id));
  };

  const handleCancelEditDetail = () => {
    setIsEditingDetail(false);
    setEditDraft(selectedServer);
    setRuntimeDraft(selectedServer ? getRuntimeSettings(selectedServer.id) : null);
  };

  const handleSaveEditDetail = () => {
    if (!selectedServer || !editDraft) return;
    handleUpdateServer(selectedServer.id, {
      name: editDraft.name,
      version: editDraft.version,
      port: editDraft.port,
      path: editDraft.path,
      imageKey: editDraft.imageKey
    });
    if (runtimeDraft) {
      updateRuntimeSettings(selectedServer.id, runtimeDraft);
    }
    setIsEditingDetail(false);
  };

  const handleCancelAppClose = useCallback(() => {
    setCloseAppModalOpen(false);
  }, []);

  const confirmCloseNow = useCallback(async () => {
    await window.hyportal?.confirmAppClose?.().catch(() => {});
  }, []);

  const handleDetailImageChange = (imageKey: string) => {
    if (!selectedServer) return;
    if (isEditingDetail) {
      setEditDraft((prev) => (prev ? { ...prev, imageKey } : prev));
    } else {
      handleUpdateServer(selectedServer.id, { imageKey });
    }
  };

  const handleSetServerStatus = async (id: string, nextStatus: Server['status']) => {
    const target = servers.find((s) => s.id === id);
    if (!target || serverStatusChanging[id]) return;
    setServerStatusChanging((prev) => ({ ...prev, [id]: true }));
    setServerActionError(null);
    try {
      if (nextStatus === 'running' && window.hyportal?.startServer) {
        const runtime = getRuntimeSettings(id);
        await window.hyportal.startServer({
          id,
          path: target.path,
          port: target.port,
          memoryGb: memoryStepToGb(runtime.memoryStep),
          disableSentry: runtime.disableSentry,
          useAotCache: runtime.useAotCache,
          versionId: target.version
        });
      } else if (nextStatus === 'stopped' && window.hyportal?.stopServer) {
        manualStopPendingRef.current.add(id);
        await window.hyportal.stopServer({ id });
      }
      handleUpdateServer(id, { status: nextStatus });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        const message = (error as Error)?.message ?? '';
        if (code === 'ALREADY_RUNNING' || message.includes('ALREADY_RUNNING')) {
          handleUpdateServer(id, { status: 'running', statusSince: Date.now() });
          return;
        }
        if (code === 'PORT_IN_USE' || message.includes('PORT_IN_USE')) {
          setPortInUseModal({ open: true, port: target.port, serverName: target.name });
        } else {
          const friendlyErrorMap: Record<string, string> = {
            MISSING_JAR: t('serversErrors.missingJar', { defaultValue: 'No se encuentra HytaleServer.jar en la carpeta del servidor.' }),
            MISSING_ASSETS: t('serversErrors.missingAssets', { defaultValue: 'No se ha encontrado Assets.zip en la carpeta del servidor.' }),
            MISSING_AOT: t('serversErrors.missingAot', { defaultValue: 'No se ha encontrado HytaleServer.aot para la cache AOT.' }),
            MISSING_DATA: t('serversErrors.createFailed', { defaultValue: 'Faltan datos para iniciar el servidor.' }),
            MISSING_JAVA_RUNTIME: t('serversErrors.missingJava', {
              defaultValue: `Java ${REQUIRED_JAVA_MAJOR}+ no encontrado. Instala Java o usa la version con JRE embebido.`,
              version: REQUIRED_JAVA_MAJOR
            }),
            OUTDATED_JAVA_RUNTIME: t('serversErrors.outdatedJava', {
              defaultValue: `Se requiere Java ${REQUIRED_JAVA_MAJOR} o superior.`,
              version: REQUIRED_JAVA_MAJOR
            })
          };
        setServerActionError(
          friendlyErrorMap[code ?? ''] ?? (error as Error)?.message ?? t('serversErrors.createFailed')
        );
      }
      if (nextStatus === 'stopped') {
        manualStopPendingRef.current.delete(id);
      }
    } finally {
      setServerStatusChanging((prev) => ({ ...prev, [id]: false }));
    }
  };

  const stopRunningServers = useCallback(async () => {
    if (window.hyportal?.stopAllServers) {
      await window.hyportal.stopAllServers().catch(() => {});
      return;
    }
    const runningIds = servers.filter((server) => server.status === 'running').map((server) => server.id);
    for (const id of runningIds) {
      try {
        await handleSetServerStatus(id, 'stopped');
      } catch {
        // swallow stop errors while shutting down
      }
    }
  }, [servers, handleSetServerStatus]);

  const handleConfirmAppClose = useCallback(async () => {
    setCloseAppModalOpen(false);
    if (shuttingDownRef.current) return;
    shuttingDownRef.current = true;
    setShutdownModalOpen(true);
    try {
      await stopRunningServers();
      await confirmCloseNow();
    } finally {
      // If the app didn't quit (e.g. error), allow retry.
      shuttingDownRef.current = false;
      setShutdownModalOpen(false);
    }
  }, [stopRunningServers, confirmCloseNow]);

  const handleDisableClosePrompt = useCallback(async () => {
    setServerSettings((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, confirmOnClose: false }
    }));
    setCloseAppModalOpen(false);
    if (shuttingDownRef.current) return;
    shuttingDownRef.current = true;
    setShutdownModalOpen(true);
    try {
      await stopRunningServers();
      await confirmCloseNow();
    } finally {
      shuttingDownRef.current = false;
      setShutdownModalOpen(false);
    }
  }, [setServerSettings, stopRunningServers, confirmCloseNow]);

  const beginAppShutdown = useCallback(() => {
    if (shuttingDownRef.current) return;
    shuttingDownRef.current = true;
    setShutdownModalOpen(true);
    stopRunningServers()
      .then(() => confirmCloseNow())
      .catch(() => confirmCloseNow())
      .finally(() => {
        shuttingDownRef.current = false;
        setShutdownModalOpen(false);
      });
  }, [stopRunningServers, confirmCloseNow]);

  const handleForceQuit = useCallback(() => {
    shuttingDownRef.current = true;
    setShutdownModalOpen(true);
    confirmCloseNow();
  }, [confirmCloseNow]);

  useEffect(() => {
    if (!serversLoaded || !runningSyncReadyFlag) return;
    const currentlyRunning = runningServersRef.current;
    servers.forEach((server) => {
      if (server.status === 'running') {
        if (currentlyRunning.has(server.id)) {
          autoRestartQueuedRef.current.delete(server.id);
          return;
        }
        if (autoRestartQueuedRef.current.has(server.id)) return;
        autoRestartQueuedRef.current.add(server.id);
        handleSetServerStatus(server.id, 'running');
      } else {
        autoRestartQueuedRef.current.delete(server.id);
        currentlyRunning.delete(server.id);
      }
    });
  }, [servers, serversLoaded, runningSyncReadyFlag, handleSetServerStatus]);

  const handleToggleServerStatus = (id: string) => {
    const target = servers.find((s) => s.id === id);
    if (!target || serverStatusChanging[id]) return;
    handleSetServerStatus(id, target.status === 'running' ? 'stopped' : 'running');
  };

  useEffect(() => {
    const unsubscribe = window.hyportal?.onServerStatus?.((payload) => {
      if (!payload?.id || !payload.status) return;
      const wasManualStop = manualStopPendingRef.current.has(payload.id);
      const hasManualSuppression = Boolean(manualStopSuppressionRef.current[payload.id]);
      if (payload.status === 'stopped') {
        manualStopPendingRef.current.delete(payload.id);
        if (wasManualStop) {
          suppressManualStopError(payload.id);
        }
      }
      handleUpdateServer(payload.id, { status: payload.status });
      if (payload.error) {
        if (hasManualSuppression) {
          clearManualStopSuppression(payload.id);
          return;
        }
        if (!wasManualStop) {
          setServerProcessErrorModal({
            open: true,
            message: payload.error
          });
        }
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, [handleUpdateServer, clearManualStopSuppression, suppressManualStopError]);

  useEffect(() => {
    const unsubscribe = window.hyportal?.onAppCloseRequested?.(() => {
      const proceedToQuit = async () => {
        beginAppShutdown();
      };

      if (!confirmOnCloseEnabled) {
        proceedToQuit();
        return;
      }
      const anyRunning = servers.some((server) => server.status === 'running');
      if (anyRunning) {
        setCloseAppModalOpen(true);
        return;
      }
      if (!window.hyportal?.getRunningServers) {
        proceedToQuit();
        return;
      }
      window.hyportal
        .getRunningServers()
        .then((entries) => {
          const hasRunning = Array.isArray(entries) && entries.some((entry) => entry && entry.id);
          if (hasRunning) {
            setCloseAppModalOpen(true);
          } else {
            proceedToQuit();
          }
        })
        .catch(() => {
          proceedToQuit();
        });
    });
    return () => {
      unsubscribe?.();
    };
  }, [confirmOnCloseEnabled, servers, beginAppShutdown]);

  return (
    <>
      {welcomeVisible && <WelcomeScreen onFinish={handleFinishWelcome} />}
      <AppShell
      titleBar={isWindows ? <TitleBar title="HyPortal" /> : undefined}
      sidebar={
        <Sidebar
          brand={
            <>
              <img src={sidebarLogoSrc} alt="HyPortal logo" className="hp-sidebar__logo" width={64} height={64} />
              <div className="hp-sidebar__brand-copy">
                <p className="hp-sidebar__brand-title">HyPortal</p>
                <p className="hp-sidebar__brand-subtitle">{t('layout.tagline')}</p>
              </div>
            </>
          }
          items={sidebarItems}
          activeId={activeTab}
          onSelect={(id) => {
            if (id === 'servers' && activeTab === 'servers' && serverView === 'detail') {
              setServerView('list');
              return;
            }
            setActiveTab(id as Tab);
          }}
          footer={
            <div>
              <p>{t('layout.footer')}</p>
              <div className="hp-sidebar__accent" />
            </div>
          }
        />
      }
    >
      <div className="hp-content-area">
        {activeTab === 'servers' && serverView === 'list' && (
          <div className="hp-view hp-view--enter">
            {requirementsBlock ? (
              requirementsBlock
            ) : (
              <>
                <HeroPanel
                  eyebrow={heroCopy.eyebrow}
                  title={heroCopy.title}
                  subtitle={heroCopy.subtitle}
                  imageSrc="images/avatar_working_on_server_cropped.png"
                  imageAlt="Person configuring a server"
                  actions={[
                    {
                      id: 'create',
                      node: (
                        <Button
                          label={t('hero.actions.newServer')}
                          variant="primary"
                          iconLeft={faPlus}
                          onClick={handleOpenCreateModal}
                          disabled={!requirementsReady}
                        />
                      )
                    }
                  ]}
                />
              <Section title={t('servers.overviewTitle')}>
                {servers.length ? (
                  <div className="hp-servers-grid">
                    {servers.map((server) => (
                      <ServerCard
                        key={server.id}
                        server={server}
                        images={images}
                        hasNewVersion={hasNewVersion(server)}
                        onView={(id) => {
                          setSelectedServerId(id);
                          setServerView('detail');
                        }}
                        onToggle={handleToggleServerStatus}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="hp-downloader-placeholder">
                    {t('servers.empty.title')}{' '}
                    <a
                      type="button"
                      className="hp-link-button"
                      onClick={handleOpenCreateModal}
                    >
                      {t('servers.empty.cta')}
                    </a>
                  </p>
                )}
              </Section>
              </>
            )}
          </div>
        )}

        {activeTab === 'servers' && serverView === 'detail' && selectedServer && (
          <div className="hp-view hp-view--enter hp-view--detail" ref={detailViewRef}>
            {requirementsBlock ?? (
              <Section
                title={t('servers.detail.title', { name: selectedServer.name })}
                leading={
                  <Button label={t('servers.actions.backToList')} variant="ghost" onClick={() => setServerView('list')} iconLeft={faAngleLeft} />
                }
                actions={
                  isEditingDetail ? (
                    <>
                      <Button label={t('servers.actions.cancel')} variant="ghost" onClick={handleCancelEditDetail} />
                      <Button label={t('servers.actions.save')} variant="primary" onClick={handleSaveEditDetail} />
                    </>
                  ) : selectedServer.status === 'running' ? (
                    <Button
                      label={t('servers.actions.stop')}
                      variant="primary"
                      iconLeft={faCircleStop}
                      style={{ background: 'linear-gradient(135deg, #ff8b7f, #ff5f52)' }}
                      disabled={serverStatusChanging[selectedServer.id]}
                      onClick={() => handleSetServerStatus(selectedServer.id, 'stopped')}
                    />
                  ) : (
                    <>
                      <Button label={t('servers.actions.edit')} variant="surface" onClick={handleStartEditDetail} />
                      <Button
                        label={t('servers.actions.start')}
                        variant="primary"
                        iconLeft={faCirclePlay}
                        style={{ background: 'linear-gradient(135deg, #5af29b, #3bd879)' }}
                        disabled={serverStatusChanging[selectedServer.id]}
                        onClick={() => handleSetServerStatus(selectedServer.id, 'running')}
                      />
                    </>
                  )
                }
              >
                <ServerDetail
                  server={selectedServer}
                  draft={editDraft}
                  runtime={selectedRuntimeSettings}
                  runtimeDraft={runtimeDraft}
                  images={images}
                  versionOptions={installedVersionOptions.length ? installedVersionOptions : AVAILABLE_VERSIONS}
                  isEditing={isEditingDetail}
                  lowMemoryWarningDismissed={lowMemoryWarningDismissed}
                  onChangeDraft={handleDraftChange}
                  onChangeRuntimeDraft={handleRuntimeDraftChange}
                  onImageChange={handleDetailImageChange}
                  onMemorySliderCommit={handleMemorySliderCommit}
                  onRequestDelete={(id) => setModalState({ mode: 'delete', open: true, targetId: id })}
                />
                {serverActionError && (
                  <p className="hp-server-action-error">{serverActionError}</p>
                )}
                <div className={`hp-terminal-wrap${selectedServer.status === 'stopped' ? ' hp-terminal-wrap--disabled' : ''}`}>
                  <TerminalPanel
                    serverId={selectedServer.id}
                    status={selectedServer.status}
                    onError={(message) => setTerminalErrorModal({ open: true, message })}
                    getServerLog={getServerLog}
                    refreshToken={terminalRefreshToken}
                  />
                  {selectedServer.status === 'stopped' && (
                    <div className="hp-terminal-wrap__overlay">
                      <p>{t('servers.console.offline')}</p>
                    </div>
                  )}
                </div>
              </Section>
            )}
          </div>
        )}

        {activeTab === 'versions' && (
          <>
            {requirementsBlock ?? (
              <>
                <div className="hp-versions-controls">
                  <Button
                    label={checkingVersions ? t('versions.checking') : t('versions.actions.checkUpdates')}
                    variant="primary"
                    iconLeft={faCodeBranch}
                    disabled={checkingVersions}
                    onClick={handleCheckVersions}
                  />
                <ToggleSwitch
                  label={t('versions.includePreRelease')}
                  checked={includePreRelease}
                  onToggle={handleIncludePreReleaseToggle}
                />
                </div>
                {availableDownloads.length > 0 && (
                  <div className="hp-versions-available">
                    {availableDownloads.map((download) => {
                      const downloadKey = `${download.id}-${download.channel}`;
                      const isPending = download.status === 'pending';
                      const isCancelling = download.status === 'cancelling';
                      const showCancelButton = isPending || isCancelling;
                      const primaryLabel =
                        isPending && download.progress != null
                          ? `${download.progress}%`
                          : isPending
                            ? t('versions.downloading')
                            : isCancelling
                              ? t('versions.cancelling', { defaultValue: 'Cancelling...' })
                              : download.status === 'error'
                                ? t('versions.retry')
                                : t('versions.actions.download');
                      return (
                        <Card key={downloadKey} className="hp-version-download-card">
                          <div>
                            <p className="hp-version-download-card__channel">
                              {download.channel === 'pre-release'
                                ? t('versions.channel.preRelease')
                                : t('versions.channel.stable')}
                            </p>
                            <h4 className="hp-version-download-card__title">{download.id}</h4>
                          </div>
                          <div className="hp-version-download-card__actions">
                            {showCancelButton && (
                              <Button
                                label={t('versions.actions.cancel', { defaultValue: 'Cancel' })}
                                variant="ghost"
                                onClick={() => handleCancelDownloadVersion(download.id)}
                                disabled={isCancelling}
                              />
                            )}
                            <Button
                              label={primaryLabel}
                              variant="primary"
                              iconLeft={faDownload}
                              disabled={isPending || isCancelling}
                              onClick={() => handleDownloadVersion(download.id, download.channel)}
                            />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
                <Section title={t('versions.title')}>
                  {installedVersionCards.length ? (
                    <div className="hp-versions-grid">
                      {installedVersionCards.map((version) => (
                        <VersionCard key={version.id} version={version} onDelete={() => handleRequestDeleteVersion(version.id)} />
                      ))}
                    </div>
                  ) : (
                    <p className="hp-downloader-placeholder">{t('versions.empty')}</p>
                  )}
                </Section>
              </>
            )}
          </>
        )}

        {activeTab === 'settings' && (
          <Section title={t('settings.title')}>
            <SettingsPanel
              language={languagePreference}
              onLanguageChange={handleLanguageChange}
              languageOptions={languageOptions}
              autostart={autostart}
              onAutostartChange={handleAutostartChange}
              languageLabel={t('settings.languageLabel')}
              languageDescription={t('settings.languageDescription')}
              autostartLabel={t('settings.autostartLabel')}
              autostartDescription={t('settings.autostartDescription')}
              confirmOnClose={confirmOnCloseEnabled}
              onConfirmOnCloseChange={handleConfirmOnCloseToggle}
              confirmOnCloseLabel={t('settings.confirmCloseLabel')}
              confirmOnCloseDescription={t('settings.confirmCloseDescription')}
            />
          </Section>
        )}
      </div>

      <Modal
        isOpen={closeAppModalOpen}
        title={t('closeAppModal.title')}
        description={t('closeAppModal.description')}
        onClose={handleCancelAppClose}
      >
        <p style={{ margin: '12px 0' }}>{t('closeAppModal.body')}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button label={t('closeAppModal.buttons.cancel')} variant="ghost" onClick={handleCancelAppClose} />
          <Button
            label={t('closeAppModal.buttons.never')}
            variant="surface"
            onClick={handleDisableClosePrompt}
          />
          <Button
            label={t('closeAppModal.buttons.close')}
            variant="danger"
            onClick={handleConfirmAppClose}
          />
        </div>
      </Modal>

      <Modal
        isOpen={shutdownModalOpen}
        title={t('shutdownModal.title', { defaultValue: 'Stopping servers' })}
        description={t('shutdownModal.description', {
          defaultValue: 'Waiting for all running servers to stop before exiting.'
        })}
        onClose={() => {}}
      >
        <p style={{ margin: '12px 0' }}>
          {t('shutdownModal.body', {
            defaultValue: 'This may take a few seconds. You can force quit if needed.'
          })}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button
            label={t('shutdownModal.force', { defaultValue: 'Force quit now' })}
            variant="danger"
            onClick={handleForceQuit}
          />
        </div>
      </Modal>

      <Modal
        isOpen={modalState.open && modalState.mode === 'create'}
        title={t('servers.actions.create')}
        description={t('hero.subtitle')}
        onClose={() => setModalState({ open: false })}
      >
        <ServerForm
          versionOptions={installedVersionOptions}
          existingNames={servers.map((s) => s.name)}
          defaultServersDir={appPaths?.serversDir}
          onGeneratePath={handleGeneratePath}
          onBrowsePath={handleBrowsePath}
          onValidatePath={validateServerPath}
          onCancel={() => setModalState({ open: false })}
          onSubmit={handleSubmitCreateServer}
        />
      </Modal>

      <Modal
        isOpen={modalState.open && modalState.mode === 'delete'}
        title={t('serversDeleteModal.title')}
        description={t('serversDeleteModal.description')}
        onClose={() => setModalState({ open: false })}
      >
        {deleteTargetServer && (
          <p className="hp-delete-modal__body">
            {t('serversDeleteModal.path', { path: deleteTargetServer.path })}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button label={t('servers.actions.cancel')} variant="ghost" onClick={() => setModalState({ open: false })} />
          <Button
            label={
              deleteCountdown > 0
                ? t('servers.actions.deleteCountdown', { seconds: deleteCountdown })
                : t('servers.actions.deleteServer')
            }
            variant="danger"
            disabled={deleteCountdown > 0}
            onClick={async () => {
              if (modalState.open && modalState.mode === 'delete') {
                await handleDeleteServer(modalState.targetId);
              }
            }}
          />
        </div>
      </Modal>

      <Modal
        isOpen={lowMemoryModalOpen}
        title={t('servers.memory.lowRamTitle', { defaultValue: 'RAM insuficiente' })}
        description={t('servers.memory.lowRamDescription', {
          defaultValue: 'Se requieren al menos 4G para que el servidor funcione correctamente.'
        })}
        onClose={() => handleCloseLowMemoryModal(false)}
      >
        <p className="hp-low-ram-modal__body">
          {t('servers.memory.lowRamBody', {
            defaultValue: 'Has seleccionado 2G. El servidor podria no iniciarse de forma fiable con tan poca memoria.'
          })}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button
            label={t('servers.memory.dontRemind', { defaultValue: 'No recordar mas' })}
            variant="ghost"
            onClick={() => handleCloseLowMemoryModal(true)}
          />
          <Button label={t('servers.actions.ok', { defaultValue: 'Vale' })} variant="primary" onClick={() => handleCloseLowMemoryModal(false)} />
        </div>
      </Modal>

      <Modal
        isOpen={highMemoryModalOpen}
        title={t('servers.memory.highRamTitle', { defaultValue: 'High memory usage' })}
        description={t('servers.memory.highRamDescription', {
          defaultValue: 'This setting reserves a large portion of your system RAM.'
        })}
        onClose={() => handleCloseHighMemoryModal(false)}
      >
        <p className="hp-low-ram-modal__body">
          {t('servers.memory.highRamBody', {
            defaultValue:
              'Allocating more than 75% of available RAM may impact performance for HyPortal and other apps.'
          })}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button
            label={t('servers.memory.highRamDontRemind', { defaultValue: 'No recordar mas' })}
            variant="ghost"
            onClick={() => handleCloseHighMemoryModal(true)}
          />
          <Button label={t('servers.actions.ok', { defaultValue: 'Vale' })} variant="primary" onClick={() => handleCloseHighMemoryModal(false)} />
        </div>
      </Modal>

      <Modal
        isOpen={portInUseModal.open}
        title={t('servers.portInUse.title', { defaultValue: 'Puerto en uso' })}
        description={t('servers.portInUse.description', { defaultValue: 'No se puede iniciar el servidor porque el puerto esta ocupado.' })}
        onClose={() => setPortInUseModal({ open: false })}
      >
        <p className="hp-port-modal__body">
          {portInUseModal.port
            ? t('servers.portInUse.body', {
                defaultValue: `El puerto ${portInUseModal.port} ya esta en uso.`,
                port: portInUseModal.port
              })
            : t('servers.portInUse.bodyNoPort', {
                defaultValue: 'El puerto configurado ya esta en uso.'
              })}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button label={t('servers.actions.ok', { defaultValue: 'Vale' })} variant="primary" onClick={() => setPortInUseModal({ open: false })} />
        </div>
      </Modal>

      <Modal
        isOpen={terminalErrorModal.open}
        title={t('servers.console.errorTitle', { defaultValue: 'Error en la consola' })}
        description={t('servers.console.errorDescription', { defaultValue: 'La consola se cerró debido a un error.' })}
        onClose={() => setTerminalErrorModal({ open: false })}
      >
        <p className="hp-port-modal__body">
          {terminalErrorModal.message || t('servers.console.errorFallback', { defaultValue: 'Ocurrió un error inesperado.' })}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button label={t('servers.actions.ok', { defaultValue: 'Vale' })} variant="primary" onClick={() => setTerminalErrorModal({ open: false })} />
        </div>
      </Modal>

      <Modal
        isOpen={serverProcessErrorModal.open}
        title={t('servers.console.errorTitle', { defaultValue: 'Error en la consola' })}
        description={t('servers.console.errorDescription', { defaultValue: 'La consola se cerró debido a un error.' })}
        onClose={() => setServerProcessErrorModal({ open: false })}
      >
        <div className="hp-terminal-error-box">
          {serverProcessErrorModal.message || t('servers.console.errorFallback', { defaultValue: 'Ocurrió un error inesperado.' })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button label={t('servers.actions.ok', { defaultValue: 'Vale' })} variant="primary" onClick={() => setServerProcessErrorModal({ open: false })} />
        </div>
      </Modal>

      <Modal
        isOpen={versionRequirementModalOpen}
        title={t('serversModals.missingVersionTitle')}
        description={t('serversModals.missingVersionBody')}
        onClose={() => setVersionRequirementModalOpen(false)}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button
            label={t('serversModals.dismiss')}
            variant="ghost"
            onClick={() => setVersionRequirementModalOpen(false)}
          />
          <Button
            label={t('serversModals.goToVersions')}
            variant="primary"
            onClick={handleGoToVersionsForDownload}
          />
        </div>
      </Modal>

      <Modal
        isOpen={versionDeleteState.mode === 'blocked'}
        title={t('versions.deleteBlockedTitle', { defaultValue: 'Cannot delete version' })}
        description={t('versions.deleteBlockedDescription', { defaultValue: 'This version is currently used by these servers:' })}
        onClose={handleCloseVersionDeleteModal}
      >
        {versionDeleteState.mode === 'blocked' && (
          <ul style={{ margin: '12px 0', paddingLeft: 20, textAlign: 'left' }}>
            {versionDeleteState.servers.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Button
            label={t('servers.actions.close', { defaultValue: 'Close' })}
            variant="ghost"
            onClick={handleCloseVersionDeleteModal}
          />
        </div>
      </Modal>

      <Modal
        isOpen={versionDeleteState.mode === 'confirm'}
        title={t('versions.deleteConfirmTitle', { defaultValue: 'Delete version' })}
        description={t('versions.deleteConfirmDescription', { defaultValue: 'This action cannot be undone.' })}
        onClose={handleCloseVersionDeleteModal}
      >
        {versionDeleteState.mode === 'confirm' && (
          <p>
            {t('versions.deleteConfirmBody', {
              defaultValue: 'Delete version {{id}} permanently?',
              id: versionDeleteState.version.id
            })}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button
            label={t('servers.actions.cancel')}
            variant="ghost"
            onClick={handleCloseVersionDeleteModal}
            disabled={versionDeleting}
          />
          <Button
            label={t('versions.actions.delete', { defaultValue: 'Delete' })}
            variant="danger"
            onClick={handleConfirmDeleteVersion}
            disabled={versionDeleting}
          />
        </div>
      </Modal>

      <BlockingOverlay
        active={blocking.active}
        message={blocking.active ? blocking.message : ''}
        onCancel={blocking.active ? blocking.onCancel : undefined}
        cancelLabel={t('servers.actions.cancel')}
      />
    </AppShell>
    </>
  );
};

export default App;
