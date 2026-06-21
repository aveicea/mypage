import { useRef } from 'react';
import { MoveIcon, TrashIcon } from './icons.jsx';

export const POSTIT_COLORS = ['#fff7c2', '#ffd6e0', '#d6f5d6', '#cfe8ff', '#e7d9ff', '#ffe0c2', '#eceff1'];

/**
 * 위젯 공통 프레임.
 * 편집 모드 + 선택 시: 위쪽 작은 툴바의 "이동 핸들"을 잡아야만 이동(본문 드래그 X),
 *   모서리/변 핸들로 리사이즈, 툴바의 휴지통으로 삭제.
 * 본문 클릭 = 선택. 보기 모드: 이동/리사이즈 불가, 본문 상호작용만.
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
    // 핸들/툴바는 각자 처리
    if (e.target.closest('.widget-resize') || e.target.closest('.widget-toolbar')) return;
    e.stopPropagation(); // 캔버스 패닝 방지
    onSelect?.(widget.id);
  }

  function startMove(e) {
    e.stopPropagation();
    onSelect?.(widget.id);
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
      d.moved = true;
      onChange({ x: d.ox + dx, y: d.oy + dy });
      return;
    }

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

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved) onChange({}, { commit: true });
  }

  const isPostit = widget.type === 'postit';

  return (
    <div
      ref={ref}
      className={`widget widget--${widget.type} ${editMode ? 'edit' : ''} ${selected ? 'selected' : ''}`}
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        zIndex: widget.zIndex,
        ...(isPostit ? { background: widget.content?.color || POSTIT_COLORS[0] } : {}),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="widget-body">{children}</div>

      {editMode && selected && (
        <>
          <div className="widget-toolbar">
            <button className="wt-btn wt-move" title="이동" onPointerDown={startMove}>
              <MoveIcon />
            </button>
            <button
              className="wt-btn wt-del"
              title="삭제"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(widget.id);
              }}
            >
              <TrashIcon />
            </button>

            {isPostit &&
              POSTIT_COLORS.map((c) => (
                <button
                  key={c}
                  className="wt-swatch"
                  title="색상"
                  style={{ background: c }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ content: { ...widget.content, color: c } }, { commit: true });
                  }}
                />
              ))}
          </div>

          {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => (
            <div
              key={dir}
              className={`widget-resize r-${dir}`}
              onPointerDown={(e) => startResize(e, dir)}
            />
          ))}
        </>
      )}
    </div>
  );
}
