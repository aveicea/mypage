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
  const marquee = useRef(null); // 편집 모드 드래그 박스 선택
  const pinching = useRef(false); // 두 손가락 핀치 중 (패닝 억제용)
  const wheelGesture = useRef({ start: 0, last: 0, body: null }); // 위젯 스크롤 1초 지연용
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
        wheelGesture.current.body = null; // 임베드/배경으로 나가면 위젯 타이머 리셋
        e.preventDefault();
        if (panEnabled) panBy(-e.deltaX, -e.deltaY);
        return;
      }

      // 위젯 본문 위: 위젯이 많으면 보드 스크롤이 어려우니 짧은 지연을 둔다.
      // 그 위젯에 처음 들어와 0.4초간은 보드가 이동하고, 같은 위젯 위에서 그 뒤로
      // 계속 굴리면 그때부터 위젯 내부가 스크롤된다. 한 번 위젯 스크롤로 들어가면
      // 멈췄다 다시 굴려도 계속 위젯 안에서만(커서를 다른 위젯/배경으로 옮겨야 리셋).
      // PDF 뷰어 위: 스크롤이 본래 목적이므로 보드 패닝 지연 없이 바로 내부 스크롤.
      // (가로 스크롤할 게 없을 때만 뒤로가기 방지)
      if (e.target.closest?.('.pdf-scroll')) {
        wheelGesture.current.body = null;
        if (horizontal) e.preventDefault();
        return;
      }

      const body = e.target.closest?.('.widget-body');
      if (body) {
        if (panEnabled) {
          const now = performance.now();
          const g = wheelGesture.current;
          if (g.body !== body) {
            // 다른 위젯으로 옮겨옴 → 새로 타이머 시작
            g.start = now;
            g.body = body;
          }
          if (now - g.start < 400) {
            // 처음 0.4초: 보드 이동
            e.preventDefault();
            panBy(-e.deltaX, -e.deltaY);
            return;
          }
        }
        // 1초 후(또는 잠금 보기): 위젯 내부 스크롤. 가로 스크롤할 게 없으면 뒤로가기만 차단.
        if (horizontal) {
          const canScrollX = body.scrollWidth > body.clientWidth + 1;
          if (!canScrollX) e.preventDefault();
        }
        return;
      }

      // 여기부터는 위젯 밖(배경) → 위젯 스크롤 타이머 리셋
      wheelGesture.current.body = null;

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

  // 두 손가락 핀치 줌 (터치). 위젯 위에서도 동작하도록 pointer 이벤트가 아닌
  // touch 이벤트로 루트에서 직접 처리한다 (위젯이 pointer 이벤트 전파를 막아도 잡힘).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !zoomEnabled) return;
    let last = 0; // 직전 두 손가락 거리
    const onStart = (e) => {
      if (e.touches.length !== 2) return;
      const [a, b] = e.touches;
      last = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinching.current = true;
      panning.current = null;
      marquee.current = null;
      setMarqueeRect(null);
      setGrabbing(false);
    };
    const onMove = (e) => {
      if (!pinching.current || e.touches.length < 2) return;
      e.preventDefault();
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const rect = el.getBoundingClientRect();
      const cx = (a.clientX + b.clientX) / 2 - rect.left;
      const cy = (a.clientY + b.clientY) / 2 - rect.top;
      if (last > 0) zoomAt(cx, cy, d / last);
      last = d;
    };
    const onEnd = (e) => {
      if (e.touches.length < 2) { pinching.current = false; last = 0; }
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [zoomEnabled, zoomAt]);

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

    // 두 손가락 핀치는 touch 이벤트 핸들러(위)에서 처리. 진행 중이면 패닝/마퀴 시작 안 함.
    if (pinching.current) return;

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
    if (pinching.current) return; // 핀치 중에는 패닝/마퀴 무시
    if (!panning.current && !marquee.current) return;

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
