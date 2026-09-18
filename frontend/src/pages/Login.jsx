import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useLanguage } from '../i18n/LanguageContext';
import LanguageSelector from '../components/LanguageSelector';
import { authAPI } from '../services/api';
import './Login.css';

export default function Login() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'officer') {
        navigate('/officer/dashboard', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError(t('auth.credsError', {}, 'Please enter both email and password.'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await authAPI.login(email, password);

      if (response && response.token && response.user) {
        login(response.token, response.user);

        // Redirect based on role
        const userRole = (response.user.role || '').toLowerCase();
        let destination =
          typeof location.state?.from === 'string'
            ? location.state.from
            : location.state?.from?.pathname;

        if (userRole === 'officer') {
          if (!destination || destination === '/' || destination === '/login' || !destination.startsWith('/officer')) {
            destination = '/officer/dashboard';
          }
        } else {
          if (!destination || destination === '/' || destination === '/login' || destination.startsWith('/officer')) {
            destination = '/dashboard';
          }
        }

        navigate(destination, { replace: true });
      } else {
        setError(String(t('auth.loginFailed', {}, 'Login failed. Please check your credentials.')));
      }
    } catch (err) {
      let rawError =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Unable to connect to server. Please try again later.';
      if (typeof rawError === 'object' && rawError !== null) {
        rawError = rawError.message || JSON.stringify(rawError);
      }
      setError(String(rawError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <LanguageSelector variant="auth-card-variant" />
        </div>

        <div className="auth-header">
          <div className="auth-icon">🛡️</div>
          <h1 className="auth-title">{t('auth.loginTitle', {}, 'Welcome Back')}</h1>
          <p className="auth-subtitle">{t('auth.loginSubtitle', {}, 'Sign in to your Verification Portal account')}</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">{t('auth.emailLabel', {}, 'Email Address')}</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder={t('auth.emailPlaceholder', {}, 'name@example.com')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">{t('auth.passwordLabel', {}, 'Password')}</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder={t('auth.passwordPlaceholder', {}, 'Enter your password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="auth-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? t('auth.signingIn', {}, 'Signing In...') : t('auth.signInBtn', {}, 'Sign In')}
          </button>
        </form>

        <div className="auth-footer">
          {t('auth.noAccount', {}, "Don't have an account?")}{' '}
          <Link to="/register" className="auth-link">{t('auth.createAccountLink', {}, 'Create an account')}</Link>
        </div>
      </div>
    </div>
  );
}
