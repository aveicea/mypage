import { useEffect, useRef, useState } from 'react';

/**
 * 무한 캔버스. 빈 공간 드래그로 패닝, 휠로 줌.
 * 자식(위젯 레이어)은 pan/zoom transform 이 적용된 .canvas-layer 안에 렌더링.
 */
export default function Canvas({ viewport, editMode, onAddAt, onBackgroundClick, children }) {
  const { pan, zoom, zoomAt, panBy, screenToWorld } = viewport;
  const rootRef = useRef(null);
  const panning = useRef(null);
  const [grabbing, setGrabbing] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, world }

  // 휠 줌은 passive:false 가 필요하므로 직접 리스너 등록
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(sx, sy, factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  function isBackground(e) {
    return e.target === rootRef.current || e.target.classList.contains('canvas-layer');
  }

  function onPointerDown(e) {
    if (menu) setMenu(null);
    if (!isBackground(e)) return;
    if (e.button !== 0) return; // 좌클릭만 패닝
    panning.current = { x: e.clientX, y: e.clientY, moved: false };
    setGrabbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!panning.current) return;
    const dx = e.clientX - panning.current.x;
    const dy = e.clientY - panning.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) panning.current.moved = true;
    panning.current.x = e.clientX;
    panning.current.y = e.clientY;
    panBy(dx, dy);
  }

  function onPointerUp(e) {
    const wasPanning = panning.current;
    panning.current = null;
    setGrabbing(false);
    if (wasPanning && !wasPanning.moved && isBackground(e)) {
      onBackgroundClick?.();
    }
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
