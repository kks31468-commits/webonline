export type RenderMode = 'inline' | 'cdn-router' | 'data-bridge';

export interface ParsedGitHubInput {
  owner: string;
  repo: string;
  branch?: string;
  subPath: string;
}

export interface RepoMeta {
  owner: string;
  repo: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  stars: number;
  isPrivate: boolean;
  htmlUrl: string;
  updatedAt: string;
}

export type FileCategory = 'html' | 'css' | 'js' | 'data' | 'image' | 'other';

export interface RepoFileItem {
  path: string;
  name: string;
  size: number;
  sha: string;
  category: FileCategory;
  extension: string;
}

export interface GasConfig {
  owner: string;
  repo: string;
  branch: string;
  basePath: string;
  entryFile: string;
  dataFile: string;
  pageTitle: string;
  renderMode: RenderMode;
  cacheSeconds: number;
  allowIframe: boolean;
  usePrivateToken: boolean;
}

export interface PreviewBundleResult {
  html: string;
  entryPath: string;
  inlinedCssFiles: string[];
  inlinedJsFiles: string[];
  rewrittenAssetCount: number;
  totalBytes: number;
  warnings: string[];
}

export interface GeneratedGasProject {
  codeGs: string;
  indexHtml?: string;
  appsscriptJson: string;
}

export interface AiMagicSetupResult {
  summaryTh: string;
  recommendedMode: RenderMode;
  basePath: string;
  entryFile: string;
  dataFile: string;
  pageTitle: string;
  cacheSeconds: number;
  needsCustomHtml: boolean;
  customIndexHtml: string;
  deploymentNoteTh: string;
}

