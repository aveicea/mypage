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
  PlusIcon, MinusIcon, ResetIcon,
} from '../widgets/icons.jsx';

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
  const [selectedId, setSelectedId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
      if (typing) return;
      if (editMode && selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        removeWidget(selectedId);
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, selectedId, removeWidget]);

  function selectWidget(id) {
    setSelectedId(id);
    const w = widgets.find((x) => x.id === id);
    if (w && w.zIndex < maxZ) updateWidget(id, { zIndex: maxZ + 1 }, { commit: true });
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
    if (created) setSelectedId(created.id);
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
        onHomeCommit={() => saveHomeRect(config.databaseId, homeRef.current)}
        viewFrame={editMode && activeView ? (views.find((v) => v.id === activeView)?.rect || null) : null}
        onViewFrameChange={(rect) => setViews((vs) => vs.map((v) => (v.id === activeView ? { ...v, rect } : v)))}
        onViewFrameCommit={() => saveViews(config.databaseId, viewsRef.current)}
        onAddAt={handleAdd}
        onQuickAdd={async (world) => {
          const w = await handleAdd('text', world);
          if (w) setAutoEditId(w.id); // 편집모드 전환 없이 그 위젯만 편집 시작
        }}
        onBackgroundClick={() => setSelectedId(null)}
      >
        {widgets.map((w) => (
          <WidgetFrame
            key={w.id}
            widget={w}
            zoom={viewport.zoom}
            editMode={editMode}
            selected={editMode && selectedId === w.id}
            onSelect={selectWidget}
            onChange={(patch, opts) => updateWidget(w.id, patch, opts)}
            onDelete={(id) => {
              removeWidget(id);
              if (selectedId === id) setSelectedId(null);
            }}
            others={editMode ? widgets.filter((x) => x.id !== w.id) : []}
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
