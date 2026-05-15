// Generador de "siren wail" vía Web Audio API. Sin assets externos —
// usamos un oscilador con rampa de frecuencia 600Hz↔1200Hz, ~1s por
// ciclo, en loop. Se usa en CriticalSiren para alertas no-ACK críticas.
//
// Nota sobre autoplay policy: los navegadores modernos requieren un
// gesto de usuario antes de que el AudioContext pueda reproducir sonido.
// La primera vez que start() se llama sin gesto previo, ctx.state queda
// en "suspended" y no suena. Solución: el componente que arranca la
// sirena también escucha el primer click/keydown global y hace
// `ctx.resume()`. Si la página ya tuvo gesto (typical en /dashboard
// abierto un rato), arranca al primer intento.

interface ActiveSiren {
  stop: () => void;
}

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}

/**
 * Asegura que el AudioContext está en estado "running". Llamar en
 * respuesta a un gesto del usuario (click, keydown) para evitar el
 * bloqueo de autoplay del navegador.
 */
export async function unlockAudioContext(): Promise<void> {
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* ignore */ }
  }
}

/**
 * Arranca un siren wail en loop hasta llamar `.stop()`. Si el
 * AudioContext está suspended (sin gesto previo del user), intenta
 * reproducir igualmente — algunos navegadores permiten oscilador puro
 * aunque el ctx sea suspended; si no, el sonido empezará al primer
 * click del usuario (gestionado en MainLayout).
 */
export function startSiren(): ActiveSiren {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  // Volumen moderado — agresivo pero no daña los oídos en una oficina.
  gain.gain.value = 0.18;
  osc.type = 'sine';

  // Programamos el wail en bloques de 60s para no saturar el scheduler;
  // un setInterval externo lo renueva mientras la sirena siga activa.
  const wailDurSec = 1.0;
  const wailCount = 60;
  const t0 = ctx.currentTime;
  for (let i = 0; i < wailCount; i++) {
    const start = t0 + i * wailDurSec;
    osc.frequency.setValueAtTime(600, start);
    osc.frequency.linearRampToValueAtTime(1200, start + wailDurSec * 0.5);
    osc.frequency.linearRampToValueAtTime(600, start + wailDurSec);
  }

  try { osc.start(); } catch { /* already started, ignore */ }

  // Renueva el wail cada 50s (antes del fin del bloque) si sigue vivo.
  const renewer = setInterval(() => {
    const now = ctx.currentTime;
    for (let i = 0; i < wailCount; i++) {
      const start = now + i * wailDurSec;
      try {
        osc.frequency.setValueAtTime(600, start);
        osc.frequency.linearRampToValueAtTime(1200, start + wailDurSec * 0.5);
        osc.frequency.linearRampToValueAtTime(600, start + wailDurSec);
      } catch { /* osc stopped, will be cleared next tick */ }
    }
  }, 50_000);

  return {
    stop: () => {
      clearInterval(renewer);
      try { osc.stop(); } catch { /* already stopped */ }
      try { osc.disconnect(); } catch { /* ignore */ }
      try { gain.disconnect(); } catch { /* ignore */ }
    },
  };
}
