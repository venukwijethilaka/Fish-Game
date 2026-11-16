// [AI-ASSISTED: Codex, 2026-11-05] Interactive HTML5 Canvas component for Pirate Sailing game loop.
import { useEffect, useRef } from 'react';
import type { Phase } from '../../../contracts/src/index';
import {
  PIERS,
  FINAL_ISLAND,
  OBSTACLES,
  DECORATIVE_ISLETS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from './mapData';
import {
  drawOceanBackground,
  drawDecorativeIslet,
  drawBoat,
  drawPier,
  drawFinalIsland,
  drawObstacle,
  drawShark,
} from './sprites';
import { SailingEngine, type InputKeys } from './sailingEngine';

interface SailingCanvasProps {
  checkpointIndex: number;
  fever: boolean;
  phase: Phase;
  paused: boolean;
  gameId?: string;
  onDock: (checkpointIndex: number) => void;
  onHit: (hazardType: 'rock' | 'barrel' | 'shark') => void;
}

export function SailingCanvas({
  checkpointIndex,
  fever,
  phase,
  paused,
  gameId,
  onDock,
  onHit,
}: SailingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SailingEngine | null>(null);
  const keysRef = useRef<InputKeys>({
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
  });
  const cameraRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const spawnTimeRef = useRef(performance.now());
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const onDockRef = useRef(onDock);
  const onHitRef = useRef(onHit);
  onDockRef.current = onDock;
  onHitRef.current = onHit;

  // Initialize or update engine
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new SailingEngine(
        checkpointIndex,
        fever,
        (cp) => onDockRef.current(cp),
        (hz) => onHitRef.current(hz),
        gameId,
      );
      // Immediately center camera on boat with zero initial lag or offset
      const initCamX = Math.max(
        0,
        Math.min(WORLD_WIDTH - window.innerWidth, engineRef.current.boat.x - window.innerWidth / 2),
      );
      const initCamY = Math.max(
        0,
        Math.min(WORLD_HEIGHT - window.innerHeight, engineRef.current.boat.y - window.innerHeight / 2),
      );
      cameraRef.current = { x: initCamX, y: initCamY };
      spawnTimeRef.current = performance.now();
    } else {
      engineRef.current.setCheckpoint(checkpointIndex);
      engineRef.current.setFever(fever);
    }
  }, [checkpointIndex, fever, gameId]);

  // Arrow / WASD / Space / Pause Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If paused or not actively in SAILING phase, do not capture navigation keys so dialogs/popups receive them exclusively
      if (paused || phaseRef.current !== 'SAILING') {
        return;
      }
      if (['ArrowUp', 'KeyW'].includes(e.code)) keysRef.current.up = true;
      if (['ArrowDown', 'KeyS'].includes(e.code)) keysRef.current.down = true;
      if (['ArrowLeft', 'KeyA'].includes(e.code)) keysRef.current.left = true;
      if (['ArrowRight', 'KeyD'].includes(e.code)) keysRef.current.right = true;
      if (e.code === 'Space') {
        e.preventDefault();
        keysRef.current.boost = true;
      }
      if (e.code === 'KeyP' && !e.repeat) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('reef:toggle-pause'));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) keysRef.current.up = false;
      if (['ArrowDown', 'KeyS'].includes(e.code)) keysRef.current.down = false;
      if (['ArrowLeft', 'KeyA'].includes(e.code)) keysRef.current.left = false;
      if (['ArrowRight', 'KeyD'].includes(e.code)) keysRef.current.right = false;
      if (e.code === 'Space') keysRef.current.boost = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [paused]);

  // Main 60 FPS Animation Loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min(0.05, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      const canvas = canvasRef.current;
      const engine = engineRef.current;

      if (canvas && engine) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;

          // Physics & docking update ONLY when not paused and actively in SAILING phase
          if (!paused && phaseRef.current === 'SAILING') {
            engine.update(keysRef.current, dt, currentTime);
          }

          // Smooth camera tracking (lerp toward player boat)
          const targetCamX = engine.boat.x - width / 2;
          const targetCamY = engine.boat.y - height / 2;
          cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.12;
          cameraRef.current.y += (targetCamY - cameraRef.current.y) * 0.12;

          // Clamp camera inside world bounds
          const camX = Math.max(0, Math.min(WORLD_WIDTH - width, cameraRef.current.x));
          const camY = Math.max(0, Math.min(WORLD_HEIGHT - height, cameraRef.current.y));

          // 1. ALWAYS CLEAR THE ENTIRE CANVAS SCREEN IN SCREEN SPACE
          ctx.clearRect(0, 0, width, height);

          // 2. Base fail-safe ocean color
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(0, 0, width, height);

          // 3. ENTER WORLD COORDINATES
          ctx.save();
          ctx.translate(-camX, -camY);

          // 4. Draw Depth-Graded Ocean Background & Caustics in World Space
          drawOceanBackground(ctx, camX, camY, width, height, currentTime);

          // 1.5 Draw Stepped Tropical Sandbars & Palm Islets (matching reference art)
          for (const islet of DECORATIVE_ISLETS) {
            drawDecorativeIslet(ctx, islet, currentTime);
          }

          // 2. Draw 14 Wooden Piers (at randomized positions across sectors)
          for (const pier of engine.piers) {
            drawPier(
              ctx,
              pier,
              pier.index === checkpointIndex,
              pier.index < checkpointIndex,
              currentTime,
            );
          }

          // 3. Draw Checkpoint 15: Final Pirate Island
          drawFinalIsland(ctx, FINAL_ISLAND, checkpointIndex === 15, currentTime);

          // 4. Draw Sea Obstacles (Rocks & Barrels)
          for (const obs of OBSTACLES) {
            drawObstacle(ctx, obs, currentTime);
          }

          // 5. Draw Sharks
          for (const shark of engine.sharks) {
            drawShark(ctx, shark, currentTime);
          }

          // 6. Initial Boat Focus & Animated Pointer Beacon (highlights player's ship at initial start)
          const spawnAge = (currentTime - spawnTimeRef.current) / 1000;
          if (spawnAge < 5.5 && Math.abs(engine.boat.speed) < 15) {
            const alpha = Math.max(0, Math.min(1, 1 - (spawnAge - 3.5) / 2));
            const pulse = (currentTime % 1400) / 1400;

            // Expanding golden radar wave ring on water
            ctx.save();
            ctx.strokeStyle = `rgba(251, 191, 36, ${(1 - pulse) * alpha * 0.9})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(engine.boat.x, engine.boat.y, 22 + pulse * 50, 0, Math.PI * 2);
            ctx.stroke();

            // Inner glowing cyan beacon
            ctx.strokeStyle = `rgba(34, 211, 238, ${alpha * 0.65})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(
              engine.boat.x,
              engine.boat.y,
              18 + Math.sin(currentTime * 0.008) * 3,
              0,
              Math.PI * 2,
            );
            ctx.stroke();

            // Bouncing cartoon pointer arrow & badge above ship
            const bounce = Math.sin(currentTime * 0.007) * 6;
            const badgeY = engine.boat.y - 70 + bounce;
            const badgeW = 104;
            const badgeH = 24;

            ctx.globalAlpha = alpha;
            // Wooden pill
            ctx.fillStyle = '#854d0e';
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(engine.boat.x - badgeW / 2, badgeY, badgeW, badgeH, 12);
            ctx.fill();
            ctx.stroke();

            // Downward pointing arrowhead
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.moveTo(engine.boat.x, badgeY + badgeH + 8);
            ctx.lineTo(engine.boat.x - 7, badgeY + badgeH);
            ctx.lineTo(engine.boat.x + 7, badgeY + badgeH);
            ctx.closePath();
            ctx.fill();

            // Label text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚓ YOUR SHIP', engine.boat.x, badgeY + badgeH / 2);
            ctx.restore();
          }

          // 7. Draw Player Pirate Boat
          const isInvincible = currentTime - engine.lastHitTime < 1500;
          drawBoat(
            ctx,
            engine.boat.x,
            engine.boat.y,
            engine.boat.angle,
            engine.boat.speed,
            fever,
            isInvincible,
            currentTime,
            engine.boat.isBoosting,
          );

          ctx.restore();

          // 8. Captain's Nautical Compass & Radar HUD
          const targetPos =
            checkpointIndex <= 14
              ? engine.piers.find((p) => p.index === checkpointIndex) ?? FINAL_ISLAND
              : FINAL_ISLAND;
          const distToTarget = Math.round(
            Math.hypot(targetPos.x - engine.boat.x, targetPos.y - engine.boat.y),
          );
          const angleToTarget = Math.atan2(
            targetPos.y - engine.boat.y,
            targetPos.x - engine.boat.x,
          );

          ctx.save();
          // Compass HUD in top right (safely positioned well below the 64px top HUD bar)
          const compassX = width - 85;
          const compassY = 118;
          const compassRadius = 30;

          // Brass Outer Rim with drop shadow
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;

          ctx.fillStyle = '#451a03';
          ctx.beginPath();
          ctx.arc(compassX, compassY, compassRadius + 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#b45309';
          ctx.beginPath();
          ctx.arc(compassX, compassY, compassRadius + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Dark Dial Face
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(compassX, compassY, compassRadius - 2, 0, Math.PI * 2);
          ctx.fill();

          // Gold Inner Ring & Cardinal Marks
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(compassX, compassY, compassRadius - 5, 0, Math.PI * 2);
          ctx.stroke();

          // Cardinal Direction Markers
          ctx.font = 'bold 9px "Luckiest Guy", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ef4444';
          ctx.fillText('N', compassX, compassY - compassRadius + 11);
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('S', compassX, compassY + compassRadius - 10);
          ctx.fillText('E', compassX + compassRadius - 11, compassY);
          ctx.fillText('W', compassX - compassRadius + 11, compassY);

          // Rotating 3D Nautical Needle
          ctx.save();
          ctx.translate(compassX, compassY);
          ctx.rotate(angleToTarget + Math.PI / 2);

          // Red Target Pointer (Points directly towards active checkpoint)
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(0, -22);
          ctx.lineTo(6, 0);
          ctx.lineTo(0, -3);
          ctx.closePath();
          ctx.fill();

          // Dark Red Shade on left of needle
          ctx.fillStyle = '#b91c1c';
          ctx.beginPath();
          ctx.moveTo(0, -22);
          ctx.lineTo(-6, 0);
          ctx.lineTo(0, -3);
          ctx.closePath();
          ctx.fill();

          // South White/Silver Counter-Weight
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.moveTo(0, 14);
          ctx.lineTo(5, 0);
          ctx.lineTo(0, 2);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.moveTo(0, 14);
          ctx.lineTo(-5, 0);
          ctx.lineTo(0, 2);
          ctx.closePath();
          ctx.fill();

          // Center Brass Pivot Pin
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Distance & Destination Badge Below Compass (Explicit SEEK Target HUD)
          const badgeText = `${checkpointIndex === 15 ? 'FINAL ISLAND' : `SEEK PIER ${checkpointIndex}`} • ${distToTarget}m`;
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const textWidth = ctx.measureText(badgeText).width;
          const badgeW = textWidth + 16;
          const badgeH = 22;
          const badgeY = compassY + compassRadius + 8;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.beginPath();
          ctx.roundRect(compassX - badgeW / 2, badgeY, badgeW, badgeH, 6);
          ctx.fill();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ctx.fillStyle = '#fef08a';
          ctx.fillText(badgeText, compassX, badgeY + badgeH / 2);

          // 9. Nitro Boost HUD Gauge with CLEAR VERTICAL SPACING (16px gap below badge)
          const gap = 16;
          const nitroW = 144;
          const nitroH = 34;
          const nitroX = compassX - nitroW / 2;
          const nitroY = badgeY + badgeH + gap;

          // Dark rounded container with cyan border
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.beginPath();
          ctx.roundRect(nitroX, nitroY, nitroW, nitroH, 8);
          ctx.fill();
          ctx.strokeStyle = engine.boat.isBoosting ? '#38bdf8' : '#0284c7';
          ctx.lineWidth = engine.boat.isBoosting ? 2 : 1.2;
          ctx.stroke();

          // Header Row: ⚡ NITRO on left, SPACE on right
          ctx.font = 'bold 10px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = engine.boat.isBoosting ? '#38bdf8' : '#7dd3fc';
          ctx.fillText('⚡ NITRO', nitroX + 10, nitroY + 11);

          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'right';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('SPACE', nitroX + nitroW - 10, nitroY + 11);

          // Progress bar trough
          const barX = nitroX + 9;
          const barY = nitroY + 19;
          const barW = nitroW - 18;
          const barH = 8;
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(barX, barY, barW, barH, 4);
          ctx.fill();

          // Active Nitro Bar Fill
          const fillRatio = Math.max(0, Math.min(1, engine.boat.nitro / 100));
          if (fillRatio > 0.02) {
            const fillW = Math.max(4, barW * fillRatio);
            const nitroGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
            nitroGrad.addColorStop(0, '#0284c7');
            nitroGrad.addColorStop(1, '#38bdf8');
            ctx.fillStyle = nitroGrad;
            ctx.beginPath();
            ctx.roundRect(barX, barY, fillW, barH, 4);
            ctx.fill();
          }

          ctx.restore();
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [checkpointIndex, fever, paused]);

  // Handle window resizing
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="sailing-viewport">
      <canvas ref={canvasRef} className="sailing-canvas" />

      {/* On-screen Directional Touch Controls for mobile/tablet */}
      <div className="sailing-touch-controls">
        <button
          type="button"
          className="touch-btn touch-nitro"
          onPointerDown={() => (keysRef.current.boost = true)}
          onPointerUp={() => (keysRef.current.boost = false)}
          onPointerLeave={() => (keysRef.current.boost = false)}
          aria-label="Nitro Speed Boost"
          title="Hold for Turbo Speed Burst!"
        >
          ⚡ NITRO
        </button>
        <button
          type="button"
          className="touch-btn touch-up"
          onPointerDown={() => (keysRef.current.up = true)}
          onPointerUp={() => (keysRef.current.up = false)}
          onPointerLeave={() => (keysRef.current.up = false)}
          aria-label="Thrust Forward"
        >
          ▲
        </button>
        <div className="touch-middle">
          <button
            type="button"
            className="touch-btn touch-left"
            onPointerDown={() => (keysRef.current.left = true)}
            onPointerUp={() => (keysRef.current.left = false)}
            onPointerLeave={() => (keysRef.current.left = false)}
            aria-label="Steer Left"
          >
            ◀
          </button>
          <button
            type="button"
            className="touch-btn touch-down"
            onPointerDown={() => (keysRef.current.down = true)}
            onPointerUp={() => (keysRef.current.down = false)}
            onPointerLeave={() => (keysRef.current.down = false)}
            aria-label="Reverse"
          >
            ▼
          </button>
          <button
            type="button"
            className="touch-btn touch-right"
            onPointerDown={() => (keysRef.current.right = true)}
            onPointerUp={() => (keysRef.current.right = false)}
            onPointerLeave={() => (keysRef.current.right = false)}
            aria-label="Steer Right"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
