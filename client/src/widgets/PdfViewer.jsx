import { useContext, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { WidgetChromeContext } from './WidgetFrame.jsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

const PAGE_SCALE = 1.5;
const PAGE_GAP = 8;
const MAX_TOC_PAGES = 1000; // 자동 목차 분석 시 스캔할 최대 페이지

/**
 * PDF.js 기반 PDF 뷰어.
 * - 터치 스크롤 지원 (아이패드 포함)
 * - IntersectionObserver로 현재 페이지 추적
 * - 페이지를 lazy 렌더링해 초기 로드 속도 향상
 * - savedPage로 마지막 위치 복원
 * - 목차 패널: 문서 내장 아웃라인이 있으면 그대로, 없으면 글자 크기로 헤더를 추정해 구성.
 *   토글로 접고/펴고, 클릭하면 해당 위치로 이동.
 */
function useDebounced(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

/** 내장 아웃라인 → 통일 트리 ({ title, dest, children }) */
function mapOutline(items) {
  return items.map((it) => ({
    title: it.title || '(제목 없음)',
    dest: it.dest,
    children: it.items && it.items.length ? mapOutline(it.items) : [],
  }));
}

/** renderItems 와 같은 key 규칙으로, 자식이 있는(접을 수 있는) 항목의 key 전부 수집 */
function collectParentKeys(items, prefix, out) {
  items.forEach((it, i) => {
    const key = prefix ? `${prefix}-${i}` : `${i}`;
    if (it.children && it.children.length) {
      out.push(key);
      collectParentKeys(it.children, key, out);
    }
  });
  return out;
}

/**
 * 글자 크기로 헤더를 추정해 목차 트리를 만든다.
 * - 각 페이지 텍스트를 같은 줄(y)끼리 묶어 줄별 최대 글자 크기 계산
 * - 가장 흔한 크기 = 본문, 그보다 충분히 큰 줄 = 헤더 후보
 * - 매 페이지 반복되는 줄(머리말/꼬리말)은 제외
 * - 헤더 크기를 큰 순으로 레벨화해 계층 구성, 위치(page, y)로 이동
 */
async function scanLines(doc) {
  const pageCount = Math.min(doc.numPages, MAX_TOC_PAGES);
  const lines = [];
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const byLine = new Map(); // 라운딩한 y → 줄 정보
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const tr = it.transform || [1, 0, 0, 1, 0, 0];
      const size = it.height || Math.hypot(tr[2], tr[3]) || Math.abs(tr[3]) || 0;
      const yKey = Math.round(tr[5]);
      const cur = byLine.get(yKey) || { y: tr[5], size: 0, parts: [] };
      cur.size = Math.max(cur.size, size);
      cur.parts.push([tr[4], it.str]);
      byLine.set(yKey, cur);
    }
    for (const ln of byLine.values()) {
      const text = ln.parts.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join('').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      lines.push({ page: p, y: ln.y, size: ln.size, text, pageHeight: vp.height });
    }
  }
  return lines;
}

/** scanLines 결과(줄 목록)에서 글자 크기로 헤더를 추정해 목차 트리를 만든다. */
function buildHeadingsTocFromLines(lines) {
  if (!lines.length) return null;
  const round = (s) => Math.round(s * 2) / 2;
  const sizeCount = new Map();
  for (const l of lines) sizeCount.set(round(l.size), (sizeCount.get(round(l.size)) || 0) + 1);

  // 본문 크기 = 가장 흔한 줄 크기
  let bodySize = 0, bestCount = -1;
  for (const [s, c] of sizeCount) if (c > bestCount) { bestCount = c; bodySize = s; }

  // 머리말/꼬리말 제거: 같은 텍스트가 여러 페이지에 반복되면 제외
  const pagesByText = new Map();
  for (const l of lines) {
    const set = pagesByText.get(l.text) || new Set();
    set.add(l.page);
    pagesByText.set(l.text, set);
  }

  const heads = lines.filter((l) =>
    l.size >= bodySize * 1.18 &&            // 본문보다 충분히 큼
    l.text.length >= 2 && l.text.length <= 90 && // 너무 짧거나 문단처럼 긴 줄 제외
    (pagesByText.get(l.text)?.size || 0) <= 3    // 반복되는 머리말/꼬리말 제외
  );
  if (!heads.length) return null;

  // 헤더 크기를 큰 순으로 레벨화 (상위 4단계까지)
  const sizes = [...new Set(heads.map((h) => round(h.size)))].sort((a, b) => b - a).slice(0, 4);
  const levelOf = (s) => {
    const i = sizes.indexOf(round(s));
    return i < 0 ? sizes.length - 1 : i;
  };

  // 문서 순서: 페이지 오름차순, 같은 페이지 안에서는 위(y 큰 값)부터
  heads.sort((a, b) => a.page - b.page || b.y - a.y);

  const rootNodes = [];
  const stack = []; // { level, node }
  for (const h of heads) {
    const node = { title: h.text, pos: { page: h.page, y: h.y, pageHeight: h.pageHeight }, children: [] };
    const level = levelOf(h.size);
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : rootNodes).push(node);
    stack.push({ level, node });
  }
  return rootNodes;
}

export default function PdfViewer({ src, savedPage = 1, onPageChange }) {
  const { sideHost } = useContext(WidgetChromeContext);
  const debouncedPageChange = useDebounced(onPageChange || (() => {}), 30000);
  const containerRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(null);
  const [toc, setToc] = useState(null);          // 통일 트리 (null=아직, []=없음)
  const [tocSource, setTocSource] = useState(null); // 'outline' | 'auto'
  const [tocLoading, setTocLoading] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [pageAspect, setPageAspect] = useState(null); // width/height
  const [query, setQuery] = useState('');          // PDF 내 검색어
  const [results, setResults] = useState(null);    // 검색 결과 (null=검색 안 함)
  const [searching, setSearching] = useState(false);
  const canvasRefs = useRef([]);
  const rendered = useRef(new Set());
  const renderQueue = useRef([]);
  const rendering = useRef(false);
  const restoredRef = useRef(false);
  const autoTried = useRef(false);
  const linesRef = useRef(null); // scanLines 캐시 (목차 추정/검색 공용)

  // PDF 로드
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setError(null);
    setPdf(null);
    setNumPages(0);
    setToc(null);
    setTocSource(null);
    setTocLoading(false);
    setTocOpen(false);
    setCollapsed(new Set());
    setPageAspect(null);
    setQuery('');
    setResults(null);
    setSearching(false);
    rendered.current.clear();
    renderQueue.current = [];
    restoredRef.current = false;
    autoTried.current = false;
    linesRef.current = null;

    pdfjsLib.getDocument({ url: src, cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist/cmaps/', cMapPacked: true })
      .promise
      .then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        // 내장 목차(아웃라인)가 있으면 우선 사용
        doc.getOutline().then((o) => {
          if (cancelled || !o || !o.length) return;
          setToc(mapOutline(o));
          setTocSource('outline');
        }).catch(() => {});
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

  // 페이지 텍스트를 한 번만 스캔해 캐시 (목차 추정/검색 공용)
  const ensureLines = useCallback(async () => {
    if (linesRef.current) return linesRef.current;
    if (!pdf) return [];
    const lines = await scanLines(pdf);
    linesRef.current = lines;
    return lines;
  }, [pdf]);

  // 목차 패널을 처음 열 때, 내장 목차가 없으면 글자 크기로 추정 (비용이 커서 지연 실행)
  useEffect(() => {
    if (!tocOpen || !pdf || autoTried.current || tocSource === 'outline') return;
    if (toc && toc.length) return;
    autoTried.current = true;
    setTocLoading(true);
    let cancelled = false;
    ensureLines()
      .then((lines) => { if (!cancelled) { setToc(buildHeadingsTocFromLines(lines) || []); setTocSource('auto'); } })
      .catch(() => { if (!cancelled) setToc([]); })
      .finally(() => { if (!cancelled) setTocLoading(false); });
    return () => { cancelled = true; };
  }, [tocOpen, pdf, toc, tocSource, ensureLines]);

  // PDF 내 검색: 검색어가 있으면 줄 목록에서 매칭을 찾아 결과로 표시
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setResults(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    ensureLines()
      .then((lines) => {
        if (cancelled) return;
        const out = [];
        for (const l of lines) {
          const idx = l.text.toLowerCase().indexOf(q);
          if (idx >= 0) {
            out.push({ page: l.page, y: l.y, pageHeight: l.pageHeight, text: l.text, idx, len: q.length });
            if (out.length >= 300) break;
          }
        }
        setResults(out);
      })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [query, ensureLines]);

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

  // 페이지 + 페이지 내 y 위치로 스크롤 (자동 목차용)
  const scrollToPos = useCallback((pageNum, y, pageHeight) => {
    enqueue(pageNum, pdf);
    const container = containerRef.current;
    const apply = () => {
      const target = canvasRefs.current[pageNum - 1];
      if (!target || !container) return;
      const h = target.clientHeight || 0;
      const off = (pageHeight && y != null) ? (pageHeight - y) * (h / pageHeight) : 0;
      container.scrollTop = target.offsetTop + Math.max(0, off - 8);
    };
    apply();
    setTimeout(apply, 350); // lazy 렌더로 위쪽 높이가 바뀌면 보정
  }, [pdf, enqueue]);

  // 내장 아웃라인 dest → 페이지로 이동
  const goToDest = useCallback(async (dest) => {
    if (!dest || !pdf) return;
    try {
      let explicit = dest;
      if (typeof dest === 'string') explicit = await pdf.getDestination(dest);
      if (!Array.isArray(explicit) || !explicit[0]) return;
      const pageIndex = await pdf.getPageIndex(explicit[0]);
      scrollToPos(pageIndex + 1, null, null);
    } catch { /* 무시 */ }
  }, [pdf, scrollToPos]);

  const goToNode = useCallback((node) => {
    if (node.dest) goToDest(node.dest);
    else if (node.pos) scrollToPos(node.pos.page, node.pos.y, node.pos.pageHeight);
    // 패널은 사용자가 손잡이로 닫을 때까지 유지 (항목 클릭으로 닫지 않음)
  }, [goToDest, scrollToPos]);

  function toggleCollapse(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(collectParentKeys(toc || [], '', [])));

  // IntersectionObserver: 보이는 페이지 렌더 + 현재 페이지 추적
  useEffect(() => {
    if (!pdf || numPages === 0) return;

    const observer = new IntersectionObserver((entries) => {
      let topEntry = null;
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const n = parseInt(entry.target.dataset.page, 10);
          enqueue(n, pdf);
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
    const t = setTimeout(() => {
      const target = canvasRefs.current[page - 1];
      const container = containerRef.current;
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
      const hasKids = it.children && it.children.length > 0;
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
              onClick={(e) => { e.stopPropagation(); goToNode(it); }}
            >
              {it.title}
            </button>
          </div>
          {hasKids && !isCollapsed && renderItems(it.children, depth + 1, key)}
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

      {sideHost && createPortal(
        <>
          <button
            className={`pdf-toc-toggle ${tocOpen ? 'open' : ''}`}
            title={tocOpen ? '목차 닫기' : '목차 열기'}
            aria-label={tocOpen ? '목차 닫기' : '목차 열기'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setTocOpen((v) => !v); }}
          />
          {tocOpen && (
            <div className="pdf-toc-panel" onPointerDown={(e) => e.stopPropagation()}>
              <div className="pdf-toc-head">
                <span className="pdf-toc-title-label">목차</span>
                <div className="pdf-toc-search">
                  <input
                    className="pdf-toc-search-input"
                    value={query}
                    placeholder="🔍"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      className="pdf-toc-search-x"
                      title="검색 지우기"
                      onClick={(e) => { e.stopPropagation(); setQuery(''); }}
                    >×</button>
                  )}
                </div>
                {!query && toc && toc.length > 0 && (
                  <span className="pdf-toc-actions">
                    <button onClick={(e) => { e.stopPropagation(); expandAll(); }}>열기</button>
                    <button onClick={(e) => { e.stopPropagation(); collapseAll(); }}>닫기</button>
                  </span>
                )}
              </div>
              <div className="pdf-toc-list">
                {query ? (
                  searching ? (
                    <div className="pdf-toc-empty">검색 중…</div>
                  ) : results && results.length ? (
                    results.map((r, i) => {
                      const start = Math.max(0, r.idx - 24);
                      return (
                        <button
                          key={i}
                          className="pdf-search-row"
                          onClick={(e) => { e.stopPropagation(); scrollToPos(r.page, r.y, r.pageHeight); }}
                        >
                          <span className="pdf-search-page">p.{r.page}</span>
                          <span className="pdf-search-snippet">
                            {start > 0 ? '…' : ''}{r.text.slice(start, r.idx)}
                            <mark>{r.text.slice(r.idx, r.idx + r.len)}</mark>
                            {r.text.slice(r.idx + r.len, r.idx + r.len + 60)}
                            {r.text.length > r.idx + r.len + 60 ? '…' : ''}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="pdf-toc-empty">검색 결과 없음</div>
                  )
                ) : tocLoading ? (
                  <div className="pdf-toc-empty">목차 분석 중…</div>
                ) : toc && toc.length ? (
                  renderItems(toc, 0, '')
                ) : (
                  <div className="pdf-toc-empty">목차를 찾지 못했어요</div>
                )}
              </div>
            </div>
          )}
        </>,
        sideHost
      )}
    </div>
  );
}
