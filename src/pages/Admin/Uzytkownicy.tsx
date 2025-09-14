// src/pages/Admin/Uzytkownicy.tsx
import React from 'react'
import {
  collection, onSnapshot, query, where,
  doc, updateDoc, serverTimestamp, runTransaction, orderBy, getDocs
} from 'firebase/firestore'
import { increment } from 'firebase/firestore'
import { db } from '../../firebase'

type Tab = 'pending'|'active'|'archived'|'all'

function tsToMillis(v:any){
  if (!v) return 0
  return typeof v.toMillis === 'function' ? v.toMillis() : (+new Date(v))
}

export default function Uzytkownicy(){
  const [tab, setTab] = React.useState<Tab>('pending')
  const [rows, setRows] = React.useState<any[]>([])
  const [busy, setBusy] = React.useState<string>('')
  const [q, setQ] = React.useState<string>('') // SZUKAJ

  React.useEffect(() => {
    let unsub: (()=>void) | null = null
    setRows([])

    // Bez złożonego indeksu: w filtrowanych zakładkach nie używamy orderBy, sort lokalnie
    if (tab === 'all') {
      const qy = query(collection(db,'users'), orderBy('createdAt','desc'))
      unsub = onSnapshot(qy, snap => {
        const arr:any[] = []
        snap.forEach(d => arr.push({ id:d.id, ...d.data() }))
        setRows(arr)
      }, err => console.error('ALL users sub err', err))
    } else {
      const qy = query(collection(db,'users'), where('status','==', tab))
      unsub = onSnapshot(qy, snap => {
        const arr:any[] = []
        snap.forEach(d => arr.push({ id:d.id, ...d.data() }))
        arr.sort((a,b)=> tsToMillis(b.createdAt)-tsToMillis(a.createdAt))
        setRows(arr)
      }, err => console.error(`${tab} users sub err`, err))
    }

    return () => { if (unsub) unsub() }
  }, [tab])

  // WYSZUKIWANIE (lokalne – po nazwie, mailu, UID)
  const list = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(u => {
      const n = (u.displayName || '').toLowerCase()
      const e = (u.email || '').toLowerCase()
      const id = (u.id || '').toLowerCase()
      return n.includes(s) || e.includes(s) || id.includes(s)
    })
  }, [rows, q])

  async function setStatus(id:string, status:'active'|'archived'|'pending'){
    setBusy('status:'+id)
    try{
      await updateDoc(doc(db,'users', id), {
        status,
        statusUpdatedAt: serverTimestamp()
      })
    }catch(e:any){
      alert(e?.message || 'Nie udało się zmienić statusu.')
    }finally{ setBusy('') }
  }

  async function toggleRole(id:string, key:'admin'|'organizer'|'instructor', val:boolean){
    setBusy('role:'+id+key)
    try{
      await updateDoc(doc(db,'users', id), {
        [`roles.${key}`]: val,
        rolesUpdatedAt: serverTimestamp()
      })
    }catch(e:any){
      alert(e?.message || 'Nie udało się zmienić roli.')
    }finally{ setBusy('') }
  }

  async function addCredits(id:string, delta:number){
    setBusy('credits:'+id+':'+delta)
    try{
      await updateDoc(doc(db,'users', id), {
        credits: increment(delta),
        creditsPatchedAt: serverTimestamp()
      })
    }catch(e:any){
      alert(e?.message || 'Nie udało się zmienić liczby godzinek.')
    }finally{ setBusy('') }
  }

  async function setCreditsTo(id:string, target:number){
    if (Number.isNaN(target)) { alert('Podaj liczbę.'); return }
    setBusy('credits:set:'+id)
    try{
      await runTransaction(db, async tx => {
        const ref = doc(db,'users', id)
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error('Użytkownik nie istnieje.')
        tx.update(ref, { credits: target, creditsPatchedAt: serverTimestamp() })
      })
    }catch(e:any){
      alert(e?.message || 'Nie udało się ustawić liczby godzinek.')
    }finally{ setBusy('') }
  }

  return (
    <div>
      <h2>Admin: Użytkownicy</h2>

      {/* Pasek zakładek + wyszukiwarka */}
      <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12}}>
        <div style={{display:'flex', gap:8}}>
          <button className={tab==='pending'?'':'btn-outline'} onClick={()=>setTab('pending')}>Oczekujący</button>
          <button className={tab==='active'?'':'btn-outline'} onClick={()=>setTab('active')}>Aktywni</button>
          <button className={tab==='archived'?'':'btn-outline'} onClick={()=>setTab('archived')}>Zarchiwizowani</button>
          <button className={tab==='all'?'':'btn-outline'} onClick={()=>setTab('all')}>Wszyscy</button>
        </div>

        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="Szukaj po imieniu, mailu lub UID"
          style={{flex:'1 1 280px', minWidth:260}}
        />
      </div>

      {list.length===0 && <div>Brak wyników.</div>}

      <ul style={{listStyle:'none', padding:0, display:'grid', gap:8}}>
        {list.map(u => (
          <li key={u.id} className="card" style={{padding:12}}>
            <div style={{display:'grid', gap:10}}>
              {/* Nagłówek */}
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap'}}>
                <div>
                  <div style={{fontWeight:600}}>{u.displayName || u.email || u.id}</div>
                  <div className="small">{u.email || 'brak e-maila'}</div>
                  <div className="small">
                    status: <strong>{u.status || '—'}</strong> · UID: {u.id}
                  </div>
                </div>

                {/* Kredyty – szybkie +1/−1 oraz ustaw na */}
                <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                  <span>wykupione:</span>
                  <span className="chip"><strong>{u.credits ?? 0}</strong></span>
                  <button
                    disabled={busy.startsWith('credits:'+u.id)}
                    onClick={()=>addCredits(u.id, +1)}
                  >+1</button>
                  <button
                    className="btn-outline"
                    disabled={busy.startsWith('credits:'+u.id)}
                    onClick={()=>addCredits(u.id, -1)}
                  >−1</button>

                  <CreditsSetter
                    value={u.credits ?? 0}
                    onSet={(val)=>setCreditsTo(u.id, val)}
                    busy={busy==='credits:set:'+u.id}
                  />
                </div>
              </div>

              {/* Role */}
              <div className="small">Role:</div>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <label style={{display:'inline-flex', alignItems:'center', gap:6, border:'1px solid #E5E7EB', borderRadius:999, padding:'4px 10px'}}>
                  <input type="checkbox" checked={!!u?.roles?.admin} onChange={e=>toggleRole(u.id,'admin', e.target.checked)} />
                  admin
                </label>
                <label style={{display:'inline-flex', alignItems:'center', gap:6, border:'1px solid #E5E7EB', borderRadius:999, padding:'4px 10px'}}>
                  <input type="checkbox" checked={!!u?.roles?.organizer} onChange={e=>toggleRole(u.id,'organizer', e.target.checked)} />
                  organizer
                </label>
                <label style={{display:'inline-flex', alignItems:'center', gap:6, border:'1px solid #E5E7EB', borderRadius:999, padding:'4px 10px'}}>
                  <input type="checkbox" checked={!!u?.roles?.instructor} onChange={e=>toggleRole(u.id,'instructor', e.target.checked)} />
                  instructor
                </label>
              </div>

              {/* Status – akcje */}
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                {u.status!=='active' && (
                  <button disabled={busy==='status:'+u.id} onClick={()=>setStatus(u.id,'active')}>
                    {busy==='status:'+u.id ? 'Przetwarzam…' : 'Aktywuj'}
                  </button>
                )}
                {u.status!=='archived' && (
                  <button className="btn-outline" disabled={busy==='status:'+u.id} onClick={()=>setStatus(u.id,'archived')}>
                    {busy==='status:'+u.id ? 'Przetwarzam…' : 'Archiwizuj'}
                  </button>
                )}
                {u.status!=='pending' && (
                  <button className="btn-outline" disabled={busy==='status:'+u.id} onClick={()=>setStatus(u.id,'pending')}>
                    {busy==='status:'+u.id ? 'Przetwarzam…' : 'Ustaw „oczekujący”'}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Mały pod-komponent do ustawienia dokładnej liczby kredytów
function CreditsSetter({ value, onSet, busy }:{ value:number, onSet:(v:number)=>void, busy:boolean }){
  const [val, setVal] = React.useState<string>(String(value ?? 0))
  React.useEffect(()=>{ setVal(String(value ?? 0)) }, [value])
  return (
    <div style={{display:'inline-flex', gap:6, alignItems:'center'}}>
      <input
        type="number"
        min={0}
        value={val}
        onChange={(e)=>setVal(e.target.value)}
        style={{width:90}}
      />
      <button
        className="btn-outline"
        onClick={()=>onSet(Number(val))}
        disabled={busy}
      >
        {busy ? 'Ustawianie…' : 'Ustaw na'}
      </button>
    </div>
  )
}
