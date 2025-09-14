cd ~/Desktop/"Aplikacja basenowa"/basen-morzkulc-starter
cat > src/main.tsx << 'EOF'
// src/main.tsx
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

import {
  doc, getDoc, setDoc, onSnapshot
} from 'firebase/firestore'

import Terminy from './pages/Terminy'
import AdminTerminy from './pages/Admin/Terminy'
import Uzytkownicy from './pages/Admin/Uzytkownicy'
import Kajaki from './pages/Admin/Kajaki'

import './index.css'

function RootApp() {
  // UŻYJEMY TEJ SAMEJ INSTANCJI APP
  const auth = getAuth(app)

  // Trwała sesja w przeglądarce + obsługa wyniku redirectu
  setPersistence(auth, browserLocalPersistence).catch(console.error)
  getRedirectResult(auth).catch((err) => {
    console.error('Google redirect error:', err)
  })

  const [user, setUser] = React.useState<any>(null)
  const [me, setMe] = React.useState<any>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)

  React.useEffect(() => {
    let profileUnsub: null | (() => void) = null

    const authUnsub = onAuthStateChanged(auth, async (u) => {
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
    signInWithRedirect(auth, provider)
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
EOF
