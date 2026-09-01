(() => {
  const sidKey = "nutri_analytics_session";
  let sessionId = sessionStorage.getItem(sidKey);
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    sessionStorage.setItem(sidKey, sessionId);
  }

  const send = (eventType, metadata = {}) => {
    const payload = JSON.stringify({
      event_type: eventType,
      session_id: sessionId,
      path: location.pathname,
      referrer: document.referrer || null,
      metadata: {
        ...metadata,
        screen: `${innerWidth}x${innerHeight}`,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track-event", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/track-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
      }
    } catch {}
  };

  send("page_view", { title: document.title });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, a, [role='button']");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const label = (target.innerText || target.getAttribute("aria-label") || target.id || target.tagName)
      .trim().replace(/\s+/g, " ").slice(0, 80);
    send("click", {
      label,
      element: target.tagName.toLowerCase(),
      x_pct: Math.round(((event.clientX || rect.left + rect.width / 2) / innerWidth) * 100),
      y_pct: Math.round(((event.clientY || rect.top + rect.height / 2) / innerHeight) * 100)
    });
  }, { passive: true });
})();