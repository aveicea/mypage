import { useRef, useState } from 'react';

const PEN_COLORS = ['#111827', '#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#ffffff'];

/**
 * 자유롭게 그리는 그림 위젯. 포인터(마우스/터치/애플펜슬)로 획을 그린다.
 * 좌표는 0~1 로 정규화해 저장 → 위젯 크기를 바꿔도 그림이 같이 스케일된다.
 */
export default function DrawWidget({ widget, editMode, onChange }) {
  const strokes = widget.content?.strokes || [];
  const svgRef = useRef(null);
  const [cur, setCur] = useState(null); // 그리는 중인 획
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [width, setWidth] = useState(2);

  function pt(e) {
    const r = svgRef.current.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ];
  }

  function onDown(e) {
    e.stopPropagation();
    svgRef.current.setPointerCapture(e.pointerId);
    setCur({ color, width, points: [pt(e)] });
  }
  function onMove(e) {
    if (!cur) return;
    e.stopPropagation();
    setCur((c) => ({ ...c, points: [...c.points, pt(e)] }));
  }
  function onUp(e) {
    if (!cur) return;
    e.stopPropagation();
    const next = cur.points.length > 1 ? [...strokes, cur] : strokes;
    setCur(null);
    if (next !== strokes) onChange({ content: { ...widget.content, strokes: next } }, { commit: true });
  }

  function toPoints(s) {
    return s.points.map((p) => `${p[0]},${p[1]}`).join(' ');
  }

  function undo() {
    onChange({ content: { ...widget.content, strokes: strokes.slice(0, -1) } }, { commit: true });
  }
  function clear() {
    onChange({ content: { ...widget.content, strokes: [] } }, { commit: true });
  }

  return (
    <div className="w-draw">
      {editMode && (
        <div className="draw-tools" onPointerDown={(e) => e.stopPropagation()}>
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              className={`draw-swatch ${color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <button className="draw-w" title="얇게" onClick={() => setWidth(2)}>·</button>
          <button className="draw-w" title="굵게" onClick={() => setWidth(5)}>●</button>
          <button className="draw-w" title="한 획 취소" onClick={undo}>↺</button>
          <button className="draw-w" title="전체 지우기" onClick={clear}>🗑</button>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        {[...strokes, ...(cur ? [cur] : [])].map((s, i) => (
          <polyline
            key={i}
            points={toPoints(s)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
