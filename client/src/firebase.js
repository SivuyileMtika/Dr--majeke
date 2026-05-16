// Firebase client initialization (placeholder). Replace config with your values or env variables.
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'your-api-key',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'your-auth-domain',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'your-project-id',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'your-storage-bucket',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || 'sender-id',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || 'app-id'
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
