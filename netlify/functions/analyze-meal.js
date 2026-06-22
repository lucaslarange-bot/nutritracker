// Analyse une photo de plat et estime calories + macros via IA vision.
// La clé IA reste ici, côté serveur. L'accès est réservé aux abonnés / essai en cours.
const { admin, getUser, hasAccess, reply } = require("./_shared");

const PROMPT = `Tu es un nutritionniste. Analyse la photo de ce repas.
Estime, du mieux possible, chaque aliment visible, sa quantité en grammes, et ses valeurs nutritionnelles.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{
  "items": [
    { "name": "nom de l'aliment", "grams": 0, "kcal": 0, "protein": 0, "carbs": 0, "fat": 0 }
  ],
  "totals": { "kcal": 0, "protein": 0, "carbs": 0, "fat": 0 },
  "confidence": "low|medium|high",
  "note": "courte remarque en français (1 phrase max)"
}
Les grammes et valeurs sont des nombres (pas de texte, pas d'unités). Si la photo ne contient pas de nourriture identifiable, renvoie items vide et confidence "low".`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

  // 1) Authentification
  const user = await getUser(event);
  if (!user) return reply(401, { error: "Non authentifié" });

  // 2) Vérification de l'accès (abonnement actif ou essai en cours)
  const { data: profile } = await admin()
    .from("profiles").select("*").eq("id", user.id).single();
  if (!hasAccess(profile)) {
    return reply(402, { error: "subscription_required", message: "Ton essai est terminé. Abonne-toi pour analyser des photos." });
  }

  // 3) Lecture de l'image
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return reply(400, { error: "Corps de requête invalide" }); }

  const { image, mime } = body;            // image = base64 SANS le préfixe data:
  if (!image) return reply(400, { error: "Image manquante" });
  const mediaType = mime || "image/jpeg";

  // 4) Appel à l'IA vision (Anthropic Messages API)
  const model = process.env.AI_MODEL || "claude-haiku-4-5-20251001";
  let aiRes;
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });
  } catch (e) {
    return reply(502, { error: "Service IA injoignable" });
  }

  if (!aiRes.ok) {
    const t = await aiRes.text();
    return reply(502, { error: "Erreur IA", detail: t.slice(0, 300) });
  }

  const data = await aiRes.json();
  const text = (data.content && data.content[0] && data.content[0].text) || "";

  // 5) Extraction du JSON renvoyé par le modèle
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    return reply(502, { error: "Réponse IA illisible", raw: text.slice(0, 300) });
  }

  return reply(200, parsed);
};
