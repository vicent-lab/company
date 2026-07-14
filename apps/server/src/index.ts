import express from 'express';
import cors from 'cors';
import { config } from './env.js';
import { healthCheck } from './db/index.js';
import { notFound, errorHandler } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import farmRoutes from './routes/farms.js';
import cowRoutes from './routes/cows.js';
import milkRoutes from './routes/milk.js';
import dashboardRoutes from './routes/dashboard.js';
import predictionRoutes from './routes/predictions.js';
import analyticsRoutes from './routes/analytics.js';
import financeRoutes from './routes/finance.js';
import weatherRoutes from './routes/weather.js';
import notificationRoutes from './routes/notifications.js';
import sustainabilityRoutes from './routes/sustainability.js';
import aiRoutes from './routes/ai.js';
import galleryRoutes from './routes/gallery.js';
import customerRoutes from './routes/customers.js';
import employeeRoutes from './routes/employees.js';
import mapRoutes from './routes/map.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', db: await healthCheck(), time: new Date().toISOString() });
});

const api = express.Router();
api.get('/', (_req, res) => res.json({ name: 'Smart Dairy API', version: '0.1.0' }));
api.use('/auth', authRoutes);
api.use('/farms', farmRoutes);
api.use('/cows', cowRoutes);
api.use('/milk-records', milkRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/predictions', predictionRoutes);
api.use('/analytics', analyticsRoutes);
api.use('/finance', financeRoutes);
api.use('/weather', weatherRoutes);
api.use('/notifications', notificationRoutes);
api.use('/sustainability', sustainabilityRoutes);
api.use('/ai', aiRoutes);
api.use('/gallery', galleryRoutes);
api.use('/customers', customerRoutes);
api.use('/employees', employeeRoutes);
api.use('/map', mapRoutes);

app.use('/api/v1', api);
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`🐄 Dairy API listening on http://localhost:${config.port} (env=${config.env})`);
});
