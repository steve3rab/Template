import { useEffect, useState } from 'react';

export const translations = {
  fr: {
    language: 'Langue',
    home: 'Template React, accueil',
    ready: 'Prêt à démarrer',
    eyebrow: 'VOTRE NOUVEAU PROJET',
    headingStart: 'Une base solide.',
    headingEnd: 'Prête à évoluer.',
    intro:
      'Une fondation React fortement typée, testée et automatisée pour construire votre produit sereinement.',
    counterLabel: 'COMPTEUR DE DÉMONSTRATION',
    counterDescription: 'Un exemple interactif couvert par des tests.',
    increment: 'Incrémenter',
    nextTitle: 'Prêt pour la suite',
    nextDescriptionStart: 'Le code applicatif est dans',
    nextDescriptionEnd: 'Ajoutez vos domaines fonctionnels dans',
    footerQuality: 'Qualité vérifiée automatiquement.',
    languageNames: { fr: 'Français', en: 'Anglais' },
    authTitle: 'Compte utilisateur',
    authIntro: 'Créez un compte ou connectez-vous pour tester le backend.',
    authRegister: 'Créer un compte',
    authLogin: 'Se connecter',
    authLogout: 'Se déconnecter',
    authEmail: 'Adresse e-mail',
    authPassword: 'Mot de passe',
    authSwitchRegister: 'Pas encore de compte ? Inscrivez-vous',
    authSwitchLogin: 'Déjà inscrit ? Connectez-vous',
    authWelcome: 'Connecté en tant que',
    authLoading: 'Chargement du compte…',
    authError: 'Une erreur est survenue. Réessayez.',
    authRegisterError: 'Impossible de créer le compte. Vérifiez les informations saisies ou essayez une autre adresse e-mail.',
    authLoginError: 'Adresse e-mail ou mot de passe incorrect.',
    authSuccess: 'Compte créé et connecté.',
    authPasswordHint: 'Utilisez au moins 12 caractères.',
  },
  en: {
    language: 'Language',
    home: 'Template React, home',
    ready: 'Ready to start',
    eyebrow: 'YOUR NEW PROJECT',
    headingStart: 'A solid foundation.',
    headingEnd: 'Ready to evolve.',
    intro:
      'A strongly typed, tested, and automated React foundation to build your product with confidence.',
    counterLabel: 'DEMO COUNTER',
    counterDescription: 'An interactive example covered by tests.',
    increment: 'Increment',
    nextTitle: 'Ready for what comes next',
    nextDescriptionStart: 'Application code lives in',
    nextDescriptionEnd: 'Add your feature areas in',
    footerQuality: 'Quality checked automatically.',
    languageNames: { fr: 'Français', en: 'Anglais' },
    authTitle: 'User account',
    authIntro: 'Register or sign in to try the backend.',
    authRegister: 'Create account',
    authLogin: 'Sign in',
    authLogout: 'Sign out',
    authEmail: 'Email address',
    authPassword: 'Password',
    authSwitchRegister: 'No account yet? Register',
    authSwitchLogin: 'Already registered? Sign in',
    authWelcome: 'Signed in as',
    authLoading: 'Loading account…',
    authError: 'Something went wrong. Please try again.',
    authRegisterError: 'Unable to create the account. Check your details or try another email address.',
    authLoginError: 'Incorrect email address or password.',
    authSuccess: 'Account created and signed in.',
    authPasswordHint: 'Use at least 12 characters.',
  },
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = {
  [Key in keyof typeof translations.fr]: (typeof translations.fr)[Key] extends string ? Key : never;
}[keyof typeof translations.fr];

const STORAGE_KEY = 'template-react-language';

function isLanguage(value: string | null): value is Language {
  return value === 'fr' || value === 'en';
}

function getInitialLanguage(): Language {
  try {
    const savedLanguage = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(savedLanguage)) return savedLanguage;
  } catch {
    // Storage can be disabled by browser privacy settings.
  }

  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')
    ? 'en'
    : 'fr';
}

export function useTranslation() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The language switch still works for the current session without storage.
    }
  }, [language]);

  return {
    language,
    setLanguage,
    t: (key: TranslationKey) => translations[language][key],
  };
}
