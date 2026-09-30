import React from 'react'
import ReactDOM from 'react-dom/client'
import SideHustleClub from './App.jsx'
import Arena from './Arena.jsx'
import Swap from './Swap.jsx'

const path = window.location.pathname
const isArena = path.startsWith('/arena')
const isSwap = path.startsWith('/swap')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isArena ? <Arena /> : isSwap ? <Swap /> : <SideHustleClub />}
  </React.StrictMode>,
)
