import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ login: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.login, form.password);
      toast.success('¡Bienvenido de vuelta!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh flex flex-col">
      {/* Poster */}
      <img
        src="/mundial-2026-cartel.jpg"
        alt="Mundial 2026"
        className="w-full object-cover"
        style={{ maxHeight: '260px', objectPosition: 'center top' }}
      />

      {/* Hero */}
      <div className="bg-wc-gradient flex flex-col items-center justify-center py-10 px-6 text-white text-center">
        <div className="text-5xl mb-3">🏆</div>
        <h1 className="text-3xl font-black tracking-tight mb-1">QUINIELA</h1>
        <p className="text-xl font-bold opacity-90">MUNDIAL 2026</p>
        <p className="text-sm opacity-70 mt-2">USA · Canadá · México</p>
      </div>

      {/* Form */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-6 px-6 pt-8 pb-12">
        <h2 className="text-2xl font-black text-wc-dark mb-1">Iniciar sesión</h2>
        <p className="text-gray-500 text-sm mb-6">Entra a tu quiniela del Mundial</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Usuario o Email</label>
            <input
              name="login"
              type="text"
              autoComplete="username"
              value={form.login}
              onChange={handleChange}
              className="input-field"
              placeholder="usuario o tu@email.com"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Contraseña</label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              className="input-field"
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-6 flex items-center justify-center gap-2">
            {loading ? <Spinner size="sm" color="white" /> : '⚽ Entrar'}
          </button>
        </form>

      </div>
    </div>
  );
}
