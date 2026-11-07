import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return respond({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return respond({ error: "Server authentication is not configured" }, 500);

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return respond({ error: "Invalid or expired session" }, 401);

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await adminClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return respond({ error: "Could not verify account permissions" }, 500);
  if (profile?.role !== "admin") return respond({ error: "Administrator access required" }, 403);

  let payload: { action?: string; userId?: string };
  try {
    payload = await request.json();
  } catch {
    return respond({ error: "Invalid request body" }, 400);
  }

  if (payload.action === "list") {
    const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) return respond({ error: "Could not load accounts" }, 500);
    const { data: profiles, error: profilesError } = await adminClient.from("user_profiles").select("id, role, full_name, phone");
    if (profilesError) return respond({ error: "Could not load account profiles" }, 500);
    const profilesById = new Map((profiles ?? []).map((item) => [item.id, item]));
    return respond((users?.users ?? []).map((account) => ({
      id: account.id,
      email: account.email ?? "",
      role: profilesById.get(account.id)?.role ?? "unknown",
      fullName: profilesById.get(account.id)?.full_name ?? "",
      phone: profilesById.get(account.id)?.phone ?? "",
      suspended: Boolean(account.banned_until && new Date(account.banned_until).getTime() > Date.now()),
      createdAt: account.created_at,
      lastSignInAt: account.last_sign_in_at,
    })));
  }

  if (payload.action === "suspend" || payload.action === "restore") {
    if (!payload.userId || payload.userId === user.id) return respond({ error: "Choose another account to update" }, 400);
    const { error } = await adminClient.auth.admin.updateUserById(payload.userId, {
      ban_duration: payload.action === "suspend" ? "876000h" : "none",
    });
    if (error) return respond({ error: "Could not update account access" }, 400);
    return respond({ success: true });
  }

  return respond({ error: "Unsupported account action" }, 400);
});
