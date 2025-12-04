const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/neopro_central',
});

async function checkAdmin() {
  try {
    // Check database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connexion à la base de données réussie\n');

    // Check if users table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ La table "users" n\'existe pas');
      console.log('💡 Vous devez initialiser la base de données avec le script init-db.sql');
      process.exit(1);
    }

    console.log('✅ Table "users" trouvée\n');

    // Check for admin user
    const adminCheck = await pool.query(
      `SELECT id, email, full_name, role, created_at
       FROM users
       WHERE email = 'admin@neopro.fr'`
    );

    if (adminCheck.rows.length === 0) {
      console.log('❌ Aucun utilisateur admin trouvé');
      console.log('💡 Exécutez le script reset-admin-password.js pour créer l\'utilisateur admin');
    } else {
      const admin = adminCheck.rows[0];
      console.log('✅ Utilisateur admin trouvé:');
      console.log('   ID:', admin.id);
      console.log('   Email:', admin.email);
      console.log('   Nom:', admin.full_name);
      console.log('   Rôle:', admin.role);
      console.log('   Créé le:', admin.created_at);
      console.log('\n💡 Si le mot de passe ne fonctionne pas, exécutez: node reset-admin-password.js');
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 PostgreSQL ne semble pas accessible. Vérifiez que:');
      console.log('   1. PostgreSQL est démarré');
      console.log('   2. Les paramètres de connexion dans .env sont corrects');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkAdmin();
