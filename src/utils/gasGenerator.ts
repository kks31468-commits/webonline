import { GasConfig, GeneratedGasProject } from '../types/github';

function normalizePath(basePath: string, file: string): string {
  const cleanBase = basePath.replace(/^\/+|\/+$/g, '');
  const cleanFile = file.replace(/^\/+/, '');
  if (!cleanBase) return cleanFile;
  if (!cleanFile) return cleanBase;
  if (cleanFile.startsWith(cleanBase + '/')) return cleanFile;
  return `${cleanBase}/${cleanFile}`;
}

function buildAppsScriptJson(): string {
  return JSON.stringify(
    {
      timeZone: 'Asia/Bangkok',
      dependencies: {},
      exceptionLogging: 'STACKDRIVER',
      runtimeVersion: 'V8',
      oauthScopes: ['https://www.googleapis.com/auth/script.external_request'],
      webapp: {
        executeAs: 'USER_DEPLOYING',
        access: 'ANYONE_ANONYMOUS',
      },
    },
    null,
    2
  );
}

function generateInlineCodeGs(config: GasConfig): string {
  const entryPath = normalizePath(config.basePath, config.entryFile || 'index.html');
  const xFrameEnum = config.allowIframe
    ? 'HtmlService.XFrameOptionsMode.ALLOWALL'
    : 'HtmlService.XFrameOptionsMode.DEFAULT';

  return `/**
 * Repo2GAS — ดึงเว็บไซต์จาก GitHub มาแสดงผลบน Google Apps Script Web App
 * โหมด: รวมไฟล์อัตโนมัติ (Inline Bundle Mode)
 * Repository: https://github.com/${config.owner}/${config.repo}
 * Branch: ${config.branch}
 *
 * ทิปส์: เปิด URL ตามด้วย ?refresh=1 เพื่อล้างแคชและดึงข้อมูลล่าสุดจาก GitHub ทันที
 */

var CONFIG = {
  OWNER: '${config.owner}',
  REPO: '${config.repo}',
  BRANCH: '${config.branch}',
  ENTRY_PATH: '${entryPath}',
  PAGE_TITLE: '${config.pageTitle.replace(/'/g, "\\'")}',
  CACHE_SECONDS: ${config.cacheSeconds},
  USE_PRIVATE_TOKEN: ${config.usePrivateToken}
};

function doGet(e) {
  var forceRefresh = e && e.parameter && e.parameter.refresh === '1';
  var cacheKey = 'gh_inline_' + CONFIG.OWNER + '_' + CONFIG.REPO + '_' + CONFIG.BRANCH + '_' + CONFIG.ENTRY_PATH;
  var html = '';

  if (!forceRefresh && CONFIG.CACHE_SECONDS > 0) {
    html = getSafeCache_(cacheKey);
  }

  if (!html) {
    html = buildBundledHtml_(CONFIG.ENTRY_PATH);
    if (CONFIG.CACHE_SECONDS > 0) {
      putSafeCache_(cacheKey, html, CONFIG.CACHE_SECONDS);
    }
  }

  return HtmlService.createHtmlOutput(html)
    .setTitle(CONFIG.PAGE_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(${xFrameEnum});
}

function buildBundledHtml_(entryPath) {
  var html = fetchGitHubFile_(entryPath);

  // 1. ดึงและรวมไฟล์ CSS แบบ Relative (<link rel="stylesheet" href="...">)
  html = html.replace(/<link\\b[^>]*rel=["']stylesheet["'][^>]*>/gi, function(tag) {
    var hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch || !isRelativeUrl_(hrefMatch[1])) {
      return tag;
    }
    var cssPath = resolveRelativePath_(entryPath, hrefMatch[1]);
    try {
      var cssText = fetchGitHubFile_(cssPath);
      cssText = cssText.replace(/url\\(\\s*(['"]?)([^'")]+)\\1\\s*\\)/gi, function(full, quote, assetUrl) {
        if (!isRelativeUrl_(assetUrl)) return full;
        var resolvedAsset = resolveRelativePath_(cssPath, assetUrl);
        return 'url(' + quote + getPublicAssetUrl_(resolvedAsset) + quote + ')';
      });
      return '<style>\\n' + cssText + '\\n</style>';
    } catch (err) {
      Logger.log('ไม่สามารถโหลด CSS: ' + cssPath + ' -> ' + err);
      return tag;
    }
  });

  // 2. ดึงและรวมไฟล์ JS แบบ Relative (<script src="..."></script>)
  html = html.replace(/<script\\b[^>]*src=["']([^"']+)["'][^>]*>\\s*<\\/script>/gi, function(tag, src) {
    if (!isRelativeUrl_(src)) {
      return tag;
    }
    var jsPath = resolveRelativePath_(entryPath, src);
    try {
      var jsText = fetchGitHubFile_(jsPath).replace(/<\\/script>/gi, '<\\\\/script>');
      return '<script>\\n' + jsText + '\\n</script>';
    } catch (err) {
      Logger.log('ไม่สามารถโหลด JS: ' + jsPath + ' -> ' + err);
      return tag;
    }
  });

  // 3. แปลงพาธรูปภาพและไอคอนแบบ Relative ให้ชี้ไปยัง CDN
  html = html.replace(
    /(<(?:img|source|video|audio|link)\\b[^>]*?\\b(?:src|href|poster)=["'])([^"']+)(["'])/gi,
    function(full, prefix, url, suffix) {
      if (!isRelativeUrl_(url)) return full;
      var assetPath = resolveRelativePath_(entryPath, url);
      return prefix + getPublicAssetUrl_(assetPath) + suffix;
    }
  );

  return html;
}

function fetchGitHubFile_(repoPath) {
  var cleanPath = repoPath.replace(/^\\/+/, '');
  var encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
  var options = { muteHttpExceptions: true };
  var url = '';

  if (CONFIG.USE_PRIVATE_TOKEN) {
    var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!token) {
      throw new Error('กรุณาตั้งค่า Script Property ชื่อ GITHUB_TOKEN ก่อนใช้งาน Private Repo');
    }
    url = 'https://api.github.com/repos/' + CONFIG.OWNER + '/' + CONFIG.REPO +
      '/contents/' + encodedPath + '?ref=' + encodeURIComponent(CONFIG.BRANCH);
    options.headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github.raw+json'
    };
  } else {
    url = 'https://raw.githubusercontent.com/' + CONFIG.OWNER + '/' + CONFIG.REPO +
      '/' + encodeURIComponent(CONFIG.BRANCH) + '/' + encodedPath;
  }

  var response = UrlFetchApp.fetch(url, options);
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('GitHub Error (' + status + ') เมื่อดึงไฟล์: ' + cleanPath);
  }
  return response.getContentText('UTF-8');
}

function getPublicAssetUrl_(repoPath) {
  var cleanPath = repoPath.replace(/^\\/+/, '');
  if (CONFIG.USE_PRIVATE_TOKEN) {
    return 'https://raw.githubusercontent.com/' + CONFIG.OWNER + '/' + CONFIG.REPO + '/' + CONFIG.BRANCH + '/' + cleanPath;
  }
  return 'https://cdn.jsdelivr.net/gh/' + CONFIG.OWNER + '/' + CONFIG.REPO + '@' + CONFIG.BRANCH + '/' + cleanPath;
}

function isRelativeUrl_(url) {
  var u = String(url || '').trim();
  if (!u) return false;
  return !(/^(https?:|\\/\\/|data:|mailto:|tel:|#|javascript:)/i.test(u));
}

function resolveRelativePath_(baseFile, relativeRef) {
  var cleanRef = String(relativeRef).split('?')[0].split('#')[0].trim();
  if (cleanRef.charAt(0) === '/') return cleanRef.replace(/^\\/+/, '');

  var parts = baseFile.split('/');
  parts.pop();
  var refParts = cleanRef.split('/');
  for (var i = 0; i < refParts.length; i++) {
    var seg = refParts[i];
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 0) parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join('/');
}

// ป้องกันข้อจำกัด CacheService (100 KB ต่อ 1 Key) ของ Google Apps Script
function putSafeCache_(key, value, ttlSeconds) {
  try {
    if (value && value.length < 95000) {
      CacheService.getScriptCache().put(key, value, ttlSeconds);
    } else {
      Logger.log('ข้ามการแคชเนื่องจากไฟล์ HTML มีขนาดเกิน 95KB (' + value.length + ' chars)');
    }
  } catch (err) {
    Logger.log('Cache put warning: ' + err);
  }
}

function getSafeCache_(key) {
  try {
    return CacheService.getScriptCache().get(key) || '';
  } catch (err) {
    return '';
  }
}
`;
}

function generateCdnRouterCodeGs(config: GasConfig): string {
  const basePath = config.basePath.replace(/^\/+|\/+$/g, '');
  const defaultPage = config.entryFile || 'index.html';
  const xFrameEnum = config.allowIframe
    ? 'HtmlService.XFrameOptionsMode.ALLOWALL'
    : 'HtmlService.XFrameOptionsMode.DEFAULT';

  return `/**
 * Repo2GAS — ดึงเว็บไซต์จาก GitHub แบบ Multi-Page Router + jsDelivr CDN
 * เหมาะสำหรับเว็บที่มีหลายหน้า (เช่น index.html, about.html) และไฟล์ Asset จำนวนมาก
 * Repository: https://github.com/${config.owner}/${config.repo}
 * Branch: ${config.branch}
 */

var CONFIG = {
  OWNER: '${config.owner}',
  REPO: '${config.repo}',
  BRANCH: '${config.branch}',
  BASE_PATH: '${basePath}',
  DEFAULT_PAGE: '${defaultPage}',
  PAGE_TITLE: '${config.pageTitle.replace(/'/g, "\\'")}',
  CACHE_SECONDS: ${config.cacheSeconds},
  USE_PRIVATE_TOKEN: ${config.usePrivateToken}
};

function doGet(e) {
  var requestedPage = (e && e.parameter && e.parameter.page) ? String(e.parameter.page) : CONFIG.DEFAULT_PAGE;
  var safePage = requestedPage.replace(/\\.\\./g, '').replace(/^\\/+/, '') || CONFIG.DEFAULT_PAGE;
  var fullRepoPath = CONFIG.BASE_PATH ? (CONFIG.BASE_PATH + '/' + safePage) : safePage;

  var forceRefresh = e && e.parameter && e.parameter.refresh === '1';
  var cacheKey = 'gh_cdn_' + CONFIG.OWNER + '_' + CONFIG.REPO + '_' + fullRepoPath;
  var html = '';

  if (!forceRefresh && CONFIG.CACHE_SECONDS > 0) {
    html = getSafeCache_(cacheKey);
  }

  if (!html) {
    html = buildCdnRoutedHtml_(fullRepoPath);
    if (CONFIG.CACHE_SECONDS > 0) {
      putSafeCache_(cacheKey, html, CONFIG.CACHE_SECONDS);
    }
  }

  return HtmlService.createHtmlOutput(html)
    .setTitle(CONFIG.PAGE_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(${xFrameEnum});
}

function buildCdnRoutedHtml_(repoFilePath) {
  var html = fetchGitHubFile_(repoFilePath);
  var scriptUrl = ScriptApp.getService().getUrl();

  // แปลงลิงก์ <a href="about.html"> ให้เปลี่ยนหน้าผ่าน ?page=... บน Google Apps Script
  html = html.replace(/<a\\b([^>]*?)href=["']([^"']+\\.html?(?:[#?][^"']*)?)["']([^>]*)>/gi, function(full, pre, href, post) {
    if (!isRelativeUrl_(href)) return full;
    var cleanHref = href.split('#')[0].split('?')[0];
    var targetRepoPath = resolveRelativePath_(repoFilePath, cleanHref);
    var pageParam = CONFIG.BASE_PATH && targetRepoPath.indexOf(CONFIG.BASE_PATH + '/') === 0
      ? targetRepoPath.slice(CONFIG.BASE_PATH.length + 1)
      : targetRepoPath;
    return '<a' + pre + 'href="' + scriptUrl + '?page=' + encodeURIComponent(pageParam) + '" target="_top"' + post + '>';
  });

  // แปลงไฟล์ CSS, JS, รูปภาพ และฟอนต์แบบ Relative ไปยัง jsDelivr CDN (รองรับ MIME type ครบถ้วน)
  html = html.replace(
    /(<(?:link|script|img|source|video|audio)\\b[^>]*?\\b(?:href|src|poster)=["'])([^"']+)(["'])/gi,
    function(full, prefix, url, suffix) {
      if (!isRelativeUrl_(url)) return full;
      var assetPath = resolveRelativePath_(repoFilePath, url);
      var cdnUrl = 'https://cdn.jsdelivr.net/gh/' + CONFIG.OWNER + '/' + CONFIG.REPO + '@' + CONFIG.BRANCH + '/' + assetPath;
      return prefix + cdnUrl + suffix;
    }
  );

  return html;
}

function fetchGitHubFile_(repoPath) {
  var encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
  var options = { muteHttpExceptions: true };
  var url = '';

  if (CONFIG.USE_PRIVATE_TOKEN) {
    var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!token) throw new Error('กรุณาตั้งค่า GITHUB_TOKEN ใน Script Properties');
    url = 'https://api.github.com/repos/' + CONFIG.OWNER + '/' + CONFIG.REPO + '/contents/' + encodedPath + '?ref=' + encodeURIComponent(CONFIG.BRANCH);
    options.headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.raw+json' };
  } else {
    url = 'https://raw.githubusercontent.com/' + CONFIG.OWNER + '/' + CONFIG.REPO + '/' + encodeURIComponent(CONFIG.BRANCH) + '/' + encodedPath;
  }

  var res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('ไม่สามารถโหลดไฟล์จาก GitHub (' + res.getResponseCode() + '): ' + repoPath);
  }
  return res.getContentText('UTF-8');
}

function isRelativeUrl_(url) {
  var u = String(url || '').trim();
  return Boolean(u) && !(/^(https?:|\\/\\/|data:|mailto:|tel:|#|javascript:)/i.test(u));
}

function resolveRelativePath_(baseFile, relativeRef) {
  var cleanRef = String(relativeRef).split('?')[0].split('#')[0].trim();
  if (cleanRef.charAt(0) === '/') return cleanRef.replace(/^\\/+/, '');
  var parts = baseFile.split('/');
  parts.pop();
  var refParts = cleanRef.split('/');
  for (var i = 0; i < refParts.length; i++) {
    var seg = refParts[i];
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (parts.length > 0) parts.pop(); }
    else { parts.push(seg); }
  }
  return parts.join('/');
}

function putSafeCache_(key, value, ttl) {
  try {
    if (value && value.length < 95000) CacheService.getScriptCache().put(key, value, ttl);
  } catch (e) {}
}

function getSafeCache_(key) {
  try {
    return CacheService.getScriptCache().get(key) || '';
  } catch (e) {
    return '';
  }
}
`;
}

function generateDataBridgeProject(config: GasConfig): { codeGs: string; indexHtml: string } {
  const dataPath = normalizePath(config.basePath, config.dataFile || 'data.json');
  const xFrameEnum = config.allowIframe
    ? 'HtmlService.XFrameOptionsMode.ALLOWALL'
    : 'HtmlService.XFrameOptionsMode.DEFAULT';

  const codeGs = `/**
 * Repo2GAS — Data Bridge Mode (ดึงไฟล์ JSON / CSV / Markdown จาก GitHub มาแสดงผลบนหน้าเว็บ GAS)
 * เหมาะสำหรับ: สร้างหน้าเว็บด้วย HTML ของ Google Script แล้วดึงข้อมูลจาก GitHub มาแสดงแบบ Real-time
 * Repository: https://github.com/${config.owner}/${config.repo}
 */

var CONFIG = {
  OWNER: '${config.owner}',
  REPO: '${config.repo}',
  BRANCH: '${config.branch}',
  DEFAULT_DATA_PATH: '${dataPath}',
  PAGE_TITLE: '${config.pageTitle.replace(/'/g, "\\'")}',
  CACHE_SECONDS: ${config.cacheSeconds},
  USE_PRIVATE_TOKEN: ${config.usePrivateToken}
};

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(CONFIG.PAGE_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(${xFrameEnum});
}

/**
 * ฟังก์ชันนี้จะถูกเรียกจากหน้า Index.html ผ่าน google.script.run
 */
function getGitHubData(customPath, forceRefresh) {
  var targetPath = customPath || CONFIG.DEFAULT_DATA_PATH;
  var cacheKey = 'gh_data_' + CONFIG.OWNER + '_' + CONFIG.REPO + '_' + targetPath;
  var rawText = '';

  if (!forceRefresh && CONFIG.CACHE_SECONDS > 0) {
    try {
      rawText = CacheService.getScriptCache().get(cacheKey) || '';
    } catch (e) {}
  }

  if (!rawText) {
    rawText = fetchGitHubFile_(targetPath);
    if (CONFIG.CACHE_SECONDS > 0 && rawText.length < 95000) {
      try {
        CacheService.getScriptCache().put(cacheKey, rawText, CONFIG.CACHE_SECONDS);
      } catch (e) {}
    }
  }

  var isJson = /\\.json$/i.test(targetPath);
  if (isJson) {
    return {
      path: targetPath,
      type: 'json',
      data: JSON.parse(rawText),
      fetchedAt: new Date().toISOString()
    };
  }

  return {
    path: targetPath,
    type: 'text',
    data: rawText,
    fetchedAt: new Date().toISOString()
  };
}

function fetchGitHubFile_(repoPath) {
  var encodedPath = repoPath.replace(/^\\/+/, '').split('/').map(encodeURIComponent).join('/');
  var options = { muteHttpExceptions: true };
  var url = '';

  if (CONFIG.USE_PRIVATE_TOKEN) {
    var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!token) throw new Error('กรุณาตั้งค่า GITHUB_TOKEN ใน Script Properties');
    url = 'https://api.github.com/repos/' + CONFIG.OWNER + '/' + CONFIG.REPO + '/contents/' + encodedPath + '?ref=' + encodeURIComponent(CONFIG.BRANCH);
    options.headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.raw+json' };
  } else {
    url = 'https://raw.githubusercontent.com/' + CONFIG.OWNER + '/' + CONFIG.REPO + '/' + encodeURIComponent(CONFIG.BRANCH) + '/' + encodedPath;
  }

  var res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('GitHub Error (' + res.getResponseCode() + '): ' + repoPath);
  }
  return res.getContentText('UTF-8');
}
`;

  const indexHtml = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 32px 20px; background: #f8fafc; color: #0f172a; }
    .container { max-width: 960px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
    h1 { font-size: 20px; margin: 0; }
    .meta { font-size: 13px; color: #64748b; margin-top: 4px; }
    button { background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 14px; font-weight: 500; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; color: #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>${config.pageTitle}</h1>
        <div class="meta" id="meta">กำลังดึงข้อมูลจาก GitHub...</div>
      </div>
      <button onclick="loadData(true)">รีเฟรชข้อมูล</button>
    </div>
    <div id="output">กำลังโหลด...</div>
  </div>

  <script>
    function loadData(forceRefresh) {
      document.getElementById('output').textContent = 'กำลังเชื่อมต่อ GitHub...';
      google.script.run
        .withSuccessHandler(function(result) {
          document.getElementById('meta').textContent =
            'ไฟล์: ' + result.path + ' · อัปเดตเมื่อ: ' + new Date(result.fetchedAt).toLocaleString('th-TH');
          renderPayload(result);
        })
        .withFailureHandler(function(err) {
          document.getElementById('output').textContent = 'เกิดข้อผิดพลาด: ' + err.message;
        })
        .getGitHubData(null, Boolean(forceRefresh));
    }

    function renderPayload(result) {
      var container = document.getElementById('output');
      if (result.type === 'json' && Array.isArray(result.data) && result.data.length > 0 && typeof result.data[0] === 'object') {
        var keys = Object.keys(result.data[0]).slice(0, 6);
        var html = '<table><thead><tr>' + keys.map(function(k) { return '<th>' + escapeHtml(k) + '</th>'; }).join('') + '</tr></thead><tbody>';
        result.data.slice(0, 50).forEach(function(row) {
          html += '<tr>' + keys.map(function(k) {
            var val = row[k];
            return '<td>' + escapeHtml(typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')) + '</td>';
          }).join('') + '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      } else {
        var pre = document.createElement('pre');
        pre.textContent = result.type === 'json' ? JSON.stringify(result.data, null, 2) : String(result.data);
        container.innerHTML = '';
        container.appendChild(pre);
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    loadData(false);
  </script>
</body>
</html>
`;

  return { codeGs, indexHtml };
}

export function generateGasProject(
  config: GasConfig,
  customIndexHtml?: string
): GeneratedGasProject {
  const appsscriptJson = buildAppsScriptJson();

  if (config.renderMode === 'cdn-router') {
    return {
      codeGs: generateCdnRouterCodeGs(config),
      appsscriptJson,
    };
  }

  if (config.renderMode === 'data-bridge') {
    const { codeGs, indexHtml } = generateDataBridgeProject(config);
    return {
      codeGs,
      indexHtml: customIndexHtml && customIndexHtml.trim() ? customIndexHtml : indexHtml,
      appsscriptJson,
    };
  }

  return {
    codeGs: generateInlineCodeGs(config),
    appsscriptJson,
  };
}
