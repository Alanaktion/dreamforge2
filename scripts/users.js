// Manages DreamForge accounts from the command line, without starting the app.
// Honours DATABASE_PATH, like the app, and applies pending migrations first.
//
//   npm run user:add -- --email ada@example.com --username ada [--admin] [--password <pw>]
//   npm run user:reset-password -- <email or username> [--password <pw>]
//
// Without --password, a temporary password is generated and printed, and the
// user must choose a new one at next sign-in. Resetting a password signs the
// user out of every session.
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const USAGE = `Usage:
  npm run user:add -- --email <email> --username <name> [--admin] [--password <pw>]
  npm run user:reset-password -- <email or username> [--password <pw>]`;

const [command, ...rest] = process.argv.slice(2);
let args;
try {
  args = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      email: { type: 'string' },
      username: { type: 'string' },
      password: { type: 'string' },
      admin: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  });
} catch (err) {
  console.error(`${err.message}\n\n${USAGE}`);
  process.exit(1);
}
const { values, positionals } = args;

if (values.help || !['add', 'reset-password'].includes(command)) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}
if (command === 'add' && (!values.email || !values.username)) {
  console.error(`--email and --username are required.\n\n${USAGE}`);
  process.exit(1);
}
if (command === 'reset-password' && positionals.length !== 1) {
  console.error(`Give exactly one email or username.\n\n${USAGE}`);
  process.exit(1);
}

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null }
});

let db, accounts;
try {
  const dbModule = await server.ssrLoadModule('/src/lib/server/db.ts');
  db = dbModule.default;
  const { dbPath } = dbModule;
  // Loaded through Vite, db.ts sees dev = true and switches to an in-memory
  // journal. Use the production journal so a crash mid-write is recoverable.
  db.pragma('journal_mode = WAL');
  const { migrate } = await server.ssrLoadModule('/src/lib/server/migrate.ts');
  migrate();
  accounts = await server.ssrLoadModule('/src/lib/server/accounts.ts');

  if (command === 'add') {
    const generated = !values.password;
    const password = values.password ?? accounts.generateTemporaryPassword();
    await accounts.createUser({
      email: values.email,
      username: values.username,
      password,
      isAdmin: values.admin,
      mustChangePassword: generated
    });
    console.log(
      `Created ${values.admin ? 'administrator' : 'user'} ${values.username} <${values.email.trim().toLowerCase()}> in ${dbPath}.`
    );
    if (generated)
      console.log(`Temporary password (must be changed at first sign-in): ${password}`);
  } else {
    const user = accounts.findUser(positionals[0]);
    if (!user)
      throw new accounts.AccountError(`No user with email or username "${positionals[0]}"`);
    if (values.password) {
      await accounts.setPassword(user.id, values.password);
      console.log(
        `Password updated for ${user.username} <${user.email}>. Existing sessions were signed out.`
      );
    } else {
      const temporary = await accounts.resetPassword(user.id);
      console.log(
        `Password reset for ${user.username} <${user.email}>. Existing sessions were signed out.`
      );
      console.log(`Temporary password (must be changed at next sign-in): ${temporary}`);
    }
    if (user.disabled)
      console.log('Note: this account is disabled; re-enable it from the admin page.');
  }
} catch (err) {
  if (accounts && err instanceof accounts.AccountError) {
    console.error(err.message);
    process.exitCode = 1;
  } else {
    throw err;
  }
} finally {
  db?.close();
  await server.close();
}
