require('dotenv').config();
const { execSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ── Seed + fixes de datos en cada arranque ───────────────────────
try {
  execSync('node prisma/seed.js', { stdio: 'inherit' });
} catch (err) {
  console.error('⚠️  Error en seed:', err.message);
}
try {
  execSync('node scripts/fix-dates.js', { stdio: 'inherit' });
} catch (err) {
  console.error('⚠️  Error en fix-dates:', err.message);
}
try {
  execSync('node scripts/fix-home-away.js', { stdio: 'inherit' });
} catch (err) {
  console.error('⚠️  Error en fix-home-away:', err.message);
}
try {
  execSync('node scripts/fix-labels.js', { stdio: 'inherit' });
} catch (err) {
  console.error('⚠️  Error en fix-labels:', err.message);
}
try {
  execSync('node scripts/init-scoring.js', { stdio: 'inherit' });
} catch (err) {
  console.error('⚠️  Error en init-scoring:', err.message);
}
// ─────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/matches', require('./src/routes/matches'));
app.use('/api/predictions', require('./src/routes/predictions'));
app.use('/api/ranking', require('./src/routes/ranking'));
app.use('/api/teams', require('./src/routes/teams'));
app.use('/api/config', require('./src/routes/config'));
app.use('/api/users', require('./src/routes/users'));

app.get('/health', (req, res) => res.json({ ok: true, time: new Date() }));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🌍 Quiniela Mundial 2026 API`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health\n`);
});
