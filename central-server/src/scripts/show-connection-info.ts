import dotenv from 'dotenv';

dotenv.config();

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  console.error('DATABASE_URL non défini');
  process.exit(1);
}

const parsed = new URL(rawUrl);

console.log('🔐 DATABASE_URL actif:');
console.log('  Host      :', parsed.hostname);
console.log('  Port      :', parsed.port);
console.log('  Database  :', parsed.pathname.slice(1));
console.log('  User      :', parsed.username);
console.log('  SSL mode  :', parsed.searchParams.get('sslmode') || 'standard');
console.log('  Full URL  :', rawUrl);

