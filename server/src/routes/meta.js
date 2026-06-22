import { Router } from 'express';

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

export default router;
