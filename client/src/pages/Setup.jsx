import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { encodeConfig, saveConfig, loadStoredConfig, buildShareUrl } from '../config.js';

export default function Setup() {
  const navigate = useNavigate();
  const existing = loadStoredConfig();
  const [apiKey, setApiKey] = useState(existing?.apiKey || '');
  const [databaseId, setDatabaseId] = useState(existing?.databaseId || '');
  const [copied, setCopied] = useState(false);

  const valid = apiKey.trim() && databaseId.trim();

  function handleSave() {
    if (!valid) return;
    const config = { apiKey: apiKey.trim(), databaseId: databaseId.trim() };
    saveConfig(config);
    const encoded = encodeConfig(config);
    navigate(`/?config=${encoded}`);
  }

  async function handleCopy() {
    if (!valid) return;
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
            placeholder="32자리 ID (대시 포함/미포함 모두 가능)"
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
          />
        </div>

        <div className="setup-actions">
          <button className="btn accent" disabled={!valid} onClick={handleSave}>
            저장하고 시작하기
          </button>
          <button className="btn" disabled={!valid} onClick={handleCopy}>
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
