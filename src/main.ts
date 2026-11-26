import './index.css';
import { GameEngine } from './core/GameEngine';

const rootEl = document.getElementById('root');
if (rootEl) {
  const engine = new GameEngine(rootEl);
  void engine.boot();
}
