import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import api from '../lib/axios';
import Spinner from '../components/Spinner';
import Avatar from '../components/Avatar';

// Recorta la imagen a un cuadrado centrado y la reduce a 256px en JPEG,
// para guardarla liviana (~20-30KB) como data URL en el perfil.
function compressImage(file, size = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Perfil() {
  const { user, logout, updateUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [nameForm, setNameForm] = useState({ name: user.name });
  const [passForm, setPassForm] = useState({ password: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [showPassForm, setShowPassForm] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      api.get('/predictions/stats'),
      api.get('/ranking'),
    ]).then(([statsRes, rankingRes]) => {
      setStats(statsRes.data);
      const me = rankingRes.data.find(u => u.id === user.id);
      setRanking(me);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id]);

  const handleSaveName = async e => {
    e.preventDefault();
    if (!nameForm.name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.put('/auth/profile', { name: nameForm.name.trim() });
      updateUser(data);
      setEditMode(false);
      toast.success('Nombre actualizado');
    } catch (err) {
      toast.error('Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async e => {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirm) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (passForm.newPassword.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    setSaving(true);
    try {
      await api.put('/auth/profile', { password: passForm.password, newPassword: passForm.newPassword });
      setShowPassForm(false);
      setPassForm({ password: '', newPassword: '', confirm: '' });
      toast.success('Contraseña actualizada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async e => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-subir el mismo archivo
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona una imagen');
      return;
    }
    setUploadingPhoto(true);
    try {
      const dataUrl = await compressImage(file);
      const { data } = await api.put('/auth/profile', { avatar: dataUrl });
      updateUser(data);
      toast.success('Foto actualizada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true);
    try {
      const { data } = await api.put('/auth/profile', { avatar: '' });
      updateUser(data);
      toast.success('Foto eliminada');
    } catch (err) {
      toast.error('Error al eliminar la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const statsItems = stats ? [
    { label: 'Pronósticos', value: stats.totalPredictions, icon: '📝', color: 'text-wc-blue' },
    { label: 'Exactos', value: stats.exactScores, icon: '⭐', color: 'text-amber-600' },
    { label: 'Precisión', value: `${stats.accuracy}%`, icon: '🎯', color: 'text-green-600' },
    { label: 'Posición', value: ranking ? `#${ranking.position}` : '—', icon: '🏅', color: 'text-wc-red' },
  ] : [];

  return (
    <div className="page-container page-enter">
      <h1 className="text-2xl font-black text-wc-dark mb-4">👤 Mi Perfil</h1>

      {/* Profile card */}
      <div className="bg-wc-gradient rounded-3xl p-6 mb-4 text-white text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
        <div className="relative w-24 h-24 mx-auto mb-3">
          <button
            type="button"
            onClick={() => !uploadingPhoto && fileInputRef.current?.click()}
            className="w-full h-full rounded-full block"
            title="Cambiar foto"
          >
            <Avatar
              name={user.name}
              src={user.avatar}
              className="w-24 h-24 bg-white/20 text-4xl font-black ring-4 ring-white/30"
            />
            {uploadingPhoto && (
              <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Spinner size="sm" color="white" />
              </span>
            )}
          </button>
          {/* Badge de cámara */}
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white text-wc-blue flex items-center justify-center shadow-md pointer-events-none">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M9 3l-1.5 2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.5L15 3H9zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
            </svg>
          </span>
        </div>
        {user.avatar && (
          <button
            type="button"
            onClick={handleRemovePhoto}
            disabled={uploadingPhoto}
            className="text-xs text-white/70 hover:text-white underline mb-2 disabled:opacity-50"
          >
            Quitar foto
          </button>
        )}
        <h2 className="text-xl font-black">{user.name}</h2>
        <p className="text-sm opacity-70">{user.email}</p>
        {ranking && (
          <div className="mt-3 flex justify-center gap-6 text-center">
            <div>
              <p className="text-2xl font-black">{stats?.totalPoints || 0}</p>
              <p className="text-xs opacity-70">puntos</p>
            </div>
            <div className="w-px bg-white/20" />
            <div>
              <p className="text-2xl font-black">#{ranking.position}</p>
              <p className="text-xs opacity-70">posición</p>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {statsItems.map(s => (
            <div key={s.label} className="card flex items-center gap-3">
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Points breakdown */}
      {stats && (
        <div className="card mb-4">
          <h3 className="font-bold text-sm text-wc-dark mb-3">📊 Desglose de Puntos</h3>
          <div className="space-y-2">
            {/* Match points by phase */}
            {stats.phaseBreakdown && Object.entries(stats.phaseBreakdown).map(([ph, d]) => (
              <div key={ph} className="flex justify-between text-sm">
                <span className="text-gray-500">{d.label}</span>
                <span className="font-bold text-wc-blue">{d.points} pts</span>
              </div>
            ))}
            {!stats.phaseBreakdown && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Partidos</span>
                <span className="font-bold text-wc-blue">{stats.matchPoints} pts</span>
              </div>
            )}
            {stats.groupPoints > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Posiciones de grupo</span>
                <span className="font-bold text-green-600">{stats.groupPoints} pts</span>
              </div>
            )}
            {stats.advancementPoints > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">🚀 Avances eliminatorias</span>
                <span className="font-bold text-purple-600">{stats.advancementPoints} pts</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Apuestas especiales</span>
              <span className="font-bold text-amber-600">{stats.championPoints} pts</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span className="text-wc-dark">Total</span>
              <span className="text-wc-dark">{stats.totalPoints} pts</span>
            </div>
          </div>

          {/* Knockout advancement summary */}
          {stats.knockoutAdv && Object.values(stats.knockoutAdv).some(d => d.total > 0) && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-bold text-gray-600 mb-2">⚡ Avances en eliminatorias</p>
              <div className="space-y-1.5">
                {Object.entries(stats.knockoutAdv)
                  .filter(([, d]) => d.total > 0)
                  .map(([ph, d]) => (
                    <div key={ph} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{d.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{d.correct}/{d.total} correctos</span>
                        <span className="font-bold text-wc-blue">{d.points} pts</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit name */}
      <div className="card mb-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-wc-dark">✏️ Editar nombre</h3>
          <button
            onClick={() => setEditMode(!editMode)}
            className="text-xs text-wc-blue font-semibold"
          >
            {editMode ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {editMode ? (
          <form onSubmit={handleSaveName} className="flex gap-2">
            <input
              type="text"
              value={nameForm.name}
              onChange={e => setNameForm({ name: e.target.value })}
              className="input-field flex-1 text-sm py-2"
              placeholder="Tu nombre"
              required
            />
            <button type="submit" disabled={saving} className="btn-primary py-2 px-4 text-sm">
              {saving ? <Spinner size="sm" color="white" /> : 'Guardar'}
            </button>
          </form>
        ) : (
          <p className="text-wc-dark font-semibold">{user.name}</p>
        )}
      </div>

      {/* Change password */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-wc-dark">🔐 Cambiar contraseña</h3>
          <button
            onClick={() => setShowPassForm(!showPassForm)}
            className="text-xs text-wc-blue font-semibold"
          >
            {showPassForm ? 'Cancelar' : 'Cambiar'}
          </button>
        </div>

        {showPassForm && (
          <form onSubmit={handleSavePassword} className="space-y-3">
            <input
              type="password"
              placeholder="Contraseña actual"
              value={passForm.password}
              onChange={e => setPassForm(f => ({ ...f, password: e.target.value }))}
              className="input-field text-sm py-2"
              required
            />
            <input
              type="password"
              placeholder="Nueva contraseña"
              value={passForm.newPassword}
              onChange={e => setPassForm(f => ({ ...f, newPassword: e.target.value }))}
              className="input-field text-sm py-2"
              minLength={6}
              required
            />
            <input
              type="password"
              placeholder="Confirmar nueva contraseña"
              value={passForm.confirm}
              onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))}
              className="input-field text-sm py-2"
              required
            />
            <button type="submit" disabled={saving} className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2">
              {saving ? <Spinner size="sm" color="white" /> : '🔐 Actualizar contraseña'}
            </button>
          </form>
        )}
      </div>

      {/* Account info */}
      <div className="card mb-4 bg-wc-light-bg space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Email</span>
          <span className="font-semibold text-wc-dark text-right truncate max-w-[200px]">{user.email}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Tipo de cuenta</span>
          <span className="font-semibold text-wc-dark capitalize">{user.role === 'admin' ? '🛡️ Admin' : '👤 Usuario'}</span>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={() => { logout(); toast.success('Sesión cerrada'); }}
        className="btn-red w-full flex items-center justify-center gap-2"
      >
        🚪 Cerrar sesión
      </button>

      <p className="text-center text-xs text-gray-400 mt-6">
        Quiniela Mundial 2026 · FIFA World Cup USA/CAN/MEX
      </p>
    </div>
  );
}
