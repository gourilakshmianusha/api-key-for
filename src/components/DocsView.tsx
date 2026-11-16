import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import type { ApiKeyRecord } from '../types/serp';

interface DocsViewProps {
  activeKey: ApiKeyRecord | null;
}

export function DocsView({ activeKey }: DocsViewProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-serpforge-app.run.app';
  const sampleKey = activeKey?.keyValue || 'YOUR_SERPFORGE_API_KEY';

  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyText(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
  }

  const baseUrl = `${origin}/api/v1`;

  const migrationSnippet = `// Replace only the base URL and X-API-KEY in your existing Serper integration
const SERP_ENDPOINT = "${baseUrl}/search";

export async function searchWeb(query: string) {
  const res = await fetch(SERP_ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPFORGE_API_KEY ?? "${sampleKey}",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ q: query, gl: "us", hl: "en", num: 10 })
  });
  if (!res.ok) throw new Error(\`Search error: \${res.status}\`);
  return res.json();
}`;

  const endpoints = [
    {
      method: 'POST',
      path: '/api/v1/search',
      purpose: 'Organic web results, Knowledge Graph, People Also Ask, Related Searches',
    },
    {
      method: 'POST',
      path: '/api/v1/news',
      purpose: 'Live news articles with publication dates, sources, and snippets',
    },
    {
      method: 'POST',
      path: '/api/v1/images',
      purpose: 'High-resolution image URLs, dimensions, thumbnails, and attribution links',
    },
    {
      method: 'POST',
      path: '/api/v1/places',
      purpose: 'Local business & geographic locations with latitude, longitude, and address',
    },
    {
      method: 'POST',
      path: '/api/v1/scholar',
      purpose: 'Academic papers, DOIs, author citations, publication years, and citation counts',
    },
  ];

  const params = [
    { name: 'q', type: 'string', required: 'Yes', defaultVal: '—', desc: 'Search query string' },
    { name: 'gl', type: 'string', required: 'No', defaultVal: '"us"', desc: 'Two-letter ISO country code' },
    { name: 'hl', type: 'string', required: 'No', defaultVal: '"en"', desc: 'Two-letter ISO language code' },
    { name: 'num', type: 'number', required: 'No', defaultVal: '10', desc: 'Results per page (1–50)' },
    { name: 'page', type: 'number', required: 'No', defaultVal: '1', desc: 'Pagination page index (1–20)' },
  ];

  return (
    <div className="space-y-6">
      {/* Base URL & Auth */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Serper-Compatible API Reference
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Drop-in replacement for Serper requests. Authenticate with <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">X-API-KEY</code> or <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">Authorization: Bearer</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Base Endpoint URL</div>
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono text-xs text-slate-900 dark:text-slate-100 truncate">
                {baseUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyText('baseUrl', baseUrl)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0"
              >
                {copiedId === 'baseUrl' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId === 'baseUrl' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Authentication Header</div>
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono text-xs text-slate-900 dark:text-slate-100 truncate">
                X-API-KEY: {sampleKey}
              </code>
              <button
                type="button"
                onClick={() => void copyText('header', `X-API-KEY: ${sampleKey}`)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0"
              >
                {copiedId === 'header' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId === 'header' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Endpoints Table */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Available Endpoints
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-6 font-medium">Method</th>
                <th className="py-2.5 px-4 font-medium">Path</th>
                <th className="py-2.5 px-6 font-medium">Returned Payload Fields</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {endpoints.map((ep) => (
                <tr key={ep.path}>
                  <td className="py-3 px-6 font-mono font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {ep.method}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {ep.path}
                  </td>
                  <td className="py-3 px-6 text-slate-600 dark:text-slate-300">{ep.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request Body Schema */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Request JSON Parameters
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-6 font-medium">Parameter</th>
                <th className="py-2.5 px-4 font-medium">Type</th>
                <th className="py-2.5 px-4 font-medium">Required</th>
                <th className="py-2.5 px-4 font-medium">Default</th>
                <th className="py-2.5 px-6 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {params.map((p) => (
                <tr key={p.name}>
                  <td className="py-3 px-6 font-mono font-medium text-slate-900 dark:text-white">
                    {p.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">{p.type}</td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{p.required}</td>
                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                    {p.defaultVal}
                  </td>
                  <td className="py-3 px-6 text-slate-600 dark:text-slate-300">{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drop-in Code Snippet */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            TypeScript / Node.js Project Integration
          </h2>
          <button
            type="button"
            onClick={() => void copyText('migration', migrationSnippet)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {copiedId === 'migration' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedId === 'migration' ? 'Copied' : 'Copy Snippet'}</span>
          </button>
        </div>
        <pre className="p-6 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed overflow-x-auto">
          {migrationSnippet}
        </pre>
      </div>
    </div>
  );
}
