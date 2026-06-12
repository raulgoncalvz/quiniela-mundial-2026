// Círculo de avatar reutilizable: muestra la foto de perfil si existe,
// o la inicial del nombre como hasta ahora. El tamaño, color de fondo y
// estilo del texto se pasan por `className` (igual que los círculos previos).
export default function Avatar({ name, src, className = '', alt }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <div className={`rounded-full overflow-hidden flex items-center justify-center ${className}`}>
      {src ? (
        <img src={src} alt={alt || name || ''} className="w-full h-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}
