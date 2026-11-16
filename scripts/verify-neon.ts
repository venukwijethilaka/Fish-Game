import 'dotenv/config';
import { createApp } from '../server/src/app.js';
import { NeonRepository } from '../server/src/infrastructure/neonRepository.js';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  console.log('Testing NeonRepository directly...');
  const repo = new NeonRepository(databaseUrl);
  await repo.ping();
  console.log('✓ repo.ping() succeeded');

  const board = await repo.board();
  console.log(`✓ repo.board() returned ${board.length} entries:`);
  for (const b of board) {
    console.log(`  Rank #${b.rank}: ${b.username} — ${b.bestScore} coins`);
  }

  console.log('\nTesting createApp() with Neon...');
  const instance = createApp({
    databaseUrl,
    secret: process.env.JWT_SECRET || 'a'.repeat(32),
  });

  const appBoard = await instance.repo.board();
  console.log(`✓ instance.repo.board() returned ${appBoard.length} entries`);

  // Test profile lookup for the first user
  if (board[0]) {
    const profile = await instance.repo.profile(board[0].id);
    console.log(`✓ Profile lookup for top captain '${profile.user.username}': bestScore=${profile.bestScore}, rank=${profile.rank}`);
  }

  await instance.close();
  console.log('\n🎉 ALL NEON POSTGRESQL CHECKS PASSED PERFECTLY!');
}

main().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
