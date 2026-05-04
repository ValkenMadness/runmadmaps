/**
 * RMM Client-Side Auth Module
 *
 * Provides authentication state management for all pages.
 * Checks the /api/auth/session endpoint and exposes athlete data.
 *
 * Usage:
 *   <script src="/scripts/auth.js"></script>
 *
 *   // In any page script:
 *   RMMAuth.check().then(athlete => {
 *     if (athlete) {
 *       console.log('Logged in as', athlete.first_name);
 *     } else {
 *       console.log('Not logged in');
 *     }
 *   });
 *
 *   // Or use the ready callback pattern:
 *   RMMAuth.onReady(function(athlete) { ... });
 *
 *   // Redirect to Strava login:
 *   RMMAuth.login();           // returns to /dashboard after auth
 *   RMMAuth.login('/intelligence/fitness');  // returns to specific page
 *
 *   // Log out:
 *   RMMAuth.logout();
 */

(function () {
  'use strict';

  var _athlete = null;
  var _checked = false;
  var _checking = false;
  var _callbacks = [];

  var RMMAuth = {

    /**
     * Check the current session. Returns a promise that resolves to
     * the athlete object (or null if not logged in).
     * Caches the result — subsequent calls return immediately.
     */
    check: function () {
      if (_checked) return Promise.resolve(_athlete);

      if (_checking) {
        return new Promise(function (resolve) {
          _callbacks.push(resolve);
        });
      }

      _checking = true;

      return fetch('/api/auth/session', { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) return null;
          return res.json();
        })
        .then(function (data) {
          _athlete = data && data.athlete ? data.athlete : null;
          _checked = true;
          _checking = false;
          _fireCallbacks();
          return _athlete;
        })
        .catch(function () {
          _athlete = null;
          _checked = true;
          _checking = false;
          _fireCallbacks();
          return null;
        });
    },

    /**
     * Register a callback that fires once auth state is known.
     * If already checked, fires immediately.
     */
    onReady: function (fn) {
      if (_checked) {
        fn(_athlete);
      } else {
        _callbacks.push(fn);
        // Trigger the check if it hasn't started
        if (!_checking) RMMAuth.check();
      }
    },

    /**
     * Get the cached athlete (may be null if not checked yet).
     */
    getAthlete: function () {
      return _athlete;
    },

    /**
     * Whether the user is currently authenticated.
     */
    isLoggedIn: function () {
      return _athlete !== null;
    },

    /**
     * Redirect to Strava OAuth login.
     * @param {string} returnTo — URL to return to after auth (default: /dashboard)
     */
    login: function (returnTo) {
      var url = '/api/auth/strava-login';
      if (returnTo) {
        url += '?return_to=' + encodeURIComponent(returnTo);
      }
      window.location.href = url;
    },

    /**
     * Log out — clears session and redirects to /map.
     */
    logout: function () {
      window.location.href = '/api/auth/logout';
    },

    /**
     * Update the nav bar to reflect auth state.
     * Call this after check() resolves.
     * Looks for elements with specific data attributes:
     *   data-auth="logged-in"    — shown when logged in
     *   data-auth="logged-out"   — shown when logged out
     *   data-auth="athlete-name" — innerHTML set to first name
     *   data-auth="athlete-pic"  — src set to profile pic URL
     */
    updateUI: function () {
      var loggedIn = _athlete !== null;

      // Toggle visibility of auth-conditional elements
      document.querySelectorAll('[data-auth="logged-in"]').forEach(function (el) {
        el.style.display = loggedIn ? '' : 'none';
      });
      document.querySelectorAll('[data-auth="logged-out"]').forEach(function (el) {
        el.style.display = loggedIn ? 'none' : '';
      });

      if (loggedIn) {
        // Set athlete name
        document.querySelectorAll('[data-auth="athlete-name"]').forEach(function (el) {
          el.textContent = _athlete.first_name || 'Runner';
        });
        // Set athlete profile pic
        if (_athlete.profile_pic) {
          document.querySelectorAll('[data-auth="athlete-pic"]').forEach(function (el) {
            el.src = _athlete.profile_pic;
            el.alt = (_athlete.first_name || 'Athlete') + ' profile';
          });
        }
      }
    }
  };

  function _fireCallbacks() {
    while (_callbacks.length > 0) {
      var fn = _callbacks.shift();
      try { fn(_athlete); } catch (e) { console.error('RMM Auth callback error:', e); }
    }
  }

  // Auto-check session on page load and update UI
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      RMMAuth.check().then(function () { RMMAuth.updateUI(); });
    });
  } else {
    RMMAuth.check().then(function () { RMMAuth.updateUI(); });
  }

  // Expose globally
  window.RMMAuth = RMMAuth;

})();
