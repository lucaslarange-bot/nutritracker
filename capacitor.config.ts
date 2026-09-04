import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'store.nutritracker.app',
  appName: 'TrackCalori',
  webDir: 'public',
  ios: {
    contentInset: 'automatic',
    // Empêche le zoom accidentel et garde le rendu net sur écrans Retina
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false
  },
  server: {
    // En dev seulement : décommente pour pointer sur ton site live pendant les tests
    // url: 'https://nutritracker.store',
    // cleartext: false
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#10b981',
      androidSplashResourceName: 'splash',
      showSpinner: false
    }
  }
};

export default config;
