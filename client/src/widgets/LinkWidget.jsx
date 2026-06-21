import { useEffect, useState } from 'react';

export default function LinkWidget({ widget, editMode, api, onChange }) {
  const url = widget.content?.url || '';
  const meta = widget.content?.meta || null;
  const [loading, setLoading] = useState(false);

  // url 은 있는데 meta 가 없으면 한 번 시도
  useEffect(() => {
    if (url && !meta && !loading) {
      setLoading(true);
      api
        .og(url)
        .then((m) => onChange({ content: { ...widget.content, meta: m } }, { commit: true }))
        .catch(() => onChange({ content: { ...widget.content, meta: { title: url } } }, { commit: true }))
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, meta]);

  function setLink() {
    const next = window.prompt('링크 URL 입력', url);
    if (next != null) onChange({ content: { url: next, meta: null } }, { commit: true });
  }

  if (!url) {
    return (
      <div className="w-placeholder">
        {editMode ? <button className="btn" onClick={setLink}>URL 입력</button> : '링크 없음'}
      </div>
    );
  }

  return (
    <a
      className="w-card"
      href={url}
      target="_blank"
      rel="noreferrer"
      onDoubleClick={(e) => {
        if (editMode) {
          e.preventDefault();
          setLink();
        }
      }}
    >
      {meta?.image && <img src={meta.image} alt="" draggable={false} />}
      <div className="w-card-body">
        <div className="w-card-title">{loading ? '불러오는 중…' : meta?.title || url}</div>
        {meta?.description && <div className="w-card-desc">{meta.description}</div>}
        <div className="w-card-desc">{new URL(url).hostname}</div>
      </div>
    </a>
  );
}
