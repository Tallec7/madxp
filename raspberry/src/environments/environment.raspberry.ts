export const environment = {
  production: true,
  // Utilise l'origine actuelle pour le socket (fonctionne depuis Pi ET téléphone)
  // - Sur Pi (Chromium) : window.location.hostname = 'neopro.local' ou 'localhost'
  // - Sur téléphone : window.location.hostname = 'neopro.local' ou '192.168.4.1'
  socketUrl: '', // Sera déterminé dynamiquement dans socket.service.ts
  mode: 'raspberry', // Identifie l'environnement Raspberry Pi local
  apiUrl: '', // Sera déterminé dynamiquement
  demoMode: false
};
