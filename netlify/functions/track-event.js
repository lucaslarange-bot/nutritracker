const { createClient } = require("@supabase/supabase-js");

const allowedTypes = new Set(["page_view", "click"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  try {
    const body = JSON.parse(event.body || "{}");
    if (!allowedTypes.has(body.event_type)) return { statusCode: 400, body: "" };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
    const forwarded = event.headers["x-forwarded-for"] || "";
    const ip = forwarded.split(",")[0].trim();
    const country = event.headers["x-country"] || event.headers["cf-ipcountry"] || null;
    const city = event.headers["x-nf-client-connection-ip"] ? null : (event.headers["x-city"] || null);
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    const { error } = await supabase.from("analytics_events").insert({
      event_type: body.event_type,
      session_id: String(body.session_id || "").slice(0, 100),
      path: String(body.path || "/").slice(0, 300),
      referrer: body.referrer ? String(body.referrer).slice(0, 500) : null,
      country: country ? String(country).slice(0, 80) : null,
      city: city ? String(city).slice(0, 120) : null,
      ip_hash: ip ? require("crypto").createHash("sha256").update(ip + (process.env.ANALYTICS_SALT || "nutritracker")).digest("hex") : null,
      metadata
    });
    if (error) throw error;
    return { statusCode: 202, headers: { "Cache-Control": "no-store" }, body: "" };
  } catch (error) {
    console.error("track-event", error.message);
    return { statusCode: 202, body: "" };
  }
};