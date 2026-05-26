const router = require('express').Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const prisma = require('../lib/prisma');

// GET /api/trivia/active — returns a random active, non-expired question the user hasn't answered
router.get('/active', auth, async (req, res) => {
  const userId = req.user.id;
  try {
    // Auto-deactivate expired questions (raw SQL to bypass outdated Prisma client)
    await prisma.$executeRaw`
      UPDATE "TriviaQuestion"
      SET "isActive" = false
      WHERE "isActive" = true
        AND "expiresAt" IS NOT NULL
        AND "expiresAt" < NOW()
    `;

    // Get active non-expired questions not yet answered by this user
    const candidates = await prisma.$queryRaw`
      SELECT id, question, type, options,
             COALESCE("homeLabel", '') AS "homeLabel",
             COALESCE("awayLabel", '') AS "awayLabel",
             "expiresAt"
      FROM "TriviaQuestion"
      WHERE "isActive" = true
        AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
        AND id NOT IN (
          SELECT "questionId" FROM "TriviaResponse" WHERE "userId" = ${userId}
        )
    `;

    if (!candidates.length) return res.json(null);

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
    const questions = await prisma.$queryRaw`
      SELECT
        q.id, q.question, q.type, q.options, q."isActive",
        COALESCE(q."correctAnswer", '') AS "correctAnswer",
        COALESCE(q."homeLabel", '')     AS "homeLabel",
        COALESCE(q."awayLabel", '')     AS "awayLabel",
        q."expiresAt",
        q."createdAt",
        COUNT(r.id)::int                           AS "totalResponses",
        COUNT(CASE WHEN r."isCorrect" THEN 1 END)::int AS "correctResponses"
      FROM "TriviaQuestion" q
      LEFT JOIN "TriviaResponse" r ON r."questionId" = q.id
      GROUP BY q.id
      ORDER BY q."createdAt" DESC
    `;
    res.json(questions);
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
    if (active) {
      await prisma.$executeRaw`
        UPDATE "TriviaQuestion"
        SET "isActive" = true,
            "expiresAt" = NOW() + INTERVAL '24 hours'
        WHERE id = ${id}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "TriviaQuestion"
        SET "isActive" = false,
            "expiresAt" = NULL
        WHERE id = ${id}
      `;
    }
    // Return updated record using fields Prisma client knows about
    const rows = await prisma.$queryRaw`
      SELECT id, question, type, options, "isActive",
             COALESCE("homeLabel", '') AS "homeLabel",
             COALESCE("awayLabel", '') AS "awayLabel",
             "expiresAt", "createdAt"
      FROM "TriviaQuestion" WHERE id = ${id}
    `;
    res.json(rows[0]);
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
