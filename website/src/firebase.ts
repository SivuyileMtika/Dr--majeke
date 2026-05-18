import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || 'AIzaSyDEgY2f6bR0qs_hfMznE3gy9JMQwtvqUjU',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || 'dr-majeke-whatapp.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || 'dr-majeke-whatapp',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'dr-majeke-whatapp.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '666995794402',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '1:666995794402:web:865e600e640879cb3d59bb',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
