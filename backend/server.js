require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

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
