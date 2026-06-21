import { useEffect, useRef, useState } from 'react';

/**
 * 무한 캔버스. 빈 공간 드래그로 패닝, 휠로 줌.
 * 자식(위젯 레이어)은 pan/zoom transform 이 적용된 .canvas-layer 안에 렌더링.
 */
export default function Canvas({ viewport, editMode, panEnabled, onAddAt, onBackgroundClick, children }) {
  const { pan, zoom, zoomAt, panBy, screenToWorld } = viewport;
  const rootRef = useRef(null);
  const panning = useRef(null);
  const pointers = useRef(new Map()); // pointerId -> {x,y} (핀치용)
  const pinch = useRef(null); // { dist, cx, cy }
  const [grabbing, setGrabbing] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, world }

  // 휠 줌은 passive:false 가 필요하므로 직접 리스너 등록
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (editMode) {
        // 편집 모드: 휠 = 확대/축소
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
      } else if (panEnabled) {
        // 잠금 해제 보기: 휠 = 스크롤(이동), 확대는 안 함
        e.preventDefault();
        panBy(-e.deltaX, -e.deltaY);
      }
      // 잠금 보기: 아무것도 안 함 (완전 고정)
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, panBy, editMode, panEnabled]);

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function isBackground(e) {
    return e.target === rootRef.current || e.target.classList.contains('canvas-layer');
  }

  function onPointerDown(e) {
    if (menu) setMenu(null);
    if (!isBackground(e)) return;
    if (e.button === 0 || e.pointerType !== 'mouse') {
      // 배경 빈 곳 클릭 = 선택 해제
      onBackgroundClick?.();
    }
    if (!panEnabled) return; // 잠금 보기: 패닝 안 함
    if (e.pointerType === 'mouse' && e.button !== 0) return; // 좌클릭만 패닝

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointers.current.size === 2 && editMode) {
      // 두 손가락 → 핀치 줌 (편집 모드에서만), 패닝 중단
      panning.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: dist(a, b), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      setGrabbing(false);
    } else {
      panning.current = { x: e.clientX, y: e.clientY, moved: false };
      setGrabbing(true);
    }
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) {
      if (!panning.current) return;
    } else {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
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

    panning.current = null;
    setGrabbing(false);
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
    ['image', '이미지'],
    ['link', '링크 카드'],
    ['embed', '임베드'],
    ['github', '깃허브 카드'],
  ];

  return (
    <div
      ref={rootRef}
      className={`canvas-root ${grabbing ? 'canvas-grabbing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
    >
      <div
        className="canvas-layer"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {children}
      </div>

      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }}>
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
