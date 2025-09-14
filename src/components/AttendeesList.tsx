import React from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import type { HourLabel } from '../types';



type Booking = {
  id: string
  uid: string
  userName?: string
  userPublicRole?: string
  poolId: string
  hour: HourLabel
  type: 'regular' | 'training' | 'instructor' | 'sauna'
  status: 'active' | 'cancelled' | 'cancelled_admin'
  instructorUid?: string | null
  kayakId?: string | null
}

export default function AttendeesList({ poolId, hour }:{
  poolId: string
  hour: HourLabel
}){
  const [items, setItems] = React.useState<Booking[]>([])

  React.useEffect(() => {
    const qy = query(
      collection(db, 'bookings'),
      where('poolId','==', poolId),
      where('hour','==', hour),
      where('status','==','active')
    )
    const unsub = onSnapshot(qy, snap => {
      const arr: Booking[] = []
      snap.forEach(d => arr.push({ id: d.id, ...(d.data() as any) }))
      setItems(arr)
    })
    return () => unsub()
  }, [poolId, hour])

  // Podział na sekcje
  const instructorBookings = items.filter(b => b.type === 'instructor')
  const trainingWithInstr   = items.filter(b => b.type === 'training' && !!b.instructorUid)
  const trainingNoInstr     = items.filter(b => b.type === 'training' && !b.instructorUid)
  const regulars            = items.filter(b => b.type === 'regular')
  const sauna               = items.filter(b => b.type === 'sauna')

  // Instruktor „zajęty”, jeśli ma co najmniej jedną parę
  const busyInstrUids = new Set(trainingWithInstr.map(b => b.instructorUid as string))
  const availableInstructors = instructorBookings
    .filter(i => !busyInstrUids.has(i.uid))
    .sort((a,b)=> (a.userName||'Instruktor').localeCompare(b.userName||'Instruktor'))

  // Mapy pomocnicze, żeby pokazać nazwę instruktora w parach
  const instrByUid = new Map(instructorBookings.map(i => [i.uid, i]))
  const pairs = trainingWithInstr
    .map(b => ({
      userName: b.userName || 'Uczestnik',
      instructorName: (instrByUid.get(b.instructorUid!)?.userName) || 'Instruktor',
      bookingId: b.id
    }))
    .sort((a,b)=> (a.userName||'').localeCompare(b.userName||''))

  // Uczestnicy = regular + training bez instruktora
  const participants = [...regulars, ...trainingNoInstr]
    .sort((a,b)=> (a.userName||'').localeCompare(b.userName||''))

  // Sauna sort po nazwie
  sauna.sort((a,b)=> (a.userName||'').localeCompare(b.userName||''))

  const hasPairs = pairs.length > 0
  const hasAvailInstructors = availableInstructors.length > 0
  const hasParticipants = participants.length > 0
  const hasSauna = sauna.length > 0

  // Jeśli wszystkie puste – nic nie renderuj (opcjonalnie)
  if (!hasPairs && !hasAvailInstructors && !hasParticipants && !hasSauna) {
    return null
  }

  return (
    <div style={{display:'grid', gap:8}}>
      {/* PARY: pokaż tylko jeśli istnieje choć jedna */}
      {hasPairs && (
        <Section title="Pary: Uczestnik — Instruktor">
          <ul style={{listStyle:'none', padding:0, margin:0, display:'grid', gap:4}}>
            {pairs.map(p => (
              <li key={p.bookingId} style={{display:'flex', gap:6, alignItems:'center'}}>
                <span>• <strong>{p.userName}</strong> — {p.instructorName}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* INSTRUKTORZY DOSTĘPNI: pokaż tylko gdy lista niepusta */}
      {hasAvailInstructors && (
        <Section title="Instruktorzy dostępni">
          <ul style={{listStyle:'none', padding:0, margin:0, display:'grid', gap:4}}>
            {availableInstructors.map(i => (
              <li key={i.id}>• {i.userName || 'Instruktor'}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* UCZESTNICY: pokaż tylko gdy lista niepusta */}
      {hasParticipants && (
        <Section title="Uczestnicy">
          <ul style={{listStyle:'none', padding:0, margin:0, display:'grid', gap:4}}>
            {participants.map(p => (
              <li key={p.id}>• {p.userName || 'Uczestnik'}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* SAUNA: pokaż tylko gdy ktoś zapisany na saunę */}
      {hasSauna && (
        <Section title="Sauna">
          <ul style={{listStyle:'none', padding:0, margin:0, display:'grid', gap:4}}>
            {sauna.map(s => (
              <li key={s.id}>
                • {s.userName || 'Uczestnik'} <span style={{fontSize:12, opacity:.7}}>(sauna)</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }:{ title:string, children: React.ReactNode }){
  return (
    <div style={{border:'1px solid #eee', borderRadius:8, padding:8}}>
      <div style={{fontWeight:600, marginBottom:6}}>{title}</div>
      {children}
    </div>
  )
}
