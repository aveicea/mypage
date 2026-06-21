import { useRef } from 'react';

// 이 요소들 위에서 시작한 포인터는 드래그(이동)로 처리하지 않고
// 본래 동작(텍스트 입력, 버튼 클릭 등)이 그대로 일어나게 둔다.
const SKIP_DRAG = new Set(['TEXTAREA', 'INPUT', 'BUTTON', 'SELECT']);

/**
 * 위젯 공통 프레임.
 * 편집 모드: 위젯 본문 아무 곳이나 잡아 드래그 이동, 모서리/변 핸들로 리사이즈,
 *            선택 강조 + 삭제 버튼. 단 입력/버튼 위에서는 드래그하지 않음.
 * 보기 모드: 본문 상호작용(스크롤/링크/영상)만, 이동·리사이즈 불가.
 */
export default function WidgetFrame({
  widget,
  zoom,
  editMode,
  selected,
  onSelect,
  onChange,
  onDelete,
  children,
}) {
  const ref = useRef(null);
  const drag = useRef(null);

  function onPointerDown(e) {
    if (!editMode) return;
    if (e.target.classList.contains('widget-resize')) return; // 리사이즈 핸들이 처리
    onSelect?.(widget.id);
    if (SKIP_DRAG.has(e.target.tagName) || e.target.closest('[data-no-drag]')) return;
    e.stopPropagation();
    drag.current = {
      mode: 'move',
      sx: e.clientX,
      sy: e.clientY,
      ox: widget.x,
      oy: widget.y,
      moved: false,
    };
    ref.current.setPointerCapture(e.pointerId);
  }

  function startResize(e, dir) {
    e.stopPropagation();
    onSelect?.(widget.id);
    drag.current = {
      mode: 'resize',
      dir,
      sx: e.clientX,
      sy: e.clientY,
      ox: widget.x,
      oy: widget.y,
      ow: widget.width,
      oh: widget.height,
      moved: true,
    };
    ref.current.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / zoom;
    const dy = (e.clientY - d.sy) / zoom;

    if (d.mode === 'move') {
      // 작은 움직임은 무시 → 더블클릭/클릭이 드래그로 오인되지 않도록
      if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 4) return;
      d.moved = true;
      e.stopPropagation();
      onChange({ x: d.ox + dx, y: d.oy + dy });
      return;
    }

    // resize
    e.stopPropagation();
    const MINW = 80;
    const MINH = 60;
    let nx = d.ox;
    let ny = d.oy;
    let nw = d.ow;
    let nh = d.oh;
    const dir = d.dir;
    if (dir.includes('e')) nw = d.ow + dx;
    if (dir.includes('s')) nh = d.oh + dy;
    if (dir.includes('w')) { nw = d.ow - dx; nx = d.ox + dx; }
    if (dir.includes('n')) { nh = d.oh - dy; ny = d.oy + dy; }
    if (nw < MINW) { if (dir.includes('w')) nx -= MINW - nw; nw = MINW; }
    if (nh < MINH) { if (dir.includes('n')) ny -= MINH - nh; nh = MINH; }
    onChange({ x: nx, y: ny, width: nw, height: nh });
  }

  function onPointerUp(e) {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved) {
      e.stopPropagation();
      onChange({}, { commit: true }); // 드래그/리사이즈 종료 시 확정 저장
    }
  }

  return (
    <div
      ref={ref}
      className={`widget ${editMode ? 'edit' : ''} ${selected ? 'selected' : ''}`}
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        zIndex: widget.zIndex,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="widget-body">{children}</div>

      {editMode && (
        <>
          {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => (
            <div
              key={dir}
              className={`widget-resize r-${dir}`}
              onPointerDown={(e) => startResize(e, dir)}
            />
          ))}
          {selected && (
            <button
              className="widget-delete"
              data-no-drag
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(widget.id);
              }}
            >
              ×
            </button>
          )}
        </>
      )}
    </div>
  );
}
