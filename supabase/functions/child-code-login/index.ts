// Child-only code authentication for weRfam.
// Deliberately does not require a user JWT: the parent's high-entropy invitation
// code is the first-time credential. Rate limiting and device binding happen here.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://werfam-pwa-bay.vercel.app",
  "https://werfam-pwa-chiomegadeveloper-4636.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const json = (payload: object, status: number, origin: string | null) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "vary": "Origin",
      ...(origin && allowedOrigins.has(origin) ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
        "access-control-allow-methods": "POST, OPTIONS",
      } : {}),
    },
  });
const sha256 = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map(x => x.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  if (req.method === "OPTIONS") return json({}, 200, origin);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !publicKey) return json({ error: "Child sign-in temporarily unavailable" }, 503, origin);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const client = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let code: string, deviceToken: string;
  try {
    const body = await req.json();
    code = String(body.code ?? "").trim().toUpperCase().replace(/-/g, "");
    deviceToken = String(body.deviceToken ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "Enter the code from your parent." }, 400, origin);
  }
  if (!/^[A-F0-9]{12,16}$/.test(code) || !/^[a-f0-9]{64}$/.test(deviceToken))
    return json({ error: "Enter a valid code from your parent on your own device." }, 400, origin);

  // Rate limit by source IP. This is defense-in-depth; edge/WAF limits should also be configured.
  const callerIp = (req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    deviceToken);
  const sourceHash = await sha256(serviceKey + ":" + callerIp);
  const { data: permitted, error: rateError } = await admin.rpc("rate_limit_child_code", { p_source_hash: sourceHash });
  if (rateError || !permitted) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429, origin);

  try {
    const { data: parentDevices, error: parentError } = await admin
      .from("parent_devices").select("parent_id").eq("token_sha256", await sha256(deviceToken)).limit(1);
    if (parentError) throw parentError;
    if (parentDevices?.length) return json({ error: "This browser is already registered to a parent. Open weRfam on the child's own phone." }, 403, origin);

    const { data: invite, error: inviteError } = await admin.from("child_invites")
      .select("id,code,child_name,used_by,expires_at").eq("code", code).maybeSingle();
    if (inviteError) throw inviteError;
    if (!invite) return json({ error: "Invalid code. Ask your parent for a new code." }, 400, origin);

    let accountEmail: string;
    let accountPassword: string;
    let newChildId: string | null = null;
    let claimed = false;

    if (invite.used_by) {
      // Subsequent code-only sign-ins are allowed only from the original paired browser.
      const { data: binding, error: bindingError } = await admin.from("child_devices")
        .select("token_sha256").eq("child_id", invite.used_by).maybeSingle();
      if (bindingError) throw bindingError;
      if (!binding || binding.token_sha256 !== await sha256(deviceToken)) {
        return json({ error: "This code is already paired to another device. Ask your parent for help." }, 403, origin);
      }
      const { data: userResult, error: getUserError } = await admin.auth.admin.getUserById(invite.used_by);
      if (getUserError || !userResult.user?.email) throw getUserError || Error("Child account not found");
      accountEmail = userResult.user.email;
      accountPassword = crypto.randomUUID() + crypto.randomUUID();
      const { error: changeError } = await admin.auth.admin.updateUserById(invite.used_by, { password: accountPassword });
      if (changeError) throw changeError;
    } else {
      if (new Date(invite.expires_at).getTime() <= Date.now())
        return json({ error: "This code has expired. Ask your parent for a new one." }, 400, origin);
      accountEmail = "child." + crypto.randomUUID().replaceAll("-", "") + "@example.com";
      accountPassword = crypto.randomUUID() + crypto.randomUUID();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: accountEmail,
        password: accountPassword,
        email_confirm: true,
        user_metadata: { role: "child", full_name: invite.child_name },
      });
      if (createError || !created.user) throw createError || Error("Child account could not be created");
      newChildId = created.user.id;
      const { error: claimError } = await admin.rpc("claim_child_code", {
        p_code: code, p_child_id: newChildId, p_device_token: deviceToken,
      });
      if (claimError) {
        await admin.auth.admin.deleteUser(newChildId).catch(() => {});
        throw claimError;
      }
      claimed = true;
    }

    const { data: authResult, error: signInError } = await client.auth.signInWithPassword({
      email: accountEmail, password: accountPassword,
    });
    if (signInError || !authResult.session)
      throw signInError || Error("Cannot issue a child session");
    return json({
      access_token: authResult.session.access_token,
      refresh_token: authResult.session.refresh_token,
    }, 200, origin);
  } catch (error) {
    console.error("weRfam code pairing failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Could not complete code sign-in. Ask your parent for a new code or try again." }, 400, origin);
  }
});
