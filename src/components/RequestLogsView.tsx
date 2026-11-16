import { RefreshCw, ScrollText, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RequestLogRecord, SearchEndpoint } from '../types/serp';

interface RequestLogsViewProps {
  logs: RequestLogRecord[];
  loading: boolean;
  isSignedIn: boolean;
  onSyncExternal: () => Promise<void>;
  onDeleteLog: (logId: string) => Promise<void>;
  onOpenPlayground: () => void;
}

type EndpointFilter = 'all' | SearchEndpoint;

export function RequestLogsView({
  logs,
  loading,
  isSignedIn,
  onSyncExternal,
  onDeleteLog,
  onOpenPlayground,
}: RequestLogsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [endpointFilter, setEndpointFilter] = useState<EndpointFilter>('all');
  const [syncing, setSyncing] = useState(false);

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return logs.filter((l) => {
      if (endpointFilter !== 'all' && l.endpoint !== endpointFilter) return false;
      if (!q) return true;
      return (
        l.query.toLowerCase().includes(q) ||
        l.keyName.toLowerCase().includes(q) ||
        l.endpoint.toLowerCase().includes(q)
      );
    });
  }, [logs, searchTerm, endpointFilter]);

  async function handleSync() {
    setSyncing(true);
    try {
      await onSyncExternal();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Request Logs
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time log of playground runs and external API calls authenticated with your keys.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter query or key..."
              aria-label="Filter request logs"
              className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 w-48"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg overflow-x-auto">
            {(['all', 'search', 'news', 'images', 'places', 'scholar'] as EndpointFilter[]).map(
              (ep) => (
                <button
                  key={ep}
                  type="button"
                  onClick={() => setEndpointFilter(ep)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                    endpointFilter === ep
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {ep}
                </button>
              )
            )}
          </div>

          {isSignedIn && (
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Sync External</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="px-5 py-3.5 flex items-center justify-between gap-4">
              <div className="h-4 w-28 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-4 w-48 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-4 w-20 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-4 w-16 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="p-12 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
            <ScrollText className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              {logs.length === 0 ? 'No requests logged yet' : 'No matching logs'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Execute a query in the API Playground or send a POST request from your application using your API key.
            </p>
          </div>
          {logs.length === 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenPlayground}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                Open Playground
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-5">Timestamp</th>
                <th className="py-2.5 px-4">Endpoint</th>
                <th className="py-2.5 px-4">Query</th>
                <th className="py-2.5 px-4">Key</th>
                <th className="py-2.5 px-4">Origin</th>
                <th className="py-2.5 px-4 text-right">Status</th>
                <th className="py-2.5 px-4 text-right">Results</th>
                <th className="py-2.5 px-4 text-right">Latency</th>
                <th className="py-2.5 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-2.5 px-5 font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                    {log.timestampMs ? new Date(log.timestampMs).toLocaleTimeString() : 'Just now'}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    /api/v1/{log.endpoint}
                  </td>
                  <td className="py-2.5 px-4 text-slate-900 dark:text-white max-w-[240px] truncate font-medium">
                    {log.query}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {log.keyName}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 capitalize whitespace-nowrap">
                    {log.source}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono tabular-nums whitespace-nowrap ${
                      log.statusCode >= 200 && log.statusCode < 300
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {log.statusCode}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                    {log.resultCount}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                    {log.latencyMs} ms
                  </td>
                  <td className="py-2.5 px-5 text-right whitespace-nowrap">
                    {log.source === 'playground' && (
                      <button
                        type="button"
                        onClick={() => void onDeleteLog(log.id)}
                        aria-label="Delete log entry"
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
