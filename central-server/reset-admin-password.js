const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'neopro',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function resetAdminPassword() {
  const password = 'admin123';
  const email = 'admin@neopro.fr';

  try {
    // Generate hash
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    console.log('🔑 Nouveau hash généré pour le mot de passe "admin123"');
    console.log('Hash:', hash);

    // Update or insert admin user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, 'Admin NEOPRO', 'admin')
       ON CONFLICT (email)
       DO UPDATE SET password_hash = $2
       RETURNING id, email, full_name, role`,
      [email, hash]
    );

    console.log('✅ Utilisateur admin mis à jour avec succès!');
    console.log('📧 Email:', result.rows[0].email);
    console.log('🔐 Mot de passe: admin123');
    console.log('\n⚠️  CHANGEZ CE MOT DE PASSE EN PRODUCTION!\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetAdminPassword();
