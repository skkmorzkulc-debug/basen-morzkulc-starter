import { logFirebaseRuntime } from './_debug-log'
if (typeof window !== 'undefined') { logFirebaseRuntime() }
import { dumpFirebaseEnv } from './firebase-dump'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'

import { app, db } from './firebase'
import {
  getAuth,
  onAuthStateChanged,
  signInWithRedirect,
  GoogleAuthProvider,
  signOut,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'

import Terminy from './pages/Terminy'
import AdminTerminy from './pages/Admin/Terminy'
import Uzytkownicy from './pages/Admin/Uzytkownicy'
import Kajaki from './pages/Admin/Kajaki'

import './index.css'

function RootApp() {
  const auth = getAuth(app)

  // Trwała sesja
  setPersistence(auth, browserLocalPersistence).catch((e) => {
    console.error('setPersistence error:', e)
    alert('setPersistence error: ' + (e?.code || e?.message || e))
  })

  // Obsługa wyniku redirectu po powrocie z Google
  getRedirectResult(auth)
    .then((res) => {
      console.log('getRedirectResult:', res)
    })
    .catch((err) => {
      console.error('Google redirect error:', err?.code, err?.message)
      alert(`Google redirect error: ${err?.code || ''} ${err?.message || ''}`)
    })

  const [user, setUser] = React.useState<any>(null)
  const [me, setMe] = React.useState<any>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)

  React.useEffect(() => {
    let profileUnsub: null | (() => void) = null

    const authUnsub = onAuthStateChanged(auth, async (u) => {
      console.log('onAuthStateChanged user =', u?.email || null)
      if (profileUnsub) { profileUnsub(); profileUnsub = null }

      setUser(u || null)

      if (u) {
        const uref = doc(db, 'users', u.uid)
        const snap = await getDoc(uref)
        if (!snap.exists()) {
          await setDoc(uref, {
            uid: u.uid,
            email: u.email || null,
            displayName: u.displayName || null,
            credits: 0,
            status: 'pending',
            roles: { admin:false, organizer:false, instructor:false },
            membership: {
              skkMorzkulcPaid:false,
              zabikrukPaid:false,
              jarmolowiczGroup:false
            },
            createdAt: new Date()
          })
        }

        profileUnsub = onSnapshot(uref, (ds) => {
          const data: any = ds.data() || {}
          setMe({ id: ds.id, ...data })
          setIsAdmin(!!data?.roles?.admin)
        })
      } else {
        setMe(null)
        setIsAdmin(false)
      }
    })

    return () => {
      authUnsub()
      if (profileUnsub) profileUnsub()
    }
  }, [auth])

  function login() {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    console.log('LOGIN CLICK', {
      origin: window.location.origin,
      authDomain: app.options['authDomain'],
    })
    signInWithRedirect(auth, provider).catch((err) => {
      console.error('signInWithRedirect error:', err?.code, err?.message)
      alert(`signInWithRedirect error: ${err?.code || ''} ${err?.message || ''}`)
    })
  }

  function logout() {
    signOut(auth)
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">Basen Morzkulc</div>

          <nav className="nav">
            <Link to="/terminy">Terminy</Link>
            {isAdmin && <Link to="/admin/terminy">Admin: Terminy</Link>}
            {isAdmin && <Link to="/admin/uzytkownicy">Admin: Użytkownicy</Link>}
            {isAdmin && <Link to="/admin/kajaki">Admin: Kajaki</Link>}
          </nav>

          <div className="userbox">
            {me && (
              <>
                <span className="user-credits">wykupione: <strong>{me.credits || 0}</strong></span>
                {me.status !== 'active' && (
                  <span className="badge" title="Admin musi zatwierdzić konto">
                    {me.status === 'pending' ? 'oczekuje na akceptację' : 'konto zarchiwizowane'}
                  </span>
                )}
              </>
            )}
            {user
              ? <>Witaj, {user.displayName || user.email} <button className="btn-ghost" onClick={logout} style={{marginLeft:8}}>Wyloguj</button></>
              : <button className="btn-outline" onClick={login}>Zaloguj</button>}
          </div>
        </div>

        <div className="section">
          <Routes>
            <Route path="/" element={<Navigate to="/terminy" />} />
            <Route path="/terminy" element={<Terminy user={user} />} />
            <Route path="/admin/terminy" element={isAdmin ? <AdminTerminy/> : <Navigate to="/terminy" />} />
            <Route path="/admin/uzytkownicy" element={isAdmin ? <Uzytkownicy/> : <Navigate to="/terminy" />} />
            <Route path="/admin/kajaki" element={isAdmin ? <Kajaki/> : <Navigate to="/terminy" />} />
            <Route path="*" element={<Navigate to="/terminy" />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
)

// RUNTIME DUMP
if (typeof window !== 'undefined') { dumpFirebaseEnv() }

// RUNTIME DUMP
if (typeof window !== 'undefined') { dumpFirebaseEnv() }
