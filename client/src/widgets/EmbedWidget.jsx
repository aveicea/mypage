/** iframe 임베드 위젯. 유튜브 등은 임베드용 URL 로 변환. */
function toEmbedUrl(raw) {
  try {
    const u = new URL(raw);
    // YouTube
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

  return (
    <div className="w-embed" style={{ width: '100%', height: '100%' }} onDoubleClick={() => editMode && setUrl()}>
      <iframe
        src={toEmbedUrl(url)}
        title={widget.id}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
