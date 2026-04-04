/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Colores oficiales Mundial FIFA 2026
        wc: {
          blue:      '#003DA5',  // Azul primario FIFA
          'blue-dark': '#00257A',
          'blue-light': '#1A5CC8',
          red:       '#E8192C',  // Rojo vibrante
          'red-dark': '#B5001F',
          gold:      '#F5A623',  // Dorado trofeo
          'gold-dark': '#D4891A',
          dark:      '#0D1B2A',  // Fondo oscuro
          gray:      '#64748B',
          'light-bg': '#F1F5F9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'wc-gradient': 'linear-gradient(135deg, #003DA5 0%, #0D1B2A 50%, #E8192C 100%)',
        'wc-gradient-soft': 'linear-gradient(135deg, #003DA5 0%, #1A5CC8 100%)',
        'gold-gradient': 'linear-gradient(135deg, #F5A623 0%, #D4891A 100%)',
      },
      boxShadow: {
        'wc': '0 4px 20px rgba(0, 61, 165, 0.15)',
        'card': '0 2px 12px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.12)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { transform: 'translateY(16px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
