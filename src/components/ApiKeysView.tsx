import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ApiKeyRecord } from '../types/serp';

interface ApiKeysViewProps {
  keys: ApiKeyRecord[];
  loading: boolean;
  isSignedIn: boolean;
  onOpenCreate: () => void;
  onSignIn: () => void;
  onRenameKey: (keyId: string, newName: string) => Promise<void>;
  onRevokeKey: (keyId: string) => Promise<void>;
  onDeleteKey: (keyId: string) => Promise<void>;
  onTestKey: (key: ApiKeyRecord) => void;
}

type StatusFilter = 'all' | 'active' | 'revoked';

function formatRelativeTime(iso: string): string {
  if (!iso) return 'Never';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'Never';
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export function ApiKeysView({
  keys,
  loading,
  isSignedIn,
  onOpenCreate,
  onSignIn,
  onRenameKey,
  onRevokeKey,
  onDeleteKey,
  onTestKey,
}: ApiKeysViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredKeys = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return keys.filter((k) => {
      if (statusFilter !== 'all' && k.status !== statusFilter) return false;
      if (!q) return true;
      return (
        k.name.toLowerCase().includes(q) ||
        k.keyPrefix.toLowerCase().includes(q) ||
        k.id.toLowerCase().includes(q)
      );
    });
  }, [keys, searchTerm, statusFilter]);

  async function handleCopy(key: ApiKeyRecord) {
    await navigator.clipboard.writeText(key.keyValue);
    setCopiedId(key.id);
    setTimeout(() => setCopiedId((prev) => (prev === key.id ? null : prev)), 1800);
  }

  function toggleReveal(id: string) {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function saveRename(keyId: string) {
    if (!editValue.trim()) return;
    setBusyId(keyId);
    setActionError(null);
    try {
      await onRenameKey(keyId, editValue.trim());
      setEditingId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rename failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRevoke(keyId: string) {
    setBusyId(keyId);
    setActionError(null);
    try {
      await onRevokeKey(keyId);
      setConfirmRevokeId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Revocation failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(keyId: string) {
    setBusyId(keyId);
    setActionError(null);
    try {
      await onDeleteKey(keyId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {!isSignedIn && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1520]">
          <div className="space-y-1">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Local browser sandbox mode
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Keys minted now work immediately in your projects via <code className="font-mono">X-API-KEY</code>. Sign in with Google to sync keys and request logs across sessions.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignIn}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            Sign in with Google
          </button>
        </div>
      )}

      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Lifetime API Keys
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Drop-in Serper-compatible authentication keys with zero expiration and unlimited requests.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter keys..."
                aria-label="Filter API keys"
                className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 w-48"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
              {(['all', 'active', 'revoked'] as StatusFilter[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === st
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="px-5 py-2.5 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="h-4 w-36 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-4 w-52 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-4 w-16 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-4 w-20 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              </div>
            ))}
          </div>
        ) : filteredKeys.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                {keys.length === 0 ? 'No API keys issued yet' : 'No matching API keys'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {keys.length === 0
                  ? 'Generate your first lifetime free key to call the SerpForge search, news, images, places, and scholar endpoints.'
                  : 'Adjust your search filter or status selection to see other keys.'}
              </p>
            </div>
            {keys.length === 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onOpenCreate}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First API Key</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-5">Project Label</th>
                  <th className="py-2.5 px-4">Secret Key</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Requests</th>
                  <th className="py-2.5 px-4">Last Used</th>
                  <th className="py-2.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredKeys.map((key) => {
                  const revealed = Boolean(revealedIds[key.id]);
                  const isEditing = editingId === key.id;
                  const isConfirmingRevoke = confirmRevokeId === key.id;
                  const isBusy = busyId === key.id;

                  return (
                    <tr
                      key={key.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-5 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editValue}
                              maxLength={80}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveRename(key.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="px-2 py-1 text-xs rounded border border-blue-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none w-40"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => void saveRename(key.id)}
                              disabled={isBusy}
                              aria-label="Save name"
                              className="p-1 text-emerald-600 hover:text-emerald-700"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              aria-label="Cancel rename"
                              className="p-1 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[180px]">{key.name}</span>
                            {key.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(key.id);
                                  setEditValue(key.name);
                                }}
                                aria-label={`Rename ${key.name}`}
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-slate-700 dark:text-slate-300">
                            {revealed ? key.keyValue : key.keyMasked}
                          </code>
                          <button
                            type="button"
                            onClick={() => toggleReveal(key.id)}
                            aria-label={revealed ? 'Hide API key' : 'Reveal API key'}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          >
                            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCopy(key)}
                            aria-label="Copy API key"
                            className="p-1 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            {copiedId === key.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {key.status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">
                            <Ban className="w-3.5 h-3.5" />
                            <span>Revoked</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {(key.requestCount || 0).toLocaleString()}
                      </td>

                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatRelativeTime(key.lastUsedAt)}
                      </td>

                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        {isConfirmingRevoke ? (
                          <div className="inline-flex items-center gap-2 text-xs">
                            <span className="text-slate-600 dark:text-slate-300">Revoke permanently?</span>
                            <button
                              type="button"
                              onClick={() => void confirmRevoke(key.id)}
                              disabled={isBusy}
                              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRevokeId(null)}
                              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            {key.status === 'active' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onTestKey(key)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>Test</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRevokeId(key.id)}
                                  className="px-2.5 py-1 rounded-md text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                >
                                  Revoke
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDelete(key.id)}
                              disabled={isBusy}
                              aria-label={`Delete ${key.name}`}
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
