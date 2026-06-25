import { useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WidgetChromeContext } from './WidgetFrame.jsx';

const PEN_COLORS = ['#111827', '#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#ffffff'];
const PEN_WIDTHS = [1, 2, 4];
const HL_WIDTHS = [10, 16, 24];

function hexToRgba(hex, a) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 자유롭게 그리는 그림 위젯. 좌표는 0~1 정규화 → 위젯 크기 바꿔도 같이 스케일. */
export default function DrawWidget({ widget, editMode, onRequestEdit, onChange }) {
  const { host, selected } = useContext(WidgetChromeContext);
  const content = widget.content || {};
  const strokes = content.strokes || [];
  const bg = content.bg ?? '#ffffff';
  const bgOpacity = content.bgOpacity ?? 1;

  const svgRef = useRef(null);
  const eraseRef = useRef(null);
  const [cur, setCur] = useState(null);
  const [tool, setTool] = useState('none'); // none | pen | hl | eraser
  const [popup, setPopup] = useState(null); // null | 'pen' | 'hl'
  const [drawing, setDrawing] = useState(false); // 보기 모드에서 더블클릭으로 켜는 그리기 세션
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penWidth, setPenWidth] = useState(1);
  const [hlColor, setHlColor] = useState('#f59e0b');
  const [hlWidth, setHlWidth] = useState(16);

  function pt(e) {
    const r = svgRef.current.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      e.pressure > 0 ? e.pressure : 0.5,
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
    const session = (editMode && selected) || drawing;
    if (!session || tool === 'none') return;
    e.stopPropagation();
    e.preventDefault(); // 아래 위젯의 텍스트가 선택되지 않게
    svgRef.current.setPointerCapture(e.pointerId);
    if (tool === 'eraser') {
      eraseRef.current = [...strokes];
      eraseAt(pt(e));
    } else if (tool === 'hl') {
      setCur({ type: 'hl', color: hlColor, width: hlWidth, points: [pt(e)] });
    } else {
      setCur({ type: 'pen', color: penColor, width: penWidth, points: [pt(e)] });
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
  const undo = () => onChange({ content: { ...content, strokes: strokes.slice(0, -1) } }, { commit: true });
  const clear = () => onChange({ content: { ...content, strokes: [] } }, { commit: true });

  function pick(t) {
    setTool(t);
    setPopup((p) => (t === 'pen' || t === 'hl' ? (p === t ? null : t) : null));
  }

  function renderStroke(s, i) {
    if (s.type === 'hl') {
      return (
        <polyline key={i} points={toPoints(s)} fill="none" stroke={s.color} strokeOpacity={0.35}
          strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      );
    }
    if (s.points.length < 2) return null;
    const segs = [];
    for (let j = 1; j < s.points.length; j++) {
      const a = s.points[j - 1];
      const b = s.points[j];
      const p = ((a[2] ?? 0.5) + (b[2] ?? 0.5)) / 2;
      segs.push(
        <line key={j} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={s.color}
          strokeWidth={s.width * (0.4 + 1.2 * p)} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      );
    }
    return <g key={i}>{segs}</g>;
  }

  const background = bg === 'transparent' ? 'transparent' : hexToRgba(bg, bgOpacity);
  const popupColors = PEN_COLORS;
  const popupWidths = popup === 'hl' ? HL_WIDTHS : PEN_WIDTHS;
  const popupColor = popup === 'hl' ? hlColor : penColor;
  const popupWidth = popup === 'hl' ? hlWidth : penWidth;
  const setPopupColor = popup === 'hl' ? setHlColor : setPenColor;
  const setPopupWidth = popup === 'hl' ? setHlWidth : setPenWidth;

  const inEdit = editMode && selected;
  const session = inEdit || drawing;
  const active = session ? tool : 'none';

  function startSession() {
    setDrawing(true);
    if (tool === 'none') setTool('pen');
  }
  function endSession() {
    setDrawing(false);
    setPopup(null);
  }

  const bar = (
    <div className="draw-bar" onPointerDown={(e) => e.stopPropagation()}>
      {/* 색/굵기 선택 팝업을 도구 버튼보다 위에 */}
      {popup && (
        <div className="draw-popup">
          {popupColors.map((c) => (
            <button key={c} className={`draw-swatch ${popupColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setPopupColor(c)} />
          ))}
          <span className="draw-sep" />
          {popupWidths.map((w) => (
            <button key={w} className={`draw-wsel ${popupWidth === w ? 'on' : ''}`} onClick={() => setPopupWidth(w)}>
              <span style={{ width: Math.min(18, w), height: Math.min(18, w) }} />
            </button>
          ))}
        </div>
      )}
      <div className="draw-tools">
        {inEdit && (
          <button className={`draw-w ${tool === 'none' ? 'on' : ''}`} title="선택/이동" onClick={() => pick('none')}>↖</button>
        )}
        <button className={`draw-w ${tool === 'pen' ? 'on' : ''}`} title="펜" onClick={() => pick('pen')}>✏️</button>
        <button className={`draw-w ${tool === 'hl' ? 'on' : ''}`} title="형광펜" onClick={() => pick('hl')}>🖍</button>
        <button className={`draw-w ${tool === 'eraser' ? 'on' : ''}`} title="지우개" onClick={() => pick('eraser')}>🧹</button>
        <button className="draw-w" title="뒤로가기" onClick={undo}>↺</button>
        <button className="draw-w" title="전체 지우기" onClick={clear}>🗑</button>
        {drawing && !inEdit && (
          <button className="draw-w draw-done" title="완료" onClick={endSession}>✓</button>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="w-draw"
      style={{ background }}
      onDoubleClick={() => { if (!inEdit) startSession(); }}
      onPointerDown={(e) => { if (session && tool !== 'none') e.stopPropagation(); }}
    >
      {(inEdit || drawing) && host && createPortal(bar, host)}
      <svg
        ref={svgRef}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{ cursor: active === 'eraser' ? 'cell' : active === 'none' ? 'default' : 'crosshair', pointerEvents: session ? 'auto' : 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        {[...strokes, ...(cur ? [cur] : [])].map(renderStroke)}
      </svg>
    </div>
  );
}
