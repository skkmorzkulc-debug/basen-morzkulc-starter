import { app } from './firebase'

export function logFirebaseRuntime() {
  const info = {
    host: typeof window !== 'undefined' ? window.location.host : '(no-window)',
    projectId: String(app.options['projectId'] || ''),
    authDomain: String(app.options['authDomain'] || ''),
  }
  // zapisz też globalnie, na wszelki wypadek
  ;(window as any).__FB_RUNTIME__ = info
  console.log('DEBUG FIREBASE:', info.host, info.projectId, info.authDomain)
}
