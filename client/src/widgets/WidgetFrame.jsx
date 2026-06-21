import { useRef } from 'react';

/**
 * 위젯 공통 프레임: 위치/크기 적용, 편집 모드에서 드래그 이동·리사이즈·선택·삭제.
 * onChange(patch, { commit }) — commit=true 일 때 즉시 노션 반영(드래그 종료 시).
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
  const dragRef = useRef(null);

  function startDrag(e) {
    if (!editMode) return;
    e.stopPropagation();
    onSelect?.(widget.id);
    dragRef.current = {
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origX: widget.x,
      origY: widget.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function startResize(e) {
    if (!editMode) return;
    e.stopPropagation();
    onSelect?.(widget.id);
    dragRef.current = {
      mode: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      origW: widget.width,
      origH: widget.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;
    if (d.mode === 'move') {
      onChange({ x: d.origX + dx, y: d.origY + dy });
    } else {
      onChange({
        width: Math.max(80, d.origW + dx),
        height: Math.max(60, d.origH + dy),
      });
    }
  }

  function endDrag(e) {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
    onChange({}, { commit: true }); // 드래그 종료 시 확정 저장
  }

  return (
    <div
      className={`widget ${editMode ? 'edit' : ''} ${selected ? 'selected' : ''}`}
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        zIndex: widget.zIndex,
      }}
      onPointerDown={(e) => {
        if (editMode) {
          e.stopPropagation();
          onSelect?.(widget.id);
        }
      }}
    >
      <div className="widget-body">{children}</div>

      {editMode && (
        <>
          <div
            className="widget-drag-overlay"
            onPointerDown={startDrag}
            onPointerMove={onMove}
            onPointerUp={endDrag}
          />
          <div
            className="widget-resize"
            onPointerDown={startResize}
            onPointerMove={onMove}
            onPointerUp={endDrag}
          />
          {selected && (
            <button
              className="widget-delete"
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
