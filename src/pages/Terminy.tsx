// src/pages/Terminy.tsx
// • Zapis zwykły / z instruktorem / sauna
// • Potwierdzenie (window.confirm) TYLKO przy zapisie <24h przed startem
// • Brak „alertów” dla odwracalnych akcji: zapis >24h i wybór/zmiana kajaka
// • Instruktor: +1 dopiero po „Odbierz +1 za szkolenie” (gdy są kursanci)
// • Wypisanie (>24h) ze zwrotem +1 (dla regular/training/sauna; instruktor bez zwrotu)
// • Kajaki + „Kajak prywatny” (nie blokuje puli); klubowe blokowane w allocations
// • Lista zapisanych

import React from 'react'
import {
  collection, onSnapshot, query, orderBy, serverTimestamp,
  doc, runTransaction, where, updateDoc, deleteDoc
} from 'firebase/firestore'
import { db } from '../firebase'
import AttendeesList from '../components/AttendeesList'
import type { HourLabel } from '../types';

const PRIVATE_KAYAK_ID = 'PRIVATE'
const DAY_MS = 24*60*60*1000

function toStartAt(dateStr:string, timeHHMM:string){ return new Date(`${dateStr}T${timeHHMM}:00`) }
function prettyHourLabel(l:HourLabel){
  if (l==='H1') return 'pierwsza godzina basenowa'
  if (l==='H2') return 'druga godzina basenowa'
  return 'sauna'
}

export default function Terminy({ user }:{ user:any }){
  const [pools, setPools] = React.useState<any[]>([])
  const [busy, setBusy] = React.useState<string>('')
  const [me, setMe] = React.useState<any>(null)

  React.useEffect(() => {
    const qy = query(collection(db,'pools'), orderBy('date'))
    return onSnapshot(qy, snap => {
      const arr:any[] = []
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }))
      setPools(arr)
    })
  }, [])

  React.useEffect(() => {
    if (!user){ setMe(null); return }
    const ref = doc(db,'users',user.uid)
    return onSnapshot(ref, ds => setMe({ id:ds.id, ...ds.data() }))
  }, [user?.uid])

  async function book(pool:any, hour:HourLabel, mode:'regular'|'training'|'sauna', instructorUid?:string){
    if (!user) { alert('Zaloguj się przez Google'); return }
if (me?.status !== 'active') { alert('Twoje konto czeka na akceptację przez admina.'); setBusy(''); return }

    const startHHMM = hour==='SAUNA' ? '21:00' : (pool?.hours?.find((h:any)=>h.label===hour)?.start || '21:00')
    const startAt = toStartAt(pool?.date||'1970-01-01', startHHMM)
    const within24h = Date.now() > startAt.getTime() - DAY_MS

    // ✅ TYLKO <24h: dodatkowe potwierdzenie
    if (within24h) {
      const msg = hour==='SAUNA'
        ? 'Zapis na saunę jest krócej niż 24h przed startem — nie będzie możliwości wypisania. Kontynuować?'
        : 'Zapis jest krócej niż 24h przed startem — nie będzie możliwości wypisania. Kontynuować?'
      if (!window.confirm(msg)) return
    }

    const key = `${pool.id}:${hour}:${mode}`; setBusy('')

    try {
      const bookingId = `b_${pool.id}_${hour}_${user.uid}`
      const bookingRef = doc(db,'bookings', bookingId)
      const userRef = doc(db,'users', user.uid)

      await runTransaction(db, async (tx) => {
        const uSnap = await tx.get(userRef)
        if (!uSnap.exists()) throw new Error('Brak profilu użytkownika.')
        const u:any = uSnap.data()
        const current = Number(u.credits||0)
        if (current <= 0) throw new Error('Brak wykupionych godzin.')

        const bSnap = await tx.get(bookingRef)
        const baseData:any = {
          poolId: pool.id, hour, uid:user.uid,
          date: pool.date, startAt, status:'active',
          userName: u.displayName || u.email || user.displayName || user.email || 'Uczestnik',
          userPublicRole:
            u?.roles?.instructor ? 'Instruktor' :
            u?.roles?.organizer  ? 'Organizator' :
            u?.roles?.admin      ? 'Admin' :
            u?.membership?.skkMorzkulcPaid ? 'SKK (składka)' :
            u?.membership?.zabikrukPaid    ? 'Żabi Kruk (składka)' :
            u?.membership?.jarmolowiczGroup ? 'Grupa MJ' : 'Gość',
          createdAt: serverTimestamp(),
          kayakId: null,
        }

        const targetType = mode==='sauna' ? 'sauna' : (mode==='training' ? 'training' : 'regular')
        if (!bSnap.exists()){
          tx.set(bookingRef, { ...baseData, type: targetType, instructorUid: instructorUid||null })
        } else {
          const b:any = bSnap.data()
          if (b.status === 'active') throw new Error('Już masz aktywny zapis.')
          tx.update(bookingRef, { status:'active', type:targetType, instructorUid: instructorUid||null, createdAt: serverTimestamp() })
        }
        tx.update(userRef, { credits: current - 1 })

        // UWAGA: brak +1 dla instruktora tutaj. Instruktor odbiera sam przyciskiem, gdy ma kursantów.
      })

      // ✅ Brak alertu po sukcesie (odwracalny >24h). UI samo odświeży stan.
    } catch(e:any){
      console.error(e); alert(e?.message || 'Nie udało się zapisać.')
    } finally { setBusy('') }
  }

  return (
    <div>
      <h2>Terminy</h2>
      {pools.length===0 && <p>Brak terminów.</p>}

      {me && me.status !== 'active' && (
  <div className="card" style={{padding:12, marginBottom:12}}>
    Twoje konto ma status: <strong>{me.status}</strong>. Admin musi je zatwierdzić, zanim zaczniesz się zapisywać.
  </div>
)}
<ul style={{listStyle:'none', padding:0, display:'grid', gap:12}}>
        {pools.map((p:any)=>(
          <li key={p.id} className="card" style={{padding:12}}>
            <div><strong>{p.date}</strong> – {p.location}</div>

            <div style={{display:'flex', gap:16, marginTop:10, flexWrap:'wrap'}}>
              {Array.isArray(p.hours) && p.hours.map((h:any)=>(
                <HourBlock
                  key={h.label}
                  pool={p}
                  hourLabel={h.label as HourLabel}
                  hourStart={h.start}
                  hourEnd={h.end}
                  user={user}
                  me={me}
                  busy={busy}
                  onBook={(mode, instr)=>book(p, h.label as HourLabel, mode, instr)}
                />
              ))}

              {p.saunaEnabled && (
                <HourBlock
                  key="SAUNA"
                  pool={p}
                  hourLabel="SAUNA"
                  hourStart="21:00"
                  hourEnd="22:30"
                  user={user}
                  me={me}
                  busy={busy}
                  onBook={(mode)=>book(p, 'SAUNA', 'sauna')}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HourBlock({
  pool, hourLabel, hourStart, hourEnd, user, me, busy,
  onBook
}:{
  pool:any, hourLabel:HourLabel, hourStart:string, hourEnd:string,
  user:any, me:any, busy:string,
  onBook:(mode:'regular'|'training'|'sauna', instructorUid?:string)=>void
}){
  const [myBooking, setMyBooking] = React.useState<any>(null)
  const [cancelBusy, setCancelBusy] = React.useState(false)
  const [showInstr, setShowInstr] = React.useState(false)
  const [instrUid, setInstrUid] = React.useState('')

  // KAJAKI
  const [showKayakPicker, setShowKayakPicker] = React.useState(false)
  const [kayaksAll, setKayaksAll] = React.useState<any[]>([])
  const [takenKayakIds, setTakenKayakIds] = React.useState<Set<string>>(new Set())
  const [chosenKayak, setChosenKayak] = React.useState<string>('')
  const [kayakName, setKayakName] = React.useState<string>('')

  // Instruktor – własny przycisk
  const [addInstrBusy, setAddInstrBusy] = React.useState(false)

  // NOWE: liczba przypisanych kursantów (dla tej godziny)
  const [studentsCount, setStudentsCount] = React.useState<number>(0)

  React.useEffect(() => {
    if (!user){ setMyBooking(null); return }
    const id = `b_${pool.id}_${hourLabel}_${user.uid}`
    const ref = doc(db, 'bookings', id)
    return onSnapshot(ref, ds => setMyBooking(ds.exists()? { id:ds.id, ...ds.data() } : null))
  }, [user?.uid, pool.id, hourLabel])

  // nazwa kajaka
  React.useEffect(() => {
    if (!myBooking?.kayakId){ setKayakName(''); return }
    if (myBooking.kayakId === PRIVATE_KAYAK_ID){ setKayakName('Kajak prywatny'); return }
    const kref = doc(db, 'kayaks', myBooking.kayakId)
    const unsub = onSnapshot(kref, snap => {
      setKayakName(snap.exists() ? ((snap.data() as any).name || myBooking.kayakId) : myBooking.kayakId)
    }, () => setKayakName(myBooking.kayakId))
    return () => unsub()
  }, [myBooking?.kayakId])

  // jeśli jestem instruktorem: policz kursantów przypisanych do mnie
  React.useEffect(() => {
    if (!me?.roles?.instructor) { setStudentsCount(0); return }
    const qy = query(
      collection(db,'bookings'),
      where('poolId','==', pool.id),
      where('hour','==', hourLabel),
      where('status','==','active'),
      where('type','==','training'),
      where('instructorUid','==', user?.uid || '')
    )
    return onSnapshot(qy, snap => {
      let n = 0; snap.forEach(()=>n++)
      setStudentsCount(n)
    })
  }, [me?.roles?.instructor, user?.uid, pool.id, hourLabel])

  const startAt = toStartAt(pool.date, hourStart)
  const canCancel = myBooking?.status==='active' && (Date.now() <= startAt.getTime() - DAY_MS)
  const isSauna = hourLabel==='SAUNA'

  async function refund(){
    if (!user || !myBooking) return
    const uref = doc(db,'users',user.uid)
    await runTransaction(db, async tx => {
      const us = await tx.get(uref)
      const cur = Number((us.data() as any)?.credits||0)
      tx.update(uref, { credits: cur + 1, lastRefundBookingId: myBooking.id, lastRefundAt: serverTimestamp() })
    })
  }

  async function cancel(){
    if (!canCancel) return
    setCancelBusy(true)
    try{
      await updateDoc(doc(db,'bookings', myBooking.id), { status:'cancelled', cancelledAt: serverTimestamp() })
      if (myBooking.type !== 'instructor'){ await refund() }
      if (myBooking.kayakId && myBooking.kayakId !== PRIVATE_KAYAK_ID){
        const allocId = `alloc_${pool.id}_${hourLabel}_${myBooking.kayakId}`
        await deleteDoc(doc(db,'allocations', allocId)).catch(()=>{})
      }
      // Zostawiamy alert dla wypisania (to jest istotny feedback).
      alert(isSauna ? 'Wypisano z sauny (+1).' : 'Wypisano (+1).')
    }catch(e:any){
      console.error(e); alert(e?.message || 'Nie udało się wypisać.')
    }finally{ setCancelBusy(false) }
  }

  /** --- KAJAK PICKER --- */
  function openKayakPicker(){ setShowKayakPicker(true) }

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
      where('hour','==', hourLabel)
    )
    const unsubAlloc = onSnapshot(qAlloc, snap => {
      const taken = new Set<string>()
      snap.forEach(d => {
        const a:any = d.data(); taken.add(a.kayakId)
      })
      setTakenKayakIds(taken)
    })
    setChosenKayak(myBooking?.kayakId || '')
    return () => { unsubKayaks(); unsubAlloc() }
  }, [showKayakPicker, pool.id, hourLabel, myBooking?.kayakId])

  function availKayaks(){
    const list = kayaksAll
      .filter(k => !takenKayakIds.has(k.id) || k.id === myBooking?.kayakId)
      .sort((a,b)=>(a.name||a.id).localeCompare(b.name||b.id))
    list.push({ id: PRIVATE_KAYAK_ID, name: 'Kajak prywatny' })
    return list
  }

  async function confirmKayak(){
    if (!myBooking) return
    if (!chosenKayak){ alert('Wybierz kajak.'); return }

    const bookingRef = doc(db,'bookings', myBooking.id)

    if (chosenKayak === PRIVATE_KAYAK_ID){
      if (myBooking.kayakId && myBooking.kayakId !== PRIVATE_KAYAK_ID){
        const allocIdOld = `alloc_${pool.id}_${hourLabel}_${myBooking.kayakId}`
        await deleteDoc(doc(db,'allocations', allocIdOld)).catch(()=>{})
      }
      await updateDoc(bookingRef, { kayakId: PRIVATE_KAYAK_ID })
      setKayakName('Kajak prywatny')
      setShowKayakPicker(false)
      // ✅ brak alertu – odwracalne
      return
    }

    const newAllocRef = doc(db,'allocations', `alloc_${pool.id}_${hourLabel}_${chosenKayak}`)
    try{
      await runTransaction(db, async tx => {
        const bSnap = await tx.get(bookingRef)
        if (!bSnap.exists()) throw new Error('Brak rezerwacji.')
        const b:any = bSnap.data()
        if (b.uid !== user.uid) throw new Error('To nie jest Twoja rezerwacja.')
        if (b.status !== 'active') throw new Error('Rezerwacja nieaktywna.')

        const aSnap = await tx.get(newAllocRef)
        if (aSnap.exists()) throw new Error('Ten kajak jest już zajęty dla tej godziny.')

        if (b.kayakId && b.kayakId !== chosenKayak && b.kayakId !== PRIVATE_KAYAK_ID){
          tx.delete(doc(db,'allocations', `alloc_${pool.id}_${hourLabel}_${b.kayakId}`))
        }
        tx.set(newAllocRef, {
          poolId: pool.id, hour: hourLabel, kayakId: chosenKayak,
          bookingId: bSnap.id, uid: user.uid, createdAt: serverTimestamp()
        })
        tx.update(bookingRef, { kayakId: chosenKayak })
      })
      const k = kayaksAll.find(k=>k.id===chosenKayak)
      setKayakName(k?.name || chosenKayak)
      setShowKayakPicker(false)
      // ✅ brak alertu – odwracalne
    }catch(e:any){
      console.error(e); alert(e?.message || 'Nie udało się przydzielić kajaka.')
    }
  }

  /** --- DODAJ MNIE JAKO INSTRUKTORA (bez +1) --- */
  async function addMeAsInstructor(){
    if (!user) return
    setAddInstrBusy(true)
    try{
      const bookingId = `b_${pool.id}_${hourLabel}_${user.uid}`
      const bookingRef = doc(db,'bookings', bookingId)
      const userRef = doc(db,'users', user.uid)

      await runTransaction(db, async tx => {
        const us = await tx.get(userRef)
        if (!us.exists()) throw new Error('Brak profilu użytkownika.')
        const u:any = us.data()

        const bs = await tx.get(bookingRef)
        if (bs.exists()){
          const b:any = bs.data()
          if (b.status==='active' && b.type!=='instructor') throw new Error('Masz już aktywny zapis na tę godzinę.')
        }

        if (!bs.exists()){
          tx.set(bookingRef, {
            poolId: pool.id, hour: hourLabel, uid: user.uid,
            date: pool.date, startAt: toStartAt(pool.date, hourStart),
            status:'active', type:'instructor',
            userName: u.displayName || u.email || 'Instruktor',
            userPublicRole: 'Instruktor',
            createdAt: serverTimestamp(),
            instructorUid: null,
            kayakId: null
          })
        } else {
          tx.update(bookingRef, { status:'active', type:'instructor', createdAt: serverTimestamp(), instructorUid:null })
        }
      })

      // ✅ brak alertu (odwracalne >24h); UI odświeży stan
    }catch(e:any){
      console.error(e); alert(e?.message || 'Nie udało się dodać jako instruktora.')
    }finally{
      setAddInstrBusy(false)
    }
  }

  /** --- ODBIERZ +1 ZA SZKOLENIE (tylko raz na tę godzinę) --- */
  async function claimInstructorCredit(){
    if (!me?.roles?.instructor) return
    const teachKey = `teach_${pool.id}_${hourLabel}`

    try{
      await runTransaction(db, async tx => {
        const uref = doc(db,'users', user.uid)
        const us = await tx.get(uref)
        if (!us.exists()) throw new Error('Brak profilu instruktora.')
        const u:any = us.data() || {}
        const already = u.teachCredits && u.teachCredits[teachKey] === true
        if (already) throw new Error('Kredyt za tę godzinę już odebrany.')

        const cur = Number(u.credits||0)
        tx.update(uref, {
          credits: cur + 1,
          [`teachCredits.${teachKey}`]: true,
          lastInstructorTeachAt: serverTimestamp()
        })
      })
      alert('+1 za szkolenie przyznany.')
    }catch(e:any){
      console.error(e); alert(e?.message || 'Nie udało się przyznać +1.')
    }
  }

  const keyBase = `${pool.id}:${hourLabel}:`
  const canShowClaim =
    !!me?.roles?.instructor &&
    myBooking?.status==='active' &&
    myBooking?.type==='instructor' &&
    studentsCount > 0 &&
    !(me?.teachCredits && me.teachCredits[`teach_${pool.id}_${hourLabel}`] === true)

  return (
    <div className="card hour-block">
      <div style={{ marginBottom: 6 }}>
        <strong>{prettyHourLabel(hourLabel)}</strong> {hourStart}–{hourEnd}
      </div>

      {myBooking?.status==='active' ? (
        <div style={{display:'grid', gap:10}}>
          <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
            <button disabled={!canCancel || cancelBusy} onClick={cancel}>
              {cancelBusy ? 'Wypisywanie…' : 'Wypisz się (>24h)'}
            </button>
            <span className="small">
              {hourLabel==='SAUNA' ? 'Zapis na saunę (nie wpływa na limity).' :
               (myBooking.type==='instructor'
                  ? `Jesteś instruktorem${studentsCount>0 ? ` — kursantów: ${studentsCount}` : ''}.`
                  : 'Zwykły zapis – zwrot +1 przy wypisaniu.' )}
            </span>
          </div>

          {canShowClaim && (
            <div>
              <button className="btn-outline" onClick={claimInstructorCredit}>
                Odbierz +1 za szkolenie
              </button>
            </div>
          )}

          {hourLabel!=='SAUNA' && myBooking.type !== 'instructor' && (
            <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
              <button onClick={()=>setShowKayakPicker(true)}>
                {myBooking.kayakId ? 'Zmień kajak' : 'Wybierz kajak'}
              </button>
              <span className="small">
                {myBooking.kayakId ? `Wybrany kajak: ${kayakName || myBooking.kayakId}` : 'Kajak nie wybrany'}
              </span>
            </div>
          )}

          {showKayakPicker && (
            <div className="picker" style={{marginTop:6, display:'grid', gap:8}}>
              <div style={{fontWeight:600, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span>Wybierz kajak</span>
                <span className="small">lista odświeża się na żywo</span>
              </div>

              <select value={chosenKayak} onChange={e=>setChosenKayak(e.target.value)}>
                {availKayaks().length===0 ? (
                  <option value="">(Brak wolnych kajaków na tę godzinę)</option>
                ) : (
                  <>
                    <option value="">— wybierz kajak —</option>
                    {availKayaks().map(k => (
                      <option key={k.id} value={k.id}>
                        {k.name || k.id}
                        {(k.id!==PRIVATE_KAYAK_ID && takenKayakIds.has(k.id) && k.id!==myBooking?.kayakId) ? ' (zajęty)' : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <div style={{display:'flex', gap:8}}>
                <button
                  disabled={!chosenKayak || (chosenKayak!==PRIVATE_KAYAK_ID && takenKayakIds.has(chosenKayak) && chosenKayak!==myBooking?.kayakId)}
                  onClick={confirmKayak}
                >
                  Potwierdź
                </button>
                <button className="btn-outline" onClick={()=>setShowKayakPicker(false)}>Anuluj</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 6 }}>
            <div className="small" style={{marginBottom:2}}>Zapisani:</div>
            <AttendeesList poolId={pool.id} hour={hourLabel} />
          </div>
        </div>
      ) : (
        <>
          <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
            {hourLabel!=='SAUNA' ? (
              <>
                <button
                  disabled={busy===keyBase+'regular'}
                  onClick={()=>onBook('regular')}
                >
                  {busy===keyBase+'regular' ? 'Zapisywanie…' : 'Zapisz się (−1)'}
                </button>

                <span className="small" style={{opacity:.7}}>lub</span>

                <button
                  disabled={busy===keyBase+'training'}
                  onClick={()=>setShowInstr(true)}
                  className="btn-outline"
                >
                  {busy===keyBase+'training' ? 'Zapisywanie…' : 'Zapisz się z instruktorem (−1)'}
                </button>

                {me?.roles?.instructor && (
                  <button
                    className="btn-outline"
                    disabled={addInstrBusy}
                    onClick={addMeAsInstructor}
                    title="Dodaj bez pobrania kredytu"
                  >
                    {addInstrBusy ? 'Dodawanie…' : 'Dodaj się jako instruktor'}
                  </button>
                )}
              </>
            ) : (
              <button
                disabled={busy===keyBase+'sauna'}
                onClick={()=>onBook('sauna')}
              >
                {busy===keyBase+'sauna' ? 'Zapisywanie…' : 'Zapisz się na saunę (−1)'}
              </button>
            )}
          </div>

          {showInstr && hourLabel!=='SAUNA' && (
            <InstructorPicker poolId={pool.id} hour={hourLabel as 'H1'|'H2'} value={instrUid} onChange={setInstrUid}>
              <div style={{display:'flex', gap:10, marginTop:8}}>
                <button disabled={!instrUid} onClick={()=>{ onBook('training', instrUid); setShowInstr(false) }}>Potwierdź (−1)</button>
                <button className="btn-outline" onClick={()=>setShowInstr(false)}>Anuluj</button>
              </div>
            </InstructorPicker>
          )}

          <div style={{marginTop:10}}>
            <div className="small" style={{marginBottom:2}}>Zapisani:</div>
            <AttendeesList poolId={pool.id} hour={hourLabel} />
          </div>
        </>
      )}
    </div>
  )
}

function InstructorPicker({ poolId, hour, value, onChange, children }:{
  poolId:string, hour:'H1'|'H2', value:string, onChange:(v:string)=>void, children?:React.ReactNode
}){
  const [rows, setRows] = React.useState<any[]>([])
  React.useEffect(() => {
    const qy = query(
      collection(db,'bookings'),
      where('poolId','==', poolId),
      where('hour','==', hour),
      where('status','==','active'),
      where('type','==','instructor')
    )
    return onSnapshot(qy, snap => {
      const arr:any[] = []
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }))
      setRows(arr)
    })
  }, [poolId, hour])
  return (
    <div className="picker">
      <div style={{fontWeight:600}}>Wybierz instruktora</div>
      <select value={value} onChange={e=>onChange(e.target.value)}>
        {rows.length===0 ? (
          <option value="">(Brak dodanych instruktorów dla tej godziny)</option>
        ) : (
          <>
            <option value="">— wybierz instruktora —</option>
            {rows.map((i:any)=>(
              <option key={i.uid} value={i.uid}>{i.userName || 'Instruktor'}</option>
            ))}
          </>
        )}
      </select>
      {children}
    </div>
  )
}
