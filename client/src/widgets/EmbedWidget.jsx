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

// 임베드 콘텐츠의 논리 너비. 위젯 너비를 이 값 기준으로 스케일 → 위젯을 키우면 콘텐츠도 확대.
const BASE_WIDTH = 480;

export default function EmbedWidget({ widget, editMode, onChange }) {
  const url = widget.content?.url || '';

  function setUrl() {
    const next = window.prompt('임베드할 URL 입력 (YouTube, Notion 등)', url);
    if (next != null) onChange({ content: { ...widget.content, url: next } }, { commit: true });
  }

  if (!url) {
    return (
      <div className="w-placeholder">
        {editMode ? <button className="btn" onClick={setUrl}>URL 입력</button> : '임베드 없음'}
      </div>
    );
  }

  const scale = Math.max(0.1, (widget.width || BASE_WIDTH) / BASE_WIDTH);

  return (
    <div className="w-embed" onDoubleClick={() => editMode && setUrl()}>
      <iframe
        src={toEmbedUrl(url)}
        title={widget.id}
        style={{
          width: BASE_WIDTH,
          height: (widget.height || BASE_WIDTH) / scale,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
