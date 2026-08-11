import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes/index.ts';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const indexPath = path.join(frontendDist, 'index.html');

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'classroom-allocation-api', time: new Date().toISOString() });
  });

  app.use('/api', routes);

  if (existsSync(indexPath)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(indexPath);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
