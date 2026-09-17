import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import './LanguageSelector.css';

export default function LanguageSelector({ variant = 'default' }) {
  const { language, setLanguage, supportedLanguages, t } = useLanguage();

  const handleChange = (e) => {
    setLanguage(e.target.value);
  };

  return (
    <div className={`language-selector-wrapper ${variant}`}>
      <label htmlFor="lang-select" className="language-selector-label" title={t('common.language', {}, 'Language')}>
        <span className="language-globe-icon" aria-hidden="true">🌐</span>
        <span className="language-label-text">{t('common.language', {}, 'Language')}:</span>
      </label>
      <select
        id="lang-select"
        className="language-dropdown-select"
        value={language}
        onChange={handleChange}
        aria-label="Select portal display language"
      >
        {supportedLanguages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName} ({lang.name})
          </option>
        ))}
      </select>
    </div>
  );
}
