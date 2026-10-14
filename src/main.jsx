import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import 'leaflet/dist/leaflet.css'
import './styles.css'

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)

// HTTPS is mandatory for geolocation and recommended for PWA installation.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.warn))
}
