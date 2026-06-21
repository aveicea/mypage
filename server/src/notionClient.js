const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28';

/**
 * 요청 헤더에서 Notion 자격증명을 추출한다.
 * 프론트엔드가 config(apiKey + databaseId)를 헤더로 전달한다.
 */
export function getCredentials(req) {
  const apiKey = req.get('x-notion-key');
  const databaseId = req.get('x-notion-db');
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
