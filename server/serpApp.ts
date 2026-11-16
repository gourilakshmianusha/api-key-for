import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express, { Express, Request, Response, Router } from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import type {
  ImageResult,
  KnowledgeGraph,
  NewsResult,
  OrganicResult,
  PeopleAlsoAskItem,
  PlaceResult,
  RelatedSearchItem,
  ScholarResult,
  SearchEndpoint,
  SerpResponse,
} from '../src/types/serp';

const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isServerless
  ? '/tmp/.serpforge-data'
  : path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'serpforge-state.json');

interface FirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
}

function loadFirebaseConfig(): FirebaseConfig | null {
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(process.cwd(), '..', '..', 'firebase-applet-config.json'),
  ];
  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as FirebaseConfig;
      }
    } catch {
      // Ignore unreadable candidate
    }
  }
  return null;
}

const fbConfig = loadFirebaseConfig();
const KEY_SECRET =
  process.env.SERPFORGE_KEY_SECRET ||
  crypto
    .createHash('sha256')
    .update(`serpforge:${fbConfig?.projectId || 'local'}:${fbConfig?.appId || 'default'}`)
    .digest('hex');

interface KeyTelemetryEntry {
  keyId: string;
  ownerId: string;
  keyName: string;
  requestCount: number;
  lastUsedAt: string;
}

interface ExternalLogEntry {
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
}

interface PersistedState {
  revokedKeyIds: string[];
  telemetry: Record<string, KeyTelemetryEntry>;
  recentLogs: ExternalLogEntry[];
}

function loadState(): PersistedState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as Partial<PersistedState>;
      return {
        revokedKeyIds: Array.isArray(raw.revokedKeyIds) ? raw.revokedKeyIds : [],
        telemetry: raw.telemetry && typeof raw.telemetry === 'object' ? raw.telemetry : {},
        recentLogs: Array.isArray(raw.recentLogs) ? raw.recentLogs : [],
      };
    }
  } catch {
    // Ignore corrupt state
  }
  return { revokedKeyIds: [], telemetry: {}, recentLogs: [] };
}

function saveState(state: PersistedState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Best-effort persistence in read-only environments
  }
}

const state = loadState();
const revokedSet = new Set<string>(state.revokedKeyIds);

function signKeyId(keyId: string): string {
  return crypto.createHmac('sha256', KEY_SECRET).update(keyId).digest('hex').slice(0, 24);
}

function mintLifetimeKey(keyId: string): {
  keyId: string;
  keyValue: string;
  keyPrefix: string;
  keyMasked: string;
} {
  const sig = signKeyId(keyId);
  const keyValue = `sf_live_${keyId}_${sig}`;
  const keyPrefix = `sf_live_${keyId.slice(0, 4)}`;
  const keyMasked = `sf_live_${keyId.slice(0, 4)}••••••••${sig.slice(-6)}`;
  return { keyId, keyValue, keyPrefix, keyMasked };
}

function verifyLifetimeKey(token: string): { valid: boolean; keyId?: string; reason?: string } {
  const trimmed = token.trim();
  const match = /^sf_live_([a-zA-Z0-9_-]{6,40})_([a-f0-9]{24})$/.exec(trimmed);
  if (!match) {
    return { valid: false, reason: 'Invalid API key format.' };
  }
  const [, keyId, providedSig] = match;
  const expectedSig = signKeyId(keyId);
  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'Invalid API key signature.' };
  }
  if (revokedSet.has(keyId)) {
    return { valid: false, reason: 'API key has been revoked.' };
  }
  return { valid: true, keyId };
}

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  if (!fbConfig?.apiKey || !idToken) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fbConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as { users?: Array<{ localId?: string; email?: string }> };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

function decodeDdgUrl(rawHref: string): string {
  try {
    const normalized = rawHref.startsWith('//') ? `https:${rawHref}` : rawHref;
    const url = new URL(normalized, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    if (uddg) return uddg;
    return normalized;
  } catch {
    return rawHref;
  }
}

function extractDisplayLink(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.hostname}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return rawUrl;
  }
}

function sanitizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function fetchDuckDuckGoOrganic(
  query: string,
  gl: string,
  hl: string,
  num: number,
  page: number
): Promise<OrganicResult[]> {
  const kl = `${gl.toLowerCase()}-${hl.toLowerCase()}`;
  const startOffset = Math.max(0, (page - 1) * num);
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(kl)}&s=${startOffset}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': `${hl}-${gl.toUpperCase()},${hl};q=0.9,en;q=0.8`,
    },
    signal: AbortSignal.timeout(6500),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const $ = cheerio.load(html);
  const results: OrganicResult[] = [];
  $('.result').each((_, el) => {
    if (results.length >= num) return false;
    const linkEl = $(el).find('.result__a');
    const title = sanitizeText(linkEl.text());
    const rawHref = linkEl.attr('href') || '';
    const link = decodeDdgUrl(rawHref);
    const snippet = sanitizeText($(el).find('.result__snippet').text());
    if (title && link && link.startsWith('http') && !link.includes('duckduckgo.com/y.js')) {
      results.push({
        title,
        link,
        snippet: snippet || title,
        position: results.length + 1,
        displayLink: extractDisplayLink(link),
      });
    }
  });
  return results;
}

async function fetchWikipediaFallbackOrganic(query: string, num: number): Promise<OrganicResult[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&srlimit=${Math.min(num, 20)}&format=json&utf8=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SerpForge/1.0' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { search?: Array<{ title: string; snippet: string }> };
  };
  const items = data.query?.search || [];
  return items.map((item, idx) => {
    const cleanSnippet = sanitizeText(item.snippet.replace(/<[^>]+>/g, ''));
    const link = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`;
    return {
      title: `${item.title} - Wikipedia`,
      link,
      snippet: cleanSnippet,
      position: idx + 1,
      displayLink: extractDisplayLink(link),
    };
  });
}

async function fetchKnowledgeGraph(query: string): Promise<KnowledgeGraph | undefined> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      query
    )}&limit=1&format=json`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'SerpForge/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!searchRes.ok) return undefined;
    const openSearch = (await searchRes.json()) as [string, string[], string[], string[]];
    const topTitle = openSearch[1]?.[0];
    if (!topTitle) return undefined;

    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle.replace(/\s+/g, '_'))}`,
      {
        headers: { 'User-Agent': 'SerpForge/1.0' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!summaryRes.ok) return undefined;
    const summary = (await summaryRes.json()) as {
      title?: string;
      description?: string;
      extract?: string;
      type?: string;
      thumbnail?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    };
    if (!summary.extract || summary.type === 'disambiguation') return undefined;
    return {
      title: summary.title || topTitle,
      type: summary.description || undefined,
      description: summary.extract,
      descriptionSource: 'Wikipedia',
      descriptionLink: summary.content_urls?.desktop?.page,
      imageUrl: summary.thumbnail?.source,
    };
  } catch {
    return undefined;
  }
}

async function fetchRelatedQueries(query: string): Promise<RelatedSearchItem[]> {
  try {
    const res = await fetch(
      `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`,
      {
        headers: { 'User-Agent': 'SerpForge/1.0' },
        signal: AbortSignal.timeout(3500),
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    const suggestions = Array.isArray(data[1]) ? data[1] : [];
    return suggestions
      .filter((s) => s.toLowerCase() !== query.toLowerCase())
      .slice(0, 8)
      .map((s) => ({ query: s }));
  } catch {
    return [];
  }
}

function derivePeopleAlsoAsk(
  query: string,
  organic: OrganicResult[],
  kg?: KnowledgeGraph
): PeopleAlsoAskItem[] {
  const items: PeopleAlsoAskItem[] = [];
  if (kg) {
    items.push({
      question: `What is ${kg.title}?`,
      snippet: kg.description.slice(0, 240),
      title: `${kg.title} - Wikipedia`,
      link: kg.descriptionLink || `https://en.wikipedia.org/wiki/${encodeURIComponent(kg.title)}`,
    });
  }
  for (const r of organic.slice(0, 3)) {
    if (r.snippet && r.snippet.length > 30) {
      items.push({
        question: `How does ${query} relate to ${r.title.split(' - ')[0].slice(0, 48)}?`,
        snippet: r.snippet,
        title: r.title,
        link: r.link,
      });
    }
  }
  return items.slice(0, 4);
}

async function executeWebSearch(
  q: string,
  gl: string,
  hl: string,
  num: number,
  page: number
): Promise<Omit<SerpResponse, 'credits' | 'plan' | 'latencyMs'>> {
  const [ddgOrganic, kg, related] = await Promise.all([
    fetchDuckDuckGoOrganic(q, gl, hl, num, page).catch(() => []),
    page === 1 ? fetchKnowledgeGraph(q).catch(() => undefined) : Promise.resolve(undefined),
    fetchRelatedQueries(q).catch(() => []),
  ]);

  let organic = ddgOrganic;
  if (organic.length === 0) {
    organic = await fetchWikipediaFallbackOrganic(q, num).catch(() => []);
  }

  const peopleAlsoAsk = page === 1 ? derivePeopleAlsoAsk(q, organic, kg) : [];

  return {
    searchParameters: { q, gl, hl, num, page, type: 'search', engine: 'google' },
    ...(kg ? { knowledgeGraph: kg } : {}),
    organic,
    ...(peopleAlsoAsk.length > 0 ? { peopleAlsoAsk } : {}),
    ...(related.length > 0 ? { relatedSearches: related } : {}),
  };
}

async function executeNewsSearch(
  q: string,
  gl: string,
  hl: string,
  num: number,
  page: number
): Promise<Omit<SerpResponse, 'credits' | 'plan' | 'latencyMs'>> {
  const upperGl = gl.toUpperCase();
  const ceid = `${upperGl}:${hl}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${encodeURIComponent(
    `${hl}-${upperGl}`
  )}&gl=${encodeURIComponent(upperGl)}&ceid=${encodeURIComponent(ceid)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SerpForge/1.0' },
    signal: AbortSignal.timeout(6000),
  });
  const news: NewsResult[] = [];
  if (res.ok) {
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const start = (page - 1) * num;
    const allItems = $('item').toArray();
    for (let i = start; i < allItems.length && news.length < num; i++) {
      const el = allItems[i];
      const title = sanitizeText($(el).find('title').text());
      const link = sanitizeText($(el).find('link').text());
      const pubDate = sanitizeText($(el).find('pubDate').text());
      const source = sanitizeText($(el).find('source').text()) || 'Google News';
      const rawDesc = $(el).find('description').text();
      const snippet = sanitizeText(cheerio.load(rawDesc).text()) || title;
      if (title && link) {
        news.push({
          title,
          link,
          snippet,
          date: pubDate,
          source,
          position: news.length + 1,
        });
      }
    }
  }
  return {
    searchParameters: { q, gl, hl, num, page, type: 'news', engine: 'google' },
    news,
  };
}

async function executeImageSearch(
  q: string,
  gl: string,
  hl: string,
  num: number,
  page: number
): Promise<Omit<SerpResponse, 'credits' | 'plan' | 'latencyMs'>> {
  const offset = (page - 1) * num;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    q
  )}&gsrnamespace=6&gsrlimit=${Math.min(num, 30)}&gsroffset=${offset}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SerpForge/1.0' },
    signal: AbortSignal.timeout(6000),
  });
  const images: ImageResult[] = [];
  if (res.ok) {
    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title: string;
            index?: number;
            imageinfo?: Array<{
              url?: string;
              thumburl?: string;
              width?: number;
              height?: number;
              mime?: string;
              descriptionurl?: string;
            }>;
          }
        >;
      };
    };
    const pages = Object.values(data.query?.pages || {}).sort(
      (a, b) => (a.index ?? 999) - (b.index ?? 999)
    );
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      if (!info?.url || (info.mime && !info.mime.startsWith('image/'))) continue;
      images.push({
        title: p.title.replace(/^File:/, '').replace(/\.[^/.]+$/, ''),
        imageUrl: info.url,
        imageWidth: info.width || 800,
        imageHeight: info.height || 600,
        thumbnailUrl: info.thumburl || info.url,
        source: 'Wikimedia Commons',
        link: info.descriptionurl || info.url,
        position: images.length + 1,
      });
    }
  }
  return {
    searchParameters: { q, gl, hl, num, page, type: 'images', engine: 'google' },
    images,
  };
}

async function executePlacesSearch(
  q: string,
  gl: string,
  hl: string,
  num: number,
  page: number
): Promise<Omit<SerpResponse, 'credits' | 'plan' | 'latencyMs'>> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    q
  )}&format=jsonv2&addressdetails=1&limit=${Math.min(num, 25)}&accept-language=${encodeURIComponent(hl)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SerpForge/1.0 (https://serpforge.local)' },
    signal: AbortSignal.timeout(6000),
  });
  const places: PlaceResult[] = [];
  if (res.ok) {
    const rows = (await res.json()) as Array<{
      place_id: number;
      name?: string;
      display_name: string;
      lat: string;
      lon: string;
      type?: string;
      category?: string;
    }>;
    for (const row of rows) {
      places.push({
        position: places.length + 1,
        title: row.name || row.display_name.split(',')[0],
        address: row.display_name,
        latitude: Number(row.lat),
        longitude: Number(row.lon),
        category: row.type || row.category || 'place',
        cid: String(row.place_id),
      });
    }
  }
  return {
    searchParameters: { q, gl, hl, num, page, type: 'places', engine: 'google' },
    places,
  };
}

async function executeScholarSearch(
  q: string,
  gl: string,
  hl: string,
  num: number,
  page: number
): Promise<Omit<SerpResponse, 'credits' | 'plan' | 'latencyMs'>> {
  const offset = (page - 1) * num;
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(
    q
  )}&rows=${Math.min(num, 25)}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SerpForge/1.0 (mailto:dev@serpforge.local)' },
    signal: AbortSignal.timeout(6500),
  });
  const organic: ScholarResult[] = [];
  if (res.ok) {
    const data = (await res.json()) as {
      message?: {
        items?: Array<{
          title?: string[];
          URL?: string;
          DOI?: string;
          author?: Array<{ given?: string; family?: string }>;
          'container-title'?: string[];
          published?: { 'date-parts'?: number[][] };
          'is-referenced-by-count'?: number;
          abstract?: string;
        }>;
      };
    };
    for (const item of data.message?.items || []) {
      const title = item.title?.[0];
      const link = item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : '');
      if (!title || !link) continue;
      const authors = (item.author || [])
        .slice(0, 3)
        .map((a) => [a.given, a.family].filter(Boolean).join(' '))
        .join(', ');
      const journal = item['container-title']?.[0] || 'Academic Publication';
      const year = item.published?.['date-parts']?.[0]?.[0];
      const snippet = item.abstract
        ? sanitizeText(item.abstract.replace(/<[^>]+>/g, '')).slice(0, 260)
        : `${authors ? `${authors} — ` : ''}${journal}${year ? ` (${year})` : ''}`;
      organic.push({
        title,
        link,
        publicationInfo: [authors, journal, year].filter(Boolean).join(' · '),
        snippet,
        year,
        citedBy: item['is-referenced-by-count'] ?? 0,
        position: organic.length + 1,
      });
    }
  }
  return {
    searchParameters: { q, gl, hl, num, page, type: 'scholar', engine: 'google' },
    organic,
  };
}

function recordRequestTelemetry(
  keyId: string,
  endpoint: SearchEndpoint,
  query: string,
  gl: string,
  hl: string,
  num: number,
  statusCode: number,
  latencyMs: number,
  resultCount: number
): void {
  const nowIso = new Date().toISOString();
  const existing = state.telemetry[keyId] || {
    keyId,
    ownerId: '',
    keyName: 'API Key',
    requestCount: 0,
    lastUsedAt: nowIso,
  };
  existing.requestCount += 1;
  existing.lastUsedAt = nowIso;
  state.telemetry[keyId] = existing;

  state.recentLogs.unshift({
    id: `ext_${crypto.randomBytes(8).toString('hex')}`,
    keyId,
    keyName: existing.keyName || 'API Key',
    endpoint,
    query: query.slice(0, 300),
    gl,
    hl,
    num,
    statusCode,
    latencyMs,
    resultCount,
    timestampIso: nowIso,
  });
  if (state.recentLogs.length > 150) {
    state.recentLogs.length = 150;
  }
  saveState(state);
}

export function createSerpApiRouter(): Router {
  const router = Router();

  const healthHandler = (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      plan: 'lifetime-free',
      endpoints: ['search', 'news', 'images', 'places', 'scholar'],
    });
  };

  router.get('/v1/health', healthHandler);
  router.get('/health', healthHandler);

  // Mint a signed lifetime-free API key
  router.post('/keys/mint', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const requestedName =
      typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : 'Project Key';

    let ownerId = 'guest';
    if (idToken) {
      const verified = await verifyFirebaseIdToken(idToken);
      if (!verified) {
        res.status(401).json({ error: 'Invalid Firebase authentication token.' });
        return;
      }
      ownerId = verified.uid;
    }

    const prefixTag = ownerId === 'guest' ? 'g' : 'u';
    const keyId = `${prefixTag}_${crypto.randomBytes(6).toString('hex')}`;
    const minted = mintLifetimeKey(keyId);

    state.telemetry[keyId] = {
      keyId,
      ownerId,
      keyName: requestedName || 'Project Key',
      requestCount: 0,
      lastUsedAt: '',
    };
    saveState(state);

    res.json({
      ...minted,
      ownerId,
      name: requestedName || 'Project Key',
      plan: 'lifetime-free',
    });
  });

  // Revoke an API key
  router.post('/keys/revoke', async (req: Request, res: Response) => {
    const keyId = typeof req.body?.keyId === 'string' ? req.body.keyId.trim() : '';
    if (!keyId || !/^[a-zA-Z0-9_-]{4,64}$/.test(keyId)) {
      res.status(400).json({ error: 'Valid keyId is required.' });
      return;
    }
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (idToken) {
      const verified = await verifyFirebaseIdToken(idToken);
      if (!verified) {
        res.status(401).json({ error: 'Invalid Firebase authentication token.' });
        return;
      }
    }
    revokedSet.add(keyId);
    state.revokedKeyIds = Array.from(revokedSet);
    saveState(state);
    res.json({ ok: true, keyId, status: 'revoked' });
  });

  // Sync key metadata & pull live telemetry
  router.post('/keys/sync', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const verified = await verifyFirebaseIdToken(idToken);
    if (!verified) {
      res.status(401).json({ error: 'Invalid Firebase authentication token.' });
      return;
    }
    const keys = Array.isArray(req.body?.keys)
      ? (req.body.keys as Array<{ id: string; name: string; status: string }>)
      : [];

    const ownedKeyIds = new Set<string>();
    for (const k of keys) {
      if (!k?.id) continue;
      ownedKeyIds.add(k.id);
      if (k.status === 'revoked') {
        revokedSet.add(k.id);
      }
      const existing = state.telemetry[k.id];
      state.telemetry[k.id] = {
        keyId: k.id,
        ownerId: verified.uid,
        keyName: k.name || existing?.keyName || 'API Key',
        requestCount: existing?.requestCount ?? 0,
        lastUsedAt: existing?.lastUsedAt ?? '',
      };
    }
    state.revokedKeyIds = Array.from(revokedSet);
    saveState(state);

    const telemetryByKey: Record<string, { requestCount: number; lastUsedAt: string }> = {};
    for (const keyId of ownedKeyIds) {
      const t = state.telemetry[keyId];
      if (t) {
        telemetryByKey[keyId] = { requestCount: t.requestCount, lastUsedAt: t.lastUsedAt };
      }
    }
    const recentExternalLogs = state.recentLogs.filter((l) => ownedKeyIds.has(l.keyId));
    res.json({ telemetryByKey, recentExternalLogs });
  });

  const validEndpoints = new Set<SearchEndpoint>(['search', 'news', 'images', 'places', 'scholar']);

  router.post('/v1/:endpoint', async (req: Request, res: Response) => {
    const start = Date.now();
    const endpoint = req.params.endpoint as SearchEndpoint;
    if (!validEndpoints.has(endpoint)) {
      res.status(404).json({ message: `Unknown search endpoint '${endpoint}'.`, statusCode: 404 });
      return;
    }

    const headerKey =
      (req.headers['x-api-key'] as string | undefined) ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : undefined);

    if (!headerKey) {
      res.status(401).json({ message: 'Unauthorized. Missing X-API-KEY header.', statusCode: 401 });
      return;
    }

    const verification = verifyLifetimeKey(headerKey);
    if (!verification.valid || !verification.keyId) {
      res.status(401).json({
        message: `Unauthorized. ${verification.reason || 'Invalid API key.'}`,
        statusCode: 401,
      });
      return;
    }

    const body = req.body || {};
    const q = typeof body.q === 'string' ? body.q.trim() : '';
    if (!q) {
      res.status(400).json({ message: 'Missing required search query parameter "q".', statusCode: 400 });
      return;
    }

    const gl = typeof body.gl === 'string' && body.gl.trim() ? body.gl.trim().slice(0, 10) : 'us';
    const hl = typeof body.hl === 'string' && body.hl.trim() ? body.hl.trim().slice(0, 10) : 'en';
    const num = Math.min(Math.max(Number(body.num) || 10, 1), 50);
    const page = Math.min(Math.max(Number(body.page) || 1, 1), 20);

    try {
      let resultPayload: Omit<SerpResponse, 'credits' | 'plan' | 'latencyMs'>;
      switch (endpoint) {
        case 'news':
          resultPayload = await executeNewsSearch(q, gl, hl, num, page);
          break;
        case 'images':
          resultPayload = await executeImageSearch(q, gl, hl, num, page);
          break;
        case 'places':
          resultPayload = await executePlacesSearch(q, gl, hl, num, page);
          break;
        case 'scholar':
          resultPayload = await executeScholarSearch(q, gl, hl, num, page);
          break;
        case 'search':
        default:
          resultPayload = await executeWebSearch(q, gl, hl, num, page);
          break;
      }

      const latencyMs = Date.now() - start;
      const resultCount =
        resultPayload.organic?.length ??
        resultPayload.news?.length ??
        resultPayload.images?.length ??
        resultPayload.places?.length ??
        0;

      const isPlayground = req.headers['x-serpforge-source'] === 'playground';
      if (!isPlayground) {
        recordRequestTelemetry(verification.keyId, endpoint, q, gl, hl, num, 200, latencyMs, resultCount);
      }

      const response: SerpResponse = {
        ...resultPayload,
        credits: 0,
        plan: 'lifetime-free',
        latencyMs,
      };

      res.setHeader('X-SerpForge-Plan', 'lifetime-free');
      res.setHeader('X-SerpForge-RateLimit-Remaining', 'unlimited');
      res.setHeader('X-SerpForge-Latency-Ms', String(latencyMs));
      res.json(response);
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Search upstream request failed.';
      res.status(502).json({ message, statusCode: 502, latencyMs });
    }
  });

  return router;
}

export function createSerpApp(options: { mountRoot?: boolean } = {}): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const router = createSerpApiRouter();
  app.use('/api', router);
  app.use('/.netlify/functions/api', router);
  if (options.mountRoot) {
    app.use('/', router);
  }

  return app;
}
