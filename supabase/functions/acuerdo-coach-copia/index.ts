// Sprint 10: Edge Function `acuerdo-coach-copia` (Supabase, Deno). Tras aceptar el Acuerdo del coach (A7), le manda al coach por
// Brevo una copia del texto aceptado. Deja «Verify JWT» ACTIVADO. Los secretos se leen SOLO de los secretos de la función:
//   BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME  (nada de esto vive en el repo ni lo manda la app).
// Toda la lógica está en ../_shared/*.mjs (probada con node --test); este archivo solo la conecta a Deno y a Supabase.
// Si lo pegas en el editor del panel (sin terminal), usa pegar-en-el-panel.ts: es lo mismo en un solo archivo.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { handle } from '../_shared/manejador.mjs';

const env = (k: string): string | undefined => Deno.env.get(k) || undefined;

Deno.serve((req: Request) =>
  handle(req, {
    env,
    fetch: (...a: Parameters<typeof fetch>) => fetch(...a),
    // Cliente con la sesión de la PERSONA (su JWT): es el que lee su último evento del acuerdo.
    getUserClient: (authHeader: string, apikey: string) =>
      createClient(env('SUPABASE_URL')!, apikey || env('SUPABASE_ANON_KEY') || '', {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    // Cliente de servicio (solo para recordar cuándo se envió, límite de 1 por hora). Sin la llave, el límite queda en memoria.
    getAdminClient: () => {
      const key = env('SUPABASE_SERVICE_ROLE_KEY');
      return key ? createClient(env('SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
    },
  }),
);
