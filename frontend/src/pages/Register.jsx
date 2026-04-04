import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      toast.success('¡Cuenta creada! Bienvenido al Mundial 🏆');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh flex flex-col">
      {/* Hero */}
      <div className="bg-wc-gradient flex flex-col items-center justify-center py-12 px-6 text-white text-center">
        <div className="text-5xl mb-3">⚽</div>
        <h1 className="text-2xl font-black tracking-tight">ÚNETE A LA QUINIELA</h1>
        <p className="text-sm opacity-70 mt-1">Mundial FIFA 2026</p>
      </div>

      {/* Form */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-6 px-6 pt-8 pb-12">
        <h2 className="text-2xl font-black text-wc-dark mb-1">Crear cuenta</h2>
        <p className="text-gray-500 text-sm mb-6">Empieza a pronosticar gratis</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Nombre</label>
            <input
              name="name"
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={handleChange}
              className="input-field"
              placeholder="Tu nombre"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Email</label>
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              className="input-field"
              placeholder="tu@email.com"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Contraseña</label>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              className="input-field"
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-6 flex items-center justify-center gap-2">
            {loading ? <Spinner size="sm" color="white" /> : '🚀 Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-wc-blue font-semibold hover:underline">
            Iniciar sesión
          </Link>
        </p>

        {/* Sistema de puntos */}
        <div className="mt-6 p-4 bg-wc-light-bg rounded-xl">
          <p className="text-xs font-bold text-wc-dark mb-2">🎯 Sistema de puntos</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-amber-50 rounded-lg p-2">
              <span className="text-lg font-black text-amber-600">3</span>
              <p className="text-[10px] text-gray-500">Resultado exacto</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <span className="text-lg font-black text-wc-blue">1</span>
              <p className="text-[10px] text-gray-500">Resultado correcto</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <span className="text-lg font-black text-gray-400">0</span>
              <p className="text-[10px] text-gray-500">Resultado errado</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
