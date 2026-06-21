import { Router } from 'express';
import { getCredentials, notionFetch, notionSendFile } from '../notionClient.js';
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

/** 이미지 업로드 → Notion File Upload → 페이지 Files 속성에 첨부 */
router.post('/:id/image', wrap(async (req, res) => {
  const { apiKey, databaseId } = getCredentials(req);
  let schema = await resolveSchema(apiKey, databaseId);

  // Files 속성이 없으면 'Image' 라는 이름으로 자동 생성
  if (!schema.props.image) {
    await notionFetch(apiKey, `/databases/${databaseId}`, {
      method: 'PATCH',
      body: { properties: { Image: { files: {} } } },
    });
    clearSchemaCache(databaseId);
    schema = await resolveSchema(apiKey, databaseId, { force: true });
  }
  const imageProp = schema.props.image;

  const { filename = 'image', contentType = 'application/octet-stream', dataBase64 } = req.body || {};
  if (!dataBase64) return res.status(400).json({ error: '이미지 데이터(dataBase64)가 없습니다' });
  const buffer = Buffer.from(dataBase64, 'base64');

  // 1) 업로드 객체 생성 → upload_url 획득
  const upload = await notionFetch(apiKey, '/file_uploads', { method: 'POST', body: {} });
  // 2) 파일 바이트 전송
  await notionSendFile(apiKey, upload.upload_url, buffer, filename, contentType);
  // 3) 페이지 Files 속성에 첨부
  const page = await notionFetch(apiKey, `/pages/${req.params.id}`, {
    method: 'PATCH',
    body: {
      properties: {
        [imageProp]: { files: [{ type: 'file_upload', file_upload: { id: upload.id }, name: filename }] },
      },
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
