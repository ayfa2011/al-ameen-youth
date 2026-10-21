// Declarative event wiring for the static page shell in index.html.
function dispatchViewEvent(event) {
  const element = event.target instanceof Element
    ? event.target.closest(`[data-view-event="${event.type}"][data-view-handler]`)
    : null;
  if (!element) return;

  const handler = window[element.dataset.viewHandler];
  if (typeof handler !== "function") {
    console.error(`View handler is unavailable: ${element.dataset.viewHandler}`);
    return;
  }

  if (element.dataset.viewPreventDefault === "true") event.preventDefault();
  let args = [];
  try { args = JSON.parse(element.dataset.viewArgs || "[]"); }
  catch (error) { console.error("Invalid view event arguments.", error); return; }
  if (element.dataset.viewPassEvent === "true") args.unshift(event);
  if (element.dataset.viewPassValue === "true") args.push(event.target.value);
  return handler.apply(element, args);
}

["click", "submit", "change", "input"].forEach(type => {
  document.addEventListener(type, dispatchViewEvent);
});
