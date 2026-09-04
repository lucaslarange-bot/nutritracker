// Reçoit les événements RevenueCat (abonnements achetés via Apple In-App Purchase
// sur l'app iOS) et met à jour le même champ "subscription_status" que le webhook
// Stripe, pour que l'accès (computeAccess / hasAccess) reste unifié web + iOS.
//
// Configuration côté RevenueCat : Project Settings > Integrations > Webhooks
//   URL          -> https://nutritracker.store/api/revenuecat-webhook
//   Auth header  -> Bearer <REVENUECAT_WEBHOOK_SECRET>  (défini ci-dessous)
//
// IMPORTANT : quand tu appelles Purchases.configure() côté app iOS, utilise comme
// appUserID l'UUID Supabase de l'utilisateur (session.user.id), PAS un ID anonyme
// RevenueCat — c'est ce qui permet à ce webhook de retrouver la bonne ligne
// "profiles" via event.app_user_id === profiles.id.
const { admin } = require("./_shared");

// Statuts RevenueCat qui doivent être traités comme un abonnement actif/en cours.
const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
]);
const INACTIVE_EVENTS = new Set(["CANCELLATION", "EXPIRATION"]);
// BILLING_ISSUE : on ne coupe pas tout de suite l'accès, Apple retente le paiement.

exports.handler = async (event) => {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const expected = `Bearer ${process.env.REVENUECAT_WEBHOOK_SECRET || ""}`;
  if (!process.env.REVENUECAT_WEBHOOK_SECRET || auth !== expected) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const evt = payload.event || {};
  const userId = evt.app_user_id;
  if (!userId) return { statusCode: 200, body: JSON.stringify({ ignored: true }) };

  const db = admin();
  const fields = {
    revenuecat_app_user_id: userId,
    revenuecat_event_type: evt.type,
  };

  if (ACTIVE_EVENTS.has(evt.type)) {
    fields.subscription_status = "active";
    if (evt.expiration_at_ms) {
      fields.current_period_end = new Date(evt.expiration_at_ms).toISOString();
    }
  } else if (INACTIVE_EVENTS.has(evt.type)) {
    fields.subscription_status = "canceled";
  }

  try {
    // Le profil doit déjà exister (créé à l'inscription Supabase) — on met juste à jour.
    await db.from("profiles").update(fields).eq("id", userId);
  } catch (e) {
    return { statusCode: 500, body: "Erreur de traitement: " + e.message };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
