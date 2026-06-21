import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import widgetsRouter from './routes/widgets.js';
import metaRouter from './routes/meta.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/widgets', widgetsRouter);
app.use('/api/meta', metaRouter);

// 공통 에러 핸들러
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

export default app;
