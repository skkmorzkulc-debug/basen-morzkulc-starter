import React from 'react'

export default function Kup({ user }: any){
  return (
    <div>
      <h2>Kup karnet (płatność przelewem)</h2>
      <p>W tytule przelewu podaj <strong>nazwę użytkownika z aplikacji</strong> (jeśli różni się od imienia i nazwiska).</p>
      <div style={{border:'1px solid #eee', borderRadius:8, padding:12, margin:'12px 0'}}>
        <div><strong>Odbiorca:</strong> Radosław Orzlowski</div>
        <div><strong>Nr konta:</strong> 13160014621861303220000001</div>
      </div>
      <h3>Wybierz karnet (kwota do przelewu)</h3>
      <ul>
        <li>Members 6 wejść – 168 zł</li>
        <li>Others 4 wejścia – 155 zł</li>
        <li>Members 2 wejścia – 60 zł</li>
      </ul>
      <p>Po zaksięgowaniu organizator doda godzinki do Twojego konta.</p>
    </div>
  )
}
