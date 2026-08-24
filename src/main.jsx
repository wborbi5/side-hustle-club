import React from 'react'
import ReactDOM from 'react-dom/client'
import SideHustleClub from './App.jsx'
import Arena from './Arena.jsx'

const isArena = window.location.pathname.startsWith('/arena')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isArena ? <Arena /> : <SideHustleClub />}
  </React.StrictMode>,
)
