import React, { createContext, useContext, useState, useCallback } from 'react';
import { translations, supportedLanguages } from './translations';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'preferred_language';

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && supportedLanguages.some((l) => l.code === saved)) {
        return saved;
      }
    } catch {
      // Fallback if localStorage is inaccessible
    }
    return 'en';
  });

  const setLanguage = useCallback((newLang) => {
    if (supportedLanguages.some((l) => l.code === newLang)) {
      setLanguageState(newLang);
      try {
        localStorage.setItem(STORAGE_KEY, newLang);
      } catch {
        // Ignore localStorage write error
      }
    }
  }, []);

  /**
   * Translates a key path into the current language, falling back to English.
   * Supports placeholder interpolation: t('header.customerGreeting', { name: 'Alice' })
   *
   * @param {string} keyPath - e.g. "nav.dashboard" or "common.logout"
   * @param {Object} [params] - interpolation parameters
   * @param {string} [fallback] - optional custom fallback text
   * @returns {string}
   */
  const t = useCallback(
    (keyPath, params = {}, fallback = null) => {
      if (!keyPath || typeof keyPath !== 'string') return '';

      const parts = keyPath.split('.');

      const lookup = (langObj) => {
        let current = langObj;
        for (const part of parts) {
          if (!current || typeof current !== 'object') return undefined;
          current = current[part];
        }
        return typeof current === 'string' ? current : undefined;
      };

      // 1. Look in selected language
      let text = lookup(translations[language]);

      // 2. Fall back to English
      if (text === undefined && language !== 'en') {
        text = lookup(translations.en);
      }

      // 3. Fall back to supplied fallback or key itself
      if (text === undefined) {
        text = fallback !== null && fallback !== undefined ? fallback : keyPath;
      }

      // 4. Parameter substitution: {name}
      if (params && typeof params === 'object') {
        let strText = String(text);
        Object.entries(params).forEach(([k, v]) => {
          strText = strText.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
        text = strText;
      }

      return text;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, supportedLanguages }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
