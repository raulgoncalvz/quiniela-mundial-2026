require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;

// Detrás del proxy de Render: confiar en 1 salto para que req.ip sea la IP real
// del cliente y no la del proxy (si no, el rate limit se comparte entre todos).
app.set('trust proxy', 1);

app.use(helmet());

// CORS — acepta múltiples orígenes separados por coma en FRONTEND_URL
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // mobile apps / curl / same-origin
    const clean = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(clean)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} no permitido`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '3mb' })); // margen para fotos de perfil en base64

// Rate limit por usuario autenticado (cae a IP si no hay token válido).
// La quiniela genera muchas peticiones legítimas al llenarse, así que el
// presupuesto es alto y se cuenta por persona, no global.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        if (decoded?.id) return `user:${decoded.id}`;
      } catch {
        // token inválido o expirado → cae al límite por IP
      }
    }
    return req.ip;
  },
});
app.use('/api/', limiter);

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/matches', require('./src/routes/matches'));
app.use('/api/predictions', require('./src/routes/predictions'));
app.use('/api/ranking', require('./src/routes/ranking'));
app.use('/api/teams', require('./src/routes/teams'));
app.use('/api/config', require('./src/routes/config'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/export', require('./src/routes/export'));
app.use('/api/trivia', require('./src/routes/trivia'));

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
  require('./src/services/liveMatchService').start();
});
