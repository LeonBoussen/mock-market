// Reset all Mock Market data for a clean testing slate.
//   node scripts/reset-db.js [--yes]
//
// Deletes every user, session, profile, position, order, equity point, saved
// simulation and cache row. After reset, the FIRST account you create becomes
// the admin again.
import readline from 'node:readline';
import { resetAllData, adminStats } from '../server/lib/reset.js';

const yes = process.argv.includes('--yes') || process.argv.includes('-y');

if (!yes) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question('\n⚠️  This deletes ALL users, profiles, orders and caches.\n   Type "yes" to confirm: ', (a) => {
      rl.close();
      resolve(a.trim().toLowerCase());
    });
  });
  if (answer !== 'yes') {
    console.log('Aborted — nothing was changed.');
    process.exit(0);
  }
}

resetAllData();
const s = adminStats();
console.log('\n✅ All data wiped.');
console.log(`   users=${s.users} profiles=${s.profiles} orders=${s.orders} sims=${s.sims}`);
console.log('   Next account to sign up will be granted admin.');
