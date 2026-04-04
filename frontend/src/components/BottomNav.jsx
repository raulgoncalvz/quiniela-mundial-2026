import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Inicio',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7z" />
      </svg>
    ),
  },
  {
    to: '/quiniela',
    label: 'Quiniela',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-5a1 1 0 0 0 2 0V9a1 1 0 0 0-2 0v6zm1-8a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" clipRule="evenodd" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 5h2v6h-2V7zm0 8h2v2h-2v-2z"/>
      </svg>
    ),
  },
  {
    to: '/ranking',
    label: 'Ranking',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5zm0 2h14v14H5V5zm2 10h2v2H7v-2zm0-4h2v3H7v-3zm3 1h2v5h-2v-5zm3-3h2v8h-2v-8zm3 2h2v6h-2v-6z"/>
      </svg>
    ),
  },
  {
    to: '/perfil',
    label: 'Perfil',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-7 15a7 7 0 0 1 14 0H5z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const { isAdmin } = useAuth();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
    >
      <div className="max-w-lg mx-auto flex items-stretch">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `nav-item ${
                isActive
                  ? 'text-wc-blue'
                  : 'text-gray-400 hover:text-gray-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                  {icon}
                </span>
                <span className={`text-[10px] font-semibold tracking-wide transition-all ${isActive ? 'text-wc-blue' : 'text-gray-400'}`}>
                  {label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-wc-blue" />
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Admin shortcut */}
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `nav-item ${isActive ? 'text-wc-red' : 'text-gray-400 hover:text-gray-600'}`
            }
          >
            {({ isActive }) => (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l6 2.67V11c0 3.88-2.64 7.52-6 8.93-3.36-1.41-6-5.05-6-8.93V7.67L12 5z"/>
                </svg>
                <span className={`text-[10px] font-semibold ${isActive ? 'text-wc-red' : 'text-gray-400'}`}>
                  Admin
                </span>
              </>
            )}
          </NavLink>
        )}
      </div>
    </nav>
  );
}
