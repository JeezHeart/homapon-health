/**
 * InteractiveDotGrid.tsx
 * Guide pang-defense: Ito yung lightweight React Bits-inspired interactive canvas dot grid
 * sa background ng login page. Nagre-react yung mga teal dots sa galaw ng mouse at may subtle
 * ripple effect pag nag-click — pure HTML5 Canvas + TypeScript (walang mabigat na 3D library)
 * at naka-respect sa `prefers-reduced-motion`.
 */
import { useEffect, useRef } from 'react';

interface DotPoint {
  baseX: number;
  baseY: number;
  offsetX: number;
  offsetY: number;
  velX: number;
  velY: number;
}

interface RippleWave {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

const DOT_GAP = 26;
const BASE_RADIUS = 1.25;
const MAX_RADIUS = 3.1;
const INTERACT_RADIUS = 148;
const PUSH_STRENGTH = 11;
const SPRING_STIFFNESS = 0.09;
const SPRING_DAMPING = 0.78;

export default function InteractiveDotGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let dots: DotPoint[] = [];
    const ripples: RippleWave[] = [];
    let rafId = 0;

    const pointer = { x: -9999, y: -9999, active: false };

    function isDarkTheme() {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function buildGrid() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(width / DOT_GAP) + 1;
      const rows = Math.ceil(height / DOT_GAP) + 1;
      const startX = (width - (cols - 1) * DOT_GAP) / 2;
      const startY = (height - (rows - 1) * DOT_GAP) / 2;

      dots = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dots.push({
            baseX: startX + c * DOT_GAP,
            baseY: startY + r * DOT_GAP,
            offsetX: 0,
            offsetY: 0,
            velX: 0,
            velY: 0,
          });
        }
      }
    }

    function drawStatic() {
      const dark = isDarkTheme();
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = dark ? 'rgba(45, 212, 191, 0.16)' : 'rgba(13, 148, 136, 0.16)';
      for (const dot of dots) {
        ctx!.beginPath();
        ctx!.arc(dot.baseX, dot.baseY, BASE_RADIUS, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function renderFrame() {
      const dark = isDarkTheme();
      const baseRgb = dark ? '45, 212, 191' : '13, 148, 136';
      const activeRgb = dark ? '94, 234, 212' : '15, 118, 110';

      ctx!.clearRect(0, 0, width, height);

      // Mag-update ng click ripple rings kung meron.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const wave = ripples[i];
        wave.radius += 6.5;
        wave.alpha *= 0.94;
        if (wave.alpha < 0.02 || wave.radius > 320) {
          ripples.splice(i, 1);
        }
      }

      for (const dot of dots) {
        let targetX = 0;
        let targetY = 0;
        let influence = 0;

        if (pointer.active) {
          const dx = dot.baseX - pointer.x;
          const dy = dot.baseY - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < INTERACT_RADIUS && dist > 0.001) {
            const factor = 1 - dist / INTERACT_RADIUS;
            const eased = factor * factor;
            influence = eased;
            targetX += (dx / dist) * PUSH_STRENGTH * eased;
            targetY += (dy / dist) * PUSH_STRENGTH * eased;
          }
        }

        for (const wave of ripples) {
          const dx = dot.baseX - wave.x;
          const dy = dot.baseY - wave.y;
          const dist = Math.hypot(dx, dy);
          const band = Math.abs(dist - wave.radius);
          if (band < 38 && dist > 0.001) {
            const waveForce = (1 - band / 38) * wave.alpha;
            influence = Math.max(influence, waveForce * 0.85);
            targetX += (dx / dist) * 10 * waveForce;
            targetY += (dy / dist) * 10 * waveForce;
          }
        }

        dot.velX = (dot.velX + (targetX - dot.offsetX) * SPRING_STIFFNESS) * SPRING_DAMPING;
        dot.velY = (dot.velY + (targetY - dot.offsetY) * SPRING_STIFFNESS) * SPRING_DAMPING;
        dot.offsetX += dot.velX;
        dot.offsetY += dot.velY;

        const radius = BASE_RADIUS + (MAX_RADIUS - BASE_RADIUS) * influence;
        const alpha = (dark ? 0.15 : 0.17) + influence * (dark ? 0.62 : 0.56);

        ctx!.beginPath();
        ctx!.arc(dot.baseX + dot.offsetX, dot.baseY + dot.offsetY, radius, 0, Math.PI * 2);
        ctx!.fillStyle = influence > 0.25 ? `rgba(${activeRgb}, ${alpha.toFixed(3)})` : `rgba(${baseRgb}, ${alpha.toFixed(3)})`;
        ctx!.fill();
      }

      rafId = window.requestAnimationFrame(renderFrame);
    }

    function handlePointerMove(e: PointerEvent) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    }

    function handlePointerLeave() {
      pointer.active = false;
    }

    function handlePointerDown(e: PointerEvent) {
      if (ripples.length < 4) {
        ripples.push({ x: e.clientX, y: e.clientY, radius: 12, alpha: 0.75 });
      }
    }

    function handleResize() {
      buildGrid();
      if (prefersReducedMotion) drawStatic();
    }

    buildGrid();
    window.addEventListener('resize', handleResize);

    if (prefersReducedMotion) {
      drawStatic();
      const observer = new MutationObserver(drawStatic);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      return () => {
        window.removeEventListener('resize', handleResize);
        observer.disconnect();
      };
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
