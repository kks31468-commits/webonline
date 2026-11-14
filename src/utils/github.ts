import {
  FileCategory,
  ParsedGitHubInput,
  PreviewBundleResult,
  RepoFileItem,
  RepoMeta,
} from '../types/github';

export function parseGitHubInput(rawInput: string): ParsedGitHubInput | null {
  const trimmed = rawInput.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!trimmed) return null;

  // Match full URL: https://github.com/owner/repo[/tree/branch[/subpath...]]
  const urlMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?$/i
  );
  if (urlMatch) {
    const [, owner, repo, branch, rawPath] = urlMatch;
    let subPath = (rawPath || '').replace(/^\/+|\/+$/g, '');
    // If user pasted a /blob/branch/folder/index.html URL, strip the filename for subPath
    if (trimmed.includes('/blob/') && subPath.includes('.')) {
      const parts = subPath.split('/');
      parts.pop();
      subPath = parts.join('/');
    }
    return { owner, repo, branch, subPath };
  }

  // Match shorthand: owner/repo or owner/repo/subpath
  const shortMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.*))?$/);
  if (shortMatch) {
    const [, owner, repo, rawPath] = shortMatch;
    return {
      owner,
      repo,
      subPath: (rawPath || '').replace(/^\/+|\/+$/g, ''),
    };
  }

  return null;
}

export function classifyFile(path: string): { category: FileCategory; extension: string } {
  const fileName = path.split('/').pop() || '';
  const dotIdx = fileName.lastIndexOf('.');
  const extension = dotIdx >= 0 ? fileName.slice(dotIdx + 1).toLowerCase() : '';

  if (['html', 'htm'].includes(extension)) return { category: 'html', extension };
  if (['css', 'scss'].includes(extension)) return { category: 'css', extension };
  if (['js', 'mjs', 'cjs'].includes(extension)) return { category: 'js', extension };
  if (['json', 'md', 'markdown', 'csv', 'txt', 'xml', 'yml', 'yaml'].includes(extension)) {
    return { category: 'data', extension };
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif'].includes(extension)) {
    return { category: 'image', extension };
  }
  return { category: 'other', extension };
}

function buildApiHeaders(token?: string, accept = 'application/vnd.github+json'): HeadersInit {
  const headers: Record<string, string> = {
    Accept: accept,
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

export async function fetchGitHubRepository(
  parsed: ParsedGitHubInput,
  token?: string
): Promise<{ meta: RepoMeta; branch: string; files: RepoFileItem[] }> {
  const repoRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
    { headers: buildApiHeaders(token) }
  );

  if (!repoRes.ok) {
    if (repoRes.status === 404) {
      throw new Error(
        'ไม่พบ Repository นี้บน GitHub (หรือเป็น Private Repo ที่ต้องใส่ GitHub Token)'
      );
    }
    if (repoRes.status === 403 || repoRes.status === 429) {
      throw new Error(
        'GitHub API เกินขีดจำกัดชั่วคราว (60 ครั้ง/ชั่วโมงสำหรับผู้ไม่ล็อกอิน) กรุณาใส่ Personal Access Token หรือรอสักครู่'
      );
    }
    throw new Error(`ไม่สามารถเชื่อมต่อ GitHub API ได้ (รหัสสถานะ ${repoRes.status})`);
  }

  const repoJson = await repoRes.json();
  const branch = parsed.branch || repoJson.default_branch || 'main';

  const meta: RepoMeta = {
    owner: repoJson.owner?.login || parsed.owner,
    repo: repoJson.name || parsed.repo,
    fullName: repoJson.full_name || `${parsed.owner}/${parsed.repo}`,
    description: repoJson.description || '',
    defaultBranch: repoJson.default_branch || 'main',
    stars: repoJson.stargazers_count ?? 0,
    isPrivate: Boolean(repoJson.private),
    htmlUrl: repoJson.html_url || `https://github.com/${parsed.owner}/${parsed.repo}`,
    updatedAt: repoJson.updated_at || '',
  };

  const treeRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: buildApiHeaders(token) }
  );

  if (!treeRes.ok) {
    if (treeRes.status === 404) {
      throw new Error(`ไม่พบ Branch "${branch}" ใน Repository นี้`);
    }
    throw new Error(`ไม่สามารถดึงรายการไฟล์จาก Branch "${branch}" ได้ (${treeRes.status})`);
  }

  const treeJson = await treeRes.json();
  const rawTree: Array<{ path: string; type: string; size?: number; sha: string }> =
    treeJson.tree || [];

  const files: RepoFileItem[] = rawTree
    .filter(
      (item) =>
        item.type === 'blob' &&
        !item.path.startsWith('.git/') &&
        !item.path.includes('node_modules/')
    )
    .map((item) => {
      const { category, extension } = classifyFile(item.path);
      return {
        path: item.path,
        name: item.path.split('/').pop() || item.path,
        size: item.size ?? 0,
        sha: item.sha,
        category,
        extension,
      };
    });

  return { meta, branch, files };
}

export async function fetchGitHubFileText(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  token?: string
): Promise<string> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const encodedPath = cleanPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  // Use raw.githubusercontent.com for public repos (no API rate limit!)
  if (!token || !token.trim()) {
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
    const res = await fetch(rawUrl);
    if (!res.ok) {
      throw new Error(`ไม่สามารถดึงไฟล์ ${cleanPath} ได้ (${res.status})`);
    }
    return await res.text();
  }

  // Use GitHub Contents API with raw media type when token is provided (supports Private Repos)
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(apiUrl, {
    headers: buildApiHeaders(token, 'application/vnd.github.raw+json'),
  });
  if (!res.ok) {
    throw new Error(`ไม่สามารถดึงไฟล์ ${cleanPath} ด้วย Token ได้ (${res.status})`);
  }
  return await res.text();
}

export function resolveRepoRelativePath(baseFilePath: string, relativeRef: string): string {
  const cleanRef = relativeRef.split('?')[0].split('#')[0].trim();
  if (!cleanRef) return '';

  // Remove leading slash if repo-root relative
  if (cleanRef.startsWith('/')) {
    return cleanRef.replace(/^\/+/, '');
  }

  const baseParts = baseFilePath.split('/');
  baseParts.pop(); // remove filename

  const refParts = cleanRef.split('/');
  for (const part of refParts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (baseParts.length > 0) baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  return baseParts.join('/');
}

export function isRelativeAssetUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return !(
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('javascript:')
  );
}

export function getCdnAssetUrl(
  owner: string,
  repo: string,
  branch: string,
  repoPath: string,
  isPrivate = false
): string {
  const cleanPath = repoPath.replace(/^\/+/, '');
  if (isPrivate) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}`;
  }
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${cleanPath}`;
}

export async function buildLivePreviewHtml(params: {
  owner: string;
  repo: string;
  branch: string;
  entryPath: string;
  files: RepoFileItem[];
  isPrivate: boolean;
  token?: string;
}): Promise<PreviewBundleResult> {
  const { owner, repo, branch, entryPath, files, isPrivate, token } = params;
  const warnings: string[] = [];
  const filePathSet = new Set(files.map((f) => f.path));

  let html = await fetchGitHubFileText(owner, repo, branch, entryPath, token);
  const inlinedCssFiles: string[] = [];
  const inlinedJsFiles: string[] = [];
  let rewrittenAssetCount = 0;

  // 1. Inline relative <link rel="stylesheet" href="...">
  const linkMatches = Array.from(
    html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)
  );
  for (const match of linkMatches) {
    const tag = match[0];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (!isRelativeAssetUrl(href)) continue;

    const resolved = resolveRepoRelativePath(entryPath, href);
    if (!filePathSet.has(resolved)) {
      warnings.push(`ไม่พบไฟล์ CSS: ${resolved}`);
      continue;
    }

    try {
      let cssText = await fetchGitHubFileText(owner, repo, branch, resolved, token);
      // Rewrite relative url(...) inside CSS
      cssText = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, assetUrl) => {
        if (!isRelativeAssetUrl(assetUrl)) return full;
        const assetPath = resolveRepoRelativePath(resolved, assetUrl);
        rewrittenAssetCount += 1;
        return `url(${quote}${getCdnAssetUrl(owner, repo, branch, assetPath, isPrivate)}${quote})`;
      });
      html = html.replace(tag, `<style data-source="${resolved}">\n${cssText}\n</style>`);
      inlinedCssFiles.push(resolved);
    } catch {
      warnings.push(`โหลด CSS ไม่สำเร็จ: ${resolved}`);
    }
  }

  // 2. Inline relative <script src="..."></script>
  const scriptMatches = Array.from(
    html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi)
  );
  for (const match of scriptMatches) {
    const tag = match[0];
    const src = match[1];
    if (!isRelativeAssetUrl(src)) continue;

    const resolved = resolveRepoRelativePath(entryPath, src);
    if (!filePathSet.has(resolved)) {
      warnings.push(`ไม่พบไฟล์ JS: ${resolved}`);
      continue;
    }

    try {
      const jsText = await fetchGitHubFileText(owner, repo, branch, resolved, token);
      const safeJs = jsText.replace(/<\/script>/gi, '<\\/script>');
      html = html.replace(tag, `<script data-source="${resolved}">\n${safeJs}\n</script>`);
      inlinedJsFiles.push(resolved);
    } catch {
      warnings.push(`โหลด JS ไม่สำเร็จ: ${resolved}`);
    }
  }

  // 3. Rewrite relative src="..." and poster="..." and href="..." (non-anchor assets)
  html = html.replace(
    /(<(?:img|source|video|audio|embed|link)\b[^>]*?\b(?:src|href|poster)=["'])([^"']+)(["'])/gi,
    (full, prefix, url, suffix) => {
      if (!isRelativeAssetUrl(url)) return full;
      const resolved = resolveRepoRelativePath(entryPath, url);
      rewrittenAssetCount += 1;
      return `${prefix}${getCdnAssetUrl(owner, repo, branch, resolved, isPrivate)}${suffix}`;
    }
  );

  return {
    html,
    entryPath,
    inlinedCssFiles,
    inlinedJsFiles,
    rewrittenAssetCount,
    totalBytes: new Blob([html]).size,
    warnings,
  };
}

export async function buildDataBridgePreviewHtml(params: {
  owner: string;
  repo: string;
  branch: string;
  dataPath: string;
  indexHtml: string;
  token?: string;
}): Promise<PreviewBundleResult> {
  const { owner, repo, branch, dataPath, indexHtml, token } = params;
  const warnings: string[] = [];

  let rawText = '';
  let loadError = '';
  try {
    rawText = await fetchGitHubFileText(owner, repo, branch, dataPath, token);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'ไม่สามารถโหลดไฟล์ข้อมูลจาก GitHub ได้';
    warnings.push(loadError);
  }

  const isJson = /\.json$/i.test(dataPath);
  let parsedData: unknown = rawText;
  if (isJson && rawText) {
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = rawText;
      warnings.push(`ไฟล์ ${dataPath} ไม่ใช่ JSON ที่สมบูรณ์ จึงแสดงผลเป็นข้อความแทน`);
    }
  }

  const payloadJson = JSON.stringify({
    path: dataPath,
    type: isJson && typeof parsedData !== 'string' ? 'json' : 'text',
    data: parsedData,
    fetchedAt: new Date().toISOString(),
  }).replace(/<\/script>/gi, '<\\/script>');

  const errorJson = JSON.stringify(loadError);

  const shimScript = `<script>
(function() {
  var PRELOADED_RESULT = ${payloadJson};
  var PRELOAD_ERROR = ${errorJson};
  function createRunner() {
    var onSuccess = null;
    var onFailure = null;
    var runner = {
      withSuccessHandler: function(fn) { onSuccess = fn; return runner; },
      withFailureHandler: function(fn) { onFailure = fn; return runner; },
      getGitHubData: function() {
        setTimeout(function() {
          if (PRELOAD_ERROR) {
            if (onFailure) onFailure(new Error(PRELOAD_ERROR));
          } else {
            if (onSuccess) onSuccess(PRELOADED_RESULT);
          }
        }, 20);
      }
    };
    return runner;
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', {
    get: function() { return createRunner(); }
  });
})();
</script>`;

  const injectedHtml = /<head[^>]*>/i.test(indexHtml)
    ? indexHtml.replace(/<head[^>]*>/i, (m) => `${m}\n${shimScript}`)
    : `${shimScript}\n${indexHtml}`;

  return {
    html: injectedHtml,
    entryPath: dataPath,
    inlinedCssFiles: [],
    inlinedJsFiles: [],
    rewrittenAssetCount: 0,
    totalBytes: new Blob([injectedHtml]).size,
    warnings,
  };
}

