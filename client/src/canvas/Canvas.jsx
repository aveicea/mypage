import { useEffect, useRef, useState } from 'react';
import HomeFrame from './HomeFrame.jsx';

/**
 * 무한 캔버스. 빈 공간 드래그로 패닝, 휠로 줌.
 * 자식(위젯 레이어)은 pan/zoom transform 이 적용된 .canvas-layer 안에 렌더링.
 */
export default function Canvas({
  viewport,
  editMode,
  panEnabled,
  zoomEnabled,
  homeRect,
  onHomeChange,
  onHomeCommit,
  viewFrame,
  onViewFrameChange,
  onViewFrameCommit,
  onAddAt,
  onQuickAdd,
  onBackgroundClick,
  onMarquee,
  children,
}) {
  const { pan, zoom, zoomAt, panBy, screenToWorld } = viewport;
  const rootRef = useRef(null);
  const panning = useRef(null);
  const pointers = useRef(new Map()); // pointerId -> {x,y} (핀치용)
  const pinch = useRef(null); // { dist, cx, cy }
  const marquee = useRef(null); // 편집 모드 드래그 박스 선택
  const [marqueeRect, setMarqueeRect] = useState(null); // 화면 좌표 오버레이
  const [grabbing, setGrabbing] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, world }

  // 휠 줌은 passive:false 가 필요하므로 직접 리스너 등록
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.ctrlKey) {
        // 핀치(트랙패드)/Ctrl+휠 = 확대/축소 (편집 + 잠금 해제일 때만)
        if (zoomEnabled) {
          e.preventDefault();
          const rect = el.getBoundingClientRect();
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
          zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
        }
        return;
      }

      // 가로가 더 큰 제스처(트랙패드 좌우 스와이프) = 브라우저 뒤로/앞으로가기 → 항상 차단
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);

      // 임베드: iframe 이 아직 비활성(hover 1초 전)일 때만 이 핸들러에 도달한다.
      // (1초 지나면 iframe pointer-events:auto 라 휠이 iframe 으로 직접 가서 여기 안 옴)
      // → 1초 전에는 보드를 이동시킨다. (페이지 스크롤/뒤로가기 방지 위해 항상 preventDefault)
      if (e.target.closest?.('.widget--embed')) {
        e.preventDefault();
        if (panEnabled) panBy(-e.deltaX, -e.deltaY);
        return;
      }

      // 스크롤 가능한 위젯 본문 위: 세로 스크롤은 위젯 내부에 맡기되,
      // 가로 스와이프는 뒤로가기로 새지 않게 차단한다.
      if (e.target.closest?.('.widget-body')) {
        if (horizontal) e.preventDefault();
        return;
      }

      // 가로 스와이프 = 뒤로가기 방지 (보드만 좌우 이동)
      if (horizontal) {
        e.preventDefault();
        if (panEnabled) panBy(-e.deltaX, 0);
        return;
      }

      // 일반 스크롤 = 보드 이동 (편집 모드이거나 잠금 해제 보기)
      if (panEnabled) {
        e.preventDefault();
        panBy(-e.deltaX, -e.deltaY);
      }
      // 잠금 보기: 아무것도 안 함 (완전 고정)
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, panBy, editMode, panEnabled, zoomEnabled]);

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function isBackground(e) {
    return e.target === rootRef.current || e.target.classList.contains('canvas-layer');
  }

  function onPointerDown(e) {
    if (menu) setMenu(null);
    if (!isBackground(e)) return;
    const additive = e.metaKey || e.ctrlKey || e.shiftKey;
    if ((e.button === 0 || e.pointerType !== 'mouse') && !additive) {
      // 배경 빈 곳 클릭 = 선택 해제 (커맨드/시프트면 유지)
      onBackgroundClick?.();
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return; // 좌클릭만

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && zoomEnabled) {
      // 두 손가락 → 핀치 줌 (편집 모드에서만), 패닝/마퀴 중단
      e.currentTarget.setPointerCapture(e.pointerId);
      panning.current = null;
      marquee.current = null;
      setMarqueeRect(null);
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: dist(a, b), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      setGrabbing(false);
      return;
    }

    if (editMode && e.pointerType === 'mouse') {
      // 편집 모드 + 마우스: 배경 드래그 = 드래그 박스 선택
      // (모바일/터치는 아래 패닝으로 빠져 화면 이동)
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = rootRef.current.getBoundingClientRect();
      marquee.current = {
        sx: e.clientX,
        sy: e.clientY,
        ox: e.clientX - rect.left,
        oy: e.clientY - rect.top,
        additive,
        moved: false,
      };
      return;
    }

    if (!panEnabled) return; // 잠금 보기: 패닝 안 함
    e.currentTarget.setPointerCapture(e.pointerId);
    panning.current = { x: e.clientX, y: e.clientY, moved: false };
    setGrabbing(true);
  }

  function onPointerMove(e) {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (!panning.current && !marquee.current) {
      return;
    }

    // 핀치 줌
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = dist(a, b);
      const rect = rootRef.current.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - rect.left;
      const cy = (a.y + b.y) / 2 - rect.top;
      if (pinch.current.dist > 0) zoomAt(cx, cy, d / pinch.current.dist);
      pinch.current.dist = d;
      return;
    }

    // 드래그 박스 선택
    if (marquee.current) {
      const m = marquee.current;
      const rect = rootRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (Math.abs(e.clientX - m.sx) + Math.abs(e.clientY - m.sy) > 2) m.moved = true;
      setMarqueeRect({
        left: Math.min(m.ox, cx),
        top: Math.min(m.oy, cy),
        width: Math.abs(cx - m.ox),
        height: Math.abs(cy - m.oy),
      });
      return;
    }

    if (!panning.current) return;
    const dx = e.clientX - panning.current.x;
    const dy = e.clientY - panning.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) panning.current.moved = true;
    panning.current.x = e.clientX;
    panning.current.y = e.clientY;
    panBy(dx, dy);
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;

    if (marquee.current) {
      const m = marquee.current;
      marquee.current = null;
      setMarqueeRect(null);
      if (m.moved) {
        const rect = rootRef.current.getBoundingClientRect();
        const a = screenToWorld(m.ox, m.oy);
        const b = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        onMarquee?.(
          {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(b.x - a.x),
            height: Math.abs(b.y - a.y),
          },
          m.additive
        );
      }
    }

    panning.current = null;
    setGrabbing(false);
  }

  function onDblClick(e) {
    if (!isBackground(e)) return;
    const rect = rootRef.current.getBoundingClientRect();
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    onQuickAdd?.(world);
  }

  function onContextMenu(e) {
    if (!isBackground(e)) return;
    e.preventDefault();
    if (!editMode) return; // 보기 모드에서는 추가 메뉴 없음
    const rect = rootRef.current.getBoundingClientRect();
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    setMenu({ x: e.clientX, y: e.clientY, world });
  }

  const types = [
    ['text', '텍스트/메모'],
    ['media', '파일/미디어'],
    ['link', '링크 카드'],
    ['embed', '임베드'],
    ['draw', '그림'],
    ['viewbtn', '뷰 버튼'],
  ];

  return (
    <div
      ref={rootRef}
      className={`canvas-root ${grabbing ? 'canvas-grabbing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDblClick}
      onContextMenu={onContextMenu}
    >
      <div
        className="canvas-layer"
        style={{
          transform:
            zoom === 1
              ? `translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px)`
              : `translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px) scale(${zoom})`,
        }}
      >
        {editMode && homeRect && (
          <HomeFrame
            rect={homeRect}
            editMode={editMode}
            zoom={zoom}
            aspect={window.innerWidth / window.innerHeight}
            onChange={onHomeChange}
            onCommit={onHomeCommit}
          />
        )}
        {editMode && viewFrame && (
          <HomeFrame
            rect={viewFrame}
            editMode={editMode}
            zoom={zoom}
            aspect={window.innerWidth / window.innerHeight}
            tone="light"
            label="뷰 영역"
            onChange={onViewFrameChange}
            onCommit={onViewFrameCommit}
          />
        )}
        {children}
      </div>

      {marqueeRect && (
        <div
          className="marquee-box"
          style={{
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      )}

      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {types.map(([type, label]) => (
            <button
              key={type}
              onClick={() => {
                onAddAt?.(type, menu.world);
                setMenu(null);
              }}
            >
              + {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
