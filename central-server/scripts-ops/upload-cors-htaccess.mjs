/**
 * Upload .htaccess CORS to the root of the Hostinger FTP video directory.
 * Run with: node scripts-ops/upload-cors-htaccess.mjs
 * Requires FTP_HOST, FTP_USER, FTP_PASSWORD in environment (or central-server/.env).
 */
import * as ftp from 'basic-ftp';
import { Readable } from 'stream';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const htaccessContent = readFileSync(join(__dirname, 'cors-htaccess.txt'), 'utf8');

const ftpConfig = {
  host: process.env.FTP_HOST,
  port: parseInt(process.env.FTP_PORT || '21', 10),
  user: process.env.FTP_USER,
  password: process.env.FTP_PASSWORD,
  secure: process.env.FTP_SECURE === 'true',
};

if (!ftpConfig.host || !ftpConfig.user || !ftpConfig.password) {
  console.error('Missing FTP_HOST, FTP_USER or FTP_PASSWORD');
  process.exit(1);
}

const client = new ftp.Client();
client.ftp.verbose = true;

try {
  await client.access(ftpConfig);
  console.log('Connected to FTP');

  const stream = Readable.from([htaccessContent]);
  await client.uploadFrom(stream, '.htaccess');
  console.log('✅ .htaccess uploaded to FTP root (neopro-video/)');
} catch (err) {
  console.error('❌ FTP upload failed:', err.message);
  process.exit(1);
} finally {
  client.close();
}
