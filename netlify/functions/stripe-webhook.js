// Reçoit les événements Stripe et met à jour le statut d'abonnement dans Supabase.
// IMPORTANT : configure l'URL de ce webhook dans Stripe et copie le "signing secret"
// dans la variable STRIPE_WEBHOOK_SECRET.
const { admin } = require("./_shared");
const Stripe = require("stripe");

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers["stripe-signature"];

  // Le corps doit être brut pour la vérification de signature
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : event.body;

  let evt;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return { statusCode: 400, body: `Webhook signature invalide: ${err.message}` };
  }

  const db = admin();

  async function updateByCustomer(customerId, fields) {
    if (!customerId) return;
    await db.from("profiles").update(fields).eq("stripe_customer_id", customerId);
  }

  try {
    switch (evt.type) {
      case "checkout.session.completed": {
        const s = evt.data.object;
        // Relie le client Stripe à l'utilisateur si pas déjà fait
        if (s.client_reference_id && s.customer) {
          await db.from("profiles")
            .update({ stripe_customer_id: s.customer })
            .eq("id", s.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = evt.data.object;
        await updateByCustomer(sub.customer, {
          stripe_subscription_id: sub.id,
          subscription_status: sub.status, // active | trialing | past_due | canceled ...
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = evt.data.object;
        await updateByCustomer(sub.customer, { subscription_status: "canceled" });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    return { statusCode: 500, body: "Erreur de traitement: " + e.message };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
