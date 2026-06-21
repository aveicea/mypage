const NOTION_BASE = 'https://api.notion.com/v1';
export const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28';

/**
 * 사용자가 붙여넣은 값에서 32자리 Notion ID 를 추출한다.
 * - 전체 URL(https://notion.so/Workspace/Title-<32hex>?v=<32hex>) 허용
 * - 대시 포함 UUID 허용
 * - ?v= 같은 쿼리(뷰 ID)는 제거하고 경로상의 ID 만 사용
 */
export function normalizeNotionId(raw) {
  if (!raw) return raw;
  let s = String(raw).trim();
  const q = s.indexOf('?');
  if (q !== -1) s = s.slice(0, q);
  // 1) 대시 포함 UUID (8-4-4-4-12)
  const uuid = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuid) return uuid[0].replace(/-/g, '');
  // 2) 경로상의 연속 32자리 hex (마지막 것을 사용)
  const matches = s.match(/[0-9a-fA-F]{32}/g);
  if (matches && matches.length) return matches[matches.length - 1];
  return s;
}

/**
 * 요청 헤더에서 Notion 자격증명을 추출한다.
 * 프론트엔드가 config(apiKey + databaseId)를 헤더로 전달한다.
 */
export function getCredentials(req) {
  const apiKey = (req.get('x-notion-key') || '').trim();
  const databaseId = normalizeNotionId(req.get('x-notion-db'));
  if (!apiKey || !databaseId) {
    const err = new Error('Notion 자격증명이 없습니다 (x-notion-key / x-notion-db 헤더 필요)');
    err.status = 400;
    throw err;
  }
  return { apiKey, databaseId };
}

/**
 * Notion API 호출 래퍼.
 */
export async function notionFetch(apiKey, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(data?.message || `Notion API error (${res.status})`);
    err.status = res.status;
    err.notion = data;
    throw err;
  }
  return data;
}

/**
 * Notion File Upload 의 전송 단계(multipart). upload_url 로 파일 바이트를 보낸다.
 */
export async function notionSendFile(apiKey, uploadUrl, buffer, filename, contentType) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: contentType || 'application/octet-stream' }), filename || 'file');
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
    },
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text();
    const err = new Error(`Notion 파일 전송 실패 (${res.status}): ${t}`);
    err.status = 502;
    throw err;
  }
  return res.json();
}
