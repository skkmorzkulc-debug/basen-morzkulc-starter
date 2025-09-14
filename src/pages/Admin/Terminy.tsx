// src/pages/Admin/Terminy.tsx
// • <input type="date"> (kalendarz)
// • „Usuń termin” bez transakcji: writeBatch + increment(1)
// • Zwrot +1 dla regular/training/sauna (instruktor bez zwrotu)
// • Czyszczenie alokacji kajaków (poza prywatnym)
// • Dodawanie nowego terminu (H1/H2) + opcjonalna sauna 21:00–22:30
// • DOMYŚLNA lokalizacja z możliwością edycji (Relaxcenter…)

import React from 'react'
import {
  collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc,
  getDocs, where, serverTimestamp, writeBatch, increment
} from 'firebase/firestore'
import { db } from '../../firebase'

const PRIVATE_KAYAK_ID = 'PRIVATE'

// ✅ DOMYŚLNA LOKALIZACJA — można łatwo zmienić w 1 miejscu
const DEFAULT_LOCATION = 'Relaxcenter – Hotel Mercure Gdynia Centrum, Armii Krajowej 22, Gdynia'

type Pool = {
  id: string
  date: string
  location: string
  hours: { label: 'H1'|'H2', start: string, end: string, capacity?: number, trainingSlots?: number }[]
  saunaEnabled?: boolean
}

export default function AdminTerminy(){
  const [date, setDate] = React.useState<string>('')
  // ⬇️ Domyślna wartość ustawiona na Relaxcenter — nadal edytowalne
  const [location, setLocation] = React.useState<string>(DEFAULT_LOCATION)

  const [h1s, setH1s] = React.useState('21:00')
  const [h1e, setH1e] = React.useState('21:45')
  const [h2s, setH2s] = React.useState('21:45')
  const [h2e, setH2e] = React.useState('22:30')
  const [capacity, setCapacity] = React.useState<number>(12)
  const [training, setTraining] = React.useState<number>(4)
  const [sauna, setSauna] = React.useState<boolean>(false)

  const [pools, setPools] = React.useState<Pool[]>([])
  const [busy, setBusy] = React.useState<string>('')

  React.useEffect(() => {
    const qy = query(collection(db,'pools'), orderBy('date'))
    return onSnapshot(qy, snap => {
      const arr: Pool[] = []
      snap.forEach(d => arr.push({ id:d.id, ...(d.data() as any) }))
      setPools(arr)
    })
  }, [])

  async function addPool(e:React.FormEvent){
    e.preventDefault()
    if (!date || !location){ alert('Uzupełnij datę i lokalizację.'); return }
    setBusy('add')
    try {
      await addDoc(collection(db,'pools'), {
        date,
        location,
        hours: [
          { label:'H1', start:h1s, end:h1e, capacity, trainingSlots: training },
          { label:'H2', start:h2s, end:h2e, capacity, trainingSlots: training },
        ],
        saunaEnabled: !!sauna,
        createdAt: serverTimestamp(),
      })
      // Po dodaniu — zresetuj formularz, ale lokalizacja znowu ma domyślną wartość (wygoda)
      setDate('')
      setLocation(DEFAULT_LOCATION)
      setH1s('21:00'); setH1e('21:45')
      setH2s('21:45'); setH2e('22:30')
      setCapacity(12); setTraining(4); setSauna(false)
      alert('Dodano termin.')
    } catch (e:any) {
      console.error(e); alert(e?.message || 'Nie udało się dodać terminu.')
    } finally {
      setBusy('')
    }
  }

  // USUŃ TERMIN – bez transakcji: writeBatch + increment(1)
  // – aktywne bookingi (H1, H2, SAUNA) -> cancelled_admin
  // – płatnym typom (regular/training/sauna) -> +1
  // – usuń alokacje kajaków (poza prywatnym)
  // – usuń dokument terminu
  async function removePool(p:Pool){
    if (!confirm(`Usunąć termin ${p.date} – ${p.location}? Zapisanym zostanie zwrócona 1 godzinka.`)) return
    setBusy(p.id)
    try {
      const hours = ['H1','H2','SAUNA']
      for (const h of hours){
        const qs = await getDocs(
          query(collection(db,'bookings'),
            where('poolId','==', p.id),
            where('hour','==', h),
            where('status','==','active'))
        )
        for (const d of qs.docs){
          const b:any = d.data()
          const batch = writeBatch(db)

          const bookingRef = doc(db,'bookings', d.id)
          batch.update(bookingRef, {
            status: 'cancelled_admin',
            cancelledAt: serverTimestamp()
          })

          if (b.type !== 'instructor'){
            const uref = doc(db,'users', b.uid)
            batch.update(uref, { credits: increment(1) })
          }

          if (b.kayakId && b.kayakId !== PRIVATE_KAYAK_ID){
            const allocRef = doc(db,'allocations', `alloc_${p.id}_${h}_${b.kayakId}`)
            batch.delete(allocRef)
          }

          await batch.commit()
        }
      }

      await deleteDoc(doc(db,'pools', p.id))
      alert('Termin usunięty. Zwroty zostały przyznane.')
    } catch(e:any){
      console.error(e); alert(e?.message || 'Nie udało się usunąć terminu.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <h2>Admin: Terminy</h2>

      <form onSubmit={addPool} className="card" style={{padding:12, display:'grid', gap:10, marginBottom:16}}>
        <div style={{display:'grid', gridTemplateColumns:'180px 1fr', gap:10}}>
          <label>Data (YYYY-MM-DD)</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} required />

          <label>Lokalizacja</label>
          <input
            type="text"
            value={location}
            onChange={e=>setLocation(e.target.value)}
            placeholder="Relaxcenter – Hotel Mercure Gdynia… (możesz dopisać notatki)"
            title="Możesz zostawić domyślny adres albo dopisać własne notatki"
            required
          />

          <label>H1 start</label>
          <input type="time" value={h1s} onChange={e=>setH1s(e.target.value)} />
          <label>H1 koniec</label>
          <input type="time" value={h1e} onChange={e=>setH1e(e.target.value)} />

          <label>H2 start</label>
          <input type="time" value={h2s} onChange={e=>setH2s(e.target.value)} />
          <label>H2 koniec</label>
          <input type="time" value={h2e} onChange={e=>setH2e(e.target.value)} />

          <label>Pojemność / godzinę</label>
          <input type="number" min={1} value={capacity} onChange={e=>setCapacity(parseInt(e.target.value||'0'))} />

          <label>Miejsca szkoleniowe</label>
          <input type="number" min={0} value={training} onChange={e=>setTraining(parseInt(e.target.value||'0'))} />

          <label>Sauna 21:00–22:30</label>
          <input type="checkbox" checked={sauna} onChange={e=>setSauna(e.target.checked)} />
        </div>

        <div style={{display:'flex', gap:8}}>
          <button type="submit" disabled={busy==='add'}>
            {busy==='add' ? 'Dodawanie…' : 'Dodaj termin'}
          </button>
        </div>
      </form>

      <ul style={{listStyle:'none', padding:0, display:'grid', gap:12}}>
        {pools.map(p => (
          <li key={p.id} className="card" style={{padding:12}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap'}}>
              <div>
                <strong>{p.date}</strong> — {p.location}
                <div className="small">
                  {p.hours?.map(h => `${h.label}:${h.start}–${h.end}`).join(' · ')}
                  {p.saunaEnabled ? ' · sauna 21:00–22:30' : ''}
                </div>
              </div>
              <div style={{display:'flex', gap:8}}>
                <button
                  className="btn-outline"
                  onClick={()=>removePool(p)}
                  disabled={busy===p.id}
                  title="Usuń termin i zwróć godzinki zapisanym"
                >
                  {busy===p.id ? 'Usuwanie…' : 'Usuń termin'}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
