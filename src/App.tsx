import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiKeysView } from './components/ApiKeysView';
import { CreateKeyModal } from './components/CreateKeyModal';
import { DocsView } from './components/DocsView';
import { OverviewStats } from './components/OverviewStats';
import { PlaygroundView } from './components/PlaygroundView';
import { RequestLogsView } from './components/RequestLogsView';
import { NavTab, Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { auth, googleProvider } from './lib/firebase';
import {
  deleteApiKeyRecord,
  deleteSingleLog,
  ensureUserProfile,
  loadSandboxKeys,
  loadSandboxLogs,
  mintAndCreateApiKey,
  recordPlaygroundUsage,
  renameApiKey,
  revokeApiKey,
  subscribeUserApiKeys,
  subscribeUserRequestLogs,
  syncExternalTelemetry,
} from './lib/keyService';
import type { ApiKeyRecord, RequestLogRecord, SearchEndpoint } from './types/serp';

const SANDBOX_INIT_FLAG = 'serpforge_sandbox_initialized_v1';
const THEME_STORAGE_KEY = 'serpforge_theme_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('keys');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [logs, setLogs] = useState<RequestLogRecord[]>([]);
  const [externalLogs, setExternalLogs] = useState<RequestLogRecord[]>([]);
  const [externalCounts, setExternalCounts] = useState<
    Record<string, { requestCount: number; lastUsedAt: string }>
  >({});
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedPlaygroundKeyId, setSelectedPlaygroundKeyId] = useState('');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage error
    }
  }, [darkMode]);

  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      setAuthReady(true);
    }, 800);

    const unsub = onAuthStateChanged(
      auth,
      async (nextUser) => {
        clearTimeout(fallbackTimer);
        setUser(nextUser);
        setAuthReady(true);
        setAuthError(null);
        if (nextUser) {
          try {
            await ensureUserProfile(nextUser);
          } catch (err) {
            setAuthError(err instanceof Error ? err.message : 'Failed to initialize profile.');
          }
        }
      },
      (err) => {
        clearTimeout(fallbackTimer);
        setAuthReady(true);
        setAuthError(err instanceof Error ? err.message : 'Authentication listener error.');
      }
    );
    return () => {
      clearTimeout(fallbackTimer);
      unsub();
    };
  }, []);

  // Load Firestore data when signed in, or Sandbox keys/logs when guest
  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setExternalLogs([]);
      setExternalCounts({});
      const existing = loadSandboxKeys();
      const alreadyInit = localStorage.getItem(SANDBOX_INIT_FLAG) === 'true';

      if (existing.length === 0 && !alreadyInit) {
        localStorage.setItem(SANDBOX_INIT_FLAG, 'true');
        setDataLoading(true);
        mintAndCreateApiKey(null, 'Default Sandbox Key')
          .then((starter) => {
            setKeys([starter]);
            setLogs(loadSandboxLogs());
          })
          .catch(() => {
            setKeys([]);
            setLogs([]);
          })
          .finally(() => setDataLoading(false));
      } else {
        setKeys(existing);
        setLogs(loadSandboxLogs());
        setDataLoading(false);
      }
      return;
    }

    setDataLoading(true);
    let keysLoaded = false;
    let logsLoaded = false;

    const unsubKeys = subscribeUserApiKeys(user.uid, (nextKeys) => {
      setKeys(nextKeys);
      keysLoaded = true;
      if (logsLoaded) setDataLoading(false);
    });

    const unsubLogs = subscribeUserRequestLogs(user.uid, (nextLogs) => {
      setLogs(nextLogs);
      logsLoaded = true;
      if (keysLoaded) setDataLoading(false);
    });

    const timer = setTimeout(() => setDataLoading(false), 1200);

    return () => {
      clearTimeout(timer);
      unsubKeys();
      unsubLogs();
    };
  }, [authReady, user]);

  const handleSyncExternal = useCallback(async () => {
    if (!user || keys.length === 0) return;
    const synced = await syncExternalTelemetry(user, keys);
    setExternalCounts(synced.telemetryByKey);
    setExternalLogs(synced.recentExternalLogs);
  }, [user, keys]);

  useEffect(() => {
    if (user && keys.length > 0) {
      void handleSyncExternal();
    }
  }, [user, keys.length, handleSyncExternal]);

  const mergedKeys = useMemo(() => {
    return keys.map((k) => {
      const ext = externalCounts[k.id];
      if (!ext) return k;
      return {
        ...k,
        requestCount: Math.max(k.requestCount || 0, ext.requestCount || 0),
        lastUsedAt: ext.lastUsedAt || k.lastUsedAt,
      };
    });
  }, [keys, externalCounts]);

  const mergedLogs = useMemo(() => {
    const byId = new Map<string, RequestLogRecord>();
    for (const l of [...logs, ...externalLogs]) {
      byId.set(l.id, l);
    }
    return Array.from(byId.values()).sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  }, [logs, externalLogs]);

  const firstActiveKey = useMemo(
    () => mergedKeys.find((k) => k.status === 'active') || null,
    [mergedKeys]
  );

  async function handleSignIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in was cancelled or failed.');
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  async function handleCreateKey(name: string): Promise<ApiKeyRecord> {
    const created = await mintAndCreateApiKey(user, name);
    if (!user) {
      setKeys(loadSandboxKeys());
    }
    setSelectedPlaygroundKeyId(created.id);
    return created;
  }

  async function handleRenameKey(keyId: string, newName: string) {
    await renameApiKey(user, keyId, newName);
    if (!user) setKeys(loadSandboxKeys());
  }

  async function handleRevokeKey(keyId: string) {
    await revokeApiKey(user, keyId);
    if (!user) setKeys(loadSandboxKeys());
  }

  async function handleDeleteKey(keyId: string) {
    await deleteApiKeyRecord(user, keyId);
    if (!user) setKeys(loadSandboxKeys());
  }

  async function handleRecordUsage(
    key: ApiKeyRecord,
    params: {
      endpoint: SearchEndpoint;
      query: string;
      gl: string;
      hl: string;
      num: number;
      statusCode: number;
      latencyMs: number;
      resultCount: number;
    }
  ) {
    await recordPlaygroundUsage(user, key, params);
    if (!user) {
      setKeys(loadSandboxKeys());
      setLogs(loadSandboxLogs());
    }
  }

  async function handleDeleteLog(logId: string) {
    await deleteSingleLog(user, logId);
    if (!user) setLogs(loadSandboxLogs());
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        keyCount={mergedKeys.length}
        isSignedIn={Boolean(user)}
        onSignIn={() => void handleSignIn()}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeTab={activeTab}
          user={user}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenCreateKey={() => setCreateModalOpen(true)}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void handleSignOut()}
        />

        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {authError && (
            <div className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">
              {authError}
            </div>
          )}

          <OverviewStats keys={mergedKeys} logs={mergedLogs} />

          {activeTab === 'keys' && (
            <ApiKeysView
              keys={mergedKeys}
              loading={dataLoading}
              isSignedIn={Boolean(user)}
              onOpenCreate={() => setCreateModalOpen(true)}
              onSignIn={() => void handleSignIn()}
              onRenameKey={handleRenameKey}
              onRevokeKey={handleRevokeKey}
              onDeleteKey={handleDeleteKey}
              onTestKey={(key) => {
                setSelectedPlaygroundKeyId(key.id);
                setActiveTab('playground');
              }}
            />
          )}

          {activeTab === 'playground' && (
            <PlaygroundView
              keys={mergedKeys}
              selectedKeyId={selectedPlaygroundKeyId}
              onSelectKeyId={setSelectedPlaygroundKeyId}
              onOpenCreateKey={() => setCreateModalOpen(true)}
              onRecordUsage={handleRecordUsage}
            />
          )}

          {activeTab === 'logs' && (
            <RequestLogsView
              logs={mergedLogs}
              loading={dataLoading}
              isSignedIn={Boolean(user)}
              onSyncExternal={handleSyncExternal}
              onDeleteLog={handleDeleteLog}
              onOpenPlayground={() => setActiveTab('playground')}
            />
          )}

          {activeTab === 'docs' && <DocsView activeKey={firstActiveKey} />}
        </main>
      </div>

      <CreateKeyModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateKey}
      />
    </div>
  );
}
