import express from 'express';
import cors from 'cors';
import routes from './routes/index.ts';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'classroom-allocation-api', time: new Date().toISOString() });
  });

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
