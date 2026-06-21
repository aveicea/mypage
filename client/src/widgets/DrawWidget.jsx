import { useRef, useState } from 'react';

const PEN_COLORS = ['#111827', '#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#ffffff'];
const BG_COLORS = ['#ffffff', '#fff7c2', '#d6f5d6', '#cfe8ff', '#111827'];

function hexToRgba(hex, a) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * 자유롭게 그리는 그림 위젯. 펜/지우개, 배경색+투명도 지원.
 * 좌표는 0~1 정규화 저장 → 위젯 크기 바꿔도 그림이 같이 스케일.
 */
export default function DrawWidget({ widget, editMode, onRequestEdit, onChange }) {
  const content = widget.content || {};
  const strokes = content.strokes || [];
  const bg = content.bg ?? '#ffffff';
  const bgOpacity = content.bgOpacity ?? 1;

  const svgRef = useRef(null);
  const eraseRef = useRef(null); // 지우개 작업 중 작업본
  const [cur, setCur] = useState(null);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [width, setWidth] = useState(2);
  const [tool, setTool] = useState('none'); // 'none'(선택/이동) | 'pen' | 'eraser'

  function pt(e) {
    const r = svgRef.current.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      e.pressure > 0 ? e.pressure : 0.5, // 필압 (애플펜슬 등)
    ];
  }

  function eraseAt(p) {
    const thr = 0.03;
    const remaining = eraseRef.current.filter(
      (s) => !s.points.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < thr)
    );
    if (remaining.length !== eraseRef.current.length) {
      eraseRef.current = remaining;
      onChange({ content: { ...content, strokes: remaining } });
    }
  }

  function onDown(e) {
    if (tool === 'none') return; // 선택/이동 모드: 위젯 프레임이 처리하도록 둠
    e.stopPropagation();
    svgRef.current.setPointerCapture(e.pointerId);
    if (tool === 'eraser') {
      eraseRef.current = [...strokes];
      eraseAt(pt(e));
    } else {
      const isHl = tool === 'hl';
      setCur({ type: isHl ? 'hl' : 'pen', color, width: isHl ? 16 : width, points: [pt(e)] });
    }
  }
  function onMove(e) {
    e.stopPropagation();
    if (tool === 'eraser') {
      if (eraseRef.current) eraseAt(pt(e));
    } else if (cur) {
      setCur((c) => ({ ...c, points: [...c.points, pt(e)] }));
    }
  }
  function onUp(e) {
    e.stopPropagation();
    if (tool === 'eraser') {
      if (eraseRef.current) onChange({ content: { ...content, strokes: eraseRef.current } }, { commit: true });
      eraseRef.current = null;
    } else if (cur) {
      const next = cur.points.length > 1 ? [...strokes, cur] : strokes;
      setCur(null);
      if (next !== strokes) onChange({ content: { ...content, strokes: next } }, { commit: true });
    }
  }

  const toPoints = (s) => s.points.map((p) => `${p[0]},${p[1]}`).join(' ');

  // 펜: 필압에 따라 굵기가 변하도록 선분 단위로 렌더
  function renderStroke(s, i) {
    if (s.type === 'hl') {
      return (
        <polyline
          key={i}
          points={toPoints(s)}
          fill="none"
          stroke={s.color}
          strokeOpacity={0.35}
          strokeWidth={s.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    if (s.points.length < 2) return null;
    const segs = [];
    for (let j = 1; j < s.points.length; j++) {
      const a = s.points[j - 1];
      const b = s.points[j];
      const p = ((a[2] ?? 0.5) + (b[2] ?? 0.5)) / 2;
      segs.push(
        <line
          key={j}
          x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
          stroke={s.color}
          strokeWidth={s.width * (0.4 + 1.2 * p)}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    return <g key={i}>{segs}</g>;
  }
  const undo = () => onChange({ content: { ...content, strokes: strokes.slice(0, -1) } }, { commit: true });
  const clear = () => onChange({ content: { ...content, strokes: [] } }, { commit: true });
  const setBg = (c) => onChange({ content: { ...content, bg: c } }, { commit: true });
  const setOpacity = (o) =>
    onChange({ content: { ...content, bgOpacity: Math.min(1, Math.max(0, Math.round(o * 100) / 100)) } }, { commit: true });

  const background = bg === 'transparent' ? 'transparent' : hexToRgba(bg, bgOpacity);

  return (
    <div
      className="w-draw"
      style={{ background }}
      onDoubleClick={() => { if (!editMode) onRequestEdit?.(); }}
    >
      {editMode && (
        <div className="draw-tools" onPointerDown={(e) => e.stopPropagation()}>
          <button className={`draw-w ${tool === 'none' ? 'on' : ''}`} title="선택/이동" onClick={() => setTool('none')}>↖</button>
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              className={`draw-swatch ${tool === 'pen' && color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => { setColor(c); setTool('pen'); }}
            />
          ))}
          <button className={`draw-w ${tool === 'pen' && width === 2 ? 'on' : ''}`} title="얇게" onClick={() => { setWidth(2); setTool('pen'); }}>·</button>
          <button className={`draw-w ${tool === 'pen' && width === 5 ? 'on' : ''}`} title="굵게" onClick={() => { setWidth(5); setTool('pen'); }}>●</button>
          <button className={`draw-w ${tool === 'hl' ? 'on' : ''}`} title="형광펜" onClick={() => setTool('hl')}>🖍</button>
          <button className={`draw-w ${tool === 'eraser' ? 'on' : ''}`} title="지우개" onClick={() => setTool('eraser')}>⌫</button>
          <button className="draw-w" title="한 획 취소" onClick={undo}>↺</button>
          <button className="draw-w" title="전체 지우기" onClick={clear}>🗑</button>
          <span className="draw-sep" />
          <span className="draw-label">배경</span>
          {BG_COLORS.map((c) => (
            <button key={c} className={`draw-swatch ${bg === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setBg(c)} />
          ))}
          <button className={`draw-w ${bg === 'transparent' ? 'on' : ''}`} title="투명 배경" onClick={() => setBg('transparent')}>▢</button>
          {bg !== 'transparent' && (
            <span className="draw-opacity">
              <button onClick={() => setOpacity(bgOpacity - 0.1)}>−</button>
              <span
                title="더블클릭하여 입력"
                onDoubleClick={() => {
                  const v = window.prompt('배경 투명도 % 입력', String(Math.round(bgOpacity * 100)));
                  if (v != null && !Number.isNaN(parseFloat(v))) setOpacity(parseFloat(v) / 100);
                }}
              >
                {Math.round(bgOpacity * 100)}%
              </span>
              <button onClick={() => setOpacity(bgOpacity + 0.1)}>＋</button>
            </span>
          )}
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{ cursor: tool === 'eraser' ? 'cell' : tool === 'none' ? 'default' : 'crosshair', pointerEvents: tool === 'none' ? 'none' : 'auto' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        {[...strokes, ...(cur ? [cur] : [])].map(renderStroke)}
      </svg>
    </div>
  );
}
