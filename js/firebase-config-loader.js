// Load local-only Firebase settings before the shared Firebase config script.
if (["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
  document.write('<script src="js/firebase-config.local.js"><\/script>');
}
