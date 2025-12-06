import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { query } from '../config/database';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const prompt = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
};

const generateSecurePassword = (): string => {
  return randomBytes(16).toString('base64').slice(0, 20);
};

const validatePassword = (password: string): boolean => {
  if (password.length < 12) {
    console.error('❌ Le mot de passe doit contenir au moins 12 caractères');
    return false;
  }
  if (!/[A-Z]/.test(password)) {
    console.error('❌ Le mot de passe doit contenir au moins une majuscule');
    return false;
  }
  if (!/[a-z]/.test(password)) {
    console.error('❌ Le mot de passe doit contenir au moins une minuscule');
    return false;
  }
  if (!/[0-9]/.test(password)) {
    console.error('❌ Le mot de passe doit contenir au moins un chiffre');
    return false;
  }
  return true;
};

const createAdmin = async () => {
  console.log('🔐 Création d\'un utilisateur administrateur\n');

  const email = await prompt('Email: ');
  if (!email || !email.includes('@')) {
    console.error('❌ Email invalide');
    process.exit(1);
  }

  const fullName = await prompt('Nom complet: ');

  console.log('\nOptions pour le mot de passe:');
  console.log('  1. Entrer un mot de passe manuellement');
  console.log('  2. Générer un mot de passe sécurisé automatiquement');

  const choice = await prompt('\nVotre choix (1/2): ');

  let password: string;

  if (choice === '2') {
    password = generateSecurePassword();
    console.log(`\n🔑 Mot de passe généré: ${password}`);
    console.log('⚠️  Conservez ce mot de passe en lieu sûr!\n');
  } else {
    password = await prompt('Mot de passe (min 12 caractères, majuscule, minuscule, chiffre): ');
    if (!validatePassword(password)) {
      process.exit(1);
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         updated_at = NOW()
       RETURNING id, email, full_name, role`,
      [email, passwordHash, fullName || 'Admin']
    );

    console.log('\n✅ Utilisateur admin créé/mis à jour avec succès:');
    console.log(`   ID: ${result.rows[0].id}`);
    console.log(`   Email: ${result.rows[0].email}`);
    console.log(`   Nom: ${result.rows[0].full_name}`);
    console.log(`   Rôle: ${result.rows[0].role}`);
  } catch (error) {
    console.error('❌ Erreur lors de la création:', error);
    process.exit(1);
  }

  rl.close();
  process.exit(0);
};

createAdmin();
