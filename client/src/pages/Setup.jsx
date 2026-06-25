import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { encodeConfig, saveConfig, loadStoredConfig, buildShareUrl } from '../config.js';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export default function Setup() {
  const navigate = useNavigate();
  const existing = loadStoredConfig();
  const [apiKey, setApiKey] = useState(existing?.apiKey || '');
  const [databaseId, setDatabaseId] = useState(existing?.databaseId || '');
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const canSave = apiKey.trim() && databaseId.trim();
  const canCreate = apiKey.trim() && !databaseId.trim();

  function handleSave() {
    if (!canSave) return;
    const config = { apiKey: apiKey.trim(), databaseId: databaseId.trim() };
    saveConfig(config);
    const encoded = encodeConfig(config);
    navigate(`/?config=${encoded}`);
  }

  async function handleCreateDb() {
    if (!apiKey.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch(`${API_BASE}/meta/create-db`, {
        method: 'POST',
        headers: { 'x-notion-key': apiKey.trim() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setDatabaseId(data.databaseId);
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!canSave) return;
    const config = { apiKey: apiKey.trim(), databaseId: databaseId.trim() };
    const url = buildShareUrl(config);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('아래 링크를 복사하세요', url);
    }
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <h1>위젯 보드 설정</h1>
        <p className="sub">Notion Integration Token 과 Database ID 를 입력하세요.</p>

        <div className="field">
          <label>Notion API 키 (Integration Token)</label>
          <input
            type="password"
            placeholder="secret_xxx 또는 ntn_xxx"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Notion Database ID</label>
          <input
            type="text"
            placeholder="32자리 ID — 없으면 아래 버튼으로 자동 생성"
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
          />
          {canCreate && (
            <button
              className="btn"
              style={{ marginTop: 8, width: '100%' }}
              disabled={creating}
              onClick={handleCreateDb}
            >
              {creating ? '생성 중…' : '새 Notion DB 자동 생성'}
            </button>
          )}
          {createError && (
            <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{createError}</p>
          )}
        </div>

        <div className="setup-actions">
          <button className="btn accent" disabled={!canSave} onClick={handleSave}>
            저장하고 시작하기
          </button>
          <button className="btn" disabled={!canSave} onClick={handleCopy}>
            {copied ? '복사됨!' : '현재 링크 복사'}
          </button>
        </div>

        <p className="hint">
          입력값은 이 브라우저(localStorage)에 저장되고, 인코딩되어 URL(<code>?config=</code>)로도
          공유됩니다. 그 링크를 북마크하면 다른 기기에서도 같은 DB로 바로 연결됩니다. 위젯 데이터
          자체는 로컬에 저장되지 않고 항상 Notion DB에서 불러옵니다.
        </p>
      </div>
    </div>
  );
}
