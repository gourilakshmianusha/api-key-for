import type { ApiKeyRecord, RequestLogRecord } from '../types/serp';

interface OverviewStatsProps {
  keys: ApiKeyRecord[];
  logs: RequestLogRecord[];
}

export function OverviewStats({ keys, logs }: OverviewStatsProps) {
  const activeKeys = keys.filter((k) => k.status === 'active').length;
  const totalRequestsFromKeys = keys.reduce((acc, k) => acc + (k.requestCount || 0), 0);
  const totalRequests = Math.max(totalRequestsFromKeys, logs.length);

  const latencies = logs
    .map((l) => l.latencyMs)
    .filter((ms) => typeof ms === 'number' && ms > 0)
    .sort((a, b) => a - b);
  const medianLatency =
    latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : null;

  const stats = [
    {
      label: 'Total Requests',
      value: totalRequests.toLocaleString(),
      detail: 'Lifetime recorded calls',
    },
    {
      label: 'Active API Keys',
      value: String(activeKeys),
      detail: `${keys.length} total issued`,
    },
    {
      label: 'Median Latency',
      value: medianLatency !== null ? `${medianLatency} ms` : '—',
      detail: latencies.length > 0 ? `Across last ${latencies.length} calls` : 'Run a search to measure',
    },
    {
      label: 'Quota Remaining',
      value: 'Unlimited',
      detail: 'Lifetime Free · $0.00 / mo',
    },
  ];

  return (
    <section
      aria-label="Workspace metrics"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="p-5 flex flex-col justify-between gap-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {stat.label}
          </div>
          <div className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
            {stat.value}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {stat.detail}
          </div>
        </div>
      ))}
    </section>
  );
}
