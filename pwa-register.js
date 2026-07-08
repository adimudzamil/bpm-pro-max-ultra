// PWA Registration and Installation Handler
// Add this script to your index.html

(function() {
  'use strict';
  
  // Check if service workers are supported
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      registerServiceWorker();
      setupInstallPrompt();
      checkForUpdates();
    });
  } else {
    console.warn('Service Workers not supported in this browser');
  }
  
  // Register Service Worker
  async function registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('✅ Service Worker registered successfully:', registration.scope);
      
      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
      
      // Handle service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            showUpdateNotification();
          }
        });
      });
      
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
    }
  }
  
  // Setup Install Prompt
  let deferredPrompt;
  
  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      
      // Store the event for later use
      deferredPrompt = e;
      
      // Show install button
      showInstallButton();
    });
    
    // Handle successful installation
    window.addEventListener('appinstalled', () => {
      console.log('✅ BPM Pro installed successfully!');
      deferredPrompt = null;
      hideInstallButton();
      showSuccess('✨ BPM Pro installed! You can now use it offline.');
    });
  }
  
  // Show install button
  function showInstallButton() {
    // Create install button if it doesn't exist
    let installBtn = document.getElementById('pwa-install-btn');
    
    if (!installBtn) {
      installBtn = document.createElement('button');
      installBtn.id = 'pwa-install-btn';
      installBtn.className = 'btn-success pwa-install-button';
      installBtn.innerHTML = '📲 Install BPM Pro App';
      installBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: pulse 2s infinite;
      `;
      
      installBtn.addEventListener('click', installApp);
      document.body.appendChild(installBtn);
    }
    
    installBtn.style.display = 'block';
  }
  
  // Hide install button
  function hideInstallButton() {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
      installBtn.style.display = 'none';
    }
  }
  
  // Install app
  async function installApp() {
    if (!deferredPrompt) {
      return;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log(`User response to install prompt: ${outcome}`);
    
    if (outcome === 'accepted') {
      console.log('✅ User accepted the install prompt');
    } else {
      console.log('❌ User dismissed the install prompt');
    }
    
    // Clear the deferredPrompt
    deferredPrompt = null;
    hideInstallButton();
  }
  
  // Show update notification
  function showUpdateNotification() {
    const updateBanner = document.createElement('div');
    updateBanner.id = 'update-notification';
    updateBanner.className = 'update-notification';
    updateBanner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: #2563EB; color: white; position: fixed; top: 0; left: 0; right: 0; z-index: 10000; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">
        <span style="font-weight: 600;">🔄 New version available!</span>
        <div>
          <button onclick="window.location.reload()" style="background: white; color: #2563EB; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 600; margin-right: 10px; cursor: pointer;">Update Now</button>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: transparent; color: white; border: 1px solid white; padding: 8px 16px; border-radius: 4px; font-weight: 600; cursor: pointer;">Later</button>
        </div>
      </div>
    `;
    document.body.prepend(updateBanner);
  }
  
  // Check for updates on focus
  function checkForUpdates() {
    let refreshing = false;
    
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.log('🔄 New service worker activated');
    });
    
    // Check for updates when page gains focus
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) reg.update();
        });
      }
    });
  }
  
  // Display online/offline status
  function updateOnlineStatus() {
    const statusIndicator = document.getElementById('online-status');
    
    if (!statusIndicator) {
      const indicator = document.createElement('div');
      indicator.id = 'online-status';
      indicator.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        z-index: 9998;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(indicator);
    }
    
    const indicator = document.getElementById('online-status');
    
    if (navigator.onLine) {
      indicator.textContent = '🟢 Online';
      indicator.style.background = '#10B981';
      indicator.style.color = 'white';
      setTimeout(() => {
        indicator.style.opacity = '0';
      }, 3000);
    } else {
      indicator.textContent = '🔴 Offline Mode';
      indicator.style.background = '#EF4444';
      indicator.style.color = 'white';
      indicator.style.opacity = '1';
    }
  }
  
  // Listen for online/offline events
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Check initial status
  window.addEventListener('load', updateOnlineStatus);
  
  // Add pulse animation to CSS
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    .pwa-install-button {
      animation: pulse 2s infinite;
    }
    
    .pwa-install-button:hover {
      animation: none;
      transform: scale(1.05);
    }
  `;
  document.head.appendChild(style);
  
})();