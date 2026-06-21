import { notionFetch } from './notionClient.js';

/**
 * 위젯 논리 필드 -> Notion 속성 이름 후보(소문자/공백제거 비교).
 * 사용자의 DB가 한글/영문 어떤 기본 이름을 쓰든 최대한 자동으로 매핑한다.
 * title 속성은 이름이 아니라 "type === title" 로 감지한다.
 */
const FIELD_CANDIDATES = {
  type: ['type', '타입', '종류', 'kind'],
  x: ['x', 'x좌표', 'posx', 'left'],
  y: ['y', 'y좌표', 'posy', 'top'],
  width: ['width', '너비', 'w', '가로'],
  height: ['height', '높이', 'h', '세로'],
  zIndex: ['zindex', 'z-index', 'z', '순서', 'order', '레이어'],
  content: ['content', '내용', 'data', '데이터', 'json'],
  image: ['image', '이미지', '사진', '파일', 'file', '첨부', 'attachment'],
};

const norm = (s) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');

// databaseId -> { titleProp, props: { type, x, y, ... } } 캐시
const schemaCache = new Map();

/**
 * DB 메타데이터를 조회해 논리 필드 -> 실제 속성 이름을 매핑한다.
 */
export async function resolveSchema(apiKey, databaseId, { force = false } = {}) {
  if (!force && schemaCache.has(databaseId)) {
    return schemaCache.get(databaseId);
  }

  const db = await notionFetch(apiKey, `/databases/${databaseId}`);
  const properties = db.properties || {};

  let titleProp = null;
  const byNorm = {}; // normName -> { name, type }
  for (const [name, def] of Object.entries(properties)) {
    if (def.type === 'title') titleProp = name;
    byNorm[norm(name)] = { name, type: def.type };
  }

  const resolved = { type: null, x: null, y: null, width: null, height: null, zIndex: null, content: null, image: null };
  for (const [field, candidates] of Object.entries(FIELD_CANDIDATES)) {
    for (const cand of candidates) {
      const hit = byNorm[norm(cand)];
      if (hit) {
        resolved[field] = hit.name;
        break;
      }
    }
  }
  // 이미지: 이름 매칭 실패 시 'files' 타입 속성을 자동 사용
  if (!resolved.image) {
    for (const [name, def] of Object.entries(properties)) {
      if (def.type === 'files') { resolved.image = name; break; }
    }
  }

  const schema = { titleProp, props: resolved, raw: properties };
  schemaCache.set(databaseId, schema);
  return schema;
}

export function clearSchemaCache(databaseId) {
  if (databaseId) schemaCache.delete(databaseId);
  else schemaCache.clear();
}

/* ---------- Notion page <-> 위젯 객체 변환 ---------- */

const num = (prop) => (prop && typeof prop.number === 'number' ? prop.number : null);
const richText = (prop) =>
  prop && Array.isArray(prop.rich_text) ? prop.rich_text.map((t) => t.plain_text).join('') : '';
const titleText = (prop) =>
  prop && Array.isArray(prop.title) ? prop.title.map((t) => t.plain_text).join('') : '';

/** Notion page -> 위젯 객체 */
export function pageToWidget(page, schema) {
  const p = page.properties || {};
  const { titleProp, props } = schema;

  let content = {};
  const rawContent = props.content ? richText(p[props.content]) : '';
  if (rawContent) {
    try {
      content = JSON.parse(rawContent);
    } catch {
      content = { _raw: rawContent };
    }
  }

  // 이미지 위젯: Files 속성에 업로드된 파일이 있으면 그 URL 을 src 로 사용(매 로드 시 갱신)
  if (props.image && Array.isArray(p[props.image]?.files) && p[props.image].files.length) {
    const f = p[props.image].files[0];
    const url = f?.file?.url || f?.external?.url;
    if (url) content = { ...content, src: url };
  }

  return {
    id: page.id,
    name: titleProp ? titleText(p[titleProp]) : '',
    type: props.type && p[props.type]?.select ? p[props.type].select.name : 'text',
    x: (props.x && num(p[props.x])) ?? 0,
    y: (props.y && num(p[props.y])) ?? 0,
    width: (props.width && num(p[props.width])) ?? 240,
    height: (props.height && num(p[props.height])) ?? 160,
    zIndex: (props.zIndex && num(p[props.zIndex])) ?? 1,
    content,
  };
}

/** 위젯(부분) 객체 -> Notion properties payload */
export function widgetToProperties(widget, schema) {
  const { titleProp, props } = schema;
  const out = {};

  if (titleProp && widget.name !== undefined) {
    out[titleProp] = { title: [{ text: { content: String(widget.name).slice(0, 2000) } }] };
  }
  if (props.type && widget.type !== undefined) {
    out[props.type] = { select: { name: widget.type } };
  }
  if (props.x && widget.x !== undefined) out[props.x] = { number: Math.round(widget.x) };
  if (props.y && widget.y !== undefined) out[props.y] = { number: Math.round(widget.y) };
  if (props.width && widget.width !== undefined) out[props.width] = { number: Math.round(widget.width) };
  if (props.height && widget.height !== undefined) out[props.height] = { number: Math.round(widget.height) };
  if (props.zIndex && widget.zIndex !== undefined) out[props.zIndex] = { number: Math.round(widget.zIndex) };
  if (props.content && widget.content !== undefined) {
    const json = JSON.stringify(widget.content ?? {});
    out[props.content] = { rich_text: chunkRichText(json) };
  }
  return out;
}

/**
 * Notion rich_text 는 항목당 content 가 2000자로 제한된다.
 * 긴 JSON(이미지 dataURL 등)을 2000자 단위로 쪼개 여러 rich_text 항목으로 저장.
 * 읽을 때 richText() 가 모든 항목의 plain_text 를 이어붙이므로 그대로 복원된다.
 */
function chunkRichText(str, limit = 2000, maxItems = 100) {
  if (!str) return [{ text: { content: '' } }];
  const items = [];
  for (let i = 0; i < str.length && items.length < maxItems; i += limit) {
    items.push({ text: { content: str.slice(i, i + limit) } });
  }
  return items;
}
