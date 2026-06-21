import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { resolveConfig } from '../config.js';
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
};

const ADD_TYPES = [
  ['text', '텍스트'],
  ['postit', '포스트잇'],
  ['image', '이미지'],
  ['link', '링크 카드'],
  ['embed', '임베드'],
  ['github', '깃허브 카드'],
];

export default function Board() {
  const navigate = useNavigate();
  const config = useMemo(() => resolveConfig(), []);

  if (!config) {
    navigate('/setup', { replace: true });
    return null;
  }

  const api = useMemo(() => createApi(config), [config]);
  const viewport = useViewport();
  const { widgets, status, error, updateWidget, addWidget, removeWidget } = useWidgetSync(api);

  const [editMode, setEditMode] = useState(false); // ✏️ 항상 보기 모드로 시작
  const [locked, setLocked] = useState(true); // 🔒 기본은 화면 완전 고정
  const [selectedId, setSelectedId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guides, setGuides] = useState([]); // 이동 시 정렬 가이드

  // 패닝 가능 조건: 편집 모드이거나, 보기 모드에서 잠금 해제일 때
  const panEnabled = editMode || !locked;
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
    const widget = {
      type,
      name: `${type}-${Date.now()}`,
      x: Math.round(pos.x - def.width / 2),
      y: Math.round(pos.y - def.height / 2),
      width: def.width,
      height: def.height,
      zIndex: maxZ + 1,
      content: def.content,
    };
    const created = await addWidget(widget);
    if (created) setSelectedId(created.id);
    setMenuOpen(false);
  }

  function renderWidgetContent(w) {
    const common = { widget: w, editMode, api, onChange: (patch, opts) => updateWidget(w.id, patch, opts) };
    switch (w.type) {
      case 'image': return <ImageWidget {...common} />;
      case 'link': return <LinkWidget {...common} />;
      case 'embed': return <EmbedWidget {...common} />;
      case 'github': return <GithubWidget {...common} />;
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
        onAddAt={handleAdd}
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

      {/* 우하단: 줌 컨트롤 (편집 모드에서만) */}
      {editMode && (
        <div className="zoom-controls">
          <button className="icon-btn" title="축소" onClick={() => viewport.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.1)}>
            <MinusIcon />
          </button>
          <span className="zoom-pct">{Math.round(viewport.zoom * 100)}%</span>
          <button className="icon-btn" title="확대" onClick={() => viewport.zoomAt(innerWidth / 2, innerHeight / 2, 1.1)}>
            <PlusIcon />
          </button>
          <button className="icon-btn" title="리셋" onClick={viewport.reset}>
            <ResetIcon />
          </button>
        </div>
      )}

      {/* 좌하단: 잠금 / 설정 / 편집 토글 */}
      <div className="bottom-left">
        {!editMode && (
          <button
            className="icon-btn"
            title={locked ? '잠금됨 (탭하여 스크롤 허용)' : '스크롤 허용됨 (탭하여 고정)'}
            onClick={() => setLocked((v) => !v)}
          >
            {locked ? <LockClosedIcon /> : <LockOpenIcon />}
          </button>
        )}
        {editMode && (
          <button className="icon-btn" title="API 설정" onClick={() => navigate('/setup')}>
            <GearIcon />
          </button>
        )}
        <button
          className={`icon-btn ${editMode ? 'active' : ''}`}
          title={editMode ? '편집 종료' : '편집 모드'}
          onClick={() => {
            setEditMode((v) => !v);
            setSelectedId(null);
            setMenuOpen(false);
          }}
        >
          <PencilIcon />
        </button>
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
