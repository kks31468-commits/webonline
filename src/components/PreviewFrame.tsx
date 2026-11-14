import { Monitor, RefreshCw, Smartphone, Tablet, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { PreviewBundleResult, RepoFileItem } from '../types/github';

interface PreviewFrameProps {
  bundle: PreviewBundleResult | null;
  loading: boolean;
  error: string | null;
  htmlFiles: RepoFileItem[];
  activeEntryPath: string;
  onSelectEntryFile: (path: string) => void;
  onRefreshPreview: () => void;
}

type ViewportSize = 'desktop' | 'tablet' | 'mobile';

export function PreviewFrame({
  bundle,
  loading,
  error,
  htmlFiles,
  activeEntryPath,
  onSelectEntryFile,
  onRefreshPreview,
}: PreviewFrameProps) {
  const [viewport, setViewport] = useState<ViewportSize>('desktop');

  const frameWidthClass =
    viewport === 'desktop'
      ? 'w-full'
      : viewport === 'tablet'
        ? 'w-[768px] max-w-full mx-auto'
        : 'w-[375px] max-w-full mx-auto';

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Preview Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          {htmlFiles.length > 0 ? (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="whitespace-nowrap">หน้าแสดงผล:</span>
              <select
                value={activeEntryPath}
                onChange={(e) => onSelectEntryFile(e.target.value)}
                className="font-mono text-xs text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {htmlFiles.map((file) => (
                  <option key={file.path} value={file.path}>
                    {file.path}
                  </option>
                ))}
              </select>
            </label>
          ) : bundle ? (
            <span className="text-xs text-slate-700 font-mono truncate">
              พรีวิว Index.html (ข้อมูลจาก {bundle.entryPath})
            </span>
          ) : (
            <span className="text-xs text-slate-600">ยังไม่มีไฟล์ HTML สำหรับพรีวิว</span>
          )}

          {bundle && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 tabular-nums">
              <span aria-hidden="true">·</span>
              <span>CSS {bundle.inlinedCssFiles.length} ไฟล์</span>
              <span aria-hidden="true">·</span>
              <span>JS {bundle.inlinedJsFiles.length} ไฟล์</span>
              <span aria-hidden="true">·</span>
              <span>ขนาด {(bundle.totalBytes / 1024).toFixed(1)} KB</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
            role="group"
            aria-label="ขนาดหน้าจอพรีวิว"
          >
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              title="หน้าจอเดสก์ท็อป"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewport === 'desktop'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewport('tablet')}
              title="หน้าจอแท็บเล็ต (768px)"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewport === 'tablet'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              title="หน้าจอมือถือ (375px)"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewport === 'mobile'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onRefreshPreview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            โหลดพรีวิวใหม่
          </button>
        </div>
      </div>

      {/* Warnings Bar if any */}
      {bundle && bundle.warnings.length > 0 && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {bundle.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </div>
      )}

      {/* Frame Canvas */}
      <div className="bg-slate-100 p-4 min-h-[540px] flex flex-col">
        {loading ? (
          <div className="flex-1 bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center p-12 text-center">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-900">กำลังดึงและประกอบไฟล์เว็บไซต์จาก GitHub...</p>
            <p className="text-xs text-slate-500 mt-1">
              กำลังรวมไฟล์ CSS, JavaScript และแปลงลิงก์ Asset เพื่อให้ตรงกับการทำงานของ Google Script
            </p>
          </div>
        ) : error ? (
          <div className="flex-1 bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center p-12 text-center">
            <AlertTriangle className="w-7 h-7 text-rose-600 mb-3" />
            <p className="text-sm font-semibold text-slate-900">ไม่สามารถสร้างพรีวิวได้</p>
            <p className="text-xs text-slate-600 mt-1 max-w-md">{error}</p>
          </div>
        ) : bundle ? (
          <div
            className={`${frameWidthClass} flex-1 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs transition-[width] duration-200`}
          >
            <iframe
              title="GitHub Website Live Preview"
              srcDoc={bundle.html}
              sandbox="allow-scripts allow-forms"
              className="w-full h-[540px] bg-white border-0"
            />
          </div>
        ) : (
          <div className="flex-1 bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center p-12 text-center">
            <p className="text-sm font-medium text-slate-900">ยังไม่มีข้อมูลพรีวิว</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              ใส่ลิงก์ GitHub Repository ด้านซ้าย แล้วกด &ldquo;ดึงข้อมูลจาก GitHub&rdquo; เพื่อดูหน้าเว็บจริง
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
