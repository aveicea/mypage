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
 * - 문서 내장 목차(아웃라인)를 옆 패널로 표시: 토글로 접고/펴고, 클릭하면 해당 위치로 이동
 */
function useDebounced(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export default function PdfViewer({ src, savedPage = 1, onPageChange }) {
  const debouncedPageChange = useDebounced(onPageChange || (() => {}), 30000);
  const containerRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(null);
  const [outline, setOutline] = useState(null);   // 문서 목차 트리 (없으면 null)
  const [tocOpen, setTocOpen] = useState(false);   // 목차 패널 열림 여부
  const [collapsed, setCollapsed] = useState(() => new Set()); // 접힌 목차 항목 키
  const [pageAspect, setPageAspect] = useState(null); // width/height (lazy 렌더 전 높이 확보용)
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
    setOutline(null);
    setTocOpen(false);
    setCollapsed(new Set());
    setPageAspect(null);
    rendered.current.clear();
    renderQueue.current = [];
    restoredRef.current = false;

    pdfjsLib.getDocument({ url: src, cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist/cmaps/', cMapPacked: true })
      .promise
      .then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        // 목차(아웃라인) — 문서가 내장한 헤더 기반 북마크 트리
        doc.getOutline().then((o) => { if (!cancelled) setOutline(o && o.length ? o : null); }).catch(() => {});
        // 1페이지 비율 → 모든 페이지 칸 높이 확보 (렌더 전에도 레이아웃 안정 → 점프 정확)
        doc.getPage(1).then((p) => {
          if (cancelled) return;
          const vp = p.getViewport({ scale: 1 });
          if (vp.width && vp.height) setPageAspect(vp.width / vp.height);
        }).catch(() => {});
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

  // 목차 항목의 dest → 페이지로 스크롤 이동
  const goToDest = useCallback(async (dest) => {
    if (!dest || !pdf) return;
    try {
      let explicit = dest;
      if (typeof dest === 'string') explicit = await pdf.getDestination(dest);
      if (!Array.isArray(explicit) || !explicit[0]) return;
      const pageIndex = await pdf.getPageIndex(explicit[0]);
      const pageNum = pageIndex + 1;
      enqueue(pageNum, pdf); // 대상 페이지 렌더 예약
      const container = containerRef.current;
      const scrollToPage = () => {
        const target = canvasRefs.current[pageNum - 1];
        if (target && container) container.scrollTop = target.offsetTop;
      };
      scrollToPage();
      // lazy 렌더로 위쪽 페이지 높이가 바뀌면 위치가 어긋날 수 있어 한 번 더 보정
      setTimeout(scrollToPage, 350);
      setTocOpen(false); // 이동 후 패널을 닫아 대상이 가려지지 않게
    } catch { /* 이동 실패는 조용히 무시 */ }
  }, [pdf, enqueue]);

  function toggleCollapse(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

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
      const container = containerRef.current;
      // scrollIntoView는 상위 컨테이너(보드 캔버스/창)까지 끌고 가므로
      // PDF 스크롤 컨테이너 내부에서만 offsetTop으로 직접 이동
      if (target && container) container.scrollTop = target.offsetTop;
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

  // 목차 트리 재귀 렌더
  const renderItems = (items, depth, prefix) =>
    items.map((it, i) => {
      const key = prefix ? `${prefix}-${i}` : `${i}`;
      const hasKids = it.items && it.items.length > 0;
      const isCollapsed = collapsed.has(key);
      return (
        <div key={key} className="pdf-toc-item">
          <div className="pdf-toc-row" style={{ paddingLeft: 6 + depth * 14 }}>
            {hasKids ? (
              <button
                className="pdf-toc-caret"
                title={isCollapsed ? '펼치기' : '접기'}
                onClick={(e) => { e.stopPropagation(); toggleCollapse(key); }}
              >
                {isCollapsed ? '▸' : '▾'}
              </button>
            ) : (
              <span className="pdf-toc-caret pdf-toc-caret--leaf" />
            )}
            <button
              className="pdf-toc-title"
              title={it.title}
              onClick={(e) => { e.stopPropagation(); goToDest(it.dest); }}
            >
              {it.title || '(제목 없음)'}
            </button>
          </div>
          {hasKids && !isCollapsed && renderItems(it.items, depth + 1, key)}
        </div>
      );
    });

  return (
    <div className="pdf-viewer">
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
            style={{
              display: 'block',
              width: '100%',
              marginBottom: PAGE_GAP,
              ...(pageAspect ? { aspectRatio: pageAspect } : {}),
            }}
          />
        ))}
      </div>

      {/* 목차가 있을 때만: 가장자리 화살표 + 슬라이드 패널 */}
      {outline && (
        <>
          <button
            className={`pdf-toc-toggle ${tocOpen ? 'open' : ''}`}
            title={tocOpen ? '목차 닫기' : '목차'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setTocOpen((v) => !v); }}
          >
            {tocOpen ? '◂' : '▸'}
          </button>
          {tocOpen && (
            <div
              className="pdf-toc-panel"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="pdf-toc-head">목차</div>
              <div className="pdf-toc-list">{renderItems(outline, 0, '')}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
