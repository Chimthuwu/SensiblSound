import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { IntroSplash } from './components/IntroSplash.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IntroSplash />
    <App />
  </StrictMode>,
)
