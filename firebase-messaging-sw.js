/* Linn Game Store - push service worker (own scope: /firebase-cloud-messaging-push-scope).
   Customer pushes carry a "notification" block, so the Firebase SDK draws them itself and opens
   fcm_options.link on tap. This file adds the fallback for data-only pushes and the click handling. */
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC9soIo8J-NP5bc4STi_eOB1oP94IvcOL8",
  authDomain: "linngametopupstore.firebaseapp.com",
  projectId: "linngametopupstore",
  storageBucket: "linngametopupstore.firebasestorage.app",
  messagingSenderId: "1081466939722",
  appId: "1:1081466939722:web:affbccdedc64a28ca439b3"
});
const messaging = firebase.messaging();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Data-only push (no "notification" block): draw it ourselves with the store icon + badge.
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;            // SDK already shows it
  const d = payload.data || {};
  if (!d.title && !d.body) return;
  const opts = {
    body: d.body || '',
    icon: '/favicon-192.png?v=4',
    badge: '/badge-96.png',
    tag: d.tag || undefined,
    data: { url: d.url || d.link || '/' }
  };
  if (d.image) opts.image = d.image;
  return self.registration.showNotification(d.title || 'Linn Game Store', opts);
});

// Tap: focus an open store tab (and jump to the link) or open a new window.
self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const data = n.data || {};
  const fcm = data.FCM_MSG || {};
  const url = data.url || (fcm.fcmOptions && fcm.fcmOptions.link) || (fcm.notification && fcm.notification.click_action) || '/';
  n.close();
  event.waitUntil((async () => {
    const target = new URL(url, self.location.origin).href;
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(target); } catch (e) {} }
        return;
      }
    }
    return self.clients.openWindow(target);
  })());
});
