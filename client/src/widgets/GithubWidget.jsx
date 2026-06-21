import { useEffect, useState } from 'react';

export default function GithubWidget({ widget, editMode, api, onChange }) {
  const url = widget.content?.url || '';
  const data = widget.content?.data || null;
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (url && !data && !loading) {
      setLoading(true);
      setFailed(false);
      api
        .github(url)
        .then((d) => onChange({ content: { ...widget.content, data: d } }, { commit: true }))
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, data]);

  function setUrl() {
    const next = window.prompt('GitHub URL 입력 (repo / PR / issue / 파일)', url);
    if (next != null) onChange({ content: { url: next, data: null } }, { commit: true });
  }

  if (!url) {
    return (
      <div className="w-placeholder">
        {editMode ? <button className="btn" onClick={setUrl}>URL 입력</button> : 'GitHub 링크 없음'}
      </div>
    );
  }

  // API 실패 시 단순 링크 카드로 폴백
  if (failed) {
    return (
      <a className="w-card" href={url} target="_blank" rel="noreferrer" onClick={(e) => editMode && e.preventDefault()} onDoubleClick={() => editMode && setUrl()}>
        <div className="w-card-body">
          <div className="w-card-title">GitHub</div>
          <div className="w-card-desc">{url}</div>
        </div>
      </a>
    );
  }

  if (loading || !data) {
    return <div className="w-placeholder">불러오는 중…</div>;
  }

  return (
    <div className="w-gh" onDoubleClick={() => editMode && setUrl()}>
      {data.kind === 'repo' && (
        <>
          <div className="w-gh-title">📦 {data.fullName}</div>
          {data.description && <div style={{ marginBottom: 8 }}>{data.description}</div>}
          <div className="w-gh-meta">
            <span>⭐ {data.stars}</span>
            <span>🍴 {data.forks}</span>
            {data.language && <span>● {data.language}</span>}
          </div>
        </>
      )}

      {(data.kind === 'pr' || data.kind === 'issue') && (
        <>
          <div className="w-gh-title">
            {data.kind === 'pr' ? '🔀' : '🐛'} {data.title}
          </div>
          <div className="w-gh-meta">
            <span className={`badge ${data.state}`}>{data.state}</span>
            <span>#{data.number}</span>
            <span>@{data.author}</span>
            <span>{data.owner}/{data.repo}</span>
          </div>
        </>
      )}

      {data.kind === 'file' && (
        <>
          <div className="w-gh-title">📄 {data.path}</div>
          <div className="w-gh-meta">
            <span>{data.owner}/{data.repo}</span>
            <span>@{data.ref}</span>
            {data.lineStart && (
              <span>L{data.lineStart}{data.lineEnd ? `-${data.lineEnd}` : ''}</span>
            )}
          </div>
          {data.snippet && <pre>{data.snippet}</pre>}
        </>
      )}

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => editMode && e.preventDefault()}
        style={{ fontSize: 12, color: 'var(--accent)' }}
      >
        GitHub에서 열기 →
      </a>
    </div>
  );
}
