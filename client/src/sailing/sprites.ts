// [AI-ASSISTED: Codex, 2026-11-05] Canvas sprite rendering for Pirate Island game assets.
import type { Pier, Island, Obstacle, Shark, DecorativeIslet } from './mapData';

// Draw animated vibrant tropical ocean background with zone depth gradients and caustics
export function drawOceanBackground(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  viewW: number,
  viewH: number,
  now: number,
) {
  // Vibrant Tropical Depth zones:
  // Shallow Reef (bright turquoise #22d3ee) -> Twilight Waters (azure #0284c7) -> Skull Trench (rich sapphire #024b6e)
  const grad = ctx.createLinearGradient(0, 0, 0, 2000);
  grad.addColorStop(0, '#024b6e'); // Deep Trench Top
  grad.addColorStop(0.25, '#0369a1'); // Skull Waters
  grad.addColorStop(0.5, '#0284c7'); // Twilight Waters
  grad.addColorStop(0.72, '#0ea5e9'); // Coral Crossing
  grad.addColorStop(0.88, '#06b6d4'); // Shallow Reef
  grad.addColorStop(1, '#22d3ee'); // Tropical Shoreline

  ctx.fillStyle = grad;
  // Fill the entire camera viewport in world space (with 100px safety margin on all sides)
  ctx.fillRect(cameraX - 100, cameraY - 100, viewW + 200, viewH + 200);

  // Sparkling animated water caustics / light grid
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.6;
  const shift = (now * 0.025) % 80;
  const startX = Math.floor((cameraX - 80) / 70) * 70;
  const endX = cameraX + viewW + 80;
  const startY = Math.floor((cameraY - 80) / 35) * 35;
  const endY = cameraY + viewH + 80;

  for (let x = startX; x < endX; x += 70) {
    ctx.beginPath();
    for (let y = startY; y < endY; y += 35) {
      const wave = Math.sin((y + now * 0.035) * 0.04) * 8;
      if (y === startY) ctx.moveTo(x + wave + shift, y);
      else ctx.lineTo(x + wave + shift, y);
    }
    ctx.stroke();
  }

  // Cross caustics shimmer
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 1.2;
  for (let y = startY; y < endY; y += 50) {
    ctx.beginPath();
    for (let x = startX; x < endX; x += 40) {
      const wave = Math.cos((x + now * 0.03) * 0.04) * 7;
      if (x === startX) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Draw Stepped 3D Cartoon Sandy Islets matching uploaded reference art
export function drawDecorativeIslet(
  ctx: CanvasRenderingContext2D,
  islet: DecorativeIslet,
  now: number,
) {
  const { x, y, width, height, hasPalm, palmOffset } = islet;
  ctx.save();

  // 1. Foaming Water Shoreline Ring
  const foamWave = Math.sin(now * 0.004 + x) * 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  ctx.roundRect(
    x - width / 2 - 10 - foamWave,
    y - height / 2 - 10 - foamWave,
    width + 20 + foamWave * 2,
    height + 20 + foamWave * 2,
    24,
  );
  ctx.fill();

  // 2. Base Shallow Sandbar (Warm golden shoreline #f59e0b)
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.roundRect(x - width / 2 - 4, y - height / 2 - 4, width + 8, height + 8, 20);
  ctx.fill();

  // 3. Middle Sand Tier (#fcd34d)
  ctx.fillStyle = '#fcd34d';
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, 16);
  ctx.fill();

  // 4. Top Sand Plateau (#fef08a)
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.roundRect(x - width / 2 + 8, y - height / 2 + 6, width - 16, height - 12, 12);
  ctx.fill();

  // Decorative Starfish & Seashells
  ctx.fillStyle = '#f43f5e'; // Pink starfish
  ctx.beginPath();
  ctx.arc(x - width * 0.25, y + height * 0.2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fed7aa'; // Shell
  ctx.beginPath();
  ctx.arc(x + width * 0.28, y - height * 0.15, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // 5. Coconut Palm Tree
  if (hasPalm) {
    const px = x + (palmOffset?.dx ?? 0);
    const py = y + (palmOffset?.dy ?? 0);
    const sway = Math.sin(now * 0.003 + x) * 4;

    // Palm shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(px + 10, py + 8, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Curved Trunk
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + 10, py - 24, px + sway, py - 46);
    ctx.stroke();

    // Ring segments on trunk
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px + 4, py - 14, 3, 0, Math.PI * 2);
    ctx.arc(px + 7, py - 28, 3, 0, Math.PI * 2);
    ctx.stroke();

    // Coconuts
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.arc(px + sway - 3, py - 44, 3.2, 0, Math.PI * 2);
    ctx.arc(px + sway + 3, py - 44, 3.2, 0, Math.PI * 2);
    ctx.arc(px + sway, py - 41, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Lush Palm Fronds
    const frondColors = ['#16a34a', '#22c55e', '#4ade80', '#15803d', '#22c55e'];
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5 + (sway * 0.02);
      ctx.fillStyle = frondColors[i];
      ctx.beginPath();
      const fx = px + sway + Math.cos(angle) * 16;
      const fy = py - 46 + Math.sin(angle) * 12;
      ctx.ellipse(fx, fy, 18, 7, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.restore();
}

// Draw the Player Pirate Ship matching the reference art
export function drawBoat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  speed: number,
  fever: boolean,
  invincible: boolean,
  now: number,
  isBoosting = false,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Invincibility flashing
  if (invincible && Math.floor(now / 120) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  // Nitro Boost Hydrodynamic Blue Water Plume Spread behind stern
  if (isBoosting) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const spread = Math.sin(now * 0.03 + i * 1.5) * (7 + i * 4);
      const dist = 32 + i * 14;
      const radius = 9 + i * 4;
      const alpha = 0.85 - i * 0.18;
      // Vibrant electric blue spray
      ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.beginPath();
      ctx.arc(spread * 0.4, dist, radius, 0, Math.PI * 2);
      ctx.fill();
      // Frothy white core
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(spread * 0.2, dist - 2, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Crisp translucent water ripples trailing behind stern (clean cartoon V-wake, no smoky mist!)
  if (Math.abs(speed) > 6 && !isBoosting) {
    ctx.save();
    ctx.strokeStyle = fever ? 'rgba(254, 240, 138, 0.7)' : 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';

    // Thin V-wake lines matching reference art
    const wakeSpread = 8 + (Math.abs(speed) / 155) * 6;
    ctx.beginPath();
    ctx.moveTo(-6, 26);
    ctx.quadraticCurveTo(-wakeSpread - 4, 34, -wakeSpread - 8, 42);
    ctx.moveTo(6, 26);
    ctx.quadraticCurveTo(wakeSpread + 4, 34, wakeSpread + 8, 42);
    ctx.stroke();

    // Subtle stern ripple arc
    ctx.beginPath();
    ctx.arc(0, 29, 6 + Math.sin(now * 0.05) * 1.5, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  // Boat shadow on water
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(5, 5, 17, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wooden Hull (Warm mahogany brown with golden trim)
  ctx.fillStyle = '#653112';
  ctx.beginPath();
  ctx.moveTo(0, -30); // Bow tip
  ctx.bezierCurveTo(20, -15, 20, 16, 13, 27); // Right side
  ctx.lineTo(-13, 27); // Stern
  ctx.bezierCurveTo(-20, 16, -20, -15, 0, -30); // Left side
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#f59e0b'; // Gold Gunwale Trim!
  ctx.stroke();

  // Wooden deck plank lines
  ctx.fillStyle = '#9a5322';
  ctx.beginPath();
  ctx.moveTo(0, -23);
  ctx.bezierCurveTo(14, -10, 14, 14, 9, 23);
  ctx.lineTo(-9, 23);
  ctx.bezierCurveTo(-14, 14, -14, -10, 0, -23);
  ctx.closePath();
  ctx.fill();

  // Deck lines
  ctx.strokeStyle = '#5a2d0d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(0, 20);
  ctx.moveTo(-5, -10);
  ctx.lineTo(-5, 18);
  ctx.moveTo(5, -10);
  ctx.lineTo(5, 18);
  ctx.stroke();

  // Brass Stern Lantern
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.arc(0, 25, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Mast & Yardarm
  ctx.strokeStyle = '#432107';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(0, -8);
  ctx.moveTo(-18, -2);
  ctx.lineTo(18, -2);
  ctx.stroke();

  // Billowing Main Sail (Black/Gold skull sail)
  ctx.fillStyle = fever ? '#ffd700' : '#1c2228';
  ctx.beginPath();
  ctx.moveTo(-17, -2);
  ctx.quadraticCurveTo(0, -12, 17, -2);
  ctx.quadraticCurveTo(0, 4, -17, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = fever ? '#b8860b' : '#0d1115';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Skull emblem on sail
  ctx.fillStyle = fever ? '#331a00' : '#e6edf3';
  ctx.beginPath();
  ctx.arc(0, -4, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-1.8, -2, 3.6, 2.2);

  // Bowsprit
  ctx.strokeStyle = '#432107';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(0, -35);
  ctx.stroke();

  ctx.restore();
}

// Draw Wooden Pier Checkpoint (1 to 14)
export function drawPier(
  ctx: CanvasRenderingContext2D,
  pier: Pier,
  isActive: boolean,
  isCompleted: boolean,
  now: number,
) {
  const { x, y } = pier;

  // Active glowing docking target ring (cyan target ring matching reference icon)
  if (isActive) {
    const pulse = 1 + Math.sin(now * 0.006) * 0.12;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y + 20, 42 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
    ctx.beginPath();
    ctx.arc(x, y + 20, 56 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Four target crosshair brackets
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      ctx.save();
      ctx.translate(x, y + 20);
      ctx.rotate(angle);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(34 * pulse, -8);
      ctx.lineTo(44 * pulse, -8);
      ctx.lineTo(44 * pulse, 8);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // Wooden Pier Structure
  ctx.save();
  // Water shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(x - 22, y - 28, 44, 56);

  // Wood planks
  ctx.fillStyle = '#7c431d';
  ctx.fillRect(x - 24, y - 30, 48, 54);
  ctx.strokeStyle = '#4a250c';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 24, y - 30, 48, 54);

  // Individual horizontal planks
  ctx.strokeStyle = '#5c3114';
  ctx.lineWidth = 1.5;
  for (let py = y - 24; py < y + 24; py += 8) {
    ctx.beginPath();
    ctx.moveTo(x - 23, py);
    ctx.lineTo(x + 23, py);
    ctx.stroke();
  }

  // Wooden mooring posts / pilings with rope caps
  const posts = [
    { px: x - 22, py: y - 28 },
    { px: x + 22, py: y - 28 },
    { px: x - 22, py: y + 22 },
    { px: x + 22, py: y + 22 },
  ];
  for (const p of posts) {
    ctx.fillStyle = '#4a250c';
    ctx.beginPath();
    ctx.arc(p.px, p.py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c89d6c'; // rope wrapping
    ctx.beginPath();
    ctx.arc(p.px, p.py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pier Label Signboard (Vivid amber for active target, green for cleared, weathered oak for uncharted)
  ctx.fillStyle = isCompleted ? '#166534' : isActive ? '#d97706' : '#3e2723';
  ctx.beginPath();
  ctx.roundRect(x - 34, y - 48, 68, 17, 5);
  ctx.fill();
  ctx.strokeStyle = isActive ? '#fbbf24' : isCompleted ? '#86efac' : '#795548';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px "Luckiest Guy", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isCompleted) {
    ctx.fillStyle = '#bbf7d0';
    ctx.fillText(`✓ PIER ${pier.index}`, x, y - 39);
  } else if (isActive) {
    ctx.fillStyle = '#fef08a';
    ctx.fillText(`★ PIER ${pier.index}`, x, y - 39);
  } else {
    // Uncharted piers show their authentic nautical name to inspire genuine seeking and exploration
    ctx.fillStyle = '#d7ccc8';
    ctx.fillText(`⚓ ${pier.name}`, x, y - 39);
  }

  ctx.restore();
}

// Draw Checkpoint 15: The Final Pirate Treasure Island!
export function drawFinalIsland(
  ctx: CanvasRenderingContext2D,
  island: Island,
  isActive: boolean,
  now: number,
) {
  const { x, y, radius } = island;

  ctx.save();
  // Golden island aura when active
  if (isActive) {
    const glow = ctx.createRadialGradient(x, y, radius * 0.7, x, y, radius * 1.5);
    glow.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
    glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sandbar base (warm tropical yellow)
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Layered rock cliffs
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.ellipse(x, y - 15, radius * 0.65, radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Palm Trees (swaying fronds)
  const palmOffset = Math.sin(now * 0.003) * 3;
  const palms = [
    { px: x - 50, py: y - 20 },
    { px: x + 45, py: y - 25 },
  ];
  for (const palm of palms) {
    // Trunk
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(palm.px, palm.py);
    ctx.quadraticCurveTo(palm.px + 6, palm.py - 20, palm.px + palmOffset, palm.py - 35);
    ctx.stroke();

    // Green fronds
    ctx.fillStyle = '#22c55e';
    for (let a = 0; a < 5; a++) {
      const angle = (a * Math.PI) / 2.5 + now * 0.001;
      ctx.beginPath();
      ctx.ellipse(
        palm.px + palmOffset + Math.cos(angle) * 12,
        palm.py - 35 + Math.sin(angle) * 8,
        14,
        6,
        angle,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  // Shipwreck Mast with Pirate Flag
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x - 20, y + 10);
  ctx.lineTo(x - 10, y - 45);
  ctx.stroke();

  // Jolly Roger Pirate Flag fluttering
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 45);
  ctx.quadraticCurveTo(x + 10, y - 40 + Math.sin(now * 0.01) * 3, x + 25, y - 43);
  ctx.lineTo(x + 23, y - 28);
  ctx.quadraticCurveTo(x + 10, y - 26, x - 10, y - 32);
  ctx.closePath();
  ctx.fill();

  // Golden Treasure Chest at the dock
  ctx.fillStyle = '#b45309'; // Chest wood
  ctx.fillRect(x - 14, y + 25, 28, 18);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 14, y + 25, 28, 18);

  // Chest Gold trim & lock
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 14, y + 29, 28, 4);
  ctx.beginPath();
  ctx.arc(x, y + 33, 3, 0, Math.PI * 2);
  ctx.fill();

  // Sparkling Piles of Gold Coins & Rubies (matching reference art)
  ctx.fillStyle = '#facc15';
  const coinOffsets = [
    { cx: x + 18, cy: y + 30 },
    { cx: x + 23, cy: y + 28 },
    { cx: x + 28, cy: y + 32 },
    { cx: x - 20, cy: y + 31 },
    { cx: x - 25, cy: y + 29 },
  ];
  for (const c of coinOffsets) {
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // Gem sparkles
  ctx.fillStyle = Math.sin(now * 0.01) > 0 ? '#ef4444' : '#10b981';
  ctx.beginPath();
  ctx.arc(x + 21, y + 25, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Signboard: "FINAL DESTINATION: PIRATE ISLAND"
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.roundRect(x - 75, y - 80, 150, 22, 6);
  ctx.fill();
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px "Titan One", "Luckiest Guy", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⭐ FINAL ISLAND #15 ⭐', x, y - 69);

  ctx.restore();
}

// Draw Sea Obstacles (Rocks, Barrels, Coral)
export function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle, now: number) {
  const { x, y, radius, type } = obs;
  ctx.save();

  if (type === 'rock' || type === 'palm_rock') {
    // Water lap ripple
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius + 4 + Math.sin(now * 0.005) * 2, 0, Math.PI * 2);
    ctx.stroke();

    // Dark grey rock base
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Light highlight
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    if (type === 'palm_rock') {
      // Mini palm on top of rock
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(x, y - 8, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'barrel') {
    // Floating wooden barrel bobbing in water
    const bob = Math.sin((now * 0.004) + x) * 2;
    ctx.translate(x, y + bob);

    ctx.fillStyle = '#854d0e';
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Iron hoops on barrel
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// Draw Patrolling / Chasing Cartoon Predator Shark
export function drawShark(ctx: CanvasRenderingContext2D, shark: Shark, now: number) {
  const { x, y, angle, state } = shark;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Red alert sonar ring & exclamation badge when chasing player
  if (state === 'CHASE') {
    const pulse = 1 + Math.sin(now * 0.015) * 0.2;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 36 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Exclamation badge above shark
    ctx.save();
    ctx.rotate(-angle); // Keep upright
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, -32, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, -32);
    ctx.restore();
  }

  // Swimming water wake ripples around shark
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 10, 12, -0.4 * Math.PI, 0.4 * Math.PI);
  ctx.stroke();

  // Pectoral Fins (Left & Right)
  ctx.fillStyle = state === 'CHASE' ? '#1e293b' : '#334155';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;

  // Left fin
  ctx.beginPath();
  ctx.moveTo(-10, 4);
  ctx.lineTo(-24, -4);
  ctx.lineTo(-10, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right fin
  ctx.beginPath();
  ctx.moveTo(10, 4);
  ctx.lineTo(24, -4);
  ctx.lineTo(10, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shark Main Body (Tapered torpedo predator shape)
  ctx.beginPath();
  ctx.moveTo(0, 24); // Snout
  ctx.bezierCurveTo(12, 14, 12, -8, 5, -20);
  // Animated Wagging Tail
  const wag = Math.sin(now * 0.012) * 4.5;
  ctx.lineTo(10 + wag, -30); // Top tail point
  ctx.lineTo(2 + wag * 0.5, -23); // Notch
  ctx.lineTo(-10 + wag, -30); // Bottom tail point
  ctx.lineTo(-5, -20);
  ctx.bezierCurveTo(-12, -8, -12, 14, 0, 24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // White underbelly jaw accent
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(5, 14);
  ctx.lineTo(-5, 14);
  ctx.closePath();
  ctx.fill();

  // Dorsal fin breaking surface with white wave highlight
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(5, -4);
  ctx.lineTo(0, -7);
  ctx.lineTo(-5, -4);
  ctx.closePath();
  ctx.fill();

  // White foam crest on dorsal fin
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(0, -7);
  ctx.stroke();

  // Menacing Predator Eyes
  ctx.fillStyle = state === 'CHASE' ? '#ef4444' : '#facc15';
  ctx.beginPath();
  ctx.arc(-6, 12, 2.2, 0, Math.PI * 2);
  ctx.arc(6, 12, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
