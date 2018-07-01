if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').then(reg => {
            console.log('Registration successful, scope is:', reg.scope);
            if (reg.waiting) {
                updateReady(reg.waiting);
                return;
            }
            if (reg.installing) {
                trackInstalling(reg.installing);
                return;
            }
            reg.addEventListener('updatefound', () => {
                console.log('sw installed');
                trackInstalling(reg.installing);
            });
        }).catch(error => {
            console.log('Service worker registration failed, error:', error);
        });
        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            window.location.reload();
            refreshing = !0;
        });
        trackInstalling = worker => {
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed') {
                    updateReady(worker);
                }
            });
        };
        updateReady = worker => {
            setTimeout(() => {
                worker.postMessage('skipWaiting');
                console.log('Update seen. Page reloading in 15 seconds');
            }, 15000);
        };
    });
}