import React from 'react'
import { db } from '../../firebase'
import {
  collection, onSnapshot, addDoc, serverTimestamp,
  doc, updateDoc, deleteDoc
} from 'firebase/firestore'

type Kayak = {
  id: string
  name: string
  note?: string
  active?: boolean
  createdAt?: any
}

export default function Kajaki(){
  const [rows, setRows] = React.useState<Kayak[]>([])
  const [name, setName] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'kayaks'), snap => {
      const arr:Kayak[] = []
      snap.forEach(d => arr.push({ id: d.id, ...(d.data() as any) }))
      arr.sort((a,b) =>
        (a.active===b.active?0:(a.active? -1:1)) ||
        (a.name||'').localeCompare(b.name||'')
      )
      setRows(arr)
    }, (e)=>{
      console.error('Błąd czytania kayaks:', e)
      alert('Błąd pobierania listy kajaków: ' + (e?.message || e))
    })
    return () => unsub()
  }, [])

  async function addKayak(){
    const n = name.trim()
    if (!n) { alert('Podaj nazwę kajaka.'); return }
    setBusy(true)
    try {
      await addDoc(collection(db, 'kayaks'), {
        name: n,
        note: note.trim() || '',
        active: true,
        createdAt: serverTimestamp()
      })
      setName(''); setNote('')
    } catch (e:any){
      console.error('Błąd dodawania kajaka:', e)
      alert('Nie udało się dodać kajaka: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function setActive(id:string, val:boolean){
    try {
      await updateDoc(doc(db,'kayaks',id), { active: val })
    } catch(e:any){
      console.error(e); alert('Nie udało się zmienić statusu: ' + (e?.message||e))
    }
  }

  async function rename(id:string, newName:string){
    const n = newName.trim()
    if (!n) return
    try {
      await updateDoc(doc(db,'kayaks',id), { name: n })
    } catch(e:any){
      console.error(e); alert('Nie udało się zmienić nazwy: ' + (e?.message||e))
    }
  }

  // Uwaga: nazwa funkcji różna od setNote z useState
  async function updateNote(id:string, newNote:string){
    try {
      await updateDoc(doc(db,'kayaks',id), { note: newNote })
    } catch(e:any){
      console.error(e); alert('Nie udało się zapisać notatki: ' + (e?.message||e))
    }
  }

  async function remove(id:string){
    if (!confirm('Usunąć kajak? (nie usuwa przydziałów historycznych)')) return
    try {
      await deleteDoc(doc(db,'kayaks',id))
    } catch(e:any){
      console.error(e); alert('Nie udało się usunąć kajaka: ' + (e?.message||e))
    }
  }

  return (
    <div>
      <h2>Admin: Kajaki</h2>

      <div style={{border:'1px solid #eee', borderRadius:8, padding:10, marginBottom:12, display:'grid', gap:6}}>
        <div style={{fontWeight:600}}>Dodaj kajak</div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nazwa (np. Reval 16)" />
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Notatka (opcjonalnie)" />
        <button onClick={addKayak} disabled={busy || !name.trim()}>
          {busy ? 'Dodawanie…' : 'Dodaj'}
        </button>
      </div>

      {rows.length===0 ? <p>Brak kajaków.</p> : (
        <ul style={{listStyle:'none', padding:0, display:'grid', gap:10}}>
          {rows.map(k => (
            <li key={k.id} style={{border:'1px solid #eee', borderRadius:8, padding:10}}>
              <div style={{display:'grid', gap:6}}>
                <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                  <input
                    defaultValue={k.name}
                    onBlur={(e)=>rename(k.id, e.currentTarget.value)}
                    style={{minWidth:220}}
                  />
                  <label style={{display:'flex', gap:6, alignItems:'center'}}>
                    <input
                      type="checkbox"
                      checked={!!k.active}
                      onChange={(e)=>setActive(k.id, e.target.checked)}
                    />
                    Aktywny
                  </label>
                  <button onClick={()=>remove(k.id)} style={{marginLeft:'auto'}}>Usuń</button>
                </div>
                <input
                  defaultValue={k.note || ''}
                  onBlur={(e)=>updateNote(k.id, e.currentTarget.value)}
                  placeholder="Notatka…"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
