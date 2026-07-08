import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MSG } from './util.js';
import { startScheduler } from './scheduler.js';
import authRoutes from './routes/auth.js';
import wgRoutes from './routes/wg.js';
import taskRoutes from './routes/tasks.js';
import shoppingRoutes from './routes/shopping.js';
import costRoutes from './routes/costs.js';
import bucketRoutes from './routes/bucket.js';
import notificationRoutes from './routes/notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 1024 * 1024 });

// Leere JSON-Bodies erlauben (z. B. POST /done ohne Payload)
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body) return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch (err) {
    err.statusCode = 400;
    done(err);
  }
});

await app.register(cors, { origin: true });
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ statusCode: 429, error: MSG.rateLimit })
});
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

app.setErrorHandler((err, req, reply) => {
  if (err.statusCode === 429) return reply.code(429).send({ error: MSG.rateLimit });
  if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: MSG.badInput });
  req.log.error(err);
  reply.code(500).send({ error: MSG.server });
});

await app.register(authRoutes);
await app.register(wgRoutes);
await app.register(taskRoutes);
await app.register(shoppingRoutes);
await app.register(costRoutes);
await app.register(bucketRoutes);
await app.register(notificationRoutes);

app.get('/api/health', () => ({ ok: true }));

// Produktion: gebautes Frontend ausliefern (SPA-Fallback auf index.html)
if (existsSync(CLIENT_DIST)) {
  await app.register(fastifyStatic, { root: CLIENT_DIST });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api/')) return reply.code(404).send({ error: MSG.notFound });
    return reply.sendFile('index.html');
  });
} else {
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: MSG.notFound }));
}

startScheduler(app.log);

app.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
