import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './locales/de/translation.json';
import en from './locales/en/translation.json';
import es from './locales/es/translation.json';
import fr from './locales/fr/translation.json';
import it from './locales/it/translation.json';
import ja from './locales/ja/translation.json';
import pt from './locales/pt/translation.json';
import ru from './locales/ru/translation.json';
import zh from './locales/zh/translation.json';

const resources = {
  de: { translation: de },
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
  ja: { translation: ja },
  pt: { translation: pt },
  ru: { translation: ru },
  zh: { translation: zh }
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
