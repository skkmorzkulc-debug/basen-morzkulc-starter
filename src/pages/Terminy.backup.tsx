// src/pages/Terminy.tsx
// • Zapis zwykły / z instruktorem
// • Wypisanie (>24h) ze zwrotem godzinki
// • Wybór kajaka z LIVE odświeżaniem (onSnapshot) — kajak znika dla innych
// • Transakcyjny przydział kajaka z ochroną przed wyścigiem

import React from 'react'
import {
  collection, onSnapshot, query, orderBy, serverTimestamp,
  doc, runTransaction, where, getDocs, updateDoc, deleteDoc
} from 'firebase/firestore'
import { db } from '../firebase'
import AttendeesList from '../components/AttendeesList'

type HourLabel = 'H1' | 'H2'

function toStartAt(dateStr: string, timeHHMM: string): Date {
  return new Date(`${dateStr}T${timeHHMM}:00`)
}
function prettyHourLabel(l: HourLabel) {
  return l === 'H1' ? 'pierwsza godzina basenowa' : 'druga godzina basenowa'
}

export default function Terminy({ user }: { user: any }) {
  const [pools, setPools] = React.useState<any[]>([])
  const [busyKey, setBusyKey] = React.useState<string>('')
  const [me, setMe] = React.useState<any>(null)

  React.useEffect(() => {
    const qy = query(collection(db, 'pools'), orderBy('date'))
    const unsub = onSnapshot(qy, (snap) => {
      const arr: any[] = []
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }))
      setPools(arr)
    })
    return () => unsub()
  }, [])

  React.useEffect(() => {
    if (!user) { setMe(null); return }
    const ref = doc(db, 'users', user.uid)
    return onSnapshot(ref, ds => setMe({ id: ds.id, ...ds.data() }))
  }, [user?.uid])

  async function book(poolId: string, hour: HourLabel, mode:'regular'|'training', instructorUid?:string) {
    if (!user) { alert('Zaloguj się przez Google'); return }
    const key = `${poolId}:${hour}:${mode}`
    setBusyKey(key)

    try {
      const poolRef = doc(db, 'pools', poolId)
      let poolSnap:any
      await new Promise<void>((resolve, reject) => {
        const unsub = onSnapshot(poolRef, snap => {
          poolSnap = { id: snap.id, ...snap.data() }
          unsub(); resolve()
        }, reject)
      })
      const hourObj = poolSnap?.hours?.find((h: any) => h.label === hour)
      const startHHMM = hourObj?.start || '21:00'
      const startAt = toStartAt(poolSnap?.date || '1970-01-01', startHHMM)

      const bookingId = `b_${poolId}_${hour}_${user.uid}`
      const bookingRef = doc(db, 'bookings', bookingId)
      const userRef = doc(db, 'users', user.uid)

      const DAY_MS = 24 * 60 * 60 * 1000
      if (Date.now() > startAt.getTime() - DAY_MS) {
        alert('Zapisy możliwe tylko > 24h przed startem.')
        setBusyKey('')
        return
      }

      await runTransaction(db, async (tx) => {
        const uSnap = await tx.get(userRef)
        if (!uSnap.exists()) throw new Error('Brak profilu użytkownika.')
        const u: any = uSnap.data()
        const current = Number(u.credits || 0)
        if (current <= 0) throw new Error('Brak godzinek. Poproś admina o doładowanie.')

        const bSnap = await tx.get(bookingRef)
        const baseData = {
          poolId, hour, uid: user.uid,
          date: poolSnap?.date || null,
          startAt,
          status: 'active' as const,
          userName: u.displayName || u.email || user.displayName || user.email || 'Uczestnik',
          userPublicRole:
            u?.roles?.instructor ? 'Instruktor' :
            u?.roles?.organizer  ? 'Organizator' :
            u?.roles?.admin      ? 'Admin' :
            u?.membership?.skkMorzkulcPaid ? 'SKK (składka)' :
            u?.membership?.zabikrukPaid    ? 'Żabi Kruk (składka)' :
            u?.membership?.jarmolowiczGroup ? 'Grupa MJ' : 'Gość',
        }

        if (!bSnap.exists()) {
          tx.set(bookingRef, {
            ...baseData,
            type: mode === 'training' ? 'training' : 'regular',
            instructorUid: mode==='training' ? (instructorUid||null) : null,
            createdAt: serverTimestamp(),
            kayakId: null
          })
        } else {
          const b:any = bSnap.data()
          if (b.status === 'active') throw new Error('Już jesteś zapisany na tę godzinę.')
          if (b.status === 'cancelled_admin') throw new Error('Ten termin został odwołany przez organizatora.')
          if (b.status === 'cancelled') {
            tx.update(bookingRef, {
              status: 'active',
              type: mode === 'training' ? 'training' : 'regular',
              instructorUid: mode==='training' ? (instructorUid||null) : null,
              createdAt: serverTimestamp()
            })
          } else {
            throw new Error('Nie można wznowić tej rezerwacji.')
          }
        }
        tx.update(userRef, { credits: current - 1 })
      })

      alert(mode==='training' ? 'Zapisano z instruktorem. Odjęto 1 godzinkę.' : 'Zapisano. Odjęto 1 godzinkę.')
    } catch (err: any) {
      console.error(err)
      alert(err?.message || 'Nie udało się zapisać.')
    } finally {
      setBusyKey('')
    }
  }

  async function addAsInstructor(poolId:string, hour:HourLabel){
    if (!user) { alert('Zaloguj się przez Google'); return }
    const key = `${poolId}:${hour}:instructor`
    setBusyKey(key)
    try {
      const poolRef = doc(db, 'pools', poolId)
      let poolSnap:any
      await new Promise<void>((resolve, reject) => {
        const unsub = onSnapshot(poolRef, snap => { poolSnap = { id:snap.id, ...snap.data() }; unsub(); resolve() }, reject)
      })
      const hourObj = poolSnap?.hours?.find((h: any) => h.label === hour)
      const startHHMM = hourObj?.start || '21:00'
      const startAt = toStartAt(poolSnap?.date || '1970-01-01', startHHMM)

      const bookingId = `b_${poolId}_${hour}_${user.uid}`
      const bookingRef = doc(db, 'bookings', bookingId)
      const userRef = doc(db, 'users', user.uid)
      const DAY_MS = 24 * 60 * 60 * 1000
      if (Date.now() > startAt.getTime() - DAY_MS) {
        alert('Dodanie jako instruktora tylko > 24h przed startem.')
        setBusyKey('')
        return
      }

      await runTransaction(db, async (tx) => {
        const uSnap = await tx.get(userRef)
        if (!uSnap.exists()) throw new Error('Brak profilu użytkownika.')
        const u:any = uSnap.data()
        const bSnap = await tx.get(bookingRef)

        const baseData = {
          poolId, hour, uid: user.uid,
          date: poolSnap?.date || null,
          startAt,
          status: 'active' as const,
          type: 'instructor' as const,
          userName: u.displayName || u.email || user.displayName || user.email || 'Instruktor',
          userPublicRole: 'Instruktor',
          kayakId: null
        }

        if (!bSnap.exists()) {
          tx.set(bookingRef, { ...baseData, createdAt: serverTimestamp(), instructorUid: null })
        } else {
          const b:any = bSnap.data()
          if (b.status === 'active' && b.type !== 'instructor') {
            throw new Error('Już masz aktywny zapis jako uczestnik.')
          } else if (b.status === 'cancelled') {
            tx.update(bookingRef, { status:'active', type:'instructor', instructorUid:null, createdAt: serverTimestamp() })
          }
        }
      })

      // +1 za bycie instruktorem (raz na dany booking)
      await runTransaction(db, async (tx) => {
        const uref = doc(db, 'users', user.uid)
        const us = await tx.get(uref)
        if (!us.exists()) throw new Error('Brak profilu instruktora.')
        const u:any = us.data()
        const current = Number(u.credits||0)
        const bk = `b_${poolId}_${hour}_${user.uid}`
        if (u.lastInstructorTeachBookingId === bk) return
        tx.update(uref, {
          credits: current + 1,
          lastInstructorTeachBookingId: bk,
          lastInstructorTeachAt: serverTimestamp()
        })
      })

      alert('Dodano jako instruktora. Przyznano +1 godzinkę.')
    } catch (e:any) {
      console.error(e)
      alert(e?.message || 'Nie udało się dodać jako instruktora.')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <div>
      <h2>Terminy</h2>
      {pools.length === 0 && <p>Brak terminów. (Admin może je dodać w panelu)</p>}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {pools.map((p: any) => (
          <li key={p.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
            <div><strong>{p.date}</strong> – {p.location}</div>

            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {Array.isArray(p.hours) && p.hours.map((h: any) => (
                <HourBlock
                  key={h.label}
                  pool={p}
                  hour={h}
                  user={user}
                  me={me}
                  busyKey={busyKey}
                  onBook={book}
                  onAddInstructor={addAsInstructor}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HourBlock({ pool, hour, user, me, busyKey, onBook, onAddInstructor }:{
  pool:any, hour:any, user:any, me:any, busyKey:string,
  onBook:(poolId:string, hour:HourLabel, mode:'regular'|'training', instructorUid?:string)=>Promise<void>,
  onAddInstructor:(poolId:string, hour:HourLabel)=>Promise<void>
}){
  const [instructors, setInstructors] = React.useState<any[]>([])
  const [instrUid, setInstrUid] = React.useState<string>('')
  const [showInstrPicker, setShowInstrPicker] = React.useState<boolean>(false)

  const [myBooking, setMyBooking] = React.useState<any>(null)
  const [cancelBusy, setCancelBusy] = React.useState(false)

  // KAJAKI – LIVE lista
  const [showKayakPicker, setShowKayakPicker] = React.useState(false)
  const [kayaksAll, setKayaksAll] = React.useState<any[]>([])
  const [takenKayakIds, setTakenKayakIds] = React.useState<Set<string>>(new Set())
  const [chosenKayak, setChosenKayak] = React.useState<string>('')

  // subskrypcja mojego bookingu
  React.useEffect(() => {
    if (!user) { setMyBooking(null); return }
    const id = `b_${pool.id}_${hour.label}_${user.uid}`
    const ref = doc(db, 'bookings', id)
    const unsub = onSnapshot(ref, ds => setMyBooking(ds.exists() ? { id: ds.id, ...ds.data() } : null))
    return () => unsub()
  }, [user?.uid, pool.id, hour.label])

  // subskrypcja instruktorów tej godziny
  React.useEffect(() => {
    const qy = query(
      collection(db, 'bookings'),
      where('poolId','==', pool.id),
      where('hour','==', hour.label),
      where('status','==','active'),
      where('type','==','instructor')
    )
    const unsub = onSnapshot(qy, snap => {
      const arr:any[] = []
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }))
      setInstructors(arr)
    })
    return () => unsub()
  }, [pool.id, hour.label])

  // LIVE: gdy picker otwarty – suby na kayaks i allocations
  React.useEffect(() => {
    if (!showKayakPicker) return

    const unsubKayaks = onSnapshot(collection(db,'kayaks'), snap => {
      const arr:any[] = []
      snap.forEach(d => {
        const k:any = d.data()
        if (k.active !== false) arr.push({ id:d.id, ...k })
      })
      setKayaksAll(arr)
    })

    const qAlloc = query(
      collection(db,'allocations'),
      where('poolId','==', pool.id),
      where('hour','==', hour.label)
    )
    const unsubAlloc = onSnapshot(qAlloc, snap => {
      const taken = new Set<string>()
      snap.forEach(d => {
        const a:any = d.data()
        taken.add(a.kayakId)
      })
      setTakenKayakIds(taken)
    })

    // wstępnie ustaw zaznaczenie na obecny kajak (jeśli jest)
    setChosenKayak(myBooking?.kayakId || '')

    return () => {
      unsubKayaks()
      unsubAlloc()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKayakPicker, pool.id, hour.label])

  const kRegular = `${pool.id}:${hour.label}:regular`
  const kWithInstr = `${pool.id}:${hour.label}:training`
  const kInstr = `${pool.id}:${hour.label}:instructor`
  const disabledRegular = busyKey===kRegular
  const disabledWithInstr = busyKey===kWithInstr
  const disabledInstr = busyKey===kInstr

  const startAt = toStartAt(pool.date, hour.start)
  const startMs = startAt.getTime()
  const DAY_MS = 24*60*60*1000
  const canCancel = myBooking?.status === 'active' && (Date.now() <= startMs - DAY_MS)

  async function refundCreditsWithRetry(bookingId:string, attempts=5, delayMs=1000){
    const userRef = doc(db, 'users', user.uid)
    for (let i=0;i<attempts;i++){
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
        return
      } catch(e:any){
        if (i===attempts-1) throw e
        await new Promise(r=>setTimeout(r, delayMs))
      }
    }
  }

  async function cancelMyBooking(){
    if (!myBooking || !canCancel) return
    setCancelBusy(true)
    try {
      await updateDoc(doc(db, 'bookings', myBooking.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp()
      })
      if (myBooking.type !== 'instructor') {
        await refundCreditsWithRetry(myBooking.id)
        if (myBooking.kayakId) {
          const allocId = `alloc_${pool.id}_${hour.label}_${myBooking.kayakId}`
          await deleteDoc(doc(db,'allocations', allocId)).catch(()=>{})
        }
        alert('Wypisano. Zwrot +1 przyznany.')
      } else {
        alert('Wypisano z roli instruktora.')
      }
    } catch(e:any){
      console.error(e)
      alert(e?.message || 'Nie udało się wypisać.')
    } finally {
      setCancelBusy(false)
    }
  }

  function openKayakPicker(){
    setShowKayakPicker(true)
    // chosenKayak ustawiany w useEffect powyżej
  }

  function availKayaks(){
    // wolne = aktywne minus zajęte (zostaw swój, jeśli już masz)
    const list = kayaksAll.filter(k => !takenKayakIds.has(k.id) || k.id === myBooking?.kayakId)
    // sortuj po nazwie
    return list.sort((a,b) => (a.name||a.id).localeCompare(b.name||b.id))
  }

  async function confirmKayak(){
    if (!myBooking) return
    if (!chosenKayak) { alert('Wybierz kajak.'); return }
    const allocId = `alloc_${pool.id}_${hour.label}_${chosenKayak}`
    const bookingRef = doc(db,'bookings', myBooking.id)
    const newAllocRef = doc(db,'allocations', allocId)

    try {
      await runTransaction(db, async (tx) => {
        const bSnap = await tx.get(bookingRef)
        if (!bSnap.exists()) throw new Error('Brak rezerwacji.')
        const b:any = bSnap.data()
        if (b.uid !== user.uid) throw new Error('To nie jest Twoja rezerwacja.')
        if (b.status !== 'active') throw new Error('Rezerwacja nieaktywna.')

        // Sprawdź czy ktoś nie zabrał kajaka w międzyczasie
        const aSnap = await tx.get(newAllocRef)
        if (aSnap.exists()) throw new Error('Ten kajak jest już zajęty dla tej godziny.')

        // Zwolnij poprzedni przydział (jeśli był i inny)
        if (b.kayakId && b.kayakId !== chosenKayak) {
          const oldAllocRef = doc(db,'allocations', `alloc_${pool.id}_${hour.label}_${b.kayakId}`)
          const oldSnap = await tx.get(oldAllocRef)
          if (oldSnap.exists()) tx.delete(oldAllocRef)
        }

        // Ustaw nowy przydział
        tx.set(newAllocRef, {
          poolId: pool.id,
          hour: hour.label,
          kayakId: chosenKayak,
          bookingId: bSnap.id,
          uid: user.uid,
          createdAt: serverTimestamp()
        })

        // Wpisz kayakId w booking
        tx.update(bookingRef, { kayakId: chosenKayak })
      })

      setShowKayakPicker(false)
      alert('Kajak przydzielony.')
    } catch (e:any) {
      console.error(e)
      alert(e?.message || 'Nie udało się przydzielić kajaka.')
    }
  }

  return (
    <div style={{ border: '1px solid #ddd', padding: 10, borderRadius: 8, minWidth: 380 }}>
      <div style={{ marginBottom: 6 }}>
        <strong>{prettyHourLabel(hour.label as HourLabel)}</strong> {hour.start}–{hour.end}
      </div>

      {myBooking?.status === 'active' ? (
        <div style={{display:'grid', gap:8}}>
          <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
            <button disabled={!canCancel || cancelBusy} onClick={cancelMyBooking}>
              {cancelBusy ? 'Wypisywanie…' : 'Wypisz się (>24h)'}
            </button>
            <span style={{fontSize:12, opacity:.8}}>
              {myBooking.type === 'instructor'
                ? 'Jesteś przypisany jako instruktor.'
                : 'Zwykły zapis – zwrot +1 przy wypisaniu.'}
            </span>
          </div>

          {myBooking.type !== 'instructor' && (
            <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              <button onClick={openKayakPicker}>
                {myBooking.kayakId ? 'Zmień kajak' : 'Wybierz kajak'}
              </button>
              <span style={{fontSize:12, opacity:.85}}>
                {myBooking.kayakId ? `Wybrany kajak: ${myBooking.kayakId}` : 'Kajak nie wybrany'}
              </span>
            </div>
          )}

          {showKayakPicker && (
            <div style={{marginTop:6, border:'1px solid #ccc', borderRadius:8, padding:10, background:'#fafafa', display:'grid', gap:8}}>
              <div style={{fontWeight:600, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span>Wybierz kajak</span>
                <span style={{fontSize:11, opacity:.7}}>lista odświeża się na żywo</span>
              </div>

              <select value={chosenKayak} onChange={e=>setChosenKayak(e.target.value)}>
                {availKayaks().length===0 ? (
                  <option value="">(Brak wolnych kajaków na tę godzinę)</option>
                ) : (
                  <>
                    <option value="">— wybierz kajak —</option>
                    {availKayaks().map(k => (
                      <option key={k.id} value={k.id}>
                        {k.name || k.id}{takenKayakIds.has(k.id) && k.id!==myBooking?.kayakId ? ' (zajęty)' : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <div style={{display:'flex', gap:8}}>
                <button disabled={!chosenKayak || (takenKayakIds.has(chosenKayak) && chosenKayak!==myBooking?.kayakId)} onClick={confirmKayak}>Potwierdź</button>
                <button onClick={()=>setShowKayakPicker(false)}>Anuluj</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
            <button
              disabled={busyKey===`${pool.id}:${hour.label}:regular`}
              onClick={()=>onBook(pool.id, hour.label as HourLabel, 'regular')}
            >
              {busyKey===`${pool.id}:${hour.label}:regular` ? 'Zapisywanie…' : 'Zapisz się (−1)'}
            </button>

            <span style={{opacity:.7}}>lub</span>

            <button
              disabled={busyKey===`${pool.id}:${hour.label}:training`}
              onClick={()=>setShowInstrPicker(true)}
              style={{background:'#fff', border:'1px solid #555', borderRadius:6, padding:'6px 10px'}}
            >
              {busyKey===`${pool.id}:${hour.label}:training` ? 'Zapisywanie…' : 'Zapisz się z instruktorem (−1)'}
            </button>

            {me?.roles?.instructor && (
              <button
                disabled={busyKey===`${pool.id}:${hour.label}:instructor`}
                onClick={()=>onAddInstructor(pool.id, hour.label as HourLabel)}
                style={{marginLeft:8, background:'#fff', border:'1px solid #999', borderRadius:6, padding:'6px 10px'}}
              >
                {busyKey===`${pool.id}:${hour.label}:instructor` ? 'Dodawanie…' : 'Dodaj się jako instruktor (+1, bez opłaty)'}
              </button>
            )}
          </div>

          {showInstrPicker && (
            <div style={{marginTop:10, padding:10, border:'1px solid #ccc', borderRadius:8, background:'#fafafa', display:'grid', gap:8, maxWidth:420}}>
              <div style={{fontWeight:600}}>Wybierz instruktora</div>
              <InstructorPicker
                poolId={pool.id}
                hour={hour.label as HourLabel}
                value={instrUid}
                onChange={setInstrUid}
              />
              <div style={{display:'flex', gap:8}}>
                <button
                  disabled={!instrUid}
                  onClick={()=>{
                    onBook(pool.id, hour.label as HourLabel, 'training', instrUid)
                    setShowInstrPicker(false)
                  }}
                >
                  Potwierdź zapis (−1)
                </button>
                <button onClick={()=>{ setShowInstrPicker(false); setInstrUid('') }}>Anuluj</button>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, opacity: .8, marginBottom: 2 }}>Zapisani:</div>
        <AttendeesList poolId={pool.id} hour={hour.label as HourLabel} />
      </div>
    </div>
  )
}

function InstructorPicker({ poolId, hour, value, onChange }:{
  poolId:string, hour:'H1'|'H2', value:string, onChange:(v:string)=>void
}){
  const [instructors, setInstructors] = React.useState<any[]>([])
  React.useEffect(() => {
    const qy = query(
      collection(db, 'bookings'),
      where('poolId','==', poolId),
      where('hour','==', hour),
      where('status','==','active'),
      where('type','==','instructor')
    )
    const unsub = onSnapshot(qy, snap => {
      const arr:any[] = []
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }))
      setInstructors(arr)
    })
    return () => unsub()
  }, [poolId, hour])
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}>
      {instructors.length===0 ? (
        <option value="">(Brak dodanych instruktorów dla tej godziny)</option>
      ) : (
        <>
          <option value="">— wybierz instruktora —</option>
          {instructors.map((i:any)=>(
            <option key={i.uid} value={i.uid}>{i.userName || 'Instruktor'}</option>
          ))}
        </>
      )}
    </select>
  )
}
