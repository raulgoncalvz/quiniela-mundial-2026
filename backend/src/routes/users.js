const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const prisma = new PrismaClient();

// GET /api/users — list all users (admin)
router.get('/', auth, admin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, username: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/users — create user (admin): username + name + password, no email required
router.post('/', auth, admin, async (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password)
    return res.status(400).json({ error: 'Nombre, usuario y contraseña son requeridos' });
  if (password.length < 4)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });

  const cleanUsername = username.toLowerCase().trim().replace(/\s+/g, '_');

  try {
    const existing = await prisma.user.findUnique({ where: { username: cleanUsername } });
    if (existing) return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        username: cleanUsername,
        email: `${cleanUsername}@quiniela.local`,
        password: hashed,
        role: role === 'admin' ? 'admin' : 'user',
      },
      select: { id: true, name: true, username: true, email: true, role: true, createdAt: true },
    });

    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/users/:id — edit user (admin): rename or reset password
router.put('/:id', auth, admin, async (req, res) => {
  const { name, password } = req.body;
  const userId = parseInt(req.params.id);

  try {
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (password) {
      if (password.length < 4)
        return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
      updateData.password = await bcrypt.hash(password, 12);
    }

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ error: 'Nada que actualizar' });

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, name: true, username: true, email: true, role: true },
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// DELETE /api/users/:id — delete user (admin)
router.delete('/:id', auth, admin, async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    await prisma.user.delete({ where: { id: userId } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
