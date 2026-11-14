import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ (ตรวจสอบได้ที่เมนู Settings > Secrets)');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ParsedRepo {
  owner: string;
  repo: string;
  branch?: string;
  subPath: string;
}

function parseGitHubUrl(rawInput: string): ParsedRepo | null {
  const trimmed = String(rawInput || '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  if (!trimmed) return null;

  const urlMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?$/i
  );
  if (urlMatch) {
    const [, owner, repo, branch, rawPath] = urlMatch;
    let subPath = (rawPath || '').replace(/^\/+|\/+$/g, '');
    if (trimmed.includes('/blob/') && subPath.includes('.')) {
      const parts = subPath.split('/');
      parts.pop();
      subPath = parts.join('/');
    }
    return { owner, repo, branch, subPath };
  }

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

function classifyExtension(filePath: string) {
  const fileName = filePath.split('/').pop() || '';
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

function buildGitHubHeaders(token?: string, accept = 'application/vnd.github+json') {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'Repo2GAS-Server',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

async function fetchRawGitHubText(
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

  if (!token || !token.trim()) {
    const res = await fetch(
      `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`
    );
    if (!res.ok) return '';
    return await res.text();
  }

  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { headers: buildGitHubHeaders(token, 'application/vnd.github.raw+json') }
  );
  if (!res.ok) return '';
  return await res.text();
}

app.post('/api/ai/magic-setup', async (req: Request, res: Response) => {
  try {
    const { repoUrl, instruction, githubToken } = req.body as {
      repoUrl?: string;
      instruction?: string;
      githubToken?: string;
    };

    const parsed = parseGitHubUrl(repoUrl || '');
    if (!parsed) {
      res.status(400).json({
        error: 'รูปแบบลิงก์ GitHub ไม่ถูกต้อง กรุณาวางลิงก์เช่น https://github.com/owner/repo',
      });
      return;
    }

    const repoRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
      { headers: buildGitHubHeaders(githubToken) }
    );

    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        res.status(404).json({
          error: 'ไม่พบ Repository นี้บน GitHub (หรือเป็น Private Repo ที่ต้องใส่ GitHub Token)',
        });
        return;
      }
      if (repoRes.status === 403 || repoRes.status === 429) {
        res.status(429).json({
          error: 'GitHub API เกินขีดจำกัดชั่วคราว กรุณาลองใหม่สักครู่หรือใส่ GitHub Token',
        });
        return;
      }
      res.status(repoRes.status).json({
        error: `ไม่สามารถดึงข้อมูลจาก GitHub ได้ (${repoRes.status})`,
      });
      return;
    }

    const repoJson = (await repoRes.json()) as {
      owner?: { login?: string };
      name?: string;
      full_name?: string;
      description?: string;
      default_branch?: string;
      stargazers_count?: number;
      private?: boolean;
      html_url?: string;
      updated_at?: string;
    };

    const branch = parsed.branch || repoJson.default_branch || 'main';
    const meta = {
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
      { headers: buildGitHubHeaders(githubToken) }
    );

    if (!treeRes.ok) {
      res.status(treeRes.status).json({
        error: `ไม่สามารถดึงรายการไฟล์ใน Branch "${branch}" ได้ (${treeRes.status})`,
      });
      return;
    }

    const treeJson = (await treeRes.json()) as {
      tree?: Array<{ path: string; type: string; size?: number; sha: string }>;
    };

    const files = (treeJson.tree || [])
      .filter(
        (item) =>
          item.type === 'blob' &&
          !item.path.startsWith('.git/') &&
          !item.path.includes('node_modules/')
      )
      .map((item) => {
        const { category, extension } = classifyExtension(item.path);
        return {
          path: item.path,
          name: item.path.split('/').pop() || item.path,
          size: item.size ?? 0,
          sha: item.sha,
          category,
          extension,
        };
      });

    // Gather compact samples of key files for Gemini to inspect
    const htmlFiles = files.filter((f) => f.category === 'html');
    const dataFiles = files.filter((f) => f.category === 'data');
    const readmeFile = files.find((f) => /^readme\.md$/i.test(f.name));
    const pkgFile = files.find((f) => f.path === 'package.json');
    const primaryHtml =
      htmlFiles.find((f) => f.name.toLowerCase() === 'index.html') || htmlFiles[0];
    const primaryJson = dataFiles.find((f) => f.extension === 'json') || dataFiles[0];

    const [readmeSample, pkgSample, htmlSample, dataSample] = await Promise.all([
      readmeFile
        ? fetchRawGitHubText(meta.owner, meta.repo, branch, readmeFile.path, githubToken)
        : Promise.resolve(''),
      pkgFile
        ? fetchRawGitHubText(meta.owner, meta.repo, branch, pkgFile.path, githubToken)
        : Promise.resolve(''),
      primaryHtml
        ? fetchRawGitHubText(meta.owner, meta.repo, branch, primaryHtml.path, githubToken)
        : Promise.resolve(''),
      primaryJson
        ? fetchRawGitHubText(meta.owner, meta.repo, branch, primaryJson.path, githubToken)
        : Promise.resolve(''),
    ]);

    const fileListSummary = files
      .slice(0, 120)
      .map((f) => `${f.path} (${f.category}, ${f.size}B)`)
      .join('\n');

    const promptText = `คุณเป็นวิศวกรผู้เชี่ยวชาญด้าน GitHub และ Google Apps Script (HtmlService, UrlFetchApp, CacheService)
หน้าที่ของคุณคือวิเคราะห์ GitHub Repository ที่ผู้ใช้ส่งมา แล้วเลือกวิธีแปลงและจัดเตรียมการตั้งค่า + โค้ดให้พร้อมนำไปแสดงเป็นเว็บไซต์บน Google Apps Script โดยอัตโนมัติ

ข้อมูล Repository:
- Full Name: ${meta.fullName}
- Branch: ${branch}
- Description: ${meta.description || '(ไม่มีคำอธิบาย)'}
- User Subpath from URL: ${parsed.subPath || '(root)'}
- User Instruction: ${instruction || '(ไม่ได้ระบุเพิ่มเติม — ให้จัดการอัตโนมัติที่ดีที่สุด)'}

รายการไฟล์ใน Repo (สูงสุด 120 ไฟล์):
${fileListSummary}

${pkgSample ? `--- package.json ---\n${pkgSample.slice(0, 2000)}\n` : ''}
${readmeSample ? `--- README.md (ย่อ) ---\n${readmeSample.slice(0, 2500)}\n` : ''}
${htmlSample ? `--- ${primaryHtml?.path} (ย่อ) ---\n${htmlSample.slice(0, 3000)}\n` : ''}
${dataSample ? `--- ${primaryJson?.path} (ย่อ) ---\n${dataSample.slice(0, 3000)}\n` : ''}

หลักการตัดสินใจ:
1. ถ้ามีไฟล์ Static HTML พร้อมแสดงผล (เช่น index.html, docs/index.html, dist/index.html) และไม่ได้เป็นเพียง template เปล่าของ Vite/React ที่ต้อง build ก่อน (เช่นมี <div id="root"></div><script type="module" src="/src/main.tsx">):
   - หากมีไฟล์ HTML หน้าเดียว หรือเน้น HTML+CSS+JS -> ใช้ recommendedMode = "inline"
   - หากมีไฟล์ HTML หลายหน้าเชื่อมโยงกัน (เช่น index.html, about.html) -> ใช้ recommendedMode = "cdn-router"
   - ตั้ง needsCustomHtml = false (เว้นแต่ผู้ใช้สั่งให้สร้าง/ปรับแต่งหน้าเว็บใหม่ผ่าน User Instruction)
2. ถ้า Repo เป็นคลังข้อมูล (JSON, CSV, Markdown) หรือเป็นซอร์สโค้ดที่ยังไม่ได้ Build (เช่น React/Vite ที่มีแค่ src/main.tsx โดยไม่มี dist/index.html หรือ docs/index.html) หรือผู้ใช้สั่งให้สร้างหน้าเว็บแสดงผลใหม่:
   - ใช้ recommendedMode = "data-bridge"
   - เลือก dataFile ที่ดีที่สุดใน Repo (เช่นไฟล์ .json หลัก หรือ README.md)
   - ตั้ง needsCustomHtml = true
   - สร้าง customIndexHtml เป็นไฟล์ HTML5 ฉบับสมบูรณ์ (รวม CSS ใน <style> และ JS ใน <script>) สำหรับ Google Apps Script (ไฟล์ Index.html) ที่:
     * สวยงาม สะอาด อ่านง่าย รองรับมือถือ (Responsive) มีภาษาไทยเป็นมิตร
     * เรียกใช้งาน google.script.run.withSuccessHandler(renderData).withFailureHandler(showError).getGitHubData(null, forceRefresh) เพื่อดึงข้อมูลจริงจาก GitHub มาแสดงผล (รองรับทั้ง Array JSON เป็นการ์ด/ตารางค้นหาได้, Object JSON, หรือ Markdown/Text ที่จัดรูปแบบสวยงาม)
     * มีปุ่มรีเฟรชข้อมูล และช่องค้นหา/กรองข้อมูลถ้าเป็น Array JSON
     * ห้ามใช้ alert() หรือ external library ที่หนักเกินไป เขียน Vanilla CSS/JS ที่ทำงานได้ 100% ทันทีใน iframe ของ Google Apps Script!

ตอบกลับเป็น JSON ตาม Schema เท่านั้น`;

    const ai = getGeminiClient();
    const aiResponse = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaryTh: {
              type: Type.STRING,
              description: 'สรุปภาษาไทย 2-3 ประโยค อธิบายว่า Repo นี้เป็นแบบใด และ AI ตั้งค่า/สร้างอะไรให้บ้าง',
            },
            recommendedMode: {
              type: Type.STRING,
              description: 'Must be one of: inline, cdn-router, data-bridge',
            },
            basePath: {
              type: Type.STRING,
              description: 'Subfolder path such as "", "docs", "dist", "public"',
            },
            entryFile: {
              type: Type.STRING,
              description: 'Entry HTML file relative to basePath, e.g. "index.html"',
            },
            dataFile: {
              type: Type.STRING,
              description: 'Primary data file path relative to basePath, e.g. "data.json" or "README.md"',
            },
            pageTitle: {
              type: Type.STRING,
              description: 'Clean web app title for HtmlService setTitle()',
            },
            cacheSeconds: {
              type: Type.INTEGER,
              description: 'Recommended cache TTL in seconds: 0, 300, 1800, 3600, or 21600',
            },
            needsCustomHtml: {
              type: Type.BOOLEAN,
              description: 'True if customIndexHtml should be used as Index.html in Data Bridge mode',
            },
            customIndexHtml: {
              type: Type.STRING,
              description: 'Complete self-contained HTML5 page calling google.script.run.getGitHubData when needsCustomHtml is true, otherwise empty string',
            },
            deploymentNoteTh: {
              type: Type.STRING,
              description: 'Short practical Thai tip specific to this repository',
            },
          },
          required: [
            'summaryTh',
            'recommendedMode',
            'basePath',
            'entryFile',
            'dataFile',
            'pageTitle',
            'cacheSeconds',
            'needsCustomHtml',
            'customIndexHtml',
            'deploymentNoteTh',
          ],
        },
      },
    });

    const rawJsonText = (aiResponse.text ?? '{}').trim();
    const aiResult = JSON.parse(rawJsonText);

    // Normalize mode strictly
    if (!['inline', 'cdn-router', 'data-bridge'].includes(aiResult.recommendedMode)) {
      aiResult.recommendedMode = htmlFiles.length > 0 ? 'inline' : 'data-bridge';
    }

    res.json({
      meta,
      branch,
      files,
      aiResult,
    });
  } catch (err) {
    console.error('AI magic-setup error:', err);
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการวิเคราะห์ด้วย AI';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/customize-html', async (req: Request, res: Response) => {
  try {
    const { instruction, currentHtml, repoFullName, dataFilePath, dataSample } = req.body as {
      instruction?: string;
      currentHtml?: string;
      repoFullName?: string;
      dataFilePath?: string;
      dataSample?: string;
    };

    if (!instruction || !instruction.trim()) {
      res.status(400).json({ error: 'กรุณาพิมพ์คำสั่งที่ต้องการให้ AI ปรับแต่ง' });
      return;
    }

    const ai = getGeminiClient();
    const prompt = `คุณเป็นผู้เชี่ยวชาญสร้างหน้าเว็บ HTML สำหรับ Google Apps Script (Index.html)
Repository: ${repoFullName || ''}
ไฟล์ข้อมูล: ${dataFilePath || ''}

คำสั่งปรับแต่งจากผู้ใช้: "${instruction.trim()}"

ตัวอย่างข้อมูลจากไฟล์ (ย่อ):
${(dataSample || '').slice(0, 3000)}

โค้ด Index.html ปัจจุบัน:
${(currentHtml || '').slice(0, 12000)}

ข้อกำหนด:
1. ปรับปรุงโค้ด Index.html ตามคำสั่งของผู้ใช้ให้สมบูรณ์ในไฟล์เดียว (HTML + <style> + <script>)
2. ต้องยังคงใช้ google.script.run.withSuccessHandler(...).withFailureHandler(...).getGitHubData(null, forceRefresh) เพื่อดึงข้อมูลจริงจาก GitHub
3. ห้ามใช้ window.alert() หรือ library ที่ต้อง build
4. ส่งกลับเป็น JSON ที่มี updatedHtml และ explanationTh`;

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            updatedHtml: {
              type: Type.STRING,
              description: 'Complete updated HTML5 document for Google Apps Script Index.html',
            },
            explanationTh: {
              type: Type.STRING,
              description: 'Brief Thai summary of what was updated',
            },
          },
          required: ['updatedHtml', 'explanationTh'],
        },
      },
    });

    const parsed = JSON.parse((aiResponse.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('AI customize-html error:', err);
    const message = err instanceof Error ? err.message : 'ไม่สามารถปรับแต่งโค้ดด้วย AI ได้';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Repo2GAS server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
