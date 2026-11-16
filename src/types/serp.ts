export type SearchEndpoint = 'search' | 'news' | 'images' | 'places' | 'scholar';

export interface SearchRequestParams {
  q: string;
  gl?: string;
  hl?: string;
  num?: number;
  page?: number;
}

export interface OrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  displayLink?: string;
}

export interface KnowledgeGraph {
  title: string;
  type?: string;
  description: string;
  descriptionSource?: string;
  descriptionLink?: string;
  imageUrl?: string;
  attributes?: Record<string, string>;
}

export interface PeopleAlsoAskItem {
  question: string;
  snippet: string;
  title: string;
  link: string;
}

export interface RelatedSearchItem {
  query: string;
}

export interface NewsResult {
  title: string;
  link: string;
  snippet: string;
  date: string;
  source: string;
  position: number;
}

export interface ImageResult {
  title: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  thumbnailUrl: string;
  source: string;
  link: string;
  position: number;
}

export interface PlaceResult {
  position: number;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  cid: string;
}

export interface ScholarResult {
  title: string;
  link: string;
  publicationInfo: string;
  snippet: string;
  year?: number;
  citedBy?: number;
  position: number;
}

export interface SerpResponse {
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
    num: number;
    page: number;
    type: SearchEndpoint;
    engine: string;
  };
  knowledgeGraph?: KnowledgeGraph;
  organic?: OrganicResult[] | ScholarResult[];
  news?: NewsResult[];
  images?: ImageResult[];
  places?: PlaceResult[];
  peopleAlsoAsk?: PeopleAlsoAskItem[];
  relatedSearches?: RelatedSearchItem[];
  credits: number;
  plan: 'lifetime-free';
  latencyMs: number;
}

export interface ApiKeyRecord {
  id: string;
  ownerId: string;
  name: string;
  keyPrefix: string;
  keyMasked: string;
  keyValue: string;
  status: 'active' | 'revoked';
  requestCount: number;
  lastUsedAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RequestLogRecord {
  id: string;
  ownerId: string;
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
  source: 'playground' | 'external';
  createdAt?: unknown;
  timestampMs?: number;
}
