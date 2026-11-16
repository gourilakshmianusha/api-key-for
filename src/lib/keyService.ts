import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type { ApiKeyRecord, RequestLogRecord, SearchEndpoint } from '../types/serp';

const SANDBOX_STORAGE_KEY = 'serpforge_sandbox_keys_v1';
const SANDBOX_LOGS_KEY = 'serpforge_sandbox_logs_v1';

function sanitizeId(raw: string, maxLen = 64): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLen);
  return cleaned || `id_${Date.now()}`;
}

function truncate(val: string, maxLen: number): string {
  return val.trim().slice(0, maxLen);
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    const displayName = truncate(user.displayName || user.email?.split('@')[0] || 'Developer', 120);
    const email = truncate(user.email || 'unknown@serpforge.dev', 200);
    const photoURL = truncate(user.photoURL || '', 500);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        email,
        photoURL,
        plan: 'lifetime-free',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName,
        email,
        photoURL,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function mintAndCreateApiKey(
  user: User | null,
  rawName: string
): Promise<ApiKeyRecord> {
  const cleanName = truncate(rawName || 'Project API Key', 80) || 'Project API Key';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) {
    const idToken = await user.getIdToken();
    headers.Authorization = `Bearer ${idToken}`;
  }

  const resp = await fetch('/api/keys/mint', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: cleanName }),
  });

  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'Failed to generate API key.');
  }

  const minted = (await resp.json()) as {
    keyId: string;
    keyValue: string;
    keyPrefix: string;
    keyMasked: string;
  };

  const keyId = sanitizeId(minted.keyId, 64);

  if (!user) {
    const localKey: ApiKeyRecord = {
      id: keyId,
      ownerId: 'guest',
      name: cleanName,
      keyPrefix: truncate(minted.keyPrefix, 24),
      keyMasked: truncate(minted.keyMasked, 48),
      keyValue: truncate(minted.keyValue, 120),
      status: 'active',
      requestCount: 0,
      lastUsedAt: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const existing = loadSandboxKeys();
    saveSandboxKeys([localKey, ...existing]);
    return localKey;
  }

  const path = `apiKeys/${keyId}`;
  try {
    await setDoc(doc(db, 'apiKeys', keyId), {
      id: keyId,
      ownerId: user.uid,
      name: cleanName,
      keyPrefix: truncate(minted.keyPrefix, 24),
      keyMasked: truncate(minted.keyMasked, 48),
      keyValue: truncate(minted.keyValue, 120),
      status: 'active',
      requestCount: 0,
      lastUsedAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    id: keyId,
    ownerId: user.uid,
    name: cleanName,
    keyPrefix: minted.keyPrefix,
    keyMasked: minted.keyMasked,
    keyValue: minted.keyValue,
    status: 'active',
    requestCount: 0,
    lastUsedAt: '',
  };
}

export async function renameApiKey(
  user: User | null,
  keyId: string,
  newName: string
): Promise<void> {
  const cleanName = truncate(newName, 80);
  if (!cleanName) throw new Error('Key name cannot be empty.');

  if (!user) {
    const updated = loadSandboxKeys().map((k) =>
      k.id === keyId ? { ...k, name: cleanName, updatedAt: new Date().toISOString() } : k
    );
    saveSandboxKeys(updated);
    return;
  }

  const path = `apiKeys/${keyId}`;
  try {
    await updateDoc(doc(db, 'apiKeys', keyId), {
      name: cleanName,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function revokeApiKey(user: User | null, keyId: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) {
    const idToken = await user.getIdToken();
    headers.Authorization = `Bearer ${idToken}`;
  }
  await fetch('/api/keys/revoke', {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyId }),
  });

  if (!user) {
    const updated = loadSandboxKeys().map((k) =>
      k.id === keyId ? { ...k, status: 'revoked' as const, updatedAt: new Date().toISOString() } : k
    );
    saveSandboxKeys(updated);
    return;
  }

  const path = `apiKeys/${keyId}`;
  try {
    await updateDoc(doc(db, 'apiKeys', keyId), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteApiKeyRecord(user: User | null, keyId: string): Promise<void> {
  await fetch('/api/keys/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId }),
  }).catch(() => undefined);

  if (!user) {
    saveSandboxKeys(loadSandboxKeys().filter((k) => k.id !== keyId));
    return;
  }

  const path = `apiKeys/${keyId}`;
  try {
    await deleteDoc(doc(db, 'apiKeys', keyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function recordPlaygroundUsage(
  user: User | null,
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
): Promise<void> {
  const nowIso = new Date().toISOString();
  const logId = sanitizeId(`log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, 64);

  if (!user) {
    const keys = loadSandboxKeys().map((k) =>
      k.id === key.id ? { ...k, requestCount: k.requestCount + 1, lastUsedAt: nowIso } : k
    );
    saveSandboxKeys(keys);

    const newLog: RequestLogRecord = {
      id: logId,
      ownerId: 'guest',
      keyId: key.id,
      keyName: key.name,
      endpoint: params.endpoint,
      query: truncate(params.query, 300),
      gl: truncate(params.gl, 10),
      hl: truncate(params.hl, 10),
      num: Math.min(Math.max(Math.round(params.num), 1), 50),
      statusCode: params.statusCode,
      latencyMs: Math.max(0, Math.round(params.latencyMs)),
      resultCount: Math.max(0, Math.round(params.resultCount)),
      source: 'playground',
      timestampMs: Date.now(),
    };
    saveSandboxLogs([newLog, ...loadSandboxLogs()].slice(0, 100));
    return;
  }

  if (key.status === 'active') {
    const keyPath = `apiKeys/${key.id}`;
    try {
      await updateDoc(doc(db, 'apiKeys', key.id), {
        requestCount: (key.requestCount || 0) + 1,
        lastUsedAt: nowIso,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, keyPath);
    }
  }

  const logPath = `requestLogs/${logId}`;
  try {
    await setDoc(doc(db, 'requestLogs', logId), {
      id: logId,
      ownerId: user.uid,
      keyId: key.id,
      keyName: truncate(key.name, 80) || 'API Key',
      endpoint: params.endpoint,
      query: truncate(params.query, 300) || 'search',
      gl: truncate(params.gl || 'us', 10),
      hl: truncate(params.hl || 'en', 10),
      num: Math.min(Math.max(Math.round(params.num || 10), 1), 50),
      statusCode: Math.round(params.statusCode),
      latencyMs: Math.max(0, Math.round(params.latencyMs)),
      resultCount: Math.max(0, Math.round(params.resultCount)),
      source: 'playground',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, logPath);
  }
}

export async function syncExternalTelemetry(
  user: User,
  keys: ApiKeyRecord[]
): Promise<{
  telemetryByKey: Record<string, { requestCount: number; lastUsedAt: string }>;
  recentExternalLogs: RequestLogRecord[];
}> {
  if (keys.length === 0) {
    return { telemetryByKey: {}, recentExternalLogs: [] };
  }
  const idToken = await user.getIdToken();
  const resp = await fetch('/api/keys/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      keys: keys.map((k) => ({ id: k.id, name: k.name, status: k.status })),
    }),
  });
  if (!resp.ok) {
    return { telemetryByKey: {}, recentExternalLogs: [] };
  }
  const data = (await resp.json()) as {
    telemetryByKey: Record<string, { requestCount: number; lastUsedAt: string }>;
    recentExternalLogs: Array<{
      id: string;
      keyId: string;
      keyName: string;
      endpoint: SearchEndpoint;
      query: string;
      gl: string;
      hl: string;
      num: number;
      statusCode: number;
      latencyMs: number;
      resultCount: number;
      timestampIso: string;
    }>;
  };

  const mappedLogs: RequestLogRecord[] = (data.recentExternalLogs || []).map((item) => ({
    id: item.id,
    ownerId: user.uid,
    keyId: item.keyId,
    keyName: item.keyName,
    endpoint: item.endpoint,
    query: item.query,
    gl: item.gl,
    hl: item.hl,
    num: item.num,
    statusCode: item.statusCode,
    latencyMs: item.latencyMs,
    resultCount: item.resultCount,
    source: 'external',
    timestampMs: Date.parse(item.timestampIso) || Date.now(),
  }));

  return {
    telemetryByKey: data.telemetryByKey || {},
    recentExternalLogs: mappedLogs,
  };
}

export function subscribeUserApiKeys(
  uid: string,
  onData: (keys: ApiKeyRecord[]) => void
): () => void {
  const path = 'apiKeys';
  const q = query(collection(db, path), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => d.data() as ApiKeyRecord);
      rows.sort((a, b) => {
        const ta = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUserRequestLogs(
  uid: string,
  onData: (logs: RequestLogRecord[]) => void
): () => void {
  const path = 'requestLogs';
  const q = query(collection(db, path), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => {
        const data = d.data() as RequestLogRecord;
        const ts =
          data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.timestampMs || 0;
        return { ...data, timestampMs: ts };
      });
      rows.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
      onData(rows.slice(0, 100));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function loadSandboxKeys(): ApiKeyRecord[] {
  try {
    const raw = localStorage.getItem(SANDBOX_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ApiKeyRecord[];
  } catch {
    return [];
  }
}

export function saveSandboxKeys(keys: ApiKeyRecord[]): void {
  try {
    localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Ignore storage quota issues
  }
}

export function loadSandboxLogs(): RequestLogRecord[] {
  try {
    const raw = localStorage.getItem(SANDBOX_LOGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RequestLogRecord[];
  } catch {
    return [];
  }
}

export function saveSandboxLogs(logs: RequestLogRecord[]): void {
  try {
    localStorage.setItem(SANDBOX_LOGS_KEY, JSON.stringify(logs));
  } catch {
    // Ignore storage quota issues
  }
}

export async function clearSandboxLogs(): Promise<void> {
  saveSandboxLogs([]);
}

export async function deleteSingleLog(user: User | null, logId: string): Promise<void> {
  if (!user) {
    saveSandboxLogs(loadSandboxLogs().filter((l) => l.id !== logId));
    return;
  }
  const path = `requestLogs/${logId}`;
  try {
    await deleteDoc(doc(db, 'requestLogs', logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function getAuthInstance() {
  return auth;
}
