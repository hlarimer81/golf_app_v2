import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SaveStatus from './components/SaveStatus.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <SaveStatus />
  </StrictMode>,
)
