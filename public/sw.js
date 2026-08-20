/* Service Worker for Journal PWA - Handles Web Share Target API */

const DB_NAME = 'JournalSharedPhotosDB';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function savePhoto(file) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add({ file: file, timestamp: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const files = formData.getAll('photos');

        if (files && files.length > 0) {
          for (const file of files) {
            if (file && file.size > 0) {
              await savePhoto(file);
            }
          }
        }
      } catch (err) {
        console.error('Error in service worker share-target fetch:', err);
      }

      return Response.redirect('/home?shared_photos=1', 303);
    })());
  }
});
