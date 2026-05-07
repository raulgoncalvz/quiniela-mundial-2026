import { useState } from 'react';
import { Link } from 'react-router-dom';
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
      {/* Hero */}
      <div className="bg-wc-gradient flex flex-col items-center justify-center py-16 px-6 text-white text-center">
        <div className="text-6xl mb-4">🏆</div>
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

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-wc-blue font-semibold hover:underline">
            Regístrate gratis
          </Link>
        </p>

        {/* Demo hint */}
        <div className="mt-6 p-3 bg-wc-light-bg rounded-xl text-xs text-gray-500 text-center">
          <strong>Demo:</strong> demo@quiniela.com · demo123
          <br />El admin crea tu usuario — inicia con tu usuario y contraseña
        </div>
      </div>
    </div>
  );
}
