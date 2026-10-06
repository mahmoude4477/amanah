// Creates a login account in the Amanah D1 database. Self sign-up is disabled, so this is how the first account is made.
//   node scripts/create-user.mjs --email you@example.com --name "Your Name" [--role admin] [--remote]
// --role admin also makes the account an independent reviewer. Without --remote the account goes to the local
// development database (.wrangler/state), which needs `npx wrangler d1 migrations apply ma-db --local` first.
// A random password is generated and printed once; the database only stores Better Auth's hash of it.
import {execFileSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {hashPassword} from 'better-auth/crypto';

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
};
const email = arg('email')?.trim().toLowerCase();
const name = arg('name')?.trim() || email?.split('@')[0];
const role = arg('role') === 'admin' ? 'admin' : 'user';
const remote = process.argv.includes('--remote');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node scripts/create-user.mjs --email you@example.com --name "Your Name" [--role admin] [--remote]');
  process.exit(2);
}

const password = randomBytes(15).toString('base64url');
const hash = await hashPassword(password);
const id = randomUUID().replaceAll('-', '');
const now = new Date().toISOString();
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = [
  `INSERT INTO "user" (id,name,email,emailVerified,image,createdAt,updatedAt,role,banned,banReason,banExpires) VALUES (${q(id)},${q(name)},${q(email)},1,NULL,${q(now)},${q(now)},${q(role)},0,NULL,NULL);`,
  `INSERT INTO "account" (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (${q(randomUUID().replaceAll('-', ''))},${q(id)},'credential',${q(id)},${q(hash)},${q(now)},${q(now)});`,
].join('\n');

const dir = mkdtempSync(path.join(tmpdir(), 'amanah-user-'));
const file = path.join(dir, 'create-user.sql');
try {
  writeFileSync(file, sql);
  const wrangler = path.join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'ma-db', remote ? '--remote' : '--local', `--file=${file}`, '--yes'], {stdio: ['ignore', 'ignore', 'inherit']});
} finally {
  rmSync(dir, {recursive: true, force: true});
}

console.log(`Account created (${remote ? 'remote' : 'local'} database):`);
console.log(`  email:    ${email}`);
console.log(`  password: ${password}`);
console.log(`  role:     ${role === 'admin' ? 'admin (independent reviewer)' : 'user'}`);
console.log('Keep the password safe; it is not stored anywhere in plain text.');
