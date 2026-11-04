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
    authTitle: 'Votre compte',
    authIntro: 'Connectez-vous ou créez un compte pour suivre vos commandes et gérer vos adresses.',
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
    authRegisterError:
      'Impossible de créer le compte. Vérifiez les informations saisies ou essayez une autre adresse e-mail.',
    authLoginError: 'Adresse e-mail ou mot de passe incorrect.',
    authSuccess: 'Votre compte a été créé. Vous êtes connecté.',
    authPasswordHint: 'Respectez toutes les règles ci-dessous.',
    passwordRuleLength: '12 caractères minimum',
    passwordRuleUppercase: 'Une lettre majuscule',
    passwordRuleLowercase: 'Une lettre minuscule',
    passwordRuleNumber: 'Un chiffre',
    passwordRuleSpecial: 'Un caractère spécial',
    authVerificationSent:
      'Un code de vérification à 10 chiffres a été envoyé à votre adresse e-mail.',
    authVerificationCode: 'Code de vérification',
    authVerificationHint:
      'Saisissez les 10 chiffres reçus par e-mail. Le code expire après 10 minutes.',
    authVerify: 'Vérifier mon adresse e-mail',
    authChangeEmail: 'Modifier mon adresse e-mail',
    userIdentifier: 'Identifiant utilisateur',
    authReset: 'Envoyer le lien',
    authBackToLogin: 'Retour à la connexion',
    authForgotPassword: 'Mot de passe oublié ?',
    authResetNotice:
      'Si cette adresse correspond à un compte, un lien de réinitialisation sera envoyé.',
    authSubmitting: 'Veuillez patienter…',
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
    authTitle: 'Your account',
    authIntro: 'Sign in or create an account to track orders and manage your addresses.',
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
    authRegisterError:
      'Unable to create the account. Check your details or try another email address.',
    authLoginError: 'Incorrect email address or password.',
    authSuccess: 'Your account has been created. You are now signed in.',
    authPasswordHint: 'Meet every requirement below.',
    passwordRuleLength: 'At least 12 characters',
    passwordRuleUppercase: 'One uppercase letter',
    passwordRuleLowercase: 'One lowercase letter',
    passwordRuleNumber: 'One number',
    passwordRuleSpecial: 'One special character',
    authVerificationSent: 'A 10-digit verification code has been sent to your email address.',
    authVerificationCode: 'Verification code',
    authVerificationHint: 'Enter the 10 digits sent by email. The code expires after 10 minutes.',
    authVerify: 'Verify my email address',
    authChangeEmail: 'Change my email address',
    userIdentifier: 'User ID',
    authReset: 'Send reset link',
    authBackToLogin: 'Back to sign in',
    authForgotPassword: 'Forgot password?',
    authResetNotice: 'If an account exists for this address, a password reset link will be sent.',
    authSubmitting: 'Please wait…',
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
