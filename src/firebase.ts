// UZUPEŁNIJ TĘ KONFIGURACJĘ DANYMI Z Firebase Console -> Project settings -> Your apps (Web)
// window._FIREBASE_CONFIG lub firebaseConfig obiekt
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: "AIzaSyBDOI9ogqvefxEhzS_EHJ9EH1uEjeQgkuM",
  authDomain: "basen-morzkulc-7564a.firebaseapp.com",
  projectId: "basen-morzkulc-7564a",
storageBucket: "basen-morzkulc-c2a81.appspot.com",

  messagingSenderId: "396983396222",
  appId: "1:396983396222:web:c79360de6acd53ea65f52f"
};

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app, 'europe-central2') // Polska strefa
