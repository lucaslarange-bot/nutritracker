const { createClient } = require("@supabase/supabase-js");

function dayKey(value) { return new Date(value).toISOString().slice(0, 10); }
function percent(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Méthode non autorisée" }) };
  const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
  if (!token || !adminEmail) return { statusCode: 401, body: JSON.stringify({ error: "Accès admin non configuré" }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user || authData.user.email.toLowerCase() !== adminEmail) {
    return { statusCode: 403, body: JSON.stringify({ error: "Accès refusé" }) };
  }

  try {
    const days = Math.min(90, Math.max(7, Number(JSON.parse(event.body || "{}").days) || 30));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    let users = [], page = 1;
    while (page <= 20) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < 1000) break;
      page++;
    }

    const { data: events, error: eventsError } = await supabase
      .from("analytics_events")
      .select("event_type,session_id,path,referrer,country,city,metadata,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(50000);
    if (eventsError) throw eventsError;

    const pageViews = events.filter(e => e.event_type === "page_view");
    const clicks = events.filter(e => e.event_type === "click");
    const uniqueVisitors = new Set(pageViews.map(e => e.session_id).filter(Boolean)).size;
    const newUsers = users.filter(u => new Date(u.created_at) >= new Date(since));
    const activeSubscriptions = users.filter(u => ["active","trialing"].includes(u.user_metadata?.subscription_status)).length;

    const daily = {};
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKey(Date.now() - i * 86400000);
      daily[key] = { date: key, visits: 0, visitors: new Set(), signups: 0 };
    }
    pageViews.forEach(e => { const k=dayKey(e.created_at); if(daily[k]) { daily[k].visits++; daily[k].visitors.add(e.session_id); }});
    newUsers.forEach(u => { const k=dayKey(u.created_at); if(daily[k]) daily[k].signups++; });

    const countBy = (list, getKey) => Object.entries(list.reduce((acc, item) => {
      const key = getKey(item) || "Inconnu"; acc[key] = (acc[key] || 0) + 1; return acc;
    }, {})).map(([name,value]) => ({ name, value })).sort((a,b)=>b.value-a.value);

    const recentUsers = users.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0, 12).map(u => ({
      id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
      status: u.user_metadata?.subscription_status || "trial"
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        period: days,
        kpis: {
          visits: pageViews.length, unique_visitors: uniqueVisitors, signups: newUsers.length,
          conversion_rate: percent(newUsers.length, uniqueVisitors), total_users: users.length,
          active_subscriptions: activeSubscriptions, clicks: clicks.length
        },
        daily: Object.values(daily).map(d => ({ ...d, visitors: d.visitors.size })),
        top_clicks: countBy(clicks, e => e.metadata?.label).slice(0, 8),
        top_pages: countBy(pageViews, e => e.path).slice(0, 8),
        locations: countBy(pageViews, e => [e.city,e.country].filter(Boolean).join(", ")).slice(0, 8),
        sources: countBy(pageViews, e => { try { return e.referrer ? new URL(e.referrer).hostname : "Accès direct"; } catch { return "Autre"; }}).slice(0, 8),
        click_map: clicks.slice(-300).map(e => ({ x: e.metadata?.x_pct, y: e.metadata?.y_pct, label: e.metadata?.label })).filter(e => Number.isFinite(e.x) && Number.isFinite(e.y)),
        recent_users: recentUsers
      })
    };
  } catch (error) {
    console.error("admin-stats", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Impossible de charger les statistiques" }) };
  }
};