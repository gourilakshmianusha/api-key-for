import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Play,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ApiKeyRecord, SearchEndpoint, SerpResponse } from '../types/serp';

interface PlaygroundViewProps {
  keys: ApiKeyRecord[];
  selectedKeyId: string;
  onSelectKeyId: (keyId: string) => void;
  onOpenCreateKey: () => void;
  onRecordUsage: (
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
  ) => Promise<void>;
}

type CodeLang = 'curl' | 'node' | 'python' | 'go' | 'php';
type InspectorTab = 'json' | 'code';

const ENDPOINTS: Array<{ id: SearchEndpoint; label: string; sample: string }> = [
  { id: 'search', label: 'Web Search', sample: 'TypeScript React Server Components' },
  { id: 'news', label: 'News', sample: 'semiconductor manufacturing' },
  { id: 'images', label: 'Images', sample: 'Golden Gate Bridge architecture' },
  { id: 'places', label: 'Places', sample: 'specialty coffee San Francisco' },
  { id: 'scholar', label: 'Scholar', sample: 'attention is all you need transformer' },
];

export function PlaygroundView({
  keys,
  selectedKeyId,
  onSelectKeyId,
  onOpenCreateKey,
  onRecordUsage,
}: PlaygroundViewProps) {
  const activeKeys = useMemo(() => keys.filter((k) => k.status === 'active'), [keys]);
  const selectedKey = useMemo(
    () => activeKeys.find((k) => k.id === selectedKeyId) || activeKeys[0] || null,
    [activeKeys, selectedKeyId]
  );

  const [endpoint, setEndpoint] = useState<SearchEndpoint>('search');
  const [queryText, setQueryText] = useState('TypeScript React Server Components');
  const [gl, setGl] = useState('us');
  const [hl, setHl] = useState('en');
  const [num, setNum] = useState(10);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SerpResponse | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('json');
  const [codeLang, setCodeLang] = useState<CodeLang>('curl');
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [openPaaIndex, setOpenPaaIndex] = useState<number | null>(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!selectedKeyId && activeKeys[0]) {
      onSelectKeyId(activeKeys[0].id);
    }
  }, [activeKeys, selectedKeyId, onSelectKeyId]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-serpforge-app.run.app';
  const displayApiKey = selectedKey?.keyValue || 'YOUR_SERPFORGE_API_KEY';

  const codeSnippet = useMemo(() => {
    const endpointUrl = `${origin}/api/v1/${endpoint}`;
    const payload = JSON.stringify({ q: queryText.trim() || 'openai', gl, hl, num, page });

    switch (codeLang) {
      case 'node':
        return `const response = await fetch("${endpointUrl}", {
  method: "POST",
  headers: {
    "X-API-KEY": "${displayApiKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    q: ${JSON.stringify(queryText.trim() || 'openai')},
    gl: "${gl}",
    hl: "${hl}",
    num: ${num},
    page: ${page}
  })
});

const data = await response.json();
console.log(data);`;
      case 'python':
        return `import requests
import json

url = "${endpointUrl}"
payload = json.dumps({
  "q": ${JSON.stringify(queryText.trim() || 'openai')},
  "gl": "${gl}",
  "hl": "${hl}",
  "num": ${num},
  "page": ${page}
})
headers = {
  "X-API-KEY": "${displayApiKey}",
  "Content-Type": "application/json"
}

response = requests.post(url, headers=headers, data=payload)
print(response.json())`;
      case 'go':
        return `package main

import (
  "bytes"
  "fmt"
  "io"
  "net/http"
)

func main() {
  payload := []byte(\`${payload}\`)
  req, _ := http.NewRequest("POST", "${endpointUrl}", bytes.NewBuffer(payload))
  req.Header.Set("X-API-KEY", "${displayApiKey}")
  req.Header.Set("Content-Type", "application/json")

  res, err := http.DefaultClient.Do(req)
  if err != nil {
    panic(err)
  }
  defer res.Body.Close()
  body, _ := io.ReadAll(res.Body)
  fmt.Println(string(body))
}`;
      case 'php':
        return `<?php
$curl = curl_init();
curl_setopt_array($curl, [
  CURLOPT_URL => "${endpointUrl}",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => '${payload.replace(/'/g, "\\'")}',
  CURLOPT_HTTPHEADER => [
    "X-API-KEY: ${displayApiKey}",
    "Content-Type: application/json"
  ],
]);
$response = curl_exec($curl);
curl_close($curl);
echo $response;`;
      case 'curl':
      default:
        return `curl -X POST "${endpointUrl}" \\
  -H "X-API-KEY: ${displayApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${payload}'`;
    }
  }, [origin, endpoint, queryText, gl, hl, num, page, displayApiKey, codeLang]);

  async function runSearch(overrideQuery?: string, overrideEndpoint?: SearchEndpoint) {
    const activeEndpoint = overrideEndpoint || endpoint;
    const activeQuery = (overrideQuery ?? queryText).trim();
    if (!activeQuery) {
      setError('Enter a search query first.');
      return;
    }
    if (!selectedKey) {
      setError('Create or select an active API key to execute live requests.');
      return;
    }

    setLoading(true);
    setError(null);
    setFailedImages({});
    const start = performance.now();

    try {
      const resp = await fetch(`/api/v1/${activeEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': selectedKey.keyValue,
          'X-SerpForge-Source': 'playground',
        },
        body: JSON.stringify({ q: activeQuery, gl, hl, num, page }),
      });
      const json = (await resp.json()) as SerpResponse & { message?: string };
      const elapsed = Math.round(performance.now() - start);

      if (!resp.ok) {
        setError(json.message || `Request failed with status ${resp.status}.`);
        return;
      }

      setResponse(json);
      const count =
        json.organic?.length ??
        json.news?.length ??
        json.images?.length ??
        json.places?.length ??
        0;

      await onRecordUsage(selectedKey, {
        endpoint: activeEndpoint,
        query: activeQuery,
        gl,
        hl,
        num,
        statusCode: resp.status,
        latencyMs: json.latencyMs || elapsed,
        resultCount: count,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error running search.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch();
  }

  function handleEndpointSwitch(next: SearchEndpoint) {
    setEndpoint(next);
    const meta = ENDPOINTS.find((e) => e.id === next);
    if (meta) {
      setQueryText(meta.sample);
    }
  }

  async function handleCopyJson() {
    if (!response) return;
    await navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1800);
  }

  async function handleCopyCode() {
    await navigator.clipboard.writeText(codeSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  }

  return (
    <div className="space-y-6">
      {/* Query Builder Surface */}
      <form
        onSubmit={handleSubmit}
        className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] p-5 space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg w-fit">
            {ENDPOINTS.map((ep) => (
              <button
                key={ep.id}
                type="button"
                onClick={() => handleEndpointSwitch(ep.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  endpoint === ep.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {ep.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="playground-key-select"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              API Key:
            </label>
            {activeKeys.length > 0 ? (
              <select
                id="playground-key-select"
                value={selectedKey?.id || ''}
                onChange={(e) => onSelectKeyId(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {activeKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.keyPrefix}...)
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={onOpenCreateKey}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Generate Key to Test
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6">
            <label htmlFor="query-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Search Query (q)
            </label>
            <input
              id="query-input"
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Enter query..."
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="gl-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Country (gl)
            </label>
            <select
              id="gl-select"
              value={gl}
              onChange={(e) => setGl(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="us">United States (us)</option>
              <option value="gb">United Kingdom (gb)</option>
              <option value="in">India (in)</option>
              <option value="ca">Canada (ca)</option>
              <option value="de">Germany (de)</option>
              <option value="fr">France (fr)</option>
              <option value="jp">Japan (jp)</option>
              <option value="au">Australia (au)</option>
            </select>
          </div>

          <div className="md:col-span-1">
            <label htmlFor="hl-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Lang (hl)
            </label>
            <select
              id="hl-select"
              value={hl}
              onChange={(e) => setHl(e.target.value)}
              className="w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="en">en</option>
              <option value="es">es</option>
              <option value="fr">fr</option>
              <option value="de">de</option>
              <option value="ja">ja</option>
              <option value="hi">hi</option>
            </select>
          </div>

          <div className="md:col-span-1">
            <label htmlFor="num-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Results
            </label>
            <input
              id="num-input"
              type="number"
              min={1}
              max={30}
              value={num}
              onChange={(e) => setNum(Number(e.target.value) || 10)}
              className="w-full px-2.5 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors whitespace-nowrap"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>{loading ? 'Searching...' : 'Run Search'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</div>
        )}
      </form>

      {/* Split Results & JSON/Code Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Rendered SERP Preview */}
        <div className="lg:col-span-6 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Rendered SERP Preview
            </h2>
            {response && (
              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                200 OK · {response.latencyMs} ms · 0 credits
              </div>
            )}
          </div>

          <div className="p-5 flex-1 overflow-y-auto max-h-[680px] space-y-6">
            {!response ? (
              <div className="h-64 flex flex-col items-center justify-center text-center space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Ready for live SERP inspection
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                  Click Run Search above to execute a real query against <code className="font-mono">/api/v1/{endpoint}</code>.
                </p>
              </div>
            ) : (
              <>
                {/* Knowledge Graph */}
                {response.knowledgeGraph && (
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex gap-4">
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Knowledge Graph · {response.knowledgeGraph.type || 'Entity'}
                      </div>
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                        {response.knowledgeGraph.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4">
                        {response.knowledgeGraph.description}
                      </p>
                      {response.knowledgeGraph.descriptionLink && (
                        <a
                          href={response.knowledgeGraph.descriptionLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline pt-1"
                        >
                          <span>{response.knowledgeGraph.descriptionSource || 'Source'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {response.knowledgeGraph.imageUrl && !failedImages['kg'] && (
                      <img
                        src={response.knowledgeGraph.imageUrl}
                        alt={response.knowledgeGraph.title}
                        referrerPolicy="no-referrer"
                        onError={() => setFailedImages((p) => ({ ...p, kg: true }))}
                        className="w-20 h-20 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                      />
                    )}
                  </div>
                )}

                {/* Organic Web / Scholar Results */}
                {response.organic && response.organic.length > 0 && (
                  <div className="space-y-5">
                    {response.organic.map((item) => (
                      <div key={`${item.position}-${item.link}`} className="space-y-1">
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          #{item.position} ·{' '}
                          {'displayLink' in item && item.displayLink
                            ? item.displayLink
                            : 'publicationInfo' in item
                              ? item.publicationInfo
                              : item.link}
                        </div>
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="block font-display text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {item.title}
                        </a>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.snippet}
                        </p>
                        {'citedBy' in item && typeof item.citedBy === 'number' && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            Cited by {item.citedBy.toLocaleString()}
                            {item.year ? ` · ${item.year}` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* News Results */}
                {response.news && response.news.length > 0 && (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {response.news.map((item) => (
                      <div key={`${item.position}-${item.link}`} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {item.source} · {item.date}
                        </div>
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="block font-display text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {item.title}
                        </a>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.snippet}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Image Results */}
                {response.images && response.images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {response.images.map((img) => {
                      const broken = failedImages[img.thumbnailUrl];
                      return (
                        <a
                          key={`${img.position}-${img.imageUrl}`}
                          href={img.link}
                          target="_blank"
                          rel="noreferrer"
                          className="group block border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900"
                        >
                          {broken ? (
                            <div className="aspect-4/3 flex flex-col items-center justify-center p-3 text-center text-slate-400">
                              <ImageIcon className="w-5 h-5 mb-1" />
                              <span className="text-[11px] line-clamp-2">{img.title}</span>
                            </div>
                          ) : (
                            <img
                              src={img.thumbnailUrl}
                              alt={img.title}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedImages((prev) => ({ ...prev, [img.thumbnailUrl]: true }))
                              }
                              className="w-full aspect-4/3 object-cover group-hover:scale-[1.02] transition-transform"
                            />
                          )}
                          <div className="p-2 text-[11px] text-slate-700 dark:text-slate-300 truncate">
                            {img.title}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Places Results */}
                {response.places && response.places.length > 0 && (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {response.places.map((place) => (
                      <div key={`${place.position}-${place.cid}`} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>{place.title}</span>
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">{place.address}</p>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Category: {place.category} · CID {place.cid}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* People Also Ask */}
                {response.peopleAlsoAsk && response.peopleAlsoAsk.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      People also ask
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {response.peopleAlsoAsk.map((paa, idx) => {
                        const isOpen = openPaaIndex === idx;
                        return (
                          <div key={paa.question} className="p-3">
                            <button
                              type="button"
                              onClick={() => setOpenPaaIndex(isOpen ? null : idx)}
                              className="w-full flex items-center justify-between gap-2 text-left text-xs font-medium text-slate-900 dark:text-white"
                            >
                              <span>{paa.question}</span>
                              {isOpen ? (
                                <ChevronUp className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                              )}
                            </button>
                            {isOpen && (
                              <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                                <p>{paa.snippet}</p>
                                <a
                                  href={paa.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-block text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {paa.title}
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Related Searches */}
                {response.relatedSearches && response.relatedSearches.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Related searches
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {response.relatedSearches.map((rel) => (
                        <button
                          key={rel.query}
                          type="button"
                          onClick={() => {
                            setQueryText(rel.query);
                            void runSearch(rel.query);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-blue-500 text-xs text-slate-700 dark:text-slate-200 transition-colors"
                        >
                          {rel.query}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: JSON & Code Snippets */}
        <div className="lg:col-span-6 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0F1520] flex flex-col">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
              <button
                type="button"
                onClick={() => setInspectorTab('json')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  inspectorTab === 'json'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                JSON Response
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('code')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  inspectorTab === 'code'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Integration Code
              </button>
            </div>

            {inspectorTab === 'json' ? (
              <button
                type="button"
                onClick={() => void handleCopyJson()}
                disabled={!response}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            )}
          </div>

          {inspectorTab === 'code' && (
            <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  { id: 'curl', label: 'cURL' },
                  { id: 'node', label: 'Node.js' },
                  { id: 'python', label: 'Python' },
                  { id: 'go', label: 'Go' },
                  { id: 'php', label: 'PHP' },
                ] as Array<{ id: CodeLang; label: string }>
              ).map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setCodeLang(lang.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    codeLang === lang.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}

          <div className="p-5 flex-1 overflow-auto max-h-[640px] bg-slate-950 text-slate-100 rounded-b-xl">
            {inspectorTab === 'json' ? (
              <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                {response
                  ? JSON.stringify(response, null, 2)
                  : 'Run a search query on the left to inspect the Serper-compatible JSON response.'}
              </pre>
            ) : (
              <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                {codeSnippet}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
