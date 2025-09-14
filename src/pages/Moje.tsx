// src/pages/Moje.tsx — anulowanie (>24h) + automatyczny zwrot +1 z retry
import React from 'react'
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, serverTimestamp, runTransaction
} from 'firebase/firestore'
import { db } from '../firebase'

// Pomocnicze: konwersja na ms dla Timestamp/Date/string
function toMillis(v: any) {
  if (!v) return null
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

export default function Moje({ user }: { user: any }) {
  const [bookings, setBookings] = React.useState<any[]>([])
  const [credits, setCredits] = React.useState<number>(0)
  const [busyId, setBusyId] = React.useState<string>('')

  React.useEffect(() => {
    if (!user) return

    // Moje rezerwacje (status przefiltrujemy w UI)
    const q = query(collection(db, 'bookings'), where('uid', '==', user.uid))
    const unsubB = onSnapshot(q, (snap) => {
      const arr: any[] = []
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }))
      // aktywne na górze
      arr.sort((a, b) => String(a.status).localeCompare(String(b.status)))
      setBookings(arr)
    })

    // Moje credits
    const uref = doc(db, 'users', user.uid)
    const unsubU = onSnapshot(uref, (ds) => {
      setCredits(((ds.data() as any)?.credits) || 0)
    })

    return () => { unsubB(); unsubU() }
  }, [user?.uid])

  if (!user) return <div>Zaloguj się przez Google.</div>

  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000

  // Można wypisać się tylko > 24h przed startem i tylko ze statusu 'active'
  function canCancel(b: any) {
    const start = toMillis(b.startAt)
    if (!start) return false
    return b.status === 'active' && (start - now) >= DAY_MS
  }

  // Zwrot +1 po anulowaniu — z powtórkami, gdyby reguły nie zdążyły „zobaczyć” cancelledAt
  async function refundCreditsWithRetry(bookingId: string, attempts = 5, delayMs = 1000) {
    const userRef = doc(db, 'users', user.uid)
    for (let i = 0; i < attempts; i++) {
      try {
        await runTransaction(db, async tx => {
          const usnap = await tx.get(userRef)
          if (!usnap.exists()) throw new Error('Brak profilu użytkownika.')
          const current = Number((usnap.data() as any).credits || 0)
          tx.update(userRef, {
            credits: current + 1,
            lastRefundBookingId: bookingId,
            lastRefundAt: serverTimestamp()
          })
        })
        return // sukces
      } catch (e: any) {
        if (i === attempts - 1) throw e
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }

  async function cancelBooking(b: any) {
    if (!canCancel(b)) return
    setBusyId(b.id)
    try {
      // 1) Anuluj rezerwację (reguły: tylko >24h i tylko status+cancelledAt)
      await updateDoc(doc(db, 'bookings', b.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp()
      })
      // 2) Zwrot +1 (reguły sprawdzają: booking = cancelled oraz świeży cancelledAt)
      await refundCreditsWithRetry(b.id)
      alert('Wypisano z zajęć. Zwrot +1 przyznany.')
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Nie udało się wypisać/zwrotu.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div>
      <h2>Moje</h2>

      <div style={{ margin: '8px 0', padding: '8px 12px', border: '1px solid #eee', borderRadius: 8 }}>
        <div><b>{user.displayName || user.email}</b></div>
        <div>Godzinki (credits): <b>{credits}</b></div>
      </div>

      {bookings.length === 0 ? (
        <p>Brak zapisów.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {bookings.map(b => {
            const startMs = toMillis(b.startAt)
            const startTxt = startMs ? new Date(startMs).toLocaleString() : '(brak startu)'
            const disabled = !canCancel(b) || busyId === b.id
            return (
              <li key={b.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                <div><b>{b.date || '(brak daty)'}</b> – {b.hour} — start: {startTxt}</div>
                <div style={{ fontSize: 12, opacity: .8, margin: '4px 0' }}>Status: {b.status}</div>
                <button disabled={disabled} onClick={() => cancelBooking(b)}>
                  {busyId === b.id ? 'Wypisywanie…' : 'Wypisz się (>24h, zwrot +1)'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
