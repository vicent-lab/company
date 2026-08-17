import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './env.js';
import { healthCheck } from './db/index.js';
import { runContinuousLearningCycle } from './ai/outcome-verifier.js';
import { snapshotAllFarmScores } from './ai/farm-score.js';
import farmScoreRoutes from './routes/farm-score.js';
import { notFound, errorHandler } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import farmRoutes from './routes/farms.js';
import cowRoutes from './routes/cows.js';
import barnRoutes from './routes/barns.js';
import securityRoutes from './routes/security.js';
import platformRoutes from './routes/platform.js';
import milkRoutes from './routes/milk.js';
import dashboardRoutes from './routes/dashboard.js';
import predictionRoutes from './routes/predictions.js';
import analyticsRoutes from './routes/analytics.js';
import financeRoutes from './routes/finance.js';
import weatherRoutes from './routes/weather.js';
import notificationRoutes from './routes/notifications.js';
import sustainabilityRoutes from './routes/sustainability.js';
import aiRoutes from './routes/ai.js';
import aiAdvisorRoutes from './routes/ai-advisor.js';
import autopilotRoutes from './routes/autopilot.js';
import executiveAiRoutes from './routes/executive-ai.js';
import intelligenceRoutes from './routes/intelligence.js';
import healthRoutes from './routes/health.js';
import whatIfRoutes from './routes/what-if.js';
import galleryRoutes from './routes/gallery.js';
import customerRoutes from './routes/customers.js';
import employeeRoutes from './routes/employees.js';
import feedConsumptionRoutes from './routes/feed-consumption.js';
import treatmentRoutes from './routes/treatments.js';
import taskRoutes from './routes/tasks.js';
import dailyActivityRoutes from './routes/daily-activities.js';
import mapRoutes from './routes/map.js';
import farmMapRoutes from './routes/farm-map.js';
import cowLocationRoutes from './routes/cow-locations.js';
import heatDetectionRoutes from './routes/heat-detection.js';
import breedingRoutes from './routes/breeding.js';
import breedingAnalyticsRoutes from './routes/breeding-analytics.js';
import semenRoutes from './routes/semen.js';
import calvingRoutes from './routes/calving.js';
import pedigreeRoutes from './routes/pedigree.js';
import twinBirthRoutes from './routes/twin-births.js';
import fertilityRoutes from './routes/fertility.js';
import geneticsRoutes from './routes/genetics.js';
import breedingRecommendationRoutes from './routes/breeding-recommendations.js';
import shiftRoutes from './routes/shifts.js';
import trainingRoutes from './routes/training.js';
import performanceRoutes from './routes/performance.js';
import leaveRoutes from './routes/leave.js';
import messageRoutes from './routes/messages.js';
import faceRoutes from './routes/face.js';
import gpsRoutes from './routes/gps.js';
import attendanceRoutes from './routes/attendance.js';
import payrollRoutes from './routes/payroll.js';
import pregnanciesRoutes from './routes/pregnancies.js';
import offspringRoutes from './routes/offspring.js';

const app = express();
const allowedOrigins = [config.frontendUrl];
if (config.env !== 'production') {
  allowedOrigins.push('http://localhost:5173', 'http://localhost:4000', 'http://127.0.0.1:5173', 'http://127.0.0.1:4000');
}
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Not allowed by CORS'));
}}));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '6mb' }));

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', db: await healthCheck(), time: new Date().toISOString() });
});

app.get('/', (_req, res) => res.json({ name: 'Smart Dairy API', version: '0.1.0', docs: '/api/v1' }));

const api = express.Router();
api.get('/', (_req, res) => res.json({ name: 'Smart Dairy API', version: '0.1.0' }));
api.use('/auth', authRoutes);
api.use('/farms', farmRoutes);
api.use('/cows', cowRoutes);
api.use('/barns', barnRoutes);
api.use('/security', securityRoutes);
api.use('/platform', platformRoutes);
api.use('/milk-records', milkRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/predictions', predictionRoutes);
api.use('/analytics', analyticsRoutes);
api.use('/finance', financeRoutes);
api.use('/weather', weatherRoutes);
api.use('/notifications', notificationRoutes);
api.use('/sustainability', sustainabilityRoutes);
  api.use('/ai', aiRoutes);
  api.use('/ai-advisor', aiAdvisorRoutes);
  api.use('/executive', executiveAiRoutes);
  api.use('/intelligence', intelligenceRoutes);
  api.use('/farm-score', farmScoreRoutes);
  api.use('/autopilot', autopilotRoutes);
  api.use('/health', healthRoutes);
  api.use('/what-if', whatIfRoutes);
api.use('/gallery', galleryRoutes);
api.use('/customers', customerRoutes);
api.use('/employees', employeeRoutes);
api.use('/feed-records', feedConsumptionRoutes);
api.use('/treatments', treatmentRoutes);
api.use('/tasks', taskRoutes);
api.use('/daily-activities', dailyActivityRoutes);
api.use('/map', mapRoutes);
api.use('/farm-map', farmMapRoutes);
api.use('/cow-locations', cowLocationRoutes);
api.use('/heat-detection', heatDetectionRoutes);
  api.use('/breeding', breedingRoutes);
  api.use('/breeding/analytics', breedingAnalyticsRoutes);
  api.use('/semen', semenRoutes);
  api.use('/calving', calvingRoutes);
  api.use('/pedigree', pedigreeRoutes);
  api.use('/pregnancies', pregnanciesRoutes);
  api.use('/offspring', offspringRoutes);
  api.use('/twin-births', twinBirthRoutes);
api.use('/fertility', fertilityRoutes);
api.use('/genetics', geneticsRoutes);
api.use('/breeding-recommendations', breedingRecommendationRoutes);
api.use('/shifts', shiftRoutes);
api.use('/training', trainingRoutes);
api.use('/performance', performanceRoutes);
api.use('/leave', leaveRoutes);
api.use('/messages', messageRoutes);
api.use('/face', faceRoutes);
api.use('/gps', gpsRoutes);
api.use('/attendance', attendanceRoutes);
api.use('/payroll', payrollRoutes);

app.use('/api/v1', api);

const webDistPaths = [
  path.resolve(process.cwd(), 'apps/web/dist'),
  path.resolve(process.cwd(), 'dist/web'),
];
const webDist = webDistPaths.find((p) => fs.existsSync(p));
const hasWebApp = Boolean(webDist);
if (hasWebApp) {
  app.use(express.static(webDist!));
}

app.get('/', (_req, res) => {
  if (hasWebApp) {
    return res.sendFile(path.join(webDist!, 'index.html'));
  }
  res.json({ name: 'Smart Dairy API', version: '0.1.0', docs: '/api/v1' });
});

if (hasWebApp) {
  app.get('*', (_req, res) => res.sendFile(path.join(webDist!, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

const port = config.port;
const isVercel = process.env.VERCEL === '1';

let exported: any = app;
if (!isVercel) {
  exported = app.listen(port, () => {
    console.log(`🐄 Dairy API listening on http://localhost:${port} (env=${config.env})`);

    const runCycle = () => {
      runContinuousLearningCycle()
        .then((r) => console.log(`🧠 Continuous learning cycle: ${r.farms} farm(s), ${r.verified} predictions verified, ${r.followedUp} advice follow-ups checked`))
        .catch((err) => console.error('Continuous learning cycle failed:', err));
      snapshotAllFarmScores()
        .then((r) => console.log(`📊 Farm score snapshot: ${r.farms} farm(s) scored`))
        .catch((err) => console.error('Farm score snapshot failed:', err));
    };
    runCycle();
    setInterval(runCycle, config.learningCycleIntervalHours * 60 * 60 * 1000);
  });
} else {
  console.log('⏭️  Vercel serverless: exporting app without background cycles');
}

export default exported as any;
