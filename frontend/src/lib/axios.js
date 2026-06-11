import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  // Render's free tier spins the backend down after inactivity, so the first
  // request can take 30-50s to wake it up. 10s was too aggressive and surfaced
  // as spurious "Error" toasts. Heavy admin operations pass their own longer
  // timeout per-request.
  timeout: 45000,
});

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 — only redirect if there was an active session (token existed)
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      const hadToken = !!localStorage.getItem('token');
      const isAuthRoute = err.config?.url?.includes('/auth/login') || err.config?.url?.includes('/auth/register');
      if (hadToken && !isAuthRoute) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
