export default function Spinner({ size = 'md', color = 'blue' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };
  const colors = { blue: 'border-wc-blue', red: 'border-wc-red', white: 'border-white' };

  return (
    <div
      className={`${sizes[size]} ${colors[color]} animate-spin rounded-full border-2 border-t-transparent`}
      role="status"
      aria-label="Cargando"
    />
  );
}
