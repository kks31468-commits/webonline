import { AiMagicSetupResult, RepoFileItem, RepoMeta } from '../types/github';
import {
  fetchGitHubFileText,
  fetchGitHubRepository,
  parseGitHubInput,
} from './github';

export async function runClientSmartAutoSetup(
  rawUrl: string,
  token?: string
): Promise<{
  meta: RepoMeta;
  branch: string;
  files: RepoFileItem[];
  aiResult: AiMagicSetupResult;
}> {
  const parsed = parseGitHubInput(rawUrl);
  if (!parsed) {
    throw new Error(
      'รูปแบบลิงก์ GitHub ไม่ถูกต้อง กรุณาวางลิงก์เช่น https://github.com/owner/repo'
    );
  }

  const { meta, branch, files } = await fetchGitHubRepository(parsed, token);

  const htmlFiles = files.filter((f) => f.category === 'html');
  const dataFiles = files.filter((f) => f.category === 'data');

  // Detect common static hosting folders
  const candidateFolders = ['', 'docs', 'dist', 'public', 'build'];
  let detectedBase = parsed.subPath || '';
  if (!detectedBase) {
    for (const folder of candidateFolders) {
      const prefix = folder ? `${folder}/` : '';
      const hasIndex = htmlFiles.some(
        (f) => f.path.toLowerCase() === `${prefix}index.html`
      );
      if (hasIndex) {
        detectedBase = folder;
        break;
      }
    }
  }

  const scopedPrefix = detectedBase ? `${detectedBase}/` : '';
  const scopedHtml = htmlFiles.filter((f) => f.path.startsWith(scopedPrefix));
  const primaryHtml =
    scopedHtml.find((f) => f.name.toLowerCase() === 'index.html') ||
    scopedHtml[0] ||
    htmlFiles.find((f) => f.name.toLowerCase() === 'index.html') ||
    htmlFiles[0];

  // Check if primaryHtml is an unbuilt Vite/React template
  let isUnbuiltSpaTemplate = false;
  if (primaryHtml) {
    try {
      const htmlContent = await fetchGitHubFileText(
        meta.owner,
        meta.repo,
        branch,
        primaryHtml.path,
        token
      );
      if (
        /src=["']\/?src\/main\.(t|j)sx?["']/i.test(htmlContent) ||
        /src=["']\/?src\/index\.(t|j)sx?["']/i.test(htmlContent)
      ) {
        isUnbuiltSpaTemplate = true;
      }
    } catch {
      // Ignore read failure during heuristic check
    }
  }

  const preferredData =
    dataFiles.find((f) => f.extension === 'json') ||
    dataFiles.find((f) => /^readme\.md$/i.test(f.name)) ||
    dataFiles[0];

  const relEntry = primaryHtml
    ? scopedPrefix && primaryHtml.path.startsWith(scopedPrefix)
      ? primaryHtml.path.slice(scopedPrefix.length)
      : primaryHtml.path
    : 'index.html';

  const relData = preferredData
    ? scopedPrefix && preferredData.path.startsWith(scopedPrefix)
      ? preferredData.path.slice(scopedPrefix.length)
      : preferredData.path
    : 'README.md';

  if (primaryHtml && !isUnbuiltSpaTemplate) {
    const mode = scopedHtml.length > 1 ? 'cdn-router' : 'inline';
    return {
      meta,
      branch,
      files,
      aiResult: {
        summaryTh:
          mode === 'cdn-router'
            ? `ตรวจพบเว็บไซต์ Static ที่มี ${scopedHtml.length} หน้า จึงตั้งค่าโหมด CDN + Multi-Page Router เพื่อให้เปิดสลับหน้าและโหลด CSS/JS บน Google Apps Script ได้ครบถ้วน`
            : `ตรวจพบเว็บไซต์ HTML/CSS/JS พร้อมแสดงผล (${primaryHtml.path}) จึงเลือกโหมด Inline Bundle เพื่อรวมไฟล์ให้รันบน Google Apps Script ได้ทันที`,
        recommendedMode: mode,
        basePath: detectedBase,
        entryFile: relEntry,
        dataFile: relData,
        pageTitle: meta.repo,
        cacheSeconds: 300,
        needsCustomHtml: false,
        customIndexHtml: '',
        deploymentNoteTh:
          'นำโค้ด Code.gs ไปวางใน script.google.com แล้ว Deploy เป็น Web app ได้ทันที',
      },
    };
  }

  // Data-bridge fallback for JSON/Markdown/Unbuilt source repos
  return {
    meta,
    branch,
    files,
    aiResult: {
      summaryTh: isUnbuiltSpaTemplate
        ? `Repository นี้เป็นซอร์สโค้ดที่ต้อง Build ก่อน จึงตั้งค่าโหมด Data Bridge ดึงไฟล์ ${relData} พร้อมหน้า Index.html ให้แสดงผลได้ทันที`
        : `Repository นี้เน้นไฟล์ข้อมูล (${relData}) จึงตั้งค่าโหมด Data Bridge และสร้างหน้า Index.html สำหรับดึงข้อมูลมาแสดงผลเป็นตารางและข้อความค้นหาได้`,
      recommendedMode: 'data-bridge',
      basePath: detectedBase,
      entryFile: 'index.html',
      dataFile: relData,
      pageTitle: meta.repo,
      cacheSeconds: 300,
      needsCustomHtml: false,
      customIndexHtml: '',
      deploymentNoteTh:
        isUnbuiltSpaTemplate
          ? 'หากต้องการนำเว็บ React/Vite ตัวเต็มขึ้น Google Script แนะนำให้ Build โฟลเดอร์ dist/ แล้วนำขึ้น Branch ก่อนครับ'
          : 'สร้างไฟล์ Index.html คู่กับ Code.gs ใน Google Apps Script เพื่อแสดงข้อมูลจาก GitHub',
    },
  };
}
