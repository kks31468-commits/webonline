import { Check, Copy, Download } from 'lucide-react';
import { useState } from 'react';

interface SyntaxCodeBlockProps {
  filename: string;
  code: string;
  language: 'javascript' | 'html' | 'json';
  subtitle?: string;
}

export function SyntaxCodeBlock({ filename, code, language, subtitle }: SyntaxCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const lines = code.split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback copy via temporary textarea
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm font-semibold text-white truncate">{filename}</span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap">
            {lines.length} บรรทัด
          </span>
          {subtitle && (
            <>
              <span className="hidden sm:inline text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline text-xs text-slate-400 truncate">{subtitle}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <Download className="w-3.5 h-3.5" />
            ดาวน์โหลด {filename}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'คัดลอกโค้ดแล้ว' : 'คัดลอกโค้ด'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full border-collapse font-mono text-[13px] leading-6" data-lang={language}>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-slate-900/70 transition-colors">
                <td className="select-none text-right pr-4 pl-4 py-0 text-slate-600 w-12 align-top tabular-nums border-r border-slate-800/70">
                  {idx + 1}
                </td>
                <td className="pl-4 pr-6 py-0 whitespace-pre text-slate-200">
                  {highlightCodeLine(line, language)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function highlightCodeLine(line: string, language: 'javascript' | 'html' | 'json') {
  const trimmed = line.trim();
  if (
    language === 'javascript' &&
    (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))
  ) {
    return <span className="text-slate-400 italic">{line}</span>;
  }

  if (language === 'javascript') {
    const keywordRegex =
      /\b(function|var|let|const|return|if|else|for|try|catch|throw|new|true|false|null)\b/g;
    const parts: Array<{ text: string; type: 'plain' | 'kw' | 'str' }> = [];
    let lastIndex = 0;

    // Highlight single-quoted strings and keywords conservatively
    const combinedRegex =
      /('(?:\\'|[^'])*')|\b(function|var|let|const|return|if|else|for|try|catch|throw|new|true|false|null|HtmlService|UrlFetchApp|CacheService|PropertiesService|ScriptApp|Logger)\b/g;

    let match: RegExpExecArray | null;
    while ((match = combinedRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: line.slice(lastIndex, match.index), type: 'plain' });
      }
      if (match[1]) {
        parts.push({ text: match[1], type: 'str' });
      } else {
        parts.push({ text: match[2], type: 'kw' });
      }
      lastIndex = combinedRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push({ text: line.slice(lastIndex), type: 'plain' });
    }

    if (parts.length === 0) return line || ' ';

    // Avoid unused variable warning on keywordRegex
    void keywordRegex;

    return parts.map((part, i) => {
      if (part.type === 'str') {
        return (
          <span key={i} className="text-emerald-300">
            {part.text}
          </span>
        );
      }
      if (part.type === 'kw') {
        return (
          <span key={i} className="text-sky-300 font-medium">
            {part.text}
          </span>
        );
      }
      return <span key={i}>{part.text}</span>;
    });
  }

  return line || ' ';
}
