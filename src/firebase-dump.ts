import { app } from './firebase'
export function dumpFirebaseEnv() {
  // te pola są bezpieczne do logowania
  console.log('FIREBASE RUNTIME:', {
    host: window.location.host,
    authDomain: app.options['authDomain'],
    projectId: app.options['projectId'],
    apiKeyBeginsWith: String(app.options['apiKey']||'').slice(0,7) // kontrolnie, bez pełnego klucza
  })
}
