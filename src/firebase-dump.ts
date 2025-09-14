import { app } from './firebase'
export function dumpFirebaseEnv() {
  const info = {
    host: typeof window !== 'undefined' ? window.location.host : '(no-window)',
    projectId: String(app.options['projectId'] || ''),
    authDomain: String(app.options['authDomain'] || ''),
    apiKeyBeginsWith: String(app.options['apiKey'] || '').slice(0,7)
  }
  ;(window as any).__lastFirebaseDump = info
  try {
    console.log('FIREBASE RUNTIME JSON:', JSON.stringify(info))
  } catch {
    console.log('FIREBASE RUNTIME JSON:', info)
  }
}
