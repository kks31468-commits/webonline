import { Eye, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FileCategory, RepoFileItem } from '../types/github';

interface FileExplorerProps {
  files: RepoFileItem[];
  owner: string;
  repo: string;
  branch: string;
  activeEntryPath: string;
  activeDataPath: string;
  onSetEntryFile: (path: string) => void;
  onSetDataFile: (path: string) => void;
  onInspectFile: (file: RepoFileItem) => Promise<string>;
}

type CategoryFilter = 'all' | FileCategory;

const CATEGORY_LABELS: Record<FileCategory, string> = {
  html: 'HTML',
  css: 'CSS',
  js: 'JavaScript',
  data: 'ข้อมูล / ข้อความ',
  image: 'รูปภาพ',
  other: 'อื่นๆ',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileExplorer({
  files,
  owner,
  repo,
  branch,
  activeEntryPath,
  activeDataPath,
  onSetEntryFile,
  onSetDataFile,
  onInspectFile,
}: FileExplorerProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [inspectedFile, setInspectedFile] = useState<RepoFileItem | null>(null);
  const [inspectedContent, setInspectedContent] = useState<string>('');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((file) => {
      if (filter !== 'all' && file.category !== filter) return false;
      if (q && !file.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [files, search, filter]);

  const handleOpenInspect = async (file: RepoFileItem) => {
    setInspectedFile(file);
    setInspectError(null);

    if (file.category === 'image') {
      setInspectedContent('');
      return;
    }

    setInspectLoading(true);
    try {
      const content = await onInspectFile(file);
      setInspectedContent(content);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'ไม่สามารถอ่านไฟล์ได้');
    } finally {
      setInspectLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
            {(
              [
                ['all', 'ทั้งหมด'],
                ['html', 'HTML'],
                ['css', 'CSS'],
                ['js', 'JS'],
                ['data', 'JSON / MD'],
                ['image', 'รูปภาพ'],
              ] as Array<[CategoryFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อไฟล์หรือพาธ..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* High-Density File Table */}
        {filteredFiles.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <p className="text-sm font-medium text-slate-900">ไม่พบไฟล์ที่ตรงกับเงื่อนไข</p>
            <p className="text-xs text-slate-500 mt-1">
              ลองล้างคำค้นหา หรือเปลี่ยนตัวกรองประเภทไฟล์ด้านบน
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/90 sticky top-0 border-b border-slate-200 text-xs font-medium text-slate-500">
                <tr>
                  <th className="py-2.5 px-4">พาธไฟล์ใน GitHub</th>
                  <th className="py-2.5 px-4 w-32">ประเภท</th>
                  <th className="py-2.5 px-4 w-28 text-right">ขนาด</th>
                  <th className="py-2.5 px-4 w-56 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredFiles.map((file) => {
                  const isEntry = file.path === activeEntryPath;
                  const isData = file.path === activeDataPath;
                  return (
                    <tr key={file.path} className="hover:bg-slate-50 transition-colors h-10">
                      <td className="py-2 px-4 font-mono text-slate-800 truncate max-w-md">
                        {file.path}
                        {(isEntry || isData) && (
                          <span className="ml-2 font-sans text-blue-600 font-medium">
                            · {isEntry ? 'หน้าหลักปัจจุบัน' : 'ไฟล์ข้อมูลปัจจุบัน'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-slate-500 whitespace-nowrap">
                        {CATEGORY_LABELS[file.category]}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {formatBytes(file.size)}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          {file.category === 'html' && !isEntry && (
                            <button
                              type="button"
                              onClick={() => onSetEntryFile(file.path)}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
                            >
                              ตั้งเป็นหน้าหลัก
                            </button>
                          )}
                          {file.category === 'data' && !isData && (
                            <button
                              type="button"
                              onClick={() => onSetDataFile(file.path)}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
                            >
                              ใช้ดึงข้อมูล
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenInspect(file)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            ดูไฟล์
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline Raw File Inspector */}
      {inspectedFile && (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-slate-900 text-slate-100">
            <div className="flex items-center gap-2 min-w-0 text-xs">
              <span className="font-mono font-medium truncate">{inspectedFile.path}</span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-slate-400 tabular-nums whitespace-nowrap">
                {formatBytes(inspectedFile.size)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setInspectedFile(null)}
              aria-label="ปิดหน้าต่างดูไฟล์"
              className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {inspectedFile.category === 'image' ? (
            <div className="p-6 bg-slate-50 flex flex-col items-center justify-center gap-3">
              <img
                src={`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${inspectedFile.path}`}
                alt={inspectedFile.name}
                referrerPolicy="no-referrer"
                className="max-h-64 rounded border border-slate-200 bg-white object-contain"
              />
              <span className="text-xs font-mono text-slate-500 break-all">
                https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{inspectedFile.path}
              </span>
            </div>
          ) : inspectLoading ? (
            <div className="p-6 text-xs text-slate-500">กำลังโหลดเนื้อหาไฟล์...</div>
          ) : inspectError ? (
            <div className="p-6 text-xs text-rose-600">{inspectError}</div>
          ) : (
            <pre className="p-4 bg-slate-950 text-slate-200 font-mono text-xs leading-relaxed overflow-x-auto max-h-80 overflow-y-auto">
              {inspectedContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
