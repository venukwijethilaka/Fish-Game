// [AI-ASSISTED: Codex, 2026-11-05] 2D Pirate Island map data: 14 Piers, Final Island #15, obstacles, sharks, and land collision physics.

export interface Pier {
  index: number;
  name: string;
  zone: 'EASY' | 'MEDIUM' | 'HARD';
  x: number;
  y: number;
  label: string;
}

export interface Island {
  index: number;
  name: string;
  x: number;
  y: number;
  radius: number;
}

export interface DecorativeIslet {
  x: number;
  y: number;
  width: number;
  height: number;
  hasPalm?: boolean;
  palmOffset?: { dx: number; dy: number };
}

export interface Obstacle {
  id: string;
  type: 'rock' | 'barrel' | 'palm_rock';
  x: number;
  y: number;
  radius: number;
}

export interface Shark {
  id: string;
  x: number;
  y: number;
  angle: number;
  patrolA: { x: number; y: number };
  patrolB: { x: number; y: number };
  speed: number;
  detectionRadius: number;
  targetA: boolean;
  state: 'PATROL' | 'CHASE';
}

export const WORLD_WIDTH = 2200;
export const WORLD_HEIGHT = 2000;

// Diverse open-water candidate locations for piers across the sea (free of all islets and hazards)
const PIER_CANDIDATES = [
  { x: 420, y: 1780, name: 'Coral Pier' },
  { x: 880, y: 1820, name: 'Starfish Dock' },
  { x: 1400, y: 1800, name: 'Seashell Wharf' },
  { x: 1820, y: 1760, name: 'Palm Jetty' },
  { x: 480, y: 1560, name: 'Anchor Point' },
  { x: 1100, y: 1580, name: 'Lagoon Quay' },
  { x: 1720, y: 1540, name: 'Reef Gateway' },
  { x: 680, y: 1380, name: 'Smuggler Landing' },
  { x: 1280, y: 1380, name: 'Pelican Berth' },
  { x: 1880, y: 1360, name: 'Driftwood Quay' },
  { x: 440, y: 1180, name: 'Lantern Dock' },
  { x: 1220, y: 1180, name: 'Shipwreck Pier' },
  { x: 1800, y: 1140, name: 'Twilight Gate' },
  { x: 520, y: 960, name: 'Mist Pier' },
  { x: 1120, y: 940, name: 'Shadow Landing' },
  { x: 1720, y: 940, name: 'Black Pearl Dock' },
  { x: 460, y: 760, name: 'Grog Wharf' },
  { x: 1320, y: 760, name: 'Buccaneer Berth' },
  { x: 1840, y: 740, name: 'Tortuga Pier' },
  { x: 480, y: 580, name: 'Skull Reach' },
  { x: 1680, y: 560, name: 'Shadow Jetty' },
  { x: 580, y: 380, name: 'Kraken Wharf' },
  { x: 1260, y: 400, name: 'Bounty Landing' },
  { x: 1760, y: 360, name: 'Dead Man Dock' },
];

const pierCache = new Map<string, Pier[]>();

/**
 * Generate randomized pier locations for a game.
 * Uses a deterministic hash of gameId so every voyage has a unique, scattered pier distribution,
 * preventing any sequential or predictable ladder layout.
 */
export function getPiers(gameId?: string): Pier[] {
  const key = gameId || 'default-pirate-seed';
  if (pierCache.has(key)) return pierCache.get(key)!;

  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const rng = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };

  const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // Select 14 randomized, scattered slots from across the open ocean candidate pool
  const chosenSlots = shuffle(PIER_CANDIDATES).slice(0, 14);

  const result: Pier[] = chosenSlots.map((slot, i) => {
    const checkpointNum = i + 1;
    const zone: 'EASY' | 'MEDIUM' | 'HARD' =
      checkpointNum <= 5 ? 'EASY' : checkpointNum <= 10 ? 'MEDIUM' : 'HARD';
    return {
      index: checkpointNum,
      name: slot.name,
      zone,
      x: slot.x,
      y: slot.y,
      label: `Pier ${checkpointNum}`,
    };
  });

  pierCache.set(key, result);
  return result;
}

// 14 Wooden Piers + 1 Final Pirate Treasure Island (#15)
export const PIERS: Pier[] = getPiers();

export const FINAL_ISLAND: Island = {
  index: 15,
  name: 'Pirate Treasure Island',
  x: 1100,
  y: 200,
  radius: 120,
};

// Tropical sandbars & palm islets acting as physical obstacles (land boundaries)
export const DECORATIVE_ISLETS: DecorativeIslet[] = [
  // Shallow Reef (Golden sandy banks with palms)
  { x: 180, y: 1840, width: 140, height: 90, hasPalm: true, palmOffset: { dx: -20, dy: -10 } },
  { x: 1150, y: 1840, width: 130, height: 75, hasPalm: false },
  { x: 2050, y: 1750, width: 120, height: 80, hasPalm: true, palmOffset: { dx: -10, dy: -15 } },
  { x: 800, y: 1580, width: 120, height: 75, hasPalm: false },
  { x: 1450, y: 1620, width: 130, height: 85, hasPalm: true, palmOffset: { dx: 15, dy: -5 } },
  { x: 250, y: 1390, width: 110, height: 75, hasPalm: true, palmOffset: { dx: 10, dy: 5 } },
  { x: 1520, y: 1400, width: 120, height: 75, hasPalm: true, palmOffset: { dx: 12, dy: -6 } },

  // Twilight Waters (Sandbars and coral banks)
  { x: 200, y: 1220, width: 130, height: 85, hasPalm: true, palmOffset: { dx: -15, dy: -5 } },
  { x: 1050, y: 1220, width: 140, height: 80, hasPalm: false },
  { x: 2050, y: 1180, width: 130, height: 85, hasPalm: true, palmOffset: { dx: -10, dy: -10 } },
  { x: 750, y: 1020, width: 130, height: 80, hasPalm: false },
  { x: 1420, y: 1020, width: 130, height: 80, hasPalm: true, palmOffset: { dx: 16, dy: 0 } },
  { x: 220, y: 860, width: 120, height: 80, hasPalm: true, palmOffset: { dx: 15, dy: -5 } },
  { x: 1550, y: 780, width: 120, height: 70, hasPalm: false },

  // Skull Trench (Rugged outer reef edges framing the final route)
  { x: 200, y: 620, width: 140, height: 90, hasPalm: true, palmOffset: { dx: -20, dy: -10 } },
  { x: 1100, y: 580, width: 140, height: 80, hasPalm: false },
  { x: 2020, y: 560, width: 130, height: 90, hasPalm: true, palmOffset: { dx: 10, dy: -10 } },
  { x: 800, y: 440, width: 120, height: 75, hasPalm: false },
  { x: 1420, y: 440, width: 120, height: 75, hasPalm: false },
  { x: 300, y: 260, width: 130, height: 85, hasPalm: true, palmOffset: { dx: -15, dy: 0 } },
  { x: 1900, y: 260, width: 130, height: 85, hasPalm: true, palmOffset: { dx: 15, dy: -5 } },
];

// Sea hazards: jagged rocks and floating powder barrels
export const OBSTACLES: Obstacle[] = [
  // Shallow Reef obstacles
  { id: 'r1', type: 'rock', x: 900, y: 1780, radius: 26 },
  { id: 'b1', type: 'barrel', x: 1400, y: 1780, radius: 20 },
  { id: 'r2', type: 'palm_rock', x: 700, y: 1620, radius: 30 },
  { id: 'b2', type: 'barrel', x: 1250, y: 1520, radius: 20 },
  { id: 'r3', type: 'rock', x: 1650, y: 1540, radius: 28 },

  // Twilight Waters obstacles
  { id: 'r4', type: 'rock', x: 700, y: 1180, radius: 28 },
  { id: 'b3', type: 'barrel', x: 1350, y: 1180, radius: 22 },
  { id: 'r5', type: 'palm_rock', x: 1100, y: 1020, radius: 32 },
  { id: 'r6', type: 'rock', x: 600, y: 920, radius: 28 },
  { id: 'b4', type: 'barrel', x: 1250, y: 880, radius: 22 },

  // Skull Trench obstacles
  { id: 'r7', type: 'rock', x: 650, y: 520, radius: 30 },
  { id: 'r8', type: 'palm_rock', x: 1450, y: 520, radius: 34 },
  { id: 'b5', type: 'barrel', x: 920, y: 420, radius: 22 },
  { id: 'r9', type: 'rock', x: 1280, y: 420, radius: 30 },
  { id: 'r10', type: 'rock', x: 780, y: 280, radius: 28 },
  { id: 'r11', type: 'rock', x: 1420, y: 280, radius: 28 },
  { id: 'r12', type: 'rock', x: 920, y: 180, radius: 26 },
  { id: 'r13', type: 'rock', x: 1280, y: 180, radius: 26 },
];

// Patrolling / Chasing Sharks navigating the open water channels
export const INITIAL_SHARKS: Shark[] = [
  // Zone 1: slow guardian shark in wide open sea corridor
  {
    id: 's1',
    x: 650,
    y: 1720,
    angle: 0,
    patrolA: { x: 450, y: 1720 },
    patrolB: { x: 880, y: 1720 },
    speed: 1.5,
    detectionRadius: 160,
    targetA: false,
    state: 'PATROL',
  },
  // Zone 2: twin patrol sharks in deep open channels (strictly cleared from all islets)
  {
    id: 's2',
    x: 520,
    y: 1110,
    angle: 0,
    patrolA: { x: 380, y: 1110 },
    patrolB: { x: 640, y: 1110 },
    speed: 2.0,
    detectionRadius: 190,
    targetA: false,
    state: 'PATROL',
  },
  {
    id: 's3',
    x: 1750,
    y: 980,
    angle: 0,
    patrolA: { x: 1600, y: 980 },
    patrolB: { x: 1900, y: 980 },
    speed: 2.1,
    detectionRadius: 190,
    targetA: false,
    state: 'PATROL',
  },
  // Zone 3: fast aggressive Skull Trench sharks in open channels
  {
    id: 's4',
    x: 550,
    y: 500,
    angle: 0,
    patrolA: { x: 420, y: 500 },
    patrolB: { x: 680, y: 500 },
    speed: 2.6,
    detectionRadius: 230,
    targetA: false,
    state: 'PATROL',
  },
  {
    id: 's5',
    x: 1680,
    y: 480,
    angle: 0,
    patrolA: { x: 1550, y: 480 },
    patrolB: { x: 1820, y: 480 },
    speed: 2.7,
    detectionRadius: 240,
    targetA: false,
    state: 'PATROL',
  },
];

/**
 * Test circle collision against a rounded rectangular sandbar/islet.
 * Returns whether collision occurred and the ejection vector to push the circle outside the island.
 */
export function testIsletCollision(
  px: number,
  py: number,
  radius: number,
  islet: DecorativeIslet,
): { collided: boolean; pushX: number; pushY: number } {
  // Use 46% of width/height for the solid sand core
  const hw = islet.width * 0.46;
  const hh = islet.height * 0.46;
  const closestX = Math.max(islet.x - hw, Math.min(px, islet.x + hw));
  const closestY = Math.max(islet.y - hh, Math.min(py, islet.y + hh));
  const dx = px - closestX;
  const dy = py - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq < radius * radius) {
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      return {
        collided: true,
        pushX: (dx / dist) * overlap,
        pushY: (dy / dist) * overlap,
      };
    } else {
      // Inside islet box: push towards nearest exterior edge
      const leftDist = px - (islet.x - hw);
      const rightDist = (islet.x + hw) - px;
      const topDist = py - (islet.y - hh);
      const bottomDist = (islet.y + hh) - py;
      const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
      if (minDist === leftDist) return { collided: true, pushX: -(leftDist + radius), pushY: 0 };
      if (minDist === rightDist) return { collided: true, pushX: rightDist + radius, pushY: 0 };
      if (minDist === topDist) return { collided: true, pushX: 0, pushY: -(topDist + radius) };
      return { collided: true, pushX: 0, pushY: bottomDist + radius };
    }
  }
  return { collided: false, pushX: 0, pushY: 0 };
}

/**
 * Test circle collision against Final Island (#15).
 * When active checkpoint is 15 and approaching dock from south, docking is allowed.
 */
export function testFinalIslandCollision(
  px: number,
  py: number,
  radius: number,
  isDockingActive: boolean,
): { collided: boolean; pushX: number; pushY: number } {
  // If approaching the southern dock entrance for the final quiz, allow docking
  if (isDockingActive && py >= FINAL_ISLAND.y + 35 && Math.abs(px - FINAL_ISLAND.x) <= 65) {
    return { collided: false, pushX: 0, pushY: 0 };
  }

  const islandRadius = FINAL_ISLAND.radius - 20; // solid core
  const dx = px - FINAL_ISLAND.x;
  const dy = py - FINAL_ISLAND.y;
  const dist = Math.hypot(dx, dy);
  const minAllowed = islandRadius + radius;

  if (dist < minAllowed) {
    const overlap = minAllowed - dist;
    const nx = dist > 0.001 ? dx / dist : 0;
    const ny = dist > 0.001 ? dy / dist : 1;
    return {
      collided: true,
      pushX: nx * overlap,
      pushY: ny * overlap,
    };
  }
  return { collided: false, pushX: 0, pushY: 0 };
}

/**
 * Check if a point (with clearance radius) overlaps any land (islets or final island).
 * Used by sharks and obstacle physics to ensure they never traverse over land.
 */
export function isPointOnLand(x: number, y: number, radius = 22): boolean {
  for (const islet of DECORATIVE_ISLETS) {
    const hw = islet.width * 0.46;
    const hh = islet.height * 0.46;
    const closestX = Math.max(islet.x - hw, Math.min(x, islet.x + hw));
    const closestY = Math.max(islet.y - hh, Math.min(y, islet.y + hh));
    const dx = x - closestX;
    const dy = y - closestY;
    if (dx * dx + dy * dy < radius * radius) {
      return true;
    }
  }
  const distIsland = Math.hypot(x - FINAL_ISLAND.x, y - FINAL_ISLAND.y);
  if (distIsland < FINAL_ISLAND.radius - 15 + radius) {
    return true;
  }
  return false;
}

export function getStartingPosition(
  checkpointIndex: number,
  piers: Pier[] = PIERS,
): { x: number; y: number; angle: number } {
  // At initial start of voyage, position ship at the southern harbor anchorage in open waters
  // Captain must consult their compass to navigate toward Pier 1!
  if (checkpointIndex <= 1) {
    return {
      x: 1050,
      y: 1900,
      angle: 0,
    };
  }
  if (checkpointIndex <= 14) {
    const prevPier = piers.find((p) => p.index === checkpointIndex - 1);
    if (prevPier) {
      return {
        x: prevPier.x,
        y: Math.min(WORLD_HEIGHT - 70, prevPier.y + 75),
        angle: 0,
      };
    }
  }
  if (checkpointIndex === 15) {
    const pier14 = piers.find((p) => p.index === 14);
    if (pier14) {
      return {
        x: pier14.x,
        y: Math.min(WORLD_HEIGHT - 70, pier14.y + 75),
        angle: 0,
      };
    }
  }
  return { x: 1050, y: 1900, angle: 0 };
}
