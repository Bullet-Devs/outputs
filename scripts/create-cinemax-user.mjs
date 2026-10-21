import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const envFile = new URL('../.env', import.meta.url);
try {
  const contents = await readFile(envFile, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
} catch {
  // Environment variables can also be supplied by the local shell.
}

const supabaseUrl = process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !adminKey) {
  console.error('Falta SUPABASE_URL o SUPABASE_SECRET_KEY en el archivo .env local. No uses la clave publishable aquí.');
  process.exit(1);
}

const prompt = createInterface({ input: stdin, output: stdout });
try {
  const username = (await prompt.question('Nombre de usuario (3–24 caracteres): ')).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username)) {
    throw new Error('Usá de 3 a 24 caracteres: letras a-z, números, punto, guion o guion bajo.');
  }
  const password = await prompt.question('Contraseña inicial (mínimo 8 caracteres): ');
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  const email = `${username}@users.cinemax.invalid`;
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: adminKey, authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username } })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.msg || result.message || result.error_description || `Supabase respondió HTTP ${response.status}.`);
  console.log(`Cuenta creada: ${username}`);
  console.log('Compartí el usuario y la contraseña inicial en privado. La persona podrá cambiarlos desde CineMax después de entrar.');
} catch (error) {
  console.error(`No se pudo crear la cuenta: ${error.message}`);
  process.exitCode = 1;
} finally {
  prompt.close();
}
