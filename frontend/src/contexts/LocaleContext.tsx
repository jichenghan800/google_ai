import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { translate, type SupportedLang, type TranslationKey } from '../locales/translations.ts';

type LocaleContextValue = {
  lang: SupportedLang;
  setLang: (lang: SupportedLang) => void;
  toggleLang: () => void;
  t: (key: TranslationKey, replacements?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const getInitialLang = (): SupportedLang => {
  try {
    const stored = localStorage.getItem('lang');
    if (stored === 'en' || stored === 'zh') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'zh';
};

export const LocaleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<SupportedLang>(getInitialLang);

  useEffect(() => {
    try {
      localStorage.setItem('lang', lang);
    } catch {
      // ignore storage errors
    }
    document.documentElement.setAttribute('data-lang', lang);
  }, [lang]);

  const setLang = useCallback((next: SupportedLang) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'zh' ? 'en' : 'zh'));
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      lang,
      setLang,
      toggleLang,
      t: (key, replacements) => translate(lang, key, replacements),
    }),
    [lang, setLang, toggleLang],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): LocaleContextValue => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
};
