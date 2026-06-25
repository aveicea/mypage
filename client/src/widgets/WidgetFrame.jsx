import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { MoveIcon, TrashIcon } from './icons.jsx';

// 위젯별 편집 도구를 테두리 바깥(외부 툴바)에 포털로 띄우기 위한 컨텍스트
export const WidgetChromeContext = createContext({ host: null, selected: false, editMode: false });

export const POSTIT_COLORS = ['#fff7c2', '#ffd6e0', '#d6f5d6', '#cfe8ff', '#e7d9ff', '#ffe0c2', '#eceff1', 'transparent'];
export const DRAW_BG = ['#ffffff', '#fff7c2', '#d6f5d6', '#cfe8ff', '#111827'];

/**
 * 위젯 공통 프레임.
 * 편집 모드 + 선택 시: 위쪽 작은 툴바의 "이동 핸들"을 잡아야만 이동(본문 드래그 X),
 *   모서리/변 핸들로 리사이즈, 툴바의 휴지통으로 삭제.
 * 본문 클릭 = 선택. 보기 모드: 이동/리사이즈 불가, 본문 상호작용만.
 */
/** 이동 중 다른 위젯들의 모서리/중심에 맞춰 스냅 + 가이드 좌표 계산 */
function computeSnap(x, y, w, h, others, thr) {
  const selfX = [x, x + w / 2, x + w];
  const selfY = [y, y + h / 2, y + h];
  let bestX = Infinity, dx = 0, gx = null;
  let bestY = Infinity, dy = 0, gy = null;
  for (const o of others) {
    const ox = [o.x, o.x + o.width / 2, o.x + o.width];
    const oy = [o.y, o.y + o.height / 2, o.y + o.height];
    for (const s of selfX) for (const t of ox) {
      const d = Math.abs(t - s);
      if (d < bestX) { bestX = d; dx = t - s; gx = t; }
    }
    for (const s of selfY) for (const t of oy) {
      const d = Math.abs(t - s);
      if (d < bestY) { bestY = d; dy = t - s; gy = t; }
    }
  }
  const hasX = bestX <= thr;
  const hasY = bestY <= thr;
  const guides = [];
  if (hasX) guides.push({ axis: 'x', at: gx });
  if (hasY) guides.push({ axis: 'y', at: gy });
  return { x: hasX ? x + dx : x, y: hasY ? y + dy : y, guides };
}

/** 리사이즈 중 움직이는 모서리를 다른 위젯 모서리/중심에 스냅 */
function snapResize(nx, ny, nw, nh, dir, others, thr) {
  const xt = [];
  const yt = [];
  for (const o of others) {
    xt.push(o.x, o.x + o.width / 2, o.x + o.width);
    yt.push(o.y, o.y + o.height / 2, o.y + o.height);
  }
  const nearest = (val, targets) => {
    let best = thr + 1, at = null;
    for (const t of targets) {
      const dd = Math.abs(t - val);
      if (dd < best) { best = dd; at = t; }
    }
    return best <= thr ? at : null;
  };
  const guides = [];
  if (dir.includes('e')) {
    const at = nearest(nx + nw, xt);
    if (at != null) { nw = at - nx; guides.push({ axis: 'x', at }); }
  }
  if (dir.includes('w')) {
    const at = nearest(nx, xt);
    if (at != null) { nw += nx - at; nx = at; guides.push({ axis: 'x', at }); }
  }
  if (dir.includes('s')) {
    const at = nearest(ny + nh, yt);
    if (at != null) { nh = at - ny; guides.push({ axis: 'y', at }); }
  }
  if (dir.includes('n')) {
    const at = nearest(ny, yt);
    if (at != null) { nh += ny - at; ny = at; guides.push({ axis: 'y', at }); }
  }
  return { nx, ny, nw, nh, guides };
}

export default function WidgetFrame({
  widget,
  zoom,
  editMode,
  interactive,
  selected,
  onSelect,
  onChange,
  onDelete,
  onDragStart,
  onMoveBy,
  others = [],
  setGuides,
  children,
}) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [extHost, setExtHost] = useState(null);
  const hostRef = useCallback((node) => setExtHost(node), []);
  const [paletteOpen, setPaletteOpen] = useState(false); // 색상 팔레트 펼침 여부
  const act = interactive ?? editMode; // 편집 모드이거나, 이 위젯만 임시 편집 활성

  // 선택 해제되면 팔레트 접기
  useEffect(() => {
    if (!selected) setPaletteOpen(false);
  }, [selected]);

  function onPointerDown(e) {
    if (!act) return;
    // 핸들/툴바는 각자 처리
    if (e.target.closest('.widget-resize') || e.target.closest('.widget-toolbar')) return;
    e.stopPropagation(); // 캔버스 패닝 방지
    onSelect?.(widget.id, e);
  }

  function startMove(e) {
    e.stopPropagation();
    if (!selected) onSelect?.(widget.id, e); // 이미 선택돼 있으면 그룹 유지
    onDragStart?.();
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
    onChange({}, { commit: false });
    onDragStart?.();
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
      const snapped = computeSnap(d.ox + dx, d.oy + dy, widget.width, widget.height, others, 6 / zoom);
      setGuides?.(snapped.guides);
      // 잡은 위젯의 시작 위치 기준 델타를 선택된 모든 위젯에 적용
      d.lastDx = snapped.x - d.ox;
      d.lastDy = snapped.y - d.oy;
      onMoveBy?.(d.lastDx, d.lastDy);
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

    // 리사이즈 중 모서리 스냅 가이드
    const r = snapResize(nx, ny, nw, nh, dir, others, 6 / zoom);
    nx = r.nx; ny = r.ny; nw = r.nw; nh = r.nh;
    setGuides?.(r.guides);

    if (nw < MINW) { if (dir.includes('w')) nx -= MINW - nw; nw = MINW; }
    if (nh < MINH) { if (dir.includes('n')) ny -= MINH - nh; nh = MINH; }
    onChange({ x: nx, y: ny, width: nw, height: nh });
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setGuides?.([]);
    if (d && d.moved) {
      if (d.mode === 'move') onMoveBy?.(d.lastDx || 0, d.lastDy || 0, { commit: true });
      else onChange({}, { commit: true });
    }
  }

  const isPostit = widget.type === 'postit';
  const isDraw = widget.type === 'draw';
  const isViewbtn = widget.type === 'viewbtn';
  const isText = widget.type === 'text';
  const collapsed = !!widget.content?.collapsed;

  return (
    <div
      ref={ref}
      className={`widget widget--${widget.type} ${act ? 'edit' : ''} ${selected ? 'selected' : ''}`}
      style={{
        left: widget.x,
        top: widget.y,
        // 뷰 버튼은 내용(글씨)에 맞게 자동 크기
        ...(isViewbtn ? {} : { width: widget.width, height: widget.height }),
        zIndex: widget.zIndex,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {isPostit && (widget.content?.color ?? POSTIT_COLORS[0]) !== 'transparent' && (
        <div
          className="postit-bg"
          style={{ background: widget.content?.color || POSTIT_COLORS[0] }}
        />
      )}
      <div className="widget-body">
        <WidgetChromeContext.Provider value={{ host: extHost, selected, editMode: act }}>
          {children}
        </WidgetChromeContext.Provider>
      </div>

      {isPostit && (
        <div
          className={`fold-btn ${collapsed ? 'on' : ''}`}
          title={collapsed ? '펼치기' : '접기'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onChange({ content: { ...widget.content, collapsed: !collapsed } }, { commit: true });
          }}
        />
      )}

      <div className="widget-ext">
        {act && selected && (
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

            {(isPostit || isDraw) && (() => {
              // 포스트잇은 color, 그림판은 bg 키 사용
              const key = isPostit ? 'color' : 'bg';
              const colors = isPostit ? POSTIT_COLORS : [...DRAW_BG, 'transparent'];
              const cur = widget.content?.[key] ?? colors[0];
              const swatch = (c, extra = '') => (
                <button
                  key={c}
                  className={`wt-swatch${c === 'transparent' ? ' wt-transparent' : ''}${extra}`}
                  title={c === 'transparent' ? '투명' : '색상'}
                  style={c !== 'transparent' ? { background: c } : {}}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!paletteOpen) { setPaletteOpen(true); return; }
                    onChange({ content: { ...widget.content, [key]: c } }, { commit: true });
                    setPaletteOpen(false);
                  }}
                />
              );
              // 접힘: 현재 색 하나만. 펼침: 전체 색.
              const items = paletteOpen
                ? colors.map((c) => swatch(c, c === cur ? ' wt-cur' : ''))
                : swatch(cur, ' wt-cur');
              // 삭제 버튼과 간격을 두고 오른쪽으로 분리
              return <span className="wt-swatches">{items}</span>;
            })()}

          </div>
        )}
        {/* 위젯별 도구(임베드 %, 그림 도구 등)가 포털로 들어오는 자리 — 항상 존재 */}
        <span className="wt-ext" ref={hostRef} />
      </div>

      {act && selected && !isViewbtn &&
        ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => (
          <div
            key={dir}
            className={`widget-resize r-${dir}`}
            onPointerDown={(e) => startResize(e, dir)}
          />
        ))}
    </div>
  );
}
