// Crée une session Stripe Checkout pour l'abonnement (avec le reste de l'essai gratuit).
const { admin, getUser, reply } = require("./_shared");
const Stripe = require("stripe");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

  const user = await getUser(event);
  if (!user) return reply(401, { error: "Non authentifié" });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const db = admin();

  // Profil de l'utilisateur
  const { data: profile } = await db.from("profiles").select("*").eq("id", user.id).single();

  // 1) Client Stripe (réutilise s'il existe déjà)
  let customerId = profile && profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await db.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  // 2) Jours d'essai restants (pour ne pas facturer avant la fin de l'essai interne)
  let trialDays = 0;
  if (profile && profile.trial_ends_at) {
    const ms = new Date(profile.trial_ends_at) - new Date();
    trialDays = Math.max(0, Math.ceil(ms / 86400000));
  }

  const appUrl = process.env.APP_URL || process.env.URL || "";

  // 3) Session Checkout (abonnement)
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    subscription_data: trialDays > 0 ? { trial_period_days: trialDays } : undefined,
    success_url: appUrl + "/?checkout=success",
    cancel_url: appUrl + "/?checkout=cancel",
    allow_promotion_codes: true,
  });

  return reply(200, { url: session.url });
};
