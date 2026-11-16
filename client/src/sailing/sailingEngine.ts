// [AI-ASSISTED: Codex, 2026-11-05] 2D Boat kinematics, Shark steering AI, and spatial land collision physics.
import {
  PIERS,
  getPiers,
  FINAL_ISLAND,
  DECORATIVE_ISLETS,
  OBSTACLES,
  INITIAL_SHARKS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  getStartingPosition,
  testIsletCollision,
  testFinalIslandCollision,
  isPointOnLand,
  type Pier,
  type Shark,
} from './mapData';

export interface BoatState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  nitro: number; // 0 to 100%
  isBoosting: boolean;
}

export interface InputKeys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
}

export class SailingEngine {
  boat: BoatState;
  sharks: Shark[];
  piers: Pier[];
  activeCheckpoint: number;
  fever: boolean;
  lastHitTime = 0;
  dockTriggered = false;
  onDock: (checkpointIndex: number) => void;
  onHit: (hazardType: 'rock' | 'barrel' | 'shark') => void;

  constructor(
    checkpointIndex: number,
    fever: boolean,
    onDock: (checkpointIndex: number) => void,
    onHit: (hazardType: 'rock' | 'barrel' | 'shark') => void,
    gameId?: string,
  ) {
    this.piers = getPiers(gameId);
    this.activeCheckpoint = checkpointIndex;
    this.fever = fever;
    this.onDock = onDock;
    this.onHit = onHit;

    const start = getStartingPosition(checkpointIndex, this.piers);
    this.boat = {
      x: start.x,
      y: start.y,
      vx: 0,
      vy: 0,
      angle: start.angle,
      speed: 0,
      nitro: 100,
      isBoosting: false,
    };
    // Clone sharks
    this.sharks = INITIAL_SHARKS.map((s) => ({ ...s }));
  }

  setCheckpoint(index: number) {
    if (index !== this.activeCheckpoint) {
      this.activeCheckpoint = index;
      this.dockTriggered = false;
    }
  }

  resetDockTrigger() {
    this.dockTriggered = false;
  }

  setFever(fever: boolean) {
    this.fever = fever;
  }

  update(keys: InputKeys, dt: number, now: number) {
    this.updateBoat(keys, dt);
    this.updateSharks(dt);
    this.checkCollisions(now);
    this.checkDocking();
  }

  private updateBoat(keys: InputKeys, dt: number) {
    const turnSpeed = 2.8;

    // Nitro speed boost handling (SPACE key or on-screen nitro button)
    const wantsBoost = keys.boost && keys.up && this.boat.nitro > 4;
    if (wantsBoost) {
      this.boat.isBoosting = true;
      this.boat.nitro = Math.max(0, this.boat.nitro - 35 * dt);
    } else {
      this.boat.isBoosting = false;
      this.boat.nitro = Math.min(100, this.boat.nitro + 18 * dt);
    }

    const accel = this.boat.isBoosting ? 320 : 180;
    const baseMax = this.boat.isBoosting ? 245 : 155;
    const maxSpeed = this.fever ? baseMax * 1.25 : baseMax; // +25% top speed in Fever mode!
    const drag = 0.94;

    // Steering
    if (keys.left) {
      this.boat.angle -= turnSpeed * dt;
    }
    if (keys.right) {
      this.boat.angle += turnSpeed * dt;
    }

    // Forward thrust
    if (keys.up) {
      this.boat.speed = Math.min(maxSpeed, this.boat.speed + accel * dt);
    } else if (keys.down) {
      // Reverse / Brake
      this.boat.speed = Math.max(-50, this.boat.speed - accel * dt * 0.8);
    } else {
      // Natural water friction drag
      this.boat.speed *= drag;
      if (Math.abs(this.boat.speed) < 2) this.boat.speed = 0;
    }

    // Velocity vectors
    this.boat.vx = Math.sin(this.boat.angle) * this.boat.speed;
    this.boat.vy = -Math.cos(this.boat.angle) * this.boat.speed;

    // Position integration
    this.boat.x += this.boat.vx * dt;
    this.boat.y += this.boat.vy * dt;

    // Solid land collision against all sandbars/islands
    let hitLand = false;
    for (const islet of DECORATIVE_ISLETS) {
      const res = testIsletCollision(this.boat.x, this.boat.y, 16, islet);
      if (res.collided) {
        this.boat.x += res.pushX;
        this.boat.y += res.pushY;
        hitLand = true;
      }
    }
    const finalIslandRes = testFinalIslandCollision(
      this.boat.x,
      this.boat.y,
      16,
      this.activeCheckpoint === 15,
    );
    if (finalIslandRes.collided) {
      this.boat.x += finalIslandRes.pushX;
      this.boat.y += finalIslandRes.pushY;
      hitLand = true;
    }

    // If colliding with solid land, bounce the boat slightly backwards
    if (hitLand && this.boat.speed > 0) {
      this.boat.speed = -35;
    }

    // World boundary clamping
    this.boat.x = Math.max(60, Math.min(WORLD_WIDTH - 60, this.boat.x));
    this.boat.y = Math.max(60, Math.min(WORLD_HEIGHT - 60, this.boat.y));
  }

  // Check if player boat is in a safe docking harbor zone
  private isBoatInSafeZone(): boolean {
    // Near any pier
    for (const p of this.piers) {
      const dist = Math.hypot(this.boat.x - p.x, this.boat.y - (p.y + 20));
      if (dist < 90) return true;
    }
    // Near Final Island
    const distIsland = Math.hypot(this.boat.x - FINAL_ISLAND.x, this.boat.y - FINAL_ISLAND.y);
    if (distIsland < FINAL_ISLAND.radius + 50) return true;
    return false;
  }

  private updateSharks(dt: number) {
    const inSafeZone = this.isBoatInSafeZone();

    for (const s of this.sharks) {
      // Active Land Ejection: Ensure sharks are never positioned on or stuck inside an island
      for (const islet of DECORATIVE_ISLETS) {
        const col = testIsletCollision(s.x, s.y, 28, islet);
        if (col.collided) {
          s.x += col.pushX;
          s.y += col.pushY;
        }
      }

      const distToBoat = Math.hypot(this.boat.x - s.x, this.boat.y - s.y);

      // Aggro / Chase condition
      if (!inSafeZone && distToBoat < s.detectionRadius) {
        s.state = 'CHASE';
        // Steer toward player boat
        const targetAngle = Math.atan2(this.boat.y - s.y, this.boat.x - s.x);
        s.angle = targetAngle - Math.PI / 2;

        const chaseSpeed = s.speed * 60 * 1.35;
        const moveDist = chaseSpeed * dt;
        const stepX = Math.cos(targetAngle) * moveDist;
        const stepY = Math.sin(targetAngle) * moveDist;

        // Never swim onto land! Slide along shore or stop before island
        if (!isPointOnLand(s.x + stepX, s.y + stepY, 22)) {
          s.x += stepX;
          s.y += stepY;
        } else if (!isPointOnLand(s.x + stepX, s.y, 22)) {
          s.x += stepX; // Wall slide along X
        } else if (!isPointOnLand(s.x, s.y + stepY, 22)) {
          s.y += stepY; // Wall slide along Y
        }
      } else {
        s.state = 'PATROL';
        // Patrol back and forth between points A and B
        const target = s.targetA ? s.patrolA : s.patrolB;
        const dx = target.x - s.x;
        const dy = target.y - s.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 20) {
          s.targetA = !s.targetA; // switch waypoint
        } else {
          const moveAngle = Math.atan2(dy, dx);
          s.angle = moveAngle - Math.PI / 2;
          const patrolSpeed = s.speed * 60;
          const moveDist = patrolSpeed * dt;
          const stepX = Math.cos(moveAngle) * moveDist;
          const stepY = Math.sin(moveAngle) * moveDist;

          // Stay in clear water during patrol; if blocked by land, turn around
          if (!isPointOnLand(s.x + stepX, s.y + stepY, 22)) {
            s.x += stepX;
            s.y += stepY;
          } else if (!isPointOnLand(s.x + stepX, s.y, 22)) {
            s.x += stepX;
          } else if (!isPointOnLand(s.x, s.y + stepY, 22)) {
            s.y += stepY;
          } else {
            s.targetA = !s.targetA;
          }
        }
      }
    }
  }

  private checkCollisions(now: number) {
    // 1500ms invincibility cooldown after a hit
    if (now - this.lastHitTime < 1500) return;

    const boatRadius = 16;

    // Check solid sandbars and islets - hitting an island reduces a lifeline!
    for (const islet of DECORATIVE_ISLETS) {
      const res = testIsletCollision(this.boat.x, this.boat.y, 20, islet);
      if (res.collided) {
        this.lastHitTime = now;
        this.boat.speed = -45;
        this.onHit('rock');
        return;
      }
    }

    // Check Final Island solid core (outside active docking entrance)
    const finalRes = testFinalIslandCollision(
      this.boat.x,
      this.boat.y,
      20,
      this.activeCheckpoint === 15,
    );
    if (finalRes.collided) {
      this.lastHitTime = now;
      this.boat.speed = -45;
      this.onHit('rock');
      return;
    }

    // Check rocks and barrels
    for (const obs of OBSTACLES) {
      const dist = Math.hypot(this.boat.x - obs.x, this.boat.y - obs.y);
      if (dist < boatRadius + obs.radius * 0.75) {
        this.lastHitTime = now;
        this.boat.speed = -40;
        this.onHit(obs.type === 'barrel' ? 'barrel' : 'rock');
        return;
      }
    }

    // Check sharks
    for (const s of this.sharks) {
      const dist = Math.hypot(this.boat.x - s.x, this.boat.y - s.y);
      if (dist < boatRadius + 14) {
        this.lastHitTime = now;
        this.boat.speed = -50;
        this.onHit('shark');
        return;
      }
    }
  }

  private checkDocking() {
    if (this.dockTriggered) return;

    if (this.activeCheckpoint <= 14) {
      const pier = this.piers.find((p) => p.index === this.activeCheckpoint);
      if (pier) {
        const dist = Math.hypot(this.boat.x - pier.x, this.boat.y - (pier.y + 20));
        if (dist <= 48) {
          this.dockTriggered = true;
          this.boat.speed = 0;
          this.onDock(this.activeCheckpoint);
        }
      }
    } else if (this.activeCheckpoint === 15) {
      // Final Pirate Treasure Island dock
      const dist = Math.hypot(this.boat.x - FINAL_ISLAND.x, this.boat.y - (FINAL_ISLAND.y + 60));
      if (dist <= 65) {
        this.dockTriggered = true;
        this.boat.speed = 0;
        this.onDock(15);
      }
    }
  }
}
