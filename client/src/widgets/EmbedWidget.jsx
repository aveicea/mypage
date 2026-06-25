import { useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WidgetChromeContext } from './WidgetFrame.jsx';

/** iframe 임베드 위젯. 유튜브 등은 임베드용 URL 로 변환. */
function toEmbedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith('/embed/')) return raw;
    }
    return raw;
  } catch {
    return raw;
  }
}

const clampZoom = (z) => Math.min(3, Math.max(0.25, Math.round(z * 100) / 100));

const HOVER_DELAY = 1000; // 1초 후 iframe 스크롤 활성화

export default function EmbedWidget({ widget, editMode, deviceId, onChange }) {
  const { host, selected, editMode: ctxEdit } = useContext(WidgetChromeContext);
  const content = widget.content || {};
  const url = content.url || '';
  const [iframeActive, setIframeActive] = useState(false);
  const hoverTimer = useRef(null);
  // 확대 배율은 기기별로 저장 (없으면 공통 zoom, 그래도 없으면 1)
  const zoom = content.zooms?.[deviceId] ?? content.zoom ?? 1;

  function setUrl() {
    const next = window.prompt('임베드할 URL 입력 (YouTube, Notion 등)', url);
    if (next != null) onChange({ content: { ...content, url: next } }, { commit: true });
  }
  function setZoom(z) {
    onChange(
      { content: { ...content, zooms: { ...content.zooms, [deviceId]: clampZoom(z) } } },
      { commit: true }
    );
  }

  if (!url) {
    return (
      <div className="w-placeholder">
        {editMode ? <button className="btn" onClick={setUrl}>URL 입력</button> : '임베드 없음'}
      </div>
    );
  }

  const tools = (
    <div
      className="embed-tools"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button onClick={() => setZoom(zoom - 0.1)}>−</button>
      <span
        title="더블클릭하여 직접 입력"
        onDoubleClick={() => {
          const v = window.prompt('확대 % 입력', String(Math.round(zoom * 100)));
          if (v != null && !Number.isNaN(parseFloat(v))) setZoom(parseFloat(v) / 100);
        }}
      >
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={() => setZoom(zoom + 0.1)}>＋</button>
      <button title="URL 변경" onClick={setUrl}>URL</button>
    </div>
  );

  // 위젯을 항상 꽉 채우면서 내용만 확대/축소:
  // iframe 을 (100/zoom)% 로 깔고 transform: scale(zoom) → 어떤 배율이든 컨테이너를 채움.
  // (축소하면 더 많은 내용이 보이고, 확대하면 내용이 커짐 — 빈 공간 안 생김)
  const iframeStyle =
    zoom !== 1
      ? {
          width: `${100 / zoom}%`,
          height: `${100 / zoom}%`,
          transform: `scale(${zoom})`,
          transformOrigin: '0 0',
        }
      : { width: '100%', height: '100%' };

  function onMouseEnter() {
    if (editMode) return;
    hoverTimer.current = setTimeout(() => setIframeActive(true), HOVER_DELAY);
  }
  function onMouseLeave() {
    clearTimeout(hoverTimer.current);
    setIframeActive(false);
  }

  return (
    <div
      className="w-embed"
      onDoubleClick={() => editMode && setUrl()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {ctxEdit && selected && host && createPortal(tools, host)}
      <iframe
        src={toEmbedUrl(url)}
        title={widget.id}
        style={{
          ...iframeStyle,
          pointerEvents: editMode ? 'none' : iframeActive ? 'auto' : 'none',
        }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
