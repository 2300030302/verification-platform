import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useLanguage } from '../i18n/LanguageContext';
import LanguageSelector from '../components/LanguageSelector';
import { authAPI } from '../services/api';
import './Login.css';
import './Register.css';

export default function Register() {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

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
    setSuccess('');

    if (!name.trim() || !email.trim() || !password) {
      setError(t('auth.credsError', {}, 'All fields are required.'));
      return;
    }

    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await authAPI.register(name.trim(), email.trim(), password, role);

      if (response && response.success) {
        setSuccess(t('auth.regSuccess', {}, 'Account created successfully! Redirecting to login...'));
        setTimeout(() => {
          navigate('/login');
        }, 1500);
      } else {
        setError('Registration failed. Please try again.');
      }
    } catch (err) {
      let rawError =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Unable to complete registration. Please check your details and try again.';
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
          <div className="auth-icon">📝</div>
          <h1 className="auth-title">{t('auth.regTitle', {}, 'Create Account')}</h1>
          <p className="auth-subtitle">{t('auth.regSubtitle', {}, 'Register for the Customer Verification Portal')}</p>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="name">{t('auth.fullNameLabel', {}, 'Full Name')}</label>
            <input
              id="name"
              type="text"
              className="form-input"
              placeholder={t('auth.fullNamePlaceholder', {}, 'e.g. John Doe')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

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
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('auth.roleLabel', {}, 'Select Account Role')}</label>
            <div className="role-selection-group">
              <label className={`role-option ${role === 'customer' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="customer"
                  checked={role === 'customer'}
                  onChange={(e) => setRole(e.target.value)}
                />
                {t('auth.customerRole', {}, 'Customer')}
              </label>
              <label className={`role-option ${role === 'officer' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="officer"
                  checked={role === 'officer'}
                  onChange={(e) => setRole(e.target.value)}
                />
                {t('auth.officerRole', {}, 'Officer')}
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="auth-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? t('auth.registering', {}, 'Creating Account...') : t('auth.registerBtn', {}, 'Create Account')}
          </button>
        </form>

        <div className="auth-footer">
          {t('auth.haveAccount', {}, 'Already have an account?')}{' '}
          <Link to="/login" className="auth-link">{t('auth.signInLink', {}, 'Sign in')}</Link>
        </div>
      </div>
    </div>
  );
}
