import { Download, ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface DeploymentGuideProps {
  hasIndexHtml: boolean;
  usePrivateToken: boolean;
}

export function DeploymentGuide({ hasIndexHtml, usePrivateToken }: DeploymentGuideProps) {
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const steps = [
    {
      num: '01',
      title: 'สร้างโปรเจกต์ Google Apps Script',
      body: 'ไปที่ script.google.com แล้วแตะ "New project" (โปรเจกต์ใหม่) เพื่อเปิดหน้าตัวแก้ไขสคริปต์',
    },
    {
      num: '02',
      title: hasIndexHtml ? 'วางโค้ด Code.gs และ Index.html' : 'วางโค้ดลงในไฟล์ Code.gs',
      body: hasIndexHtml
        ? 'นำโค้ด Code.gs ไปวางแทนที่ของเดิม จากนั้นกดเครื่องหมาย + ข้าง Files เลือก HTML ตั้งชื่อว่า Index (ตัว I ใหญ่) แล้ววางโค้ด Index.html'
        : 'ลบฟังก์ชัน myFunction เดิมในไฟล์ Code.gs ออกให้หมด แล้ววางโค้ด Code.gs ที่สร้างจากด้านบนลงไปแทนที่ จากนั้นกดบันทึก',
    },
    {
      num: '03',
      title: usePrivateToken ? 'ตั้งค่า Token สำหรับ Private Repo' : 'กด Deploy เป็น Web app',
      body: usePrivateToken
        ? 'ไปที่เมนู Project Settings (รูปเฟือง) เลื่อนลงมาที่ Script Properties เพิ่ม Property ชื่อ GITHUB_TOKEN แล้วใส่ Personal Access Token จากนั้นกด Deploy > New deployment'
        : 'แตะปุ่ม Deploy มุมขวาบน เลือก New deployment แล้วกดรูปเฟืองข้าง Select type เลือกประเภทเป็น Web app',
    },
    {
      num: '04',
      title: 'กำหนดสิทธิ์เข้าถึงและรับลิงก์เว็บไซต์',
      body: 'ตั้งค่า Execute as เป็น "Me" และ Who has access เป็น "Anyone" จากนั้นกด Deploy และกด Authorize access ในครั้งแรก คุณจะได้ลิงก์ลงท้ายด้วย /exec ไปเปิดใช้งานเป็นเว็บไซต์ได้ทันที',
    },
  ];

  const handleDownloadStandaloneHtml = async () => {
    setExporting(true);
    setExportStatus(null);
    try {
      const res = await fetch('/api/export/github-pages-html');
      const contentType = res.headers.get('content-type') || '';

      if (!res.ok || (!contentType.includes('text/html') && res.status >= 400)) {
        throw new Error('ไม่สามารถสร้างไฟล์ index.html จากเซิร์ฟเวอร์ได้');
      }

      const htmlText = await res.text();
      // Guard against SPA fallback returning non-standalone HTML when already on GitHub Pages
      if (/<script\b[^>]*src=["']\.\/assets\//i.test(htmlText)) {
        throw new Error(
          'คุณกำลังเปิดใช้งานอยู่บนหน้าเว็บ Static อยู่แล้ว สามารถนำไฟล์ index.html บน GitHub Repo ไปใช้งานต่อได้ทันที'
        );
      }

      const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'index.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportStatus('ดาวน์โหลดไฟล์ index.html เรียบร้อยแล้ว นำไฟล์นี้ไปอัปโหลดขึ้น GitHub ได้เลย');
    } catch (err) {
      setExportStatus(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการดาวน์โหลด index.html'
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <section id="deploy-guide" className="pt-12 border-t border-slate-200 space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            ขั้นตอนนำโค้ดไป Deploy บน Google Apps Script
          </h2>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            ทำตาม 4 ขั้นตอนด้านล่างเพื่อเปลี่ยนไฟล์เว็บไซต์จาก GitHub ให้ทำงานบนโดเมนของ Google Apps Script
            โดยไม่ต้องเช่าโฮสติ้งแยก
          </p>
        </div>

        <a
          href="https://script.google.com/home/start"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          เปิด Google Apps Script
          <ExternalLink className="w-4 h-4 text-slate-500" />
        </a>
      </div>

      {/* 4-Step Editorial Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {steps.map((step) => (
          <div
            key={step.num}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
          >
            <div>
              <div className="font-mono text-xs font-semibold text-blue-600 tabular-nums">
                ขั้นตอนที่ {step.num}
              </div>
              <h3 className="text-base font-semibold text-slate-900 mt-2">{step.title}</h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Hosting This App Online on GitHub Pages from a Tablet */}
      <div id="github-pages" className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              นำเว็บ Repo2GAS นี้ขึ้นออนไลน์บน GitHub Pages จากแท็บเล็ต (ไม่ต้องใช้โน้ตบุ๊ก)
            </h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              ทำได้ผ่านเบราว์เซอร์บนแท็บเล็ต (Safari / Chrome) โดยไม่ต้องเปิด Terminal หรือรันคำสั่ง Build เอง
              แค่ดาวน์โหลดไฟล์ <code className="text-slate-900">index.html</code> ไฟล์เดียวแล้วอัปโหลดขึ้น GitHub
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadStandaloneHtml}
            disabled={exporting}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'กำลังรวมไฟล์...' : 'ดาวน์โหลดไฟล์ index.html เดียว'}
          </button>
        </div>

        {exportStatus && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800">
            {exportStatus}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-sm text-slate-600 leading-relaxed">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="font-mono text-xs font-semibold text-blue-600">ขั้นที่ 1</div>
            <div className="font-medium text-slate-900 mt-1">ดาวน์โหลดไฟล์เดียว</div>
            <p className="mt-1 text-xs sm:text-sm">
              แตะปุ่ม &ldquo;ดาวน์โหลดไฟล์ index.html เดียว&rdquo; ด้านบน เพื่อบันทึกไฟล์ลงในเครื่องแท็บเล็ต
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="font-mono text-xs font-semibold text-blue-600">ขั้นที่ 2</div>
            <div className="font-medium text-slate-900 mt-1">สร้างคลังบน GitHub</div>
            <p className="mt-1 text-xs sm:text-sm">
              เปิด <code className="text-slate-900">github.com</code> บนแท็บเล็ต แตะ <strong>+</strong> &gt;{' '}
              <strong>New repository</strong> ตั้งชื่อคลัง (เช่น <code className="text-slate-900">my-web</code>)
              เลือก Public แล้วกด Create
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="font-mono text-xs font-semibold text-blue-600">ขั้นที่ 3</div>
            <div className="font-medium text-slate-900 mt-1">อัปโหลดไฟล์บนหน้าเว็บ</div>
            <p className="mt-1 text-xs sm:text-sm">
              ในหน้าคลังใหม่ แตะคำว่า <strong>uploading an existing file</strong> เลือกไฟล์{' '}
              <code className="text-slate-900">index.html</code> ที่โหลดไว้ แล้วกด{' '}
              <strong>Commit changes</strong>
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="font-mono text-xs font-semibold text-blue-600">ขั้นที่ 4</div>
            <div className="font-medium text-slate-900 mt-1">เปิด GitHub Pages</div>
            <p className="mt-1 text-xs sm:text-sm">
              ไปที่ <strong>Settings &gt; Pages</strong> ตรง Branch เลือก{' '}
              <code className="text-slate-900">main</code> และ <code className="text-slate-900">/ (root)</code>{' '}
              แล้วกด <strong>Save</strong> รอ ~1 นาทีก็เปิดใช้งานออนไลน์ได้ทันที
            </p>
          </div>
        </div>
      </div>

      {/* Technical Notes & Best Practices */}
      <div id="faq" className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-base font-semibold text-slate-900">
          ปัญหาที่พบบ่อยเมื่อดึงเว็บ GitHub เข้า Google Script (และวิธีที่โค้ดนี้จัดการให้)
        </h3>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-600 leading-relaxed">
          <div>
            <div className="font-medium text-slate-900">1. ปัญหา CSS/JS ไม่โหลด (MIME Type)</div>
            <p className="mt-1">
              ลิงก์ raw.githubusercontent.com ส่งไฟล์กลับมาเป็น text/plain ทำให้เบราว์เซอร์บล็อกไฟล์ CSS และ JS
              โค้ดที่สร้างนี้จึงดึงมารวมเป็น Inline หรือชี้ผ่าน jsDelivr CDN ให้อัตโนมัติ
            </p>
          </div>
          <div>
            <div className="font-medium text-slate-900">2. การล้างแคชเมื่ออัปเดตโค้ดบน GitHub</div>
            <p className="mt-1">
              Google Apps Script มี CacheService จำกัดขนาด 100 KB ต่อคีย์ (โค้ดนี้ตรวจสอบขนาดให้ก่อนเก็บ)
              และเมื่อคุณอัปเดตไฟล์บน GitHub สามารถเติม <code className="text-slate-900">?refresh=1</code> ท้าย URL เพื่อดึงข้อมูลใหม่ทันที
            </p>
          </div>
          <div>
            <div className="font-medium text-slate-900">3. ข้อจำกัดสำหรับเว็บ React / Vite</div>
            <p className="mt-1">
              หากโปรเจกต์บน GitHub เป็นซอร์สโค้ด React/TypeScript ที่ยังไม่ Build ให้นำโฟลเดอร์{' '}
              <code className="text-slate-900">dist/</code> ที่ Build แล้วขึ้น Branch หรือใช้ไฟล์ HTML/CSS/JS สำเร็จรูปเพื่อให้ Google Script เปิดแสดงผลได้ทันที
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
