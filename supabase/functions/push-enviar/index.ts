// Avisos push (R1 v1.19): Edge Function `push-enviar` (Supabase, Deno). Deja «Verify JWT» ACTIVADO.
//   · La app la llama con { accion: 'clave' } para obtener la clave pública de suscripción.
//   · Un Database Webhook (INSERT en grasa.push_outbox) la llama para enviar lo pendiente.
// No necesita secretos propios: las claves VAPID las crea ella misma y quedan en grasa.push_config (solo service_role, por funciones).
// Usa los secretos que Supabase ya inyecta: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. Si la pegas en el editor del panel, usa pegar-en-el-panel.ts.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';
import { handle } from '../_shared/push.mjs';

const env = (k: string): string => Deno.env.get(k) || '';
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve((req: Request) =>
  handle(req, {
    admin: { rpc: (fn: string, args?: Record<string, unknown>) => sb.schema('grasa').rpc(fn, args || {}) },
    generateKeys: () => webpush.generateVAPIDKeys(),
    send: async (sub: unknown, payload: string, v: { subject: string; publicKey: string; privateKey: string }) => {
      const r = await webpush.sendNotification(sub, payload, { vapidDetails: { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey }, TTL: 3600 });
      return { status: r.statusCode };
    },
  }),
);
