import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const users = [
  { email: 'admin@convertipap.site',       password: 'Imr+Converti26',  nombre: 'Admin Principal',     rol_visible: 'Administrador',     role: 'administrador' },
  { email: 'admin2@convertipap.site',      password: 'Imr#Converti26',  nombre: 'Admin Secundario',    rol_visible: 'Administrador',     role: 'administrador' },
  { email: 'ceo@convertipap.site',         password: 'CEO#Converti26',  nombre: 'CEO',                 rol_visible: 'Gerente General',   role: 'gerente_general' },
  { email: 'direccion@convertipap.site',   password: 'Dir$Tissue20',    nombre: 'Dirección',           rol_visible: 'Dirección',         role: 'direccion' },
  { email: 'gcalidad@convertipap.site',    password: 'Cal!Control26',   nombre: 'Gerente Calidad',     rol_visible: 'Calidad',           role: 'calidad' },
  { email: 'capturista1@convertipap.site', password: 'Cap1$Prod26!',    nombre: 'Capturista 1',        rol_visible: 'Capturista',        role: 'capturista' },
  { email: 'capturista2@convertipap.site', password: 'Cap2$Prod26!',    nombre: 'Capturista 2',        rol_visible: 'Capturista',        role: 'capturista' },
  { email: 'capturista3@convertipap.site', password: 'Cap3$Prod26!',    nombre: 'Capturista 3',        rol_visible: 'Capturista',        role: 'capturista' },
];

const results = [];
for (const u of users) {
  let userId = null;
  let status = 'created';
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { nombre: u.nombre, rol_visible: u.rol_visible }
  });
  if (error) {
    // Likely already exists -> look it up
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find(x => x.email === u.email);
    if (existing) {
      userId = existing.id;
      status = 'exists';
      // update password to ensure it matches
      await supabase.auth.admin.updateUserById(existing.id, {
        password: u.password,
        email_confirm: true,
        user_metadata: { nombre: u.nombre, rol_visible: u.rol_visible }
      });
    } else {
      results.push({ email: u.email, status: 'ERROR', error: error.message });
      continue;
    }
  } else {
    userId = data.user.id;
  }

  // Ensure profile exists (in case trigger failed)
  await supabase.from('profiles').upsert({
    id: userId,
    email: u.email,
    nombre: u.nombre,
    rol_visible: u.rol_visible,
    activo: true,
  }, { onConflict: 'id' });

  // Assign role
  const { error: rerr } = await supabase.from('user_roles')
    .upsert({ user_id: userId, role: u.role }, { onConflict: 'user_id,role' });

  results.push({ email: u.email, userId, status, role: u.role, roleErr: rerr?.message });
}

console.log(JSON.stringify(results, null, 2));
