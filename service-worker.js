const CACHE_VERSION = 2;
const CURRENT_CACHES = {
    prefetch: `cur-converter-cache-v${CACHE_VERSION}`
};
const cacheURLs = ['/', 'js/app.js', 'js/idb.js', 'css/bootstrap.min.css', 'js/jquery-3.3.1.slim.min.js', 'js/bootstrap.min.js'];

self.addEventListener('install', event => {
    console.log('Caching has started. Resources to cache:', cacheURLs);
    event.waitUntil(caches.open(CURRENT_CACHES.prefetch).then(cache => {
        const cachePromises = cacheURLs.map(cacheURL => {
            const request = new Request(cacheURL, {
                mode: 'no-cors'
            });
            return fetch(request).then(response => {
                if (response.status >= 400) {
                    console.error(`request for ${cacheURL} failed with status ${response.statusText}`);
                }
                return cache.put(cacheURL, response);
            }).catch(error => {
                console.error(`Could not cache ${cacheURL} due to ${error}`);
            });
        });
        return Promise.all(cachePromises).then(() => {
            console.log('Caching has been successful. All items have been cached.');
        });
    }).catch(error => {
        console.error('Caching failed:', error);
    }));
});

self.addEventListener('fetch', event => {
    let requestUrl = new URL(event.request.url);
    event.respondWith(caches.match(event.request).then(response => {
        if (response) {
            console.log(`Retrieving Cached Item: ${event.request.url}`);
            return response;
        }

        let fetchRequest = event.request.clone();
        return fetch(fetchRequest).then(response => {

            if (requestUrl.pathname.startsWith('/api/')) {
                return response;
            }

            let responseToCache = response.clone();
            caches.open(CURRENT_CACHES.prefetch).then(cache => {
                cache.put(event.request, responseToCache);
                console.log(`${event.request.url} has been saved to the cache`);
            });
            return response;
        });
    }));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(cacheNames => Promise.all(cacheNames.filter(cacheName => cacheName !== CURRENT_CACHES.prefetch).map(cacheName => caches.delete(cacheName)))));
});

self.addEventListener('message', messageEvent => {
    if (messageEvent.data === 'skipWaiting') return skipWaiting();
});