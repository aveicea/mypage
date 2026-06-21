import { useRef } from 'react';

/**
 * "처음 보일 영역" 가이드. 편집 모드에서는 상단 탭으로 이동, 코너로 크기 조절.
 * 내부는 pointer-events 를 막지 않도록(테두리/핸들만 잡힘) 처리.
 */
export default function HomeFrame({ rect, editMode, zoom, onChange, onCommit }) {
  const drag = useRef(null);

  function startMove(e) {
    e.stopPropagation();
    drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, ...rect };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function startResize(e, dir) {
    e.stopPropagation();
    drag.current = { mode: 'resize', dir, sx: e.clientX, sy: e.clientY, ...rect };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const dx = (e.clientX - d.sx) / zoom;
    const dy = (e.clientY - d.sy) / zoom;
    if (d.mode === 'move') {
      onChange({ x: d.x + dx, y: d.y + dy, width: d.width, height: d.height });
      return;
    }
    let { x, y, width, height } = d;
    const dir = d.dir;
    if (dir.includes('e')) width = d.width + dx;
    if (dir.includes('s')) height = d.height + dy;
    if (dir.includes('w')) { width = d.width - dx; x = d.x + dx; }
    if (dir.includes('n')) { height = d.height - dy; y = d.y + dy; }
    width = Math.max(120, width);
    height = Math.max(90, height);
    onChange({ x, y, width, height });
  }
  function onUp() {
    if (drag.current) {
      drag.current = null;
      onCommit?.();
    }
  }

  return (
    <div
      className="home-frame"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      {editMode && (
        <>
          <div
            className="home-move"
            onPointerDown={startMove}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            홈 화면 영역
          </div>
          {['nw', 'ne', 'sw', 'se'].map((dir) => (
            <div
              key={dir}
              className={`home-handle h-${dir}`}
              onPointerDown={(e) => startResize(e, dir)}
              onPointerMove={onMove}
              onPointerUp={onUp}
            />
          ))}
        </>
      )}
    </div>
  );
}
