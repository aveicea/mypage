/**
 * 백엔드(노션 프록시) 호출 래퍼.
 * config(apiKey + databaseId)를 요청 헤더로 전달한다.
 */

function headers(config) {
  return {
    'Content-Type': 'application/json',
    'x-notion-key': config.apiKey,
    'x-notion-db': config.databaseId,
  };
}

async function handle(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

export function createApi(config) {
  return {
    schema: () =>
      fetch('/api/widgets/_schema', { headers: headers(config) }).then(handle),

    list: () =>
      fetch('/api/widgets', { headers: headers(config) }).then(handle),

    create: (widget) =>
      fetch('/api/widgets', {
        method: 'POST',
        headers: headers(config),
        body: JSON.stringify(widget),
      }).then(handle),

    update: (id, patch) =>
      fetch(`/api/widgets/${id}`, {
        method: 'PATCH',
        headers: headers(config),
        body: JSON.stringify(patch),
      }).then(handle),

    remove: (id) =>
      fetch(`/api/widgets/${id}`, {
        method: 'DELETE',
        headers: headers(config),
      }).then(handle),

    uploadImage: (id, payload) =>
      fetch(`/api/widgets/${id}/image`, {
        method: 'POST',
        headers: headers(config),
        body: JSON.stringify(payload),
      }).then(handle),

    og: (url) =>
      fetch(`/api/meta/og?url=${encodeURIComponent(url)}`, { headers: headers(config) }).then(handle),
  };
}
