import { useContext, useLayoutEffect, useRef, useState } from 'react';
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

export default function EmbedWidget({ widget, editMode, deviceId, onChange }) {
  const { host, selected, editMode: ctxEdit } = useContext(WidgetChromeContext);
  const content = widget.content || {};
  const url = content.url || '';
  // 확대 배율은 기기별로 저장 (없으면 공통 zoom, 그래도 없으면 1)
  const zoom = content.zooms?.[deviceId] ?? content.zoom ?? 1;

  // CSS zoom 은 width:100% 같은 퍼센트 크기에는 적용이 상쇄돼 안 먹는다.
  // → 컨테이너 픽셀 크기를 측정해 iframe 에 고정 px 로 주고 zoom 을 걸어야 실제로 확대됨.
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [url]);

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
    <div className="embed-tools" onPointerDown={(e) => e.stopPropagation()}>
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

  // 선명하게: transform 스케일(래스터) 대신 CSS zoom(레이아웃 확대) 사용.
  // zoom 이 먹으려면 iframe 이 퍼센트가 아니라 고정 px 크기여야 함 (측정값 사용).
  const iframeStyle =
    zoom !== 1 && size.w
      ? { width: `${size.w}px`, height: `${size.h}px`, zoom }
      : { width: '100%', height: '100%' };

  return (
    <div className="w-embed" ref={wrapRef} onDoubleClick={() => editMode && setUrl()}>
      {ctxEdit && selected && host && createPortal(tools, host)}
      <iframe
        src={toEmbedUrl(url)}
        title={widget.id}
        style={iframeStyle}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
