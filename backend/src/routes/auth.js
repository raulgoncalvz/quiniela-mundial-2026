const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function safeUser(u) {
  return { id: u.id, name: u.name, username: u.username, email: u.email, role: u.role };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'El email ya está registrado' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name: name.trim(), email: email.toLowerCase(), password: hashed },
    });

    const token = signToken(user);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/auth/login — acepta email o username en el campo "login"
router.post('/login', async (req, res) => {
  const { email, login, password } = req.body;
  const identifier = (login || email || '').trim();
  if (!identifier || !password)
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  try {
    // Busca por email primero, luego por username
    let user = null;
    if (identifier.includes('@')) {
      user = await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
    } else {
      user = await prisma.user.findUnique({ where: { username: identifier.toLowerCase() } });
    }
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = signToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, username: true, email: true, role: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/auth/profile
router.put('/profile', auth, async (req, res) => {
  const { name, password, newPassword } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const updateData = {};
    if (name) updateData.name = name.trim();

    if (newPassword) {
      if (!password) return res.status(400).json({ error: 'Se requiere la contraseña actual' });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
      if (newPassword.length < 6)
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
      updateData.password = await bcrypt.hash(newPassword, 12);
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: { id: true, name: true, username: true, email: true, role: true },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
