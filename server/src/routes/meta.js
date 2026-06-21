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

/**
 * GET /api/meta/github?url=... -> GitHub 정보(repo/PR/issue/file) 조회
 * 토큰 없이 public API 사용 (rate limit 있음).
 */
router.get('/github', wrap(async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url 쿼리 필요' });

  const info = parseGithubUrl(url);
  if (!info) return res.status(400).json({ error: 'GitHub URL 형식이 아님', kind: 'unknown' });

  const gh = (path) =>
    fetch(`https://api.github.com${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'WidgetBoard/0.1' },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`GitHub API ${r.status}`);
      return r.json();
    });

  try {
    if (info.kind === 'repo') {
      const d = await gh(`/repos/${info.owner}/${info.repo}`);
      return res.json({
        kind: 'repo', url, owner: info.owner, repo: info.repo,
        fullName: d.full_name, description: d.description,
        stars: d.stargazers_count, language: d.language, forks: d.forks_count,
      });
    }
    if (info.kind === 'pr' || info.kind === 'issue') {
      const path = info.kind === 'pr' ? 'pulls' : 'issues';
      const d = await gh(`/repos/${info.owner}/${info.repo}/${path}/${info.number}`);
      let state = d.state;
      if (info.kind === 'pr' && d.merged_at) state = 'merged';
      return res.json({
        kind: info.kind, url, owner: info.owner, repo: info.repo,
        number: info.number, title: d.title, state, author: d.user?.login,
      });
    }
    if (info.kind === 'file') {
      const d = await gh(`/repos/${info.owner}/${info.repo}/contents/${info.path}?ref=${info.ref}`);
      let snippet = '';
      if (d.content) {
        const decoded = Buffer.from(d.content, 'base64').toString('utf-8');
        const lines = decoded.split('\n');
        if (info.lineStart) {
          const start = Math.max(0, info.lineStart - 1);
          const end = info.lineEnd ? info.lineEnd : info.lineStart;
          snippet = lines.slice(start, end).join('\n');
        } else {
          snippet = lines.slice(0, 20).join('\n');
        }
      }
      return res.json({
        kind: 'file', url, owner: info.owner, repo: info.repo,
        path: info.path, ref: info.ref, lineStart: info.lineStart, lineEnd: info.lineEnd, snippet,
      });
    }
    return res.status(400).json({ error: '지원하지 않는 GitHub URL', kind: 'unknown' });
  } catch (e) {
    res.status(502).json({ error: 'GitHub 조회 실패', detail: String(e), kind: info.kind });
  }
}));

function parseGithubUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/github\.com$/.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo, kind, ...rest] = parts;

  if (!kind) return { kind: 'repo', owner, repo };
  if (kind === 'pull' && rest[0]) return { kind: 'pr', owner, repo, number: rest[0] };
  if (kind === 'issues' && rest[0]) return { kind: 'issue', owner, repo, number: rest[0] };
  if (kind === 'blob' && rest.length >= 2) {
    const ref = rest[0];
    const path = rest.slice(1).join('/');
    const hash = u.hash || '';
    const m = hash.match(/#?L(\d+)(?:-L(\d+))?/);
    return {
      kind: 'file', owner, repo, ref, path,
      lineStart: m ? Number(m[1]) : null,
      lineEnd: m && m[2] ? Number(m[2]) : null,
    };
  }
  return { kind: 'repo', owner, repo };
}

export default router;
