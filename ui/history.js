(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const form = $("filters"),
    events = $("events"),
    status = $("status");
  let disposed = false;
  let ready = false,
    busy = false,
    page = 1,
    nextCursor = null,
    initial = true;
  let filters = { order: "desc", limit: 50 };
  let sequence = 0;
  const pending = new Map();
  function send(message) {
    window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*");
  }
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("UNAVAILABLE"));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      send({ id, method, params });
    });
  }
  function theme(context) {
    if (context?.theme === "dark" || context?.theme === "light")
      document.documentElement.dataset.theme = context.theme;
  }
  function controls() {
    $("controls").disabled = !ready || busy;
    $("first").disabled = !ready || busy || page === 1;
    $("next").disabled = !ready || busy || !nextCursor;
    events.setAttribute("aria-busy", String(busy));
  }
  function text(tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = String(value ?? "Not recorded");
    if (className) element.className = className;
    return element;
  }
  function field(list, name, value) {
    list.append(text("dt", name), text("dd", value));
  }
  function render(result) {
    if (result?.isError)
      throw new Error(result.structuredContent?.error || "UNAVAILABLE");
    const data = result?.structuredContent;
    if (
      !data ||
      !Array.isArray(data.events) ||
      data.events.length > 50 ||
      typeof data.hasMore !== "boolean" ||
      (data.hasMore &&
        (typeof data.nextCursor !== "string" || data.nextCursor.length > 1024))
    )
      throw new Error("INVALID_RESPONSE");
    const fragment = document.createDocumentFragment();
    for (const event of data.events) {
      const article = document.createElement("article");
      const heading = document.createElement("header");
      heading.append(
        text("h2", `${event.action} · ${event.scope?.id}`),
        text("span", event.outcome, "badge"),
      );
      const fields = document.createElement("dl");
      field(fields, "Recorded", event.recordedAt);
      field(fields, "Observed", event.observedAt);
      field(fields, "Scope", `${event.scope?.type} · ${event.scope?.id}`);
      if (event.issueId) field(fields, "Issue", event.issueId);
      field(fields, "Reason", event.reason);
      field(fields, "Result", event.result);
      const details = document.createElement("details");
      details.append(text("summary", "Evidence and attribution"));
      const attribution = document.createElement("dl");
      field(attribution, "Event", event.eventId);
      if (event.phase) field(attribution, "Phase", event.phase);
      field(
        attribution,
        "Thread",
        event.threadId || "Not recorded · navigation unavailable",
      );
      if (event.threadId)
        details.append(
          text(
            "p",
            "Thread navigation unavailable: no verified canonical URL.",
          ),
        );
      if (event.turnId) field(attribution, "Turn", event.turnId);
      if (event.correlationId)
        field(attribution, "Correlation", event.correlationId);
      if (event.correctsEventId)
        field(attribution, "Corrects", event.correctsEventId);
      details.append(
        attribution,
        text("p", "Evidence references (unverified navigation)"),
      );
      const refs = document.createElement("ul");
      for (const ref of (event.evidenceRefs || []).slice(0, 30))
        refs.append(text("li", ref));
      if (!refs.childNodes.length)
        refs.append(
          text(
            "li",
            "No evidence recorded; result is not independently established here.",
          ),
        );
      details.append(refs);
      article.append(heading, fields, details);
      fragment.append(article);
    }
    events.replaceChildren(fragment);
    nextCursor = data.hasMore ? data.nextCursor : null;
    status.textContent = data.events.length
      ? `${data.events.length} recorded events · snapshot page ${page}`
      : "No events match these filters.";
    $("page").textContent = `Page ${page}`;
  }
  function failure(error) {
    events.replaceChildren();
    nextCursor = null;
    const message = String(error?.message || "");
    status.textContent = /UNAUTHORIZED|401|403|auth|expired/i.test(message)
      ? "Access unavailable or expired. Reconnect the CEO plugin in ChatGPT, then refresh."
      : /INVALID_CURSOR/.test(message)
        ? "This snapshot is no longer available. Refresh to start again."
        : "History is unavailable. Refresh to try again.";
  }
  async function load(cursor, targetPage = 1) {
    if (!ready || busy) return;
    busy = true;
    controls();
    status.textContent = "Loading history…";
    events.replaceChildren();
    try {
      const result = await request("tools/call", {
        name: "list_coordination_events",
        arguments: { ...filters, ...(cursor ? { cursor } : {}) },
      });
      if (disposed) return;
      page = targetPage;
      render(result);
    } catch (error) {
      if (!disposed) failure(error);
    } finally {
      busy = false;
      controls();
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    if (values.scopeId && !values.scopeType) {
      status.textContent = "Choose a scope for the scope identifier.";
      return;
    }
    filters = { limit: 50, order: values.order };
    for (const key of ["issueId", "scopeType", "scopeId"])
      if (values[key]?.trim()) filters[key] = values[key].trim();
    load();
  });
  $("refresh").addEventListener("click", () => load());
  $("first").addEventListener("click", () => load());
  $("next").addEventListener("click", () => load(nextCursor, page + 1));
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== "2.0") return;
    const message = event.data;
    if (
      !message.method &&
      ("result" in message || "error" in message) &&
      pending.has(message.id)
    ) {
      const call = pending.get(message.id);
      clearTimeout(call.timer);
      pending.delete(message.id);
      if (message.error)
        call.reject(new Error(message.error.message || "UNAVAILABLE"));
      else call.resolve(message.result);
      return;
    }
    if (disposed) return;
    if (message.method === "ui/notifications/host-context-changed")
      theme(message.params);
    if (message.method === "ui/notifications/tool-result" && initial) {
      initial = false;
      const args = message.params?._meta?.historyFilters;
      if (args) {
        filters = { ...args, limit: 50, order: args.order || "desc" };
        for (const key of ["issueId", "scopeType", "scopeId", "order"])
          form.elements.namedItem(key).value = filters[key] || "";
      }
      load();
    }
    if (message.method === "ping" && message.id !== undefined)
      send({ id: message.id, result: {} });
    if (message.method === "ui/resource-teardown" && message.id !== undefined) {
      disposed = true;
      events.replaceChildren();
      ready = false;
      status.textContent = "History view closed.";
      for (const call of pending.values()) {
        clearTimeout(call.timer);
        call.reject(new Error("CLOSED"));
      }
      pending.clear();
      controls();
      send({ id: message.id, result: {} });
    }
  });
  if (window.parent === window) {
    status.textContent =
      "Open this history view inside ChatGPT with the CEO plugin.";
    return;
  }
  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    appInfo: { name: "CEO coordination history", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] },
  })
    .then((result) => {
      if (disposed) return;
      if (
        result?.protocolVersion !== "2026-01-26" ||
        !result?.hostCapabilities?.serverTools
      )
        throw new Error("UNAVAILABLE");
      theme(result.hostContext);
      ready = true;
      controls();
      status.textContent =
        "Ready. Waiting for history request, or select Refresh.";
      send({ method: "ui/notifications/initialized", params: {} });
    })
    .catch((error) => {
      if (!disposed) failure(error);
      controls();
    });
})();
