const router = require('express').Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const prisma = require('../lib/prisma');

// GET /api/trivia/active — returns a random active, non-expired question the user hasn't answered
router.get('/active', auth, async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  try {
    // Auto-deactivate expired questions
    await prisma.triviaQuestion.updateMany({
      where: { isActive: true, expiresAt: { lt: now } },
      data: { isActive: false },
    });

    // Find all active non-expired questions this user hasn't answered yet
    const answered = await prisma.triviaResponse.findMany({
      where: { userId },
      select: { questionId: true },
    });
    const answeredIds = answered.map(r => r.questionId);

    const candidates = await prisma.triviaQuestion.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: now },
        id: { notIn: answeredIds.length ? answeredIds : [-1] },
      },
      select: { id: true, question: true, type: true, options: true, homeLabel: true, awayLabel: true, expiresAt: true },
    });

    if (candidates.length === 0) return res.json(null);

    // Pick one at random
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    res.json(pick);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/trivia/:id/answer — submit an answer
router.post('/:id/answer', auth, async (req, res) => {
  const questionId = parseInt(req.params.id);
  const userId = req.user.id;
  const { answer } = req.body;

  if (!answer || typeof answer !== 'string') {
    return res.status(400).json({ error: 'Respuesta requerida' });
  }

  try {
    const question = await prisma.triviaQuestion.findUnique({ where: { id: questionId } });
    if (!question) return res.status(404).json({ error: 'Pregunta no encontrada' });

    // Normalize score answers: "3 - 1", "3-1", "3 -1" → "3-1"
    const normalize = s => s.replace(/\s/g, '').toLowerCase();
    const isCorrect = answer === '__timeout__'
      ? false
      : normalize(answer) === normalize(question.correctAnswer);

    await prisma.triviaResponse.upsert({
      where: { userId_questionId: { userId, questionId } },
      update: { answer: answer.trim(), isCorrect },
      create: { userId, questionId, answer: answer.trim(), isCorrect },
    });

    res.json({ correct: isCorrect, correctAnswer: question.correctAnswer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

// GET /api/trivia — list all questions with response stats
router.get('/', auth, admin, async (req, res) => {
  try {
    const questions = await prisma.triviaQuestion.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { responses: true } } },
    });

    const result = await Promise.all(
      questions.map(async (q) => {
        const correctCount = await prisma.triviaResponse.count({
          where: { questionId: q.id, isCorrect: true },
        });
        return {
          ...q,
          totalResponses: q._count.responses,
          correctResponses: correctCount,
        };
      })
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/trivia/:id/responses — list who answered and how
router.get('/:id/responses', auth, admin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const responses = await prisma.triviaResponse.findMany({
      where: { questionId: id },
      include: { user: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(responses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/trivia — create question
router.post('/', auth, admin, async (req, res) => {
  const { question, type, options, correctAnswer, homeLabel, awayLabel } = req.body;

  if (!question || !correctAnswer) {
    return res.status(400).json({ error: 'Pregunta y respuesta correcta son requeridas' });
  }
  if (type === 'multiple' && (!Array.isArray(options) || options.length < 2)) {
    return res.status(400).json({ error: 'Se requieren al menos 2 opciones' });
  }

  try {
    const created = await prisma.triviaQuestion.create({
      data: {
        question: question.trim(),
        type: type || 'multiple',
        options: type === 'multiple' ? options.map(o => o.trim()) : [],
        correctAnswer: correctAnswer.trim(),
        homeLabel: homeLabel?.trim() || '',
        awayLabel: awayLabel?.trim() || '',
        isActive: false,
      },
    });
    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/trivia/:id — update question
router.put('/:id', auth, admin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { question, type, options, correctAnswer } = req.body;

  try {
    const updated = await prisma.triviaQuestion.update({
      where: { id },
      data: {
        ...(question && { question: question.trim() }),
        ...(type && { type }),
        ...(options && { options: options.map(o => o.trim()) }),
        ...(correctAnswer && { correctAnswer: correctAnswer.trim() }),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/trivia/:id/activate — activate (sets 24h expiry) or deactivate
router.put('/:id/activate', auth, admin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { active } = req.body;

  try {
    const expiresAt = active ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
    const updated = await prisma.triviaQuestion.update({
      where: { id },
      data: { isActive: active, expiresAt },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// DELETE /api/trivia/:id — delete question
router.delete('/:id', auth, admin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.triviaQuestion.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
