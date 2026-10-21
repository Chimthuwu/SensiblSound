import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { IntroSplash } from './components/IntroSplash.tsx'
import { ContextMenuProvider } from './components/studio/ContextMenu.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ContextMenuProvider>
      <IntroSplash />
      <App />
    </ContextMenuProvider>
  </StrictMode>,
)
