import { Router } from 'express';
import { getCredentials, notionFetch } from '../notionClient.js';
import { resolveSchema, pageToWidget, widgetToProperties, clearSchemaCache } from '../notionSchema.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** DB 스키마 진단 (속성 매핑이 제대로 됐는지 확인용) */
router.get('/_schema', wrap(async (req, res) => {
  const { apiKey, databaseId } = getCredentials(req);
  clearSchemaCache(databaseId);
  const schema = await resolveSchema(apiKey, databaseId, { force: true });
  res.json({
    titleProp: schema.titleProp,
    mapped: schema.props,
    available: Object.fromEntries(
      Object.entries(schema.raw).map(([name, def]) => [name, def.type])
    ),
  });
}));

/** 전체 위젯 목록 조회 (단일 진실 소스: 항상 Notion 에서 읽음) */
router.get('/', wrap(async (req, res) => {
  const { apiKey, databaseId } = getCredentials(req);
  const schema = await resolveSchema(apiKey, databaseId);

  const widgets = [];
  let cursor;
  do {
    const data = await notionFetch(apiKey, `/databases/${databaseId}/query`, {
      method: 'POST',
      body: cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 },
    });
    for (const page of data.results || []) {
      widgets.push(pageToWidget(page, schema));
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  res.json({ widgets });
}));

/** 위젯 생성 (새 page) */
router.post('/', wrap(async (req, res) => {
  const { apiKey, databaseId } = getCredentials(req);
  const schema = await resolveSchema(apiKey, databaseId);

  const widget = req.body || {};
  if (!widget.name) widget.name = `${widget.type || 'widget'}-${Date.now()}`;

  const page = await notionFetch(apiKey, '/pages', {
    method: 'POST',
    body: {
      parent: { database_id: databaseId },
      properties: widgetToProperties(widget, schema),
    },
  });

  res.json({ widget: pageToWidget(page, schema) });
}));

/** 위젯 업데이트 (이동/리사이즈/내용/순서) */
router.patch('/:id', wrap(async (req, res) => {
  const { apiKey, databaseId } = getCredentials(req);
  const schema = await resolveSchema(apiKey, databaseId);

  const page = await notionFetch(apiKey, `/pages/${req.params.id}`, {
    method: 'PATCH',
    body: { properties: widgetToProperties(req.body || {}, schema) },
  });

  res.json({ widget: pageToWidget(page, schema) });
}));

/** 위젯 삭제 (archive 처리) */
router.delete('/:id', wrap(async (req, res) => {
  const { apiKey } = getCredentials(req);
  await notionFetch(apiKey, `/pages/${req.params.id}`, {
    method: 'PATCH',
    body: { archived: true },
  });
  res.json({ ok: true });
}));

export default router;
