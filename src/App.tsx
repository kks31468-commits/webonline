import {
  ArrowRight,
  Check,
  Code2,
  Download,
  ExternalLink,
  FolderTree,
  GitBranch,
  Globe,
  KeyRound,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { DeploymentGuide } from './components/DeploymentGuide';
import { FileExplorer } from './components/FileExplorer';
import { PreviewFrame } from './components/PreviewFrame';
import { SyntaxCodeBlock } from './components/SyntaxCodeBlock';
import {
  AiMagicSetupResult,
  GasConfig,
  PreviewBundleResult,
  RenderMode,
  RepoFileItem,
  RepoMeta,
} from './types/github';
import { generateGasProject } from './utils/gasGenerator';
import { runClientSmartAutoSetup } from './utils/clientAutoSetup';
import {
  buildDataBridgePreviewHtml,
  buildLivePreviewHtml,
  fetchGitHubFileText,
  fetchGitHubRepository,
  parseGitHubInput,
} from './utils/github';

type WorkspaceTab = 'code' | 'preview' | 'files';
type CodeFileTab = 'code.gs' | 'index.html' | 'appsscript.json';

interface RepoPreset {
  label: string;
  input: string;
}

const PRESETS: RepoPreset[] = [
  {
    label: 'mdn/beginner-html-site-styled (เว็บ HTML/CSS/JS)',
    input: 'mdn/beginner-html-site-styled',
  },
  {
    label: 'octocat/Spoon-Knife (เว็บคลาสสิก GitHub)',
    input: 'octocat/Spoon-Knife',
  },
  {
    label: 'github/gemoji (คลังข้อมูล JSON)',
    input: 'github/gemoji',
  },
];

function joinRepoPath(basePath: string, file: string): string {
  const cleanBase = basePath.replace(/^\/+|\/+$/g, '');
  const cleanFile = file.replace(/^\/+/, '');
  if (!cleanBase) return cleanFile;
  if (!cleanFile) return cleanBase;
  if (cleanFile.startsWith(cleanBase + '/')) return cleanFile;
  return `${cleanBase}/${cleanFile}`;
}

export default function App() {
  // Primary AI One-Paste Bar State
  const [repoInput, setRepoInput] = useState('mdn/beginner-html-site-styled');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDiagnosis, setAiDiagnosis] = useState<AiMagicSetupResult | null>(null);
  const [customIndexHtml, setCustomIndexHtml] = useState<string>('');

  // Follow-up AI HTML Customization State
  const [refinePrompt, setRefinePrompt] = useState('');
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineMessage, setRefineMessage] = useState<string | null>(null);

  // Manual Repository & Token State
  const [branchInput, setBranchInput] = useState('');
  const [basePathInput, setBasePathInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);

  // Loaded GitHub Data
  const [repoMeta, setRepoMeta] = useState<RepoMeta | null>(null);
  const [activeBranch, setActiveBranch] = useState('main');
  const [files, setFiles] = useState<RepoFileItem[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);

  // GAS Configuration
  const [renderMode, setRenderMode] = useState<RenderMode>('inline');
  const [entryFile, setEntryFile] = useState('index.html');
  const [dataFile, setDataFile] = useState('db/emoji.json');
  const [pageTitle, setPageTitle] = useState('My GitHub Website');
  const [cacheSeconds, setCacheSeconds] = useState(300);
  const [allowIframe, setAllowIframe] = useState(true);
  const [usePrivateToken, setUsePrivateToken] = useState(false);

  // Workspace UI State
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('preview');
  const [activeCodeFile, setActiveCodeFile] = useState<CodeFileTab>('code.gs');
  const [linkCopied, setLinkCopied] = useState(false);

  // Preview State
  const [previewBundle, setPreviewBundle] = useState<PreviewBundleResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const htmlFiles = useMemo(() => files.filter((f) => f.category === 'html'), [files]);
  const dataFiles = useMemo(() => files.filter((f) => f.category === 'data'), [files]);

  const gasConfig: GasConfig = useMemo(
    () => ({
      owner: repoMeta?.owner || parseGitHubInput(repoInput)?.owner || 'username',
      repo: repoMeta?.repo || parseGitHubInput(repoInput)?.repo || 'my-website',
      branch: activeBranch || branchInput || 'main',
      basePath: basePathInput.trim(),
      entryFile: entryFile.trim() || 'index.html',
      dataFile: dataFile.trim() || 'data.json',
      pageTitle: pageTitle.trim() || 'GitHub Web App',
      renderMode,
      cacheSeconds,
      allowIframe,
      usePrivateToken,
    }),
    [
      repoMeta,
      repoInput,
      activeBranch,
      branchInput,
      basePathInput,
      entryFile,
      dataFile,
      pageTitle,
      renderMode,
      cacheSeconds,
      allowIframe,
      usePrivateToken,
    ]
  );

  const generatedProject = useMemo(
    () => generateGasProject(gasConfig, customIndexHtml),
    [gasConfig, customIndexHtml]
  );

  useEffect(() => {
    if (renderMode !== 'data-bridge' && activeCodeFile === 'index.html') {
      setActiveCodeFile('code.gs');
    }
  }, [renderMode, activeCodeFile]);

  const runPreviewForCurrentMode = useCallback(
    async (params: {
      owner: string;
      repo: string;
      branch: string;
      mode: RenderMode;
      entryPath: string;
      dataPath: string;
      indexHtmlOverride?: string;
      repoFiles: RepoFileItem[];
      isPrivate: boolean;
      token?: string;
    }) => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        if (params.mode === 'data-bridge') {
          const fallbackIndex = generateGasProject(
            {
              owner: params.owner,
              repo: params.repo,
              branch: params.branch,
              basePath: '',
              entryFile: 'index.html',
              dataFile: params.dataPath,
              pageTitle: params.repo,
              renderMode: 'data-bridge',
              cacheSeconds: 300,
              allowIframe: true,
              usePrivateToken: Boolean(params.token?.trim()),
            },
            params.indexHtmlOverride
          ).indexHtml;

          const bundle = await buildDataBridgePreviewHtml({
            owner: params.owner,
            repo: params.repo,
            branch: params.branch,
            dataPath: params.dataPath,
            indexHtml: params.indexHtmlOverride || fallbackIndex || '',
            token: params.token,
          });
          setPreviewBundle(bundle);
        } else {
          const bundle = await buildLivePreviewHtml({
            owner: params.owner,
            repo: params.repo,
            branch: params.branch,
            entryPath: params.entryPath,
            files: params.repoFiles,
            isPrivate: params.isPrivate,
            token: params.token,
          });
          setPreviewBundle(bundle);
        }
      } catch (err) {
        setPreviewBundle(null);
        setPreviewError(
          err instanceof Error ? err.message : 'ไม่สามารถประกอบไฟล์พรีวิวจาก GitHub ได้'
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  // Re-run preview automatically when user switches renderMode or dataFile after repo is loaded
  useEffect(() => {
    if (!repoMeta || files.length === 0) return;
    if (aiLoading) return;

    const fullEntry = joinRepoPath(basePathInput, entryFile);
    const fullData = joinRepoPath(basePathInput, dataFile);

    if (renderMode === 'data-bridge') {
      void runPreviewForCurrentMode({
        owner: repoMeta.owner,
        repo: repoMeta.repo,
        branch: activeBranch,
        mode: 'data-bridge',
        entryPath: fullEntry,
        dataPath: fullData,
        indexHtmlOverride: customIndexHtml,
        repoFiles: files,
        isPrivate: repoMeta.isPrivate,
        token: tokenInput,
      });
    } else if (htmlFiles.length > 0) {
      const targetEntry = files.some((f) => f.path === fullEntry) ? fullEntry : htmlFiles[0].path;
      void runPreviewForCurrentMode({
        owner: repoMeta.owner,
        repo: repoMeta.repo,
        branch: activeBranch,
        mode: renderMode,
        entryPath: targetEntry,
        dataPath: fullData,
        repoFiles: files,
        isPrivate: repoMeta.isPrivate,
        token: tokenInput,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderMode, dataFile, customIndexHtml]);

  // One-Click AI Magic Setup Handler
  const runAiMagicSetup = useCallback(
    async (targetUrl: string, userPrompt?: string) => {
      const trimmedUrl = targetUrl.trim();
      if (!trimmedUrl) {
        setAiError('กรุณาวางลิงก์ GitHub Repository ก่อนกดให้ AI จัดการ');
        return;
      }

      setAiLoading(true);
      setAiError(null);
      setRepoError(null);
      setRefineMessage(null);

      try {
        let resultData: {
          meta: RepoMeta;
          branch: string;
          files: RepoFileItem[];
          aiResult: AiMagicSetupResult;
        };

        // Use relative path without leading slash so it respects any subpath, and fall back to
        // client-side auto-setup when hosted statically on GitHub Pages (404/405/HTML response).
        let useClientFallback = false;
        try {
          const res = await fetch('/api/ai/magic-setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repoUrl: trimmedUrl,
              instruction: (userPrompt ?? aiInstruction).trim(),
              githubToken: tokenInput.trim() || undefined,
            }),
          });

          const contentType = res.headers.get('content-type') || '';
          if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
            useClientFallback = true;
          } else {
            const payload = await res.json();
            if (!res.ok) {
              throw new Error(payload.error || 'AI ไม่สามารถวิเคราะห์ Repository นี้ได้');
            }
            resultData = payload;
          }
        } catch (fetchErr) {
          if (fetchErr instanceof TypeError) {
            useClientFallback = true;
          } else {
            throw fetchErr;
          }
        }

        if (useClientFallback) {
          resultData = await runClientSmartAutoSetup(
            trimmedUrl,
            tokenInput.trim() || undefined
          );
        }

        const { meta, branch, files: fetchedFiles, aiResult } = resultData!;

        setRepoMeta(meta);
        setActiveBranch(branch);
        setBranchInput(branch);
        setFiles(fetchedFiles);
        setBasePathInput(aiResult.basePath || '');
        setRenderMode(aiResult.recommendedMode);
        setEntryFile(aiResult.entryFile || 'index.html');
        setDataFile(aiResult.dataFile || 'README.md');
        setPageTitle(aiResult.pageTitle || meta.repo);
        setCacheSeconds(aiResult.cacheSeconds ?? 300);
        setUsePrivateToken(meta.isPrivate || Boolean(tokenInput.trim()));
        setAiDiagnosis(aiResult);

        const nextCustomHtml =
          aiResult.needsCustomHtml && aiResult.customIndexHtml ? aiResult.customIndexHtml : '';
        setCustomIndexHtml(nextCustomHtml);

        const fullEntry = joinRepoPath(aiResult.basePath || '', aiResult.entryFile || 'index.html');
        const fullData = joinRepoPath(aiResult.basePath || '', aiResult.dataFile || 'README.md');

        await runPreviewForCurrentMode({
          owner: meta.owner,
          repo: meta.repo,
          branch,
          mode: aiResult.recommendedMode,
          entryPath: fullEntry,
          dataPath: fullData,
          indexHtmlOverride: nextCustomHtml,
          repoFiles: fetchedFiles,
          isPrivate: meta.isPrivate,
          token: tokenInput,
        });

        setActiveTab('preview');
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเรียก AI');
      } finally {
        setAiLoading(false);
      }
    },
    [aiInstruction, tokenInput, runPreviewForCurrentMode]
  );

  // Manual GitHub Fetch (without overwriting manual mode unless needed)
  const loadRepositoryManual = useCallback(
    async (rawRepoStr: string, overrideBranch?: string) => {
      const parsed = parseGitHubInput(rawRepoStr);
      if (!parsed) {
        setRepoError(
          'รูปแบบลิงก์ GitHub ไม่ถูกต้อง กรุณาใส่เป็น https://github.com/owner/repo หรือ owner/repo'
        );
        return;
      }

      setRepoLoading(true);
      setRepoError(null);
      setAiError(null);

      try {
        const effectiveBranch =
          overrideBranch !== undefined ? overrideBranch : parsed.branch || '';
        const { meta, branch, files: fetchedFiles } = await fetchGitHubRepository(
          { ...parsed, branch: effectiveBranch || undefined },
          tokenInput
        );

        setRepoMeta(meta);
        setActiveBranch(branch);
        setBranchInput(branch);
        const nextBasePath =
          parsed.subPath || (meta.fullName === repoMeta?.fullName ? basePathInput : '');
        setBasePathInput(nextBasePath);
        setFiles(fetchedFiles);
        setUsePrivateToken(meta.isPrivate || Boolean(tokenInput.trim()));
        setPageTitle(meta.repo);

        const subPrefix = nextBasePath.replace(/^\/+|\/+$/g, '');
        const scopedHtml = fetchedFiles.filter(
          (f) => f.category === 'html' && (!subPrefix || f.path.startsWith(subPrefix + '/'))
        );
        const preferredHtml =
          scopedHtml.find((f) => f.name.toLowerCase() === 'index.html') ||
          scopedHtml[0] ||
          fetchedFiles.find((f) => f.name.toLowerCase() === 'index.html') ||
          fetchedFiles.find((f) => f.category === 'html');

        const scopedData = fetchedFiles.filter(
          (f) => f.category === 'data' && (!subPrefix || f.path.startsWith(subPrefix + '/'))
        );
        const preferredData =
          scopedData.find((f) => f.extension === 'json') ||
          scopedData[0] ||
          fetchedFiles.find((f) => f.extension === 'json') ||
          fetchedFiles.find((f) => f.category === 'data');

        let chosenDataRel = dataFile;
        if (preferredData) {
          chosenDataRel =
            subPrefix && preferredData.path.startsWith(subPrefix + '/')
              ? preferredData.path.slice(subPrefix.length + 1)
              : preferredData.path;
          setDataFile(chosenDataRel);
        }

        if (preferredHtml) {
          const relEntry =
            subPrefix && preferredHtml.path.startsWith(subPrefix + '/')
              ? preferredHtml.path.slice(subPrefix.length + 1)
              : preferredHtml.path;
          setEntryFile(relEntry);
          const nextMode = renderMode === 'data-bridge' ? 'inline' : renderMode;
          setRenderMode(nextMode);
          setCustomIndexHtml('');

          await runPreviewForCurrentMode({
            owner: meta.owner,
            repo: meta.repo,
            branch,
            mode: nextMode,
            entryPath: preferredHtml.path,
            dataPath: joinRepoPath(subPrefix, chosenDataRel),
            repoFiles: fetchedFiles,
            isPrivate: meta.isPrivate,
            token: tokenInput,
          });
        } else {
          setRenderMode('data-bridge');
          setCustomIndexHtml('');
          await runPreviewForCurrentMode({
            owner: meta.owner,
            repo: meta.repo,
            branch,
            mode: 'data-bridge',
            entryPath: '',
            dataPath: joinRepoPath(subPrefix, chosenDataRel),
            repoFiles: fetchedFiles,
            isPrivate: meta.isPrivate,
            token: tokenInput,
          });
        }
      } catch (err) {
        setRepoError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ GitHub');
      } finally {
        setRepoLoading(false);
      }
    },
    [tokenInput, basePathInput, dataFile, renderMode, runPreviewForCurrentMode]
  );

  // Initial load on first mount (supports ?repo=... shareable online URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedRepo = params.get('repo');
    if (sharedRepo && sharedRepo.trim()) {
      setRepoInput(sharedRepo.trim());
      void runAiMagicSetup(sharedRepo.trim(), params.get('prompt') || '');
    } else {
      void loadRepositoryManual('mdn/beginner-html-site-styled', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMagicFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runAiMagicSetup(repoInput, aiInstruction);
  };

  const handleManualFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void loadRepositoryManual(repoInput, branchInput.trim());
  };

  const handleRefineHtmlSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!refinePrompt.trim() || !repoMeta) return;

    setRefineLoading(true);
    setRefineMessage(null);
    setAiError(null);

    try {
      const fullDataPath = joinRepoPath(basePathInput, dataFile);
      let dataSample = '';
      try {
        dataSample = await fetchGitHubFileText(
          repoMeta.owner,
          repoMeta.repo,
          activeBranch,
          fullDataPath,
          tokenInput
        );
      } catch {
        dataSample = '';
      }

      const currentHtml = generatedProject.indexHtml || customIndexHtml;
      const res = await fetch('/api/ai/customize-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: refinePrompt.trim(),
          currentHtml,
          repoFullName: repoMeta.fullName,
          dataFilePath: fullDataPath,
          dataSample,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
        throw new Error(
          'ฟีเจอร์สั่ง AI แก้โค้ด HTML แบบโต้ตอบต้องรันบนโหมดเซิร์ฟเวอร์ (Node.js / Cloud Run) หากใช้งานบน GitHub Pages สามารถนำโค้ด Index.html ที่สร้างไว้ไปแก้ไขได้โดยตรงครับ'
        );
      }

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'ไม่สามารถปรับแต่งหน้าเว็บได้');
      }

      if (payload.updatedHtml) {
        setRenderMode('data-bridge');
        setCustomIndexHtml(payload.updatedHtml);
        setRefineMessage(payload.explanationTh || 'อัปเดตหน้าเว็บเรียบร้อยแล้ว');
        setRefinePrompt('');
        setActiveTab('preview');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการปรับแต่งด้วย AI');
    } finally {
      setRefineLoading(false);
    }
  };

  const handleSelectPreset = (preset: RepoPreset) => {
    setRepoInput(preset.input);
    setBranchInput('');
    setBasePathInput('');
    void runAiMagicSetup(preset.input, '');
  };

  const handleDownloadPrimaryCode = () => {
    const blob = new Blob([generatedProject.codeGs], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Code.gs';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyShareUrl = async () => {
    const targetRepo = repoMeta?.fullName || repoInput.trim();
    const url = new URL(window.location.href);
    url.search = '';
    if (targetRepo) {
      url.searchParams.set('repo', targetRepo);
    }
    const shareStr = url.toString();
    try {
      await navigator.clipboard.writeText(shareStr);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareStr;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1800);
  };

  const handleEntrySelectFromPreviewOrExplorer = (fullPath: string) => {
    const cleanBase = basePathInput.trim().replace(/^\/+|\/+$/g, '');
    const rel =
      cleanBase && fullPath.startsWith(cleanBase + '/')
        ? fullPath.slice(cleanBase.length + 1)
        : fullPath;
    setEntryFile(rel);
    if (repoMeta) {
      void runPreviewForCurrentMode({
        owner: repoMeta.owner,
        repo: repoMeta.repo,
        branch: activeBranch,
        mode: renderMode === 'data-bridge' ? 'inline' : renderMode,
        entryPath: fullPath,
        dataPath: joinRepoPath(basePathInput, dataFile),
        repoFiles: files,
        isPrivate: repoMeta.isPrivate,
        token: tokenInput,
      });
    }
  };

  const activeFullEntryPath = joinRepoPath(basePathInput, entryFile);

  return (
    <div id="top" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col overflow-x-hidden">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Repo2GAS
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#workbench"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              ตัวสร้างโค้ด
            </a>
            <a
              href="#deploy-guide"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              วิธีติดตั้งบน Google
            </a>
            <a
              href="#github-pages"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              อัปขึ้น GitHub
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleDownloadPrimaryCode}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 min-h-[40px]"
            >
              <Download className="w-4 h-4" />
              ดาวน์โหลด Code.gs
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {/* Hero + One-Paste AI Auto-Builder */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="max-w-3xl space-y-2">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              วางลิงก์ GitHub แล้วให้ AI จัดการแปลงเป็นเว็บ Google Apps Script ให้อัตโนมัติ
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              แค่ใส่ลิงก์ GitHub Repository ระบบ AI จะเข้าไปอ่านโครงสร้างไฟล์ เลือกโหมดที่เหมาะสม
              สร้างหน้าเว็บให้ใหม่ทันทีหาก Repo ยังไม่มีหน้า HTML และเตรียมโค้ด{' '}
              <code className="font-mono text-slate-800">Code.gs</code> พร้อมพรีวิวให้เสร็จในคลิกเดียว
            </p>
          </div>

          <form onSubmit={handleMagicFormSubmit} className="space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px_auto] gap-3">
              <div>
                <label htmlFor="magic-repo-url" className="sr-only">
                  ลิงก์ GitHub Repository
                </label>
                <input
                  id="magic-repo-url"
                  type="text"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="วางลิงก์ GitHub เช่น https://github.com/username/my-project"
                  className="w-full px-4 py-3 text-base lg:text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[46px]"
                />
              </div>

              <div>
                <label htmlFor="magic-instruction" className="sr-only">
                  คำสั่งเพิ่มเติมให้ AI (ไม่บังคับ)
                </label>
                <input
                  id="magic-instruction"
                  type="text"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder="คำสั่งเสริม (ไม่บังคับ) เช่น ทำเป็นเว็บค้นหาข้อมูล"
                  className="w-full px-4 py-3 text-base lg:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[46px]"
                />
              </div>

              <button
                type="submit"
                disabled={aiLoading}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 min-h-[46px]"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    AI กำลังวิเคราะห์และสร้างเว็บ...
                  </>
                ) : (
                  <>
                    ให้ AI จัดการให้ทั้งหมด
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
              <span>ทดลองให้ AI จัดการตัวอย่างจริง:</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset.input}
                  type="button"
                  disabled={aiLoading}
                  onClick={() => handleSelectPreset(preset)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </form>

          {aiError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs sm:text-sm text-rose-800 leading-relaxed">
              {aiError}
            </div>
          )}

          {aiDiagnosis && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-blue-700">
                  สรุปผลการจัดการอัตโนมัติจาก AI
                </span>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  โหมดที่เลือก: {aiDiagnosis.recommendedMode}
                  {aiDiagnosis.basePath ? ` · โฟลเดอร์: ${aiDiagnosis.basePath}` : ''}
                </span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">{aiDiagnosis.summaryTh}</p>
              {aiDiagnosis.deploymentNoteTh && (
                <p className="text-xs text-slate-600 leading-relaxed">
                  หมายเหตุ: {aiDiagnosis.deploymentNoteTh}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Main 2-Column Workbench */}
        <section
          id="workbench"
          className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start"
        >
          {/* Left Column: Manual Fine-Tuning */}
          <aside className="bg-white border border-slate-200 rounded-xl p-5 space-y-6">
            <form onSubmit={handleManualFormSubmit} className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  ปรับแต่งการดึงข้อมูลเอง (เพิ่มเติม)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  หากต้องการระบุ Branch, โฟลเดอร์ หรือใส่ Token สำหรับ Private Repo
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="branch-input" className="block text-xs font-medium text-slate-700">
                    Branch
                  </label>
                  <div className="relative">
                    <GitBranch className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="branch-input"
                      type="text"
                      value={branchInput}
                      onChange={(e) => setBranchInput(e.target.value)}
                      placeholder="auto (main)"
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="path-input" className="block text-xs font-medium text-slate-700">
                    โฟลเดอร์ย่อย
                  </label>
                  <input
                    id="path-input"
                    type="text"
                    value={basePathInput}
                    onChange={(e) => setBasePathInput(e.target.value)}
                    placeholder="เช่น docs หรือ dist"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowTokenInput((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {showTokenInput ? 'ซ่อนช่อง GitHub Token' : 'ใช้ Private Repo (ใส่ GitHub Token)'}
                </button>

                {showTokenInput && (
                  <div className="mt-2 space-y-1">
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[11px] text-slate-500 leading-snug">
                      ใช้สำหรับดึงไฟล์ Private Repo เท่านั้น ไม่บันทึกลงในโค้ดที่ส่งออก
                    </p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={repoLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${repoLoading ? 'animate-spin' : ''}`} />
                {repoLoading ? 'กำลังโหลดไฟล์ใหม่...' : 'โหลดโครงสร้างไฟล์ใหม่'}
              </button>

              {repoError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 leading-relaxed">
                  {repoError}
                </div>
              )}
            </form>

            <hr className="border-slate-200" />

            {/* GAS Output Settings */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">
                ตั้งค่ารูปแบบ Google Apps Script
              </h2>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">
                  โหมดการทำงานของ Web App
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {(
                    [
                      {
                        id: 'inline',
                        title: 'รวมไฟล์อัตโนมัติ (Inline Bundle)',
                        desc: 'รวม HTML + CSS + JS ให้อยู่ในหน้าเดียว (เหมาะกับเว็บ Static)',
                      },
                      {
                        id: 'cdn-router',
                        title: 'CDN + รองรับหลายหน้า (Router)',
                        desc: 'โหลด CSS/JS ผ่าน jsDelivr และสลับหน้าด้วย ?page=...',
                      },
                      {
                        id: 'data-bridge',
                        title: 'ดึงข้อมูล JSON / Text (Data Bridge)',
                        desc: 'ใช้หน้า Index.html (AI สร้างได้) ดึงไฟล์ข้อมูลจาก GitHub',
                      },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setRenderMode(mode.id)}
                      className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                        renderMode === mode.id
                          ? 'bg-blue-50/70 border-blue-500 text-slate-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">{mode.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {mode.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {renderMode === 'data-bridge' ? (
                <div className="space-y-1.5">
                  <label htmlFor="data-file" className="block text-xs font-medium text-slate-700">
                    ไฟล์ข้อมูลเป้าหมาย (.json / .md / .csv)
                  </label>
                  {dataFiles.length > 0 ? (
                    <select
                      id="data-file"
                      value={joinRepoPath(basePathInput, dataFile)}
                      onChange={(e) => {
                        const full = e.target.value;
                        const cleanBase = basePathInput.trim().replace(/^\/+|\/+$/g, '');
                        const rel =
                          cleanBase && full.startsWith(cleanBase + '/')
                            ? full.slice(cleanBase.length + 1)
                            : full;
                        setDataFile(rel);
                      }}
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {dataFiles.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.path}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="data-file"
                      type="text"
                      value={dataFile}
                      onChange={(e) => setDataFile(e.target.value)}
                      placeholder="data.json"
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="entry-file" className="block text-xs font-medium text-slate-700">
                    ไฟล์หน้าแรก (Entry HTML)
                  </label>
                  {htmlFiles.length > 0 ? (
                    <select
                      id="entry-file"
                      value={activeFullEntryPath}
                      onChange={(e) => handleEntrySelectFromPreviewOrExplorer(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {htmlFiles.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.path}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="entry-file"
                      type="text"
                      value={entryFile}
                      onChange={(e) => setEntryFile(e.target.value)}
                      placeholder="index.html"
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="page-title" className="block text-xs font-medium text-slate-700">
                    ชื่อเว็บไซต์ (Tab Title)
                  </label>
                  <input
                    id="page-title"
                    type="text"
                    value={pageTitle}
                    onChange={(e) => setPageTitle(e.target.value)}
                    placeholder="My GitHub Website"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="cache-ttl" className="block text-xs font-medium text-slate-700">
                    ระยะเวลาแคช (CacheService)
                  </label>
                  <select
                    id="cache-ttl"
                    value={cacheSeconds}
                    onChange={(e) => setCacheSeconds(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={0}>ไม่แคช (ดึงสดทุกครั้ง)</option>
                    <option value={300}>5 นาที (แนะนำ)</option>
                    <option value={1800}>30 นาที</option>
                    <option value={3600}>1 ชั่วโมง</option>
                    <option value={21600}>6 ชั่วโมง (สูงสุด)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowIframe}
                    onChange={(e) => setAllowIframe(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>อนุญาตฝังเว็บใน Google Sites หรือ iframe (XFrameOptions.ALLOWALL)</span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePrivateToken}
                    onChange={(e) => setUsePrivateToken(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>รองรับ Private Repo (อ่าน GITHUB_TOKEN จาก Script Properties)</span>
                </label>
              </div>
            </div>
          </aside>

          {/* Right Column: Tabbed Output Workspace */}
          <div className="min-w-0 space-y-4">
            {/* Repository Context Strip */}
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 min-w-0">
                <span className="font-mono font-semibold text-slate-900 truncate">
                  {repoMeta ? repoMeta.fullName : `${gasConfig.owner}/${gasConfig.repo}`}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Branch: {gasConfig.branch}</span>
                {files.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{files.length} ไฟล์</span>
                  </>
                )}
                {repoMeta?.description && (
                  <>
                    <span className="hidden md:inline" aria-hidden="true">
                      ·
                    </span>
                    <span className="hidden md:inline text-slate-500 truncate max-w-md">
                      {repoMeta.description}
                    </span>
                  </>
                )}
              </div>

              {repoMeta && (
                <div className="flex items-center gap-4 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyShareUrl}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {linkCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        คัดลอกลิงก์แชร์แล้ว
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5" />
                        แชร์ลิงก์โปรเจกต์
                      </>
                    )}
                  </button>
                  <a
                    href={repoMeta.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap shrink-0"
                  >
                    เปิดบน GitHub
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {/* AI Customization Bar when in Data Bridge mode */}
            {renderMode === 'data-bridge' && repoMeta && (
              <form
                onSubmit={handleRefineHtmlSubmit}
                className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
              >
                <input
                  type="text"
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  placeholder="สั่ง AI ปรับแต่งหน้าเว็บ Index.html เพิ่มเติม เช่น เพิ่มช่องค้นหา หรือเปลี่ยนโทนสี"
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={refineLoading || !refinePrompt.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {refineLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      กำลังปรับแต่ง...
                    </>
                  ) : (
                    'ให้ AI ปรับหน้าเว็บ'
                  )}
                </button>
              </form>
            )}

            {refineMessage && (
              <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                {refineMessage}
              </div>
            )}

            {/* Workspace Mode Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div
                className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
                role="tablist"
                aria-label="มุมมองการทำงาน"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'preview'}
                  onClick={() => setActiveTab('preview')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'preview'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  พรีวิวเว็บไซต์จริง
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'code'}
                  onClick={() => setActiveTab('code')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'code'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Code2 className="w-4 h-4" />
                  โค้ด Google Script
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'files'}
                  onClick={() => setActiveTab('files')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'files'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FolderTree className="w-4 h-4" />
                  ไฟล์ใน Repository ({files.length})
                </button>
              </div>

              {activeTab === 'code' && (
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setActiveCodeFile('code.gs')}
                    className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeCodeFile === 'code.gs'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Code.gs
                  </button>
                  {generatedProject.indexHtml && (
                    <button
                      type="button"
                      onClick={() => setActiveCodeFile('index.html')}
                      className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeCodeFile === 'index.html'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Index.html
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveCodeFile('appsscript.json')}
                    className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeCodeFile === 'appsscript.json'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    appsscript.json
                  </button>
                </div>
              )}
            </div>

            {/* Active Tab Viewport */}
            {activeTab === 'preview' && (
              <PreviewFrame
                bundle={previewBundle}
                loading={previewLoading || aiLoading}
                error={previewError}
                htmlFiles={renderMode === 'data-bridge' ? [] : htmlFiles}
                activeEntryPath={
                  renderMode === 'data-bridge'
                    ? joinRepoPath(basePathInput, dataFile)
                    : activeFullEntryPath
                }
                onSelectEntryFile={handleEntrySelectFromPreviewOrExplorer}
                onRefreshPreview={() => {
                  if (repoMeta) {
                    void runPreviewForCurrentMode({
                      owner: repoMeta.owner,
                      repo: repoMeta.repo,
                      branch: activeBranch,
                      mode: renderMode,
                      entryPath: activeFullEntryPath,
                      dataPath: joinRepoPath(basePathInput, dataFile),
                      indexHtmlOverride: customIndexHtml,
                      repoFiles: files,
                      isPrivate: repoMeta.isPrivate,
                      token: tokenInput,
                    });
                  }
                }}
              />
            )}

            {activeTab === 'code' && (
              <div className="space-y-3">
                {activeCodeFile === 'code.gs' && (
                  <SyntaxCodeBlock
                    filename="Code.gs"
                    language="javascript"
                    code={generatedProject.codeGs}
                    subtitle={
                      renderMode === 'inline'
                        ? 'โหมดรวมไฟล์ CSS/JS อัตโนมัติ'
                        : renderMode === 'cdn-router'
                          ? 'โหมด CDN + Multi-Page Router'
                          : 'โหมด Data Bridge (ดึง JSON/Text)'
                    }
                  />
                )}

                {activeCodeFile === 'index.html' && generatedProject.indexHtml && (
                  <SyntaxCodeBlock
                    filename="Index.html"
                    language="html"
                    code={generatedProject.indexHtml}
                    subtitle={
                      customIndexHtml
                        ? 'สร้างและออกแบบอัตโนมัติโดย AI สำหรับ Repository นี้'
                        : 'สร้างไฟล์ HTML ชื่อ Index ใน Google Apps Script แล้ววางโค้ดนี้'
                    }
                  />
                )}

                {activeCodeFile === 'appsscript.json' && (
                  <SyntaxCodeBlock
                    filename="appsscript.json"
                    language="json"
                    code={generatedProject.appsscriptJson}
                    subtitle="ไฟล์ Manifest (เปิดดูได้ใน Project Settings > Show appsscript.json)"
                  />
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <FileExplorer
                files={files}
                owner={gasConfig.owner}
                repo={gasConfig.repo}
                branch={gasConfig.branch}
                activeEntryPath={activeFullEntryPath}
                activeDataPath={joinRepoPath(basePathInput, dataFile)}
                onSetEntryFile={(path) => {
                  if (renderMode === 'data-bridge') setRenderMode('inline');
                  handleEntrySelectFromPreviewOrExplorer(path);
                  setActiveTab('preview');
                }}
                onSetDataFile={(path) => {
                  setDataFile(path);
                  setRenderMode('data-bridge');
                  setActiveTab('preview');
                }}
                onInspectFile={(file) =>
                  fetchGitHubFileText(
                    gasConfig.owner,
                    gasConfig.repo,
                    gasConfig.branch,
                    file.path,
                    tokenInput
                  )
                }
              />
            )}
          </div>
        </section>

        {/* Deployment Guide & Troubleshooting */}
        <DeploymentGuide
          hasIndexHtml={Boolean(generatedProject.indexHtml)}
          usePrivateToken={usePrivateToken}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>Repo2GAS — เครื่องมือแปลงเว็บไซต์ GitHub เป็น Google Apps Script Web App</span>
          <span>รองรับ HtmlService, UrlFetchApp และ CacheService อัตโนมัติ</span>
        </div>
      </footer>
    </div>
  );
}
