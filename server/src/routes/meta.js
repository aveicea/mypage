import { Router } from 'express';
import { notionFetch } from '../notionClient.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** 매우 단순한 OG/메타 태그 파서 (링크 카드용) */
function parseMeta(html) {
  const pick = (re) => {
    const m = html.match(re);
    return m ? m[1].trim() : null;
  };
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const ogDesc = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const title = pick(/<title[^>]*>([^<]*)<\/title>/i);
  return {
    title: ogTitle || title || null,
    description: ogDesc || null,
    image: ogImage || null,
  };
}

/** GET /api/meta/og?url=... -> OG 메타데이터 */
router.get('/og', wrap(async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url 쿼리 필요' });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WidgetBoard/0.1)' } });
    const html = await r.text();
    res.json({ url, ...parseMeta(html) });
  } catch (e) {
    res.status(502).json({ error: '메타데이터 조회 실패', detail: String(e) });
  }
}));

/** POST /api/meta/create-db  — API 키만으로 새 위젯 보드 DB 생성 */
router.post('/create-db', wrap(async (req, res) => {
  const apiKey = (req.get('x-notion-key') || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'x-notion-key 헤더 필요' });

  // 이 integration이 접근 가능한 페이지 하나 찾기
  const search = await notionFetch(apiKey, '/search', {
    method: 'POST',
    body: { filter: { value: 'page', property: 'object' }, page_size: 1 },
  });
  const parentPage = search.results?.[0];
  if (!parentPage) {
    return res.status(422).json({ error: 'Integration이 접근 가능한 Notion 페이지가 없습니다. Notion에서 Integration을 페이지에 연결해 주세요.' });
  }

  const db = await notionFetch(apiKey, '/databases', {
    method: 'POST',
    body: {
      parent: { type: 'page_id', page_id: parentPage.id },
      title: [{ type: 'text', text: { content: '위젯 보드' } }],
      properties: {
        Name:    { title: {} },
        // type 은 widgetToProperties/pageToWidget 가 select 로 읽고 쓴다.
        // (rich_text 로 만들면 위젯 생성 시 Notion 이 타입 불일치로 400 거부)
        type:    { select: {} },
        x:       { number: {} },
        y:       { number: {} },
        width:   { number: {} },
        height:  { number: {} },
        zIndex:  { number: {} },
        content: { rich_text: {} },
        // 이미지/파일 위젯이 첨부를 저장할 Files 속성 (이름 'Image' → 스키마가 image 로 매핑)
        Image:   { files: {} },
      },
    },
  });

  res.json({ databaseId: db.id.replace(/-/g, '') });
}));

export default router;
