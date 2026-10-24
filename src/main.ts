import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { mount } from './ui/app';

mount(document.getElementById('app')!);

// Offline-Unterstützung: Service Worker aktualisiert sich still im Hintergrund.
registerSW({ immediate: true });
