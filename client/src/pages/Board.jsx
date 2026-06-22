import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { resolveConfig, getDeviceId, loadHomeRect, saveHomeRect, loadViews, saveViews } from '../config.js';
import { createApi } from '../api.js';
import { useViewport } from '../canvas/useViewport.js';
import { useWidgetSync } from '../hooks/useWidgetSync.js';
import Canvas from '../canvas/Canvas.jsx';
import WidgetFrame from '../widgets/WidgetFrame.jsx';
import TextWidget from '../widgets/TextWidget.jsx';
import ImageWidget from '../widgets/ImageWidget.jsx';
import LinkWidget from '../widgets/LinkWidget.jsx';
import EmbedWidget from '../widgets/EmbedWidget.jsx';
import GithubWidget from '../widgets/GithubWidget.jsx';
import DrawWidget from '../widgets/DrawWidget.jsx';
import ViewButtonWidget from '../widgets/ViewButtonWidget.jsx';
import {
  PencilIcon, LockClosedIcon, LockOpenIcon, GearIcon,
  PlusIcon, MinusIcon, ResetIcon, LayersIcon,
} from '../widgets/icons.jsx';

const TYPE_LABEL = {
  text: '텍스트', postit: '포스트잇', image: '이미지', link: '링크',
  embed: '임베드', github: '깃허브', draw: '그림', viewbtn: '뷰 버튼',
};
function widgetLabel(w) {
  const t = TYPE_LABEL[w.type] || w.type;
  const txt = String(w.content?.text || w.content?.name || w.content?.url || '').replace(/\n/g, ' ').trim();
  return txt ? `${t}: ${txt.slice(0, 16)}` : t;
}

const DEFAULTS = {
  text: { width: 220, height: 120, content: { text: '' } },
  postit: { width: 200, height: 200, content: { text: '' } },
  image: { width: 280, height: 200, content: { src: '' } },
  link: { width: 280, height: 220, content: { url: '' } },
  embed: { width: 360, height: 240, content: { url: '' } },
  github: { width: 320, height: 200, content: { url: '' } },
  draw: { width: 300, height: 220, content: { strokes: [] } },
  viewbtn: { width: 96, height: 34, content: { name: '뷰' } },
};

const ADD_TYPES = [
  ['text', '텍스트'],
  ['postit', '포스트잇'],
  ['image', '이미지'],
  ['link', '링크 카드'],
  ['embed', '임베드'],
  ['github', '깃허브 카드'],
  ['draw', '그림'],
  ['viewbtn', '뷰 버튼'],
];

export default function Board() {
  const navigate = useNavigate();
  const config = useMemo(() => resolveConfig(), []);

  if (!config) {
    navigate('/setup', { replace: true });
    return null;
  }

  const api = useMemo(() => createApi(config), [config]);
  const deviceId = useMemo(() => getDeviceId(), []);
  const viewport = useViewport();
  const { widgets, status, error, updateWidget, addWidget, removeWidget } = useWidgetSync(api, deviceId);

  const [editMode, setEditMode] = useState(false); // ✏️ 항상 보기 모드로 시작
  const [locked, setLocked] = useState(true); // 🔒 기본은 화면 완전 고정
  const [selectedIds, setSelectedIds] = useState([]); // 다중 선택
  const setSelectedId = (id) => setSelectedIds(id == null ? [] : [id]);
  const selectedId = selectedIds[0] ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const movePositions = useRef(null); // 그룹 이동 시작 위치 스냅샷
  const [guides, setGuides] = useState([]); // 이동 시 정렬 가이드
  const [homeRect, setHomeRect] = useState(
    () => loadHomeRect(config.databaseId) || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
  );
  const homeRef = useRef(homeRect);
  homeRef.current = homeRect;
  const [views, setViews] = useState(() => loadViews(config.databaseId));
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const [activeView, setActiveView] = useState(null); // 칩으로 띄운 편집용 뷰 프레임
  const [autoEditId, setAutoEditId] = useState(null); // 추가 직후 자동 편집할 위젯
  const [activeWidgetId, setActiveWidgetId] = useState(null); // 기본 모드에서 임시 편집 활성 위젯
  const [orderPanel, setOrderPanel] = useState(false); // 위젯 순서 사이드바
  const dragOrderId = useRef(null);

  function reorderTo(srcId, dstId) {
    if (!srcId || !dstId || srcId === dstId) return;
    const sorted = [...widgets].sort((x, y) => (y.zIndex || 1) - (x.zIndex || 1));
    const from = sorted.findIndex((w) => w.id === srcId);
    const to = sorted.findIndex((w) => w.id === dstId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = sorted.splice(from, 1);
    sorted.splice(to, 0, moved);
    sorted.forEach((w, idx) => {
      const z = sorted.length - idx;
      if ((w.zIndex || 1) !== z) updateWidget(w.id, { zIndex: z }, { commit: true });
    });
  }

  function swapOrder(a, b) {
    if (!b) return;
    const sorted = [...widgets].sort((x, y) => (y.zIndex || 1) - (x.zIndex || 1));
    const ia = sorted.findIndex((w) => w.id === a.id);
    const ib = sorted.findIndex((w) => w.id === b.id);
    [sorted[ia], sorted[ib]] = [sorted[ib], sorted[ia]];
    sorted.forEach((w, idx) => {
      const z = sorted.length - idx;
      if ((w.zIndex || 1) !== z) updateWidget(w.id, { zIndex: z }, { commit: true });
    });
  }
  const undoStack = useRef([]); // 되돌리기 (추가/삭제/이동/리사이즈)
  const pushUndo = (entry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > 50) undoStack.current.shift();
  };

  function captureRect() {
    const z = viewport.zoom;
    return {
      x: -viewport.pan.x / z,
      y: -viewport.pan.y / z,
      width: window.innerWidth / z,
      height: window.innerHeight / z,
    };
  }
  function addView() {
    const name = window.prompt('뷰 이름', '뷰 ' + (views.length + 1));
    if (name == null) return;
    const next = [...views, { id: 'v' + Date.now(), name: name || '뷰 ' + (views.length + 1), rect: captureRect() }];
    setViews(next);
    saveViews(config.databaseId, next);
  }
  function removeView(id) {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    saveViews(config.databaseId, next);
  }

  // 홈 프레임: 이동하면 그 위치를 기준으로 모든 위젯 재배치(프레임은 원점 유지),
  // 리사이즈(비율 고정)는 보이는 영역(줌)만 변경
  function handleHomeCommit(mode) {
    const r = homeRef.current;
    if (mode === 'move' && (Math.abs(r.x) > 0.5 || Math.abs(r.y) > 0.5)) {
      widgets.forEach((w) => updateWidget(w.id, { x: w.x - r.x, y: w.y - r.y }, { commit: true }));
      const reset = { x: 0, y: 0, width: r.width, height: r.height };
      setHomeRect(reset);
      saveHomeRect(config.databaseId, reset);
    } else {
      saveHomeRect(config.databaseId, r);
    }
  }

  // 삭제(되돌리기 가능)
  function boardRemove(id) {
    const w = widgets.find((x) => x.id === id);
    if (w) pushUndo({ kind: 'delete', widget: { ...w } });
    removeWidget(id);
    if (selectedId === id) setSelectedId(null);
  }

  function doUndo() {
    const e = undoStack.current.pop();
    if (!e) return;
    if (e.kind === 'geom') {
      updateWidget(e.id, { x: e.x, y: e.y, width: e.width, height: e.height }, { commit: true });
    } else if (e.kind === 'add') {
      removeWidget(e.id);
    } else if (e.kind === 'delete') {
      addWidget(e.widget);
    }
  }

  // 첫 로드 시 홈 영역으로 맞춤 (한 번만)
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current) return;
    didFit.current = true;
    viewport.fitTo(homeRef.current);
  }, [viewport]);

  // 패닝: 편집 모드이거나 잠금 해제 보기. 확대: 편집 + 잠금 해제일 때만.
  const panEnabled = editMode || !locked;
  const zoomEnabled = editMode && !locked;
  const maxZ = widgets.reduce((m, w) => Math.max(m, w.zIndex || 1), 1);
  const minZ = widgets.reduce((m, w) => Math.min(m, w.zIndex || 1), 1);

  // 단축키
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
      if (e.key === 'Escape') {
        setSelectedId(null);
        setMenuOpen(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        doUndo();
        return;
      }
      if (typing) return;
      if (editMode && selectedIds.length && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        selectedIds.forEach((id) => boardRemove(id));
        setSelectedIds([]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, selectedIds, widgets]);

  function selectWidget(id, e) {
    const additive = e && (e.metaKey || e.ctrlKey || e.shiftKey);
    if (additive) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelectedIds([id]);
    }
  }

  // 드래그 시작: 선택된 위젯들(또는 그 위젯)의 시작 위치 스냅샷 + 되돌리기 체크포인트
  function startGroupDrag(w) {
    const ids = selectedIds.includes(w.id) ? selectedIds : [w.id];
    const m = new Map();
    ids.forEach((id) => {
      const ww = widgets.find((x) => x.id === id);
      if (ww) {
        m.set(id, { x: ww.x, y: ww.y });
        pushUndo({ kind: 'geom', id, x: ww.x, y: ww.y, width: ww.width, height: ww.height });
      }
    });
    movePositions.current = m;
  }

  // 그룹 이동: 시작 위치 기준으로 모두 dx,dy 이동
  function moveSelectedBy(dx, dy, opts) {
    const m = movePositions.current;
    if (!m) return;
    m.forEach((pos, id) => updateWidget(id, { x: pos.x + dx, y: pos.y + dy }, opts));
  }

  // 마퀴(드래그 박스) 선택
  function marqueeSelect(rect, additive) {
    const hit = widgets
      .filter((w) =>
        rect.x < w.x + w.width && rect.x + rect.width > w.x &&
        rect.y < w.y + w.height && rect.y + rect.height > w.y)
      .map((w) => w.id);
    setSelectedIds((prev) => (additive ? Array.from(new Set([...prev, ...hit])) : hit));
  }

  async function handleAdd(type, world) {
    const def = DEFAULTS[type] || DEFAULTS.text;
    const pos = world || viewport.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    // 뷰 버튼은 생성 시 현재 화면을 가리키도록 저장
    const content = type === 'viewbtn' ? { name: '뷰', rect: captureRect() } : def.content;
    const widget = {
      type,
      name: `${type}-${Date.now()}`,
      x: Math.round(pos.x - def.width / 2),
      y: Math.round(pos.y - def.height / 2),
      width: def.width,
      height: def.height,
      zIndex: maxZ + 1,
      content,
    };
    const created = await addWidget(widget);
    if (created) {
      setSelectedId(created.id);
      pushUndo({ kind: 'add', id: created.id });
    }
    setMenuOpen(false);
    return created;
  }

  function renderWidgetContent(w) {
    const common = {
      widget: w,
      editMode,
      api,
      deviceId,
      onRequestEdit: () => {
        setEditMode(true);
        setLocked(false);
        setSelectedId(w.id);
      },
      onJumpTo: (rect) => viewport.fitTo(rect),
      getCurrentRect: captureRect,
      savedViews: views,
      autoEdit: autoEditId === w.id,
      onAutoEdited: () => setAutoEditId(null),
      onAutoEmpty: () => { boardRemove(w.id); setActiveWidgetId(null); },
      onChange: (patch, opts) => updateWidget(w.id, patch, opts),
    };
    switch (w.type) {
      case 'image': return <ImageWidget {...common} />;
      case 'link': return <LinkWidget {...common} />;
      case 'embed': return <EmbedWidget {...common} />;
      case 'github': return <GithubWidget {...common} />;
      case 'draw': return <DrawWidget {...common} />;
      case 'viewbtn': return <ViewButtonWidget {...common} />;
      case 'postit':
      case 'text':
      default: return <TextWidget {...common} />;
    }
  }

  return (
    <>
      <Canvas
        viewport={viewport}
        editMode={editMode}
        panEnabled={panEnabled}
        zoomEnabled={zoomEnabled}
        homeRect={homeRect}
        onHomeChange={setHomeRect}
        onHomeCommit={handleHomeCommit}
        viewFrame={editMode && activeView ? (views.find((v) => v.id === activeView)?.rect || null) : null}
        onViewFrameChange={(rect) => setViews((vs) => vs.map((v) => (v.id === activeView ? { ...v, rect } : v)))}
        onViewFrameCommit={() => saveViews(config.databaseId, viewsRef.current)}
        onAddAt={handleAdd}
        onQuickAdd={async (world) => {
          const w = await handleAdd('text', world);
          if (w) {
            setAutoEditId(w.id); // 그 위젯만 편집 시작 (편집모드 전환 X)
            setActiveWidgetId(w.id); // 그 위젯만 이동/크기조절 가능
            setSelectedId(w.id);
          }
        }}
        onMarquee={marqueeSelect}
        onBackgroundClick={() => { setSelectedIds([]); setActiveWidgetId(null); }}
      >
        {widgets.map((w) => (
          <WidgetFrame
            key={w.id}
            widget={w}
            zoom={viewport.zoom}
            editMode={editMode}
            interactive={editMode || activeWidgetId === w.id}
            selected={(editMode && selectedIds.includes(w.id)) || activeWidgetId === w.id}
            onSelect={selectWidget}
            onChange={(patch, opts) => updateWidget(w.id, patch, opts)}
            onDragStart={() => startGroupDrag(w)}
            onMoveBy={moveSelectedBy}
            onDelete={(id) => boardRemove(id)}
            others={editMode ? widgets.filter((x) => !selectedIds.includes(x.id)) : []}
            setGuides={setGuides}
          >
            {renderWidgetContent(w)}
          </WidgetFrame>
        ))}

        {guides.map((g, i) =>
          g.axis === 'x' ? (
            <div key={`g${i}`} className="snap-guide-v" style={{ left: g.at }} />
          ) : (
            <div key={`g${i}`} className="snap-guide-h" style={{ top: g.at }} />
          )
        )}
      </Canvas>

      {/* 좌상단: 위젯 추가 (편집 모드에서만) */}
      {editMode && (
        <div className="toolbar">
          <div className="dropdown">
            <button className="icon-btn" title="위젯 추가" onClick={() => setMenuOpen((v) => !v)}>
              <PlusIcon />
            </button>
            {menuOpen && (
              <div className="dropdown-menu">
                {ADD_TYPES.map(([type, label]) => (
                  <button key={type} onClick={() => handleAdd(type)}>{label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 우하단: 줌 컨트롤 (편집 + 잠금 해제일 때만) */}
      {zoomEnabled && (
        <div className="zoom-controls">
          <button className="icon-btn" title="축소" onClick={() => viewport.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.1)}>
            <MinusIcon />
          </button>
          <span className="zoom-pct">{Math.round(viewport.zoom * 100)}%</span>
          <button className="icon-btn" title="확대" onClick={() => viewport.zoomAt(innerWidth / 2, innerHeight / 2, 1.1)}>
            <PlusIcon />
          </button>
          <button className="icon-btn" title="리셋" onClick={() => viewport.fitTo(homeRect)}>
            <ResetIcon />
          </button>
        </div>
      )}

      {/* 줌 위: 위젯 순서 사이드바 토글 */}
      {editMode && (
        <button
          className={`order-toggle icon-btn ${orderPanel ? 'active' : ''}`}
          title="위젯 순서"
          onClick={() => setOrderPanel((v) => !v)}
        >
          <LayersIcon />
        </button>
      )}

      {/* 위젯 순서 사이드바 */}
      {editMode && orderPanel && (
        <div className="order-panel">
          <div className="order-title">위젯 순서 (위 = 앞)</div>
          <div className="order-list">
            {[...widgets].sort((a, b) => (b.zIndex || 1) - (a.zIndex || 1)).map((w, i, arr) => (
              <div
                key={w.id}
                className={`order-row ${selectedIds.includes(w.id) ? 'sel' : ''}`}
                draggable
                onDragStart={() => { dragOrderId.current = w.id; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { reorderTo(dragOrderId.current, w.id); dragOrderId.current = null; }}
                onClick={() => setSelectedId(w.id)}
              >
                <span className="order-grip" title="드래그하여 순서 변경">⠿</span>
                <span className="order-name">{widgetLabel(w)}</span>
                <button
                  disabled={i === 0}
                  title="앞으로"
                  onClick={(e) => { e.stopPropagation(); swapOrder(w, arr[i - 1]); }}
                >▲</button>
                <button
                  disabled={i === arr.length - 1}
                  title="뒤로"
                  onClick={(e) => { e.stopPropagation(); swapOrder(w, arr[i + 1]); }}
                >▼</button>
              </div>
            ))}
            {widgets.length === 0 && <div className="order-empty">위젯 없음</div>}
          </div>
        </div>
      )}

      {/* 상단 중앙: 저장된 뷰(북마크) */}
      {(views.length > 0 || editMode) && (
        <div className="views-bar">
          {views.map((v) => (
            <span key={v.id} className={`view-chip ${activeView === v.id ? 'active' : ''}`}>
              <button
                className="view-go"
                title={editMode ? '클릭: 영역 표시/이동' : v.name}
                onClick={() => {
                  if (editMode) setActiveView((cur) => (cur === v.id ? null : v.id));
                  else viewport.fitTo(v.rect);
                }}
              >
                {v.name}
              </button>
              {editMode && (
                <button
                  className="view-del"
                  title="삭제"
                  onClick={() => {
                    removeView(v.id);
                    if (activeView === v.id) setActiveView(null);
                  }}
                >×</button>
              )}
            </span>
          ))}
          {editMode && (
            <button className="view-add" title="현재 화면을 뷰로 저장" onClick={addView}>+ 뷰 저장</button>
          )}
        </div>
      )}

      {/* 우상단: API 설정 (편집 모드에서만) */}
      {editMode && (
        <div className="top-right">
          <button className="icon-btn" title="API 설정" onClick={() => navigate('/setup')}>
            <GearIcon />
          </button>
        </div>
      )}

      {/* 좌하단: 편집 / (줄바꿈) 잠금 · 리셋 */}
      <div className="bottom-left">
        <button
          className={`icon-btn ${editMode ? 'active' : ''}`}
          title={editMode ? '편집 종료' : '편집 모드'}
          onClick={() => {
            const entering = !editMode;
            setEditMode(entering);
            if (entering) setLocked(false); // 편집 진입 시 자물쇠 자동 해제
            setSelectedId(null);
            setMenuOpen(false);
            setActiveView(null);
          }}
        >
          <PencilIcon />
        </button>
        <div className="bl-row">
          <button
            className="icon-btn"
            title={locked ? '잠금됨 (탭하여 스크롤 허용)' : '스크롤 허용됨 (탭하여 고정)'}
            onClick={() => setLocked((v) => !v)}
          >
            {locked ? <LockClosedIcon /> : <LockOpenIcon />}
          </button>
          {!editMode && !locked && (
            <button className="icon-btn" title="처음 화면으로" onClick={() => viewport.fitTo(homeRect)}>
              <ResetIcon />
            </button>
          )}
        </div>
      </div>

      {status === 'loading' && <div className="toast">Notion 에서 불러오는 중…</div>}
      {status === 'error' && (
        <div className="toast toast-error">
          오류: {error} <button className="icon-btn" onClick={() => navigate('/setup')}><GearIcon /></button>
        </div>
      )}
    </>
  );
}
