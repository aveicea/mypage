import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

const PAGE_SCALE = 1.5;
const PAGE_GAP = 8;

/**
 * PDF.js 기반 PDF 뷰어.
 * - 터치 스크롤 지원 (아이패드 포함)
 * - IntersectionObserver로 현재 페이지 추적
 * - 페이지를 lazy 렌더링해 초기 로드 속도 향상
 * - savedPage로 마지막 위치 복원
 */
function useDebounced(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export default function PdfViewer({ src, savedPage = 1, onPageChange }) {
  const debouncedPageChange = useDebounced(onPageChange || (() => {}), 1500);
  const containerRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(null);
  const canvasRefs = useRef([]);
  const rendered = useRef(new Set());
  const renderQueue = useRef([]);
  const rendering = useRef(false);
  const restoredRef = useRef(false);

  // PDF 로드
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setError(null);
    setPdf(null);
    setNumPages(0);
    rendered.current.clear();
    renderQueue.current = [];
    restoredRef.current = false;

    pdfjsLib.getDocument({ url: src, cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist/cmaps/', cMapPacked: true })
      .promise
      .then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'PDF 로드 실패');
      });

    return () => { cancelled = true; };
  }, [src]);

  // 단일 페이지 렌더링 (canvas에 그리기)
  const renderPage = useCallback(async (pageNum, doc) => {
    if (rendered.current.has(pageNum)) return;
    const canvas = canvasRefs.current[pageNum - 1];
    if (!canvas) return;
    rendered.current.add(pageNum);
    try {
      const page = await doc.getPage(pageNum);
      const vp = page.getViewport({ scale: PAGE_SCALE });
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    } catch {
      rendered.current.delete(pageNum);
    }
  }, []);

  // 렌더 큐 소비 (순차 처리로 메모리 안전)
  const flushQueue = useCallback(async (doc) => {
    if (rendering.current) return;
    rendering.current = true;
    while (renderQueue.current.length > 0) {
      const n = renderQueue.current.shift();
      await renderPage(n, doc);
    }
    rendering.current = false;
  }, [renderPage]);

  const enqueue = useCallback((pageNum, doc) => {
    if (rendered.current.has(pageNum) || renderQueue.current.includes(pageNum)) return;
    renderQueue.current.push(pageNum);
    flushQueue(doc);
  }, [flushQueue]);

  // IntersectionObserver: 보이는 페이지 렌더 + 현재 페이지 추적
  useEffect(() => {
    if (!pdf || numPages === 0) return;

    const observer = new IntersectionObserver((entries) => {
      let topEntry = null;
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const n = parseInt(entry.target.dataset.page, 10);
          enqueue(n, pdf);
          // 가장 위에 보이는 페이지를 현재 페이지로 추적
          if (!topEntry || entry.boundingClientRect.top < topEntry.boundingClientRect.top) {
            topEntry = entry;
          }
        }
      });
      if (topEntry) {
        debouncedPageChange(parseInt(topEntry.target.dataset.page, 10));
      }
    }, { root: containerRef.current, threshold: 0.1 });

    canvasRefs.current.forEach((c) => { if (c) observer.observe(c); });
    return () => observer.disconnect();
  }, [pdf, numPages, enqueue, onPageChange]);

  // 저장된 페이지로 스크롤 복원 (최초 1회)
  useEffect(() => {
    if (!pdf || numPages === 0 || restoredRef.current) return;
    restoredRef.current = true;
    const page = Math.max(1, Math.min(savedPage, numPages));
    if (page <= 1) return;
    // 렌더 전이라 canvas 크기가 0일 수 있으므로 약간 대기
    const t = setTimeout(() => {
      const target = canvasRefs.current[page - 1];
      if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, 300);
    return () => clearTimeout(t);
  }, [pdf, numPages, savedPage]);

  if (error) {
    return (
      <div className="pdf-error">
        <p>PDF를 불러올 수 없습니다</p>
        <a href={src} target="_blank" rel="noreferrer">새 탭에서 열기</a>
      </div>
    );
  }

  if (!pdf) {
    return <div className="pdf-loading">PDF 로딩 중…</div>;
  }

  return (
    <div
      ref={containerRef}
      className="pdf-scroll"
      style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch', height: '100%' }}
    >
      {Array.from({ length: numPages }, (_, i) => (
        <canvas
          key={i}
          ref={(el) => { canvasRefs.current[i] = el; }}
          data-page={i + 1}
          style={{ display: 'block', width: '100%', marginBottom: PAGE_GAP }}
        />
      ))}
    </div>
  );
}
