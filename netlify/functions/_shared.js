// Code partagé par les fonctions (préfixe "_" => non déployé comme endpoint)
const { createClient } = require("@supabase/supabase-js");

// Client Supabase "admin" (clé service-role) — UNIQUEMENT côté serveur
function admin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

// Récupère l'utilisateur à partir du jeton "Authorization: Bearer <token>"
async function getUser(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const token = h.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

// Un utilisateur a accès si son abonnement est actif/en essai Stripe,
// OU si son essai gratuit interne n'est pas encore terminé.
function hasAccess(profile) {
  if (!profile) return false;
  const status = profile.subscription_status;
  if (status === "active" || status === "trialing") return true;
  if (profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date()) return true;
  return false;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function reply(statusCode, obj) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(obj) };
}

module.exports = { admin, getUser, hasAccess, reply };
