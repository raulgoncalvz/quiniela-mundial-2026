import { forwardRef, useEffect, useRef, useState } from 'react';
import api from '../lib/axios';

const TIMER_SECONDS = 10;
const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TriviaModal({ question, userId, onClose }) {
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [selected, setSelected] = useState(null);
  const [scoreHome, setScoreHome] = useState('');
  const [scoreAway, setScoreAway] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const intervalRef = useRef(null);
  const awayRef = useRef(null);

  useEffect(() => {
    if (submitted) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current);
          handleTimeUp();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [submitted]);

  const handleTimeUp = () => {
    setSubmitted(true);
    setResult({ timedOut: true, correct: false, correctAnswer: null });
    markSeen();
    api.post(`/trivia/${question.id}/answer`, { answer: '__timeout__' })
      .then(r => setResult({ timedOut: true, correct: false, correctAnswer: r.data.correctAnswer }))
      .catch(() => {});
  };

  const markSeen = () => {
    localStorage.setItem(`trivia_seen_${userId}_${question.id}`, '1');
  };

  const getAnswer = () => {
    if (question.type === 'multiple') return selected;
    if (question.type === 'score') {
      if (scoreHome === '' || scoreAway === '') return null;
      return `${scoreHome}-${scoreAway}`;
    }
    return null;
  };

  const canSubmit = () => {
    if (question.type === 'multiple') return !!selected;
    if (question.type === 'score') return scoreHome !== '' && scoreAway !== '';
    return false;
  };

  const handleSubmit = async () => {
    const answer = getAnswer();
    if (!answer || submitting) return;
    clearInterval(intervalRef.current);
    setSubmitting(true);
    try {
      const { data } = await api.post(`/trivia/${question.id}/answer`, { answer });
      setResult({ timedOut: false, correct: data.correct, correctAnswer: data.correctAnswer });
    } catch {
      setResult({ timedOut: false, correct: false, correctAnswer: '—' });
    } finally {
      setSubmitted(true);
      setSubmitting(false);
      markSeen();
    }
  };

  const progress = (timeLeft / TIMER_SECONDS) * CIRCUMFERENCE;
  const timerColor = timeLeft <= 3 ? '#ef4444' : 'white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={submitted ? onClose : undefined}
      />

      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-wc-gradient text-white px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] opacity-75 uppercase tracking-widest font-semibold mb-0.5">
                ⚽ Trivia Mundial
              </p>
              <h2 className="font-black text-lg leading-tight">¿Lo sabías?</h2>
            </div>

            {!submitted ? (
              <div className="relative flex-shrink-0 w-14 h-14 flex items-center justify-center">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 52 52">
                  <circle cx="26" cy="26" r={RADIUS} fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="4" />
                  <circle
                    cx="26" cy="26" r={RADIUS}
                    fill="none"
                    stroke={timerColor}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={CIRCUMFERENCE - progress}
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
                  />
                </svg>
                <span className="absolute text-xl font-black leading-none" style={{ color: timerColor }}>
                  {timeLeft}
                </span>
              </div>
            ) : (
              <button
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white font-bold text-lg"
              >
                ×
              </button>
            )}
          </div>

          <p className="mt-3 text-sm font-semibold leading-snug opacity-95">
            {question.question}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {!submitted ? (
            <>
              {question.type === 'multiple' && (
                <div className="space-y-2 mb-4">
                  {question.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setSelected(opt)}
                      className={`w-full text-left px-4 py-3 rounded-2xl border-2 font-medium text-sm transition-all active:scale-[0.98] ${
                        selected === opt
                          ? 'border-wc-blue bg-blue-50 text-wc-blue'
                          : 'border-gray-200 text-gray-700 hover:border-wc-blue/40'
                      }`}
                    >
                      <span className="text-gray-400 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {question.type === 'score' && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 text-center mb-3 font-medium">
                    Ingresa el marcador del partido
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <ScoreBox
                      value={scoreHome}
                      onChange={v => {
                        setScoreHome(v);
                        if (v !== '') awayRef.current?.focus();
                      }}
                      autoFocus
                    />
                    <span className="text-3xl font-black text-gray-300">—</span>
                    <ScoreBox
                      ref={awayRef}
                      value={scoreAway}
                      onChange={setScoreAway}
                      onKeyDown={e => e.key === 'Enter' && canSubmit() && handleSubmit()}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400 font-semibold mt-2 px-2">
                    <span>{question.homeLabel || 'Local'}</span>
                    <span>{question.awayLabel || 'Visitante'}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!canSubmit()}
                className="w-full bg-wc-gradient text-white font-bold py-3 rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-transform text-sm"
              >
                {submitting ? 'Enviando...' : 'Responder →'}
              </button>
            </>
          ) : (
            <ResultView result={result} type={question.type} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

const ScoreBox = forwardRef(function ScoreBox({ value, onChange, autoFocus, onKeyDown }, ref) {
  return (
    <input
      ref={ref}
      type="number"
      min="0"
      max="99"
      value={value}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
        onChange(v);
      }}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      placeholder="0"
      className="w-16 h-16 text-center text-3xl font-black border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-wc-blue bg-gray-50 transition-colors"
    />
  );
});

function ResultView({ result, type, onClose }) {
  if (!result) return null;

  if (result.timedOut) {
    return (
      <div className="text-center py-2">
        <p className="text-5xl mb-3">⏰</p>
        <p className="font-black text-xl text-gray-700">¡Se acabó el tiempo!</p>
        <p className="text-sm text-gray-500 mt-1">No respondiste a tiempo</p>
        {result.correctAnswer && <CorrectAnswerBox answer={result.correctAnswer} type={type} />}
        <CloseButton onClose={onClose} />
      </div>
    );
  }

  if (result.correct) {
    return (
      <div className="text-center py-2">
        <p className="text-5xl mb-3">🎉</p>
        <p className="font-black text-xl text-green-600">¡Correcto!</p>
        <p className="text-sm text-gray-500 mt-1">¡Eres un experto del fútbol!</p>
        <CloseButton onClose={onClose} color="green" />
      </div>
    );
  }

  return (
    <div className="text-center py-2">
      <p className="text-5xl mb-3">❌</p>
      <p className="font-black text-xl text-red-500">Incorrecto</p>
      <p className="text-sm text-gray-500 mt-1">¡Sigue aprendiendo!</p>
      {result.correctAnswer && <CorrectAnswerBox answer={result.correctAnswer} type={type} />}
      <CloseButton onClose={onClose} />
    </div>
  );
}

function CorrectAnswerBox({ answer, type }) {
  const isScore = type === 'score';
  const parts = isScore ? answer.split('-') : null;

  return (
    <div className="mt-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
      <p className="text-[11px] text-green-600 font-bold uppercase tracking-wide text-center mb-2">
        Respuesta correcta
      </p>
      {isScore && parts?.length === 2 ? (
        <div className="flex items-center justify-center gap-3">
          <span className="w-12 h-12 flex items-center justify-center text-2xl font-black bg-white border-2 border-green-300 rounded-xl text-green-700">
            {parts[0]}
          </span>
          <span className="text-xl font-black text-green-400">—</span>
          <span className="w-12 h-12 flex items-center justify-center text-2xl font-black bg-white border-2 border-green-300 rounded-xl text-green-700">
            {parts[1]}
          </span>
        </div>
      ) : (
        <p className="text-green-700 font-bold text-sm text-center">{answer}</p>
      )}
    </div>
  );
}

function CloseButton({ onClose, color = 'gray' }) {
  const styles = {
    gray: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    green: 'bg-green-100 text-green-700 hover:bg-green-200',
  };
  return (
    <button
      onClick={onClose}
      className={`mt-4 w-full font-bold py-3 rounded-2xl active:scale-[0.98] transition-all text-sm ${styles[color]}`}
    >
      Cerrar
    </button>
  );
}
