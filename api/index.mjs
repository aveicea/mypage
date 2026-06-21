// Vercel 서버리스 함수: Express 앱을 그대로 핸들러로 사용한다.
// vercel.json 의 rewrite 가 /api/* 요청을 이 함수로 보내고,
// req.url 은 원본 경로(/api/widgets 등)가 유지되어 Express 라우터가 매칭한다.
import app from '../server/src/app.js';

export default app;
