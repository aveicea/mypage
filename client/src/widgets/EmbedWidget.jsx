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
  const content = widget.content || {};
  const url = content.url || '';
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

  // 위젯을 항상 꽉 채우되, zoom 으로 콘텐츠가 보이는 배율을 조절
  const w = (widget.width || 360) / zoom;
  const h = (widget.height || 240) / zoom;

  return (
    <div className="w-embed" onDoubleClick={() => editMode && setUrl()}>
      {editMode && (
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
      )}
      <iframe
        src={toEmbedUrl(url)}
        title={widget.id}
        style={{ width: w, height: h, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
