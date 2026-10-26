import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

let client: SupabaseClient | undefined;

// Service-role client. Server-side only: never import this from a client component.
export function db(): SupabaseClient {
  if (!client) {
    const env = supabaseEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// Unwraps a Supabase response, throwing on error so callers can use plain try/catch.
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}
