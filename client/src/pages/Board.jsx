import { useMemo, useState } from 'react';
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

const DEFAULTS = {
  text: { width: 240, height: 160, content: { text: '' } },
  image: { width: 280, height: 200, content: { src: '' } },
  link: { width: 280, height: 220, content: { url: '' } },
  embed: { width: 360, height: 240, content: { url: '' } },
  github: { width: 320, height: 200, content: { url: '' } },
};

export default function Board() {
  const navigate = useNavigate();
  const config = useMemo(() => resolveConfig(), []);

  // 설정이 없으면 /setup 으로
  if (!config) {
    navigate('/setup', { replace: true });
    return null;
  }

  const api = useMemo(() => createApi(config), [config]);
  const viewport = useViewport();
  const { widgets, status, error, updateWidget, addWidget, removeWidget } = useWidgetSync(api);

  const [editMode, setEditMode] = useState(false); // 항상 보기 모드로 시작
  const [selectedId, setSelectedId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const maxZ = widgets.reduce((m, w) => Math.max(m, w.zIndex || 1), 1);

  function bringToFront(id) {
    setSelectedId(id);
    const w = widgets.find((x) => x.id === id);
    if (w && w.zIndex < maxZ) updateWidget(id, { zIndex: maxZ + 1 }, { commit: true });
  }

  async function handleAdd(type, world) {
    const def = DEFAULTS[type] || DEFAULTS.text;
    // 좌표가 없으면 현재 화면 중앙 근처에 배치
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
      case 'text':
      default: return <TextWidget {...common} />;
    }
  }

  const addTypes = [
    ['text', '텍스트/메모'],
    ['image', '이미지'],
    ['link', '링크 카드'],
    ['embed', '임베드'],
    ['github', '깃허브 카드'],
  ];

  return (
    <>
      <Canvas
        viewport={viewport}
        editMode={editMode}
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
            onSelect={bringToFront}
            onChange={(patch, opts) => updateWidget(w.id, patch, opts)}
            onDelete={(id) => {
              removeWidget(id);
              if (selectedId === id) setSelectedId(null);
            }}
          >
            {renderWidgetContent(w)}
          </WidgetFrame>
        ))}
      </Canvas>

      {/* 좌상단: 위젯 추가 (편집 모드에서만) */}
      {editMode && (
        <div className="toolbar">
          <div className="dropdown">
            <button className="btn accent" onClick={() => setMenuOpen((v) => !v)}>
              + 위젯 추가
            </button>
            {menuOpen && (
              <div className="dropdown-menu">
                {addTypes.map(([type, label]) => (
                  <button key={type} onClick={() => handleAdd(type)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 좌하단: 줌 컨트롤 */}
      <div className="zoom-controls">
        <button onClick={() => viewport.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.1)}>−</button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button onClick={() => viewport.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.1)}>＋</button>
        <button onClick={viewport.reset} title="리셋">⟳</button>
      </div>

      {/* 우하단: 편집 모드 토글 + API 설정 */}
      <div className="bottom-right">
        {editMode && (
          <button className="btn" onClick={() => navigate('/setup')}>API 설정</button>
        )}
        <button
          className={`btn ${editMode ? 'accent' : ''}`}
          onClick={() => {
            setEditMode((v) => !v);
            setSelectedId(null);
            setMenuOpen(false);
          }}
        >
          {editMode ? '편집 모드 ✓' : '편집 모드'}
        </button>
      </div>

      {/* 상태 표시 */}
      {status === 'loading' && (
        <div className="zoom-controls" style={{ bottom: 'auto', top: 16, left: '50%', transform: 'translateX(-50%)' }}>
          Notion 에서 불러오는 중…
        </div>
      )}
      {status === 'error' && (
        <div
          className="zoom-controls"
          style={{ bottom: 'auto', top: 16, left: '50%', transform: 'translateX(-50%)', color: 'var(--danger)' }}
        >
          오류: {error} <button onClick={() => navigate('/setup')}>설정</button>
        </div>
      )}
    </>
  );
}
