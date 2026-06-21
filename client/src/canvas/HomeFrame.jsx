import { useRef } from 'react';

/**
 * 영역 가이드(홈 화면 / 뷰 영역). 편집 모드에서는 상단 탭으로 이동, 코너로 크기 조절.
 * 내부는 pointer-events 를 막지 않도록(테두리/핸들만 잡힘) 처리.
 */
export default function HomeFrame({ rect, editMode, zoom, aspect = 16 / 9, onChange, onCommit, tone = 'dark', label = '홈 화면 영역' }) {
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
    // 화면 비율 유지 (가이드라서 비율이 변하면 안 됨) — 가로 드래그로 폭을 정하고 높이는 비율로
    let { x, y } = d;
    const dir = d.dir;
    let width = d.width;
    if (dir.includes('e')) width = d.width + dx;
    if (dir.includes('w')) width = d.width - dx;
    width = Math.max(160, width);
    let height = width / aspect;
    if (dir.includes('w')) x = d.x + (d.width - width); // 오른쪽 모서리 고정
    if (dir.includes('n')) y = d.y + (d.height - height); // 아래쪽 모서리 고정
    onChange({ x, y, width, height });
  }
  function onUp() {
    if (drag.current) {
      const mode = drag.current.mode;
      drag.current = null;
      onCommit?.(mode);
    }
  }

  return (
    <div
      className={`home-frame ${tone === 'light' ? 'home-frame--light' : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      {editMode && (
        <>
          <div className="home-move" onPointerDown={startMove} onPointerMove={onMove} onPointerUp={onUp}>
            {label}
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
