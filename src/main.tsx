import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles/base.css';
import './styles/screens.css';
import { App } from './App';

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
