// Reçoit les événements Stripe et met à jour le statut d'abonnement dans Supabase.
// IMPORTANT : configure l'URL de ce webhook dans Stripe et copie le "signing secret"
// dans la variable STRIPE_WEBHOOK_SECRET.
//
// Envoie aussi l'événement "Subscribe" à Meta via la Conversions API (server-side),
// pour que le pixel "Abonnement" reçoive des conversions fiables (contourne les
// bloqueurs de pub / Safari ITP). Variables d'env nécessaires :
//   META_PIXEL_ID     -> l'ID du pixel/"ensemble de données" nutritracker
//   META_ACCESS_TOKEN -> token généré dans Events Manager > Paramètres > Conversions API
const { admin } = require("./_shared");
const Stripe = require("stripe");
const crypto = require("crypto");

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex");

async function sendMetaSubscribeEvent({ email, valueCents, currency, eventSourceUrl }) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    console.warn("META_PIXEL_ID ou META_ACCESS_TOKEN manquant : événement Meta CAPI non envoyé.");
    return;
  }

const payload = {
  data: [
    {
      event_name: "Subscribe",
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      event_source_url: eventSourceUrl || "https://nutritracker.store",
      user_data: {
        em: email ? [sha256(email)] : undefined,
      },
      custom_data: {
        value: valueCents / 100,
        currency: (currency || "eur").toUpperCase(),
      },
    },
    ],
};

try {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
    );
  const json = await res.json();
  if (!res.ok) {
    console.error("Erreur Meta Conversions API:", JSON.stringify(json));
  }
} catch (err) {
  console.error("Échec appel Meta Conversions API:", err.message);
}
}

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers["stripe-signature"];

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
        if (s.client_reference_id && s.customer) {
          await db.from("profiles")
          .update({ stripe_customer_id: s.customer })
          .eq("id", s.client_reference_id);
        }

        if (s.mode === "subscription" && typeof s.amount_total === "number") {
          await sendMetaSubscribeEvent({
            email: s.customer_details?.email || s.customer_email,
            valueCents: s.amount_total,
            currency: s.currency,
            eventSourceUrl: "https://nutritracker.store/merci",
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = evt.data.object;
        await updateByCustomer(sub.customer, {
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
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
