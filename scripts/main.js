/* ==========================================================================
   RUN MAD MAPS — Main Script
   ========================================================================== */

(function () {
  'use strict';

  // --- DOM ---
  var emailInput = document.getElementById('emailInput');
  var submitBtn = document.getElementById('submitBtn');
  var consentCheckbox = document.getElementById('consentCheckbox');
  var formRow = document.getElementById('formRow');
  var consentRow = document.getElementById('consentRow');
  var errorMsg = document.getElementById('errorMsg');
  var successMsg = document.getElementById('successMsg');

  // --- Email validation ---
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // --- Show error ---
  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.add('visible');
    setTimeout(function () {
      errorMsg.classList.remove('visible');
    }, 4000);
  }

  // --- Show success ---
  function showSuccess() {
    formRow.style.display = 'none';
    consentRow.style.display = 'none';
    errorMsg.classList.remove('visible');
    successMsg.classList.add('visible');
  }

  // --- Submit handler ---
  async function handleSubmit() {
    var email = emailInput.value.trim();
    var consent = consentCheckbox.checked;

    // Validate
    if (!email) {
      emailInput.focus();
      showError('Enter your email.');
      return;
    }

    if (!isValidEmail(email)) {
      emailInput.focus();
      showError('That doesn\'t look like an email.');
      return;
    }

    if (!consent) {
      showError('Please tick the consent box.');
      return;
    }

    // Disable button
    submitBtn.textContent = '...';
    submitBtn.disabled = true;

    try {
      var response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, consent: consent })
      });

      var data = await response.json();

      if (response.ok) {
        showSuccess();
      } else if (response.status === 409) {
        showSuccess(); // Already subscribed — don't reveal this to user, just show success
      } else {
        showError(data.error || 'Something went wrong. Try again.');
        submitBtn.textContent = 'Join';
        submitBtn.disabled = false;
      }
    } catch (err) {
      showError('Connection failed. Try again.');
      submitBtn.textContent = 'Join';
      submitBtn.disabled = false;
    }
  }

  // --- Event listeners ---
  submitBtn.addEventListener('click', handleSubmit);

  emailInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  });
})();

// Admin bypass gate
(function() {
    var params = new URLSearchParams(window.location.search);

    if (params.get('admin') === 'madmaps') {
        localStorage.setItem('rmm_admin', 'true');
        window.history.replaceState({}, '', window.location.pathname);
    }

    if (params.get('admin') === 'reset') {
        localStorage.removeItem('rmm_admin');
        window.history.replaceState({}, '', window.location.pathname);
    }

    if (localStorage.getItem('rmm_admin') === 'true') {
        var curtain = document.querySelector('.curtain');
        if (curtain) {
            var adminNav = document.createElement('nav');
            adminNav.className = 'admin-nav';
            adminNav.innerHTML = [
                '<div class="admin-nav-label">ADMIN</div>',
                '<div class="admin-nav-links">',
                '    <a href="/map">Map</a>',
                '    <a href="/about">About</a>',
                '    <a href="/shop">Shop</a>',
                '    <a href="/intelligence">Intelligence</a>',
                '    <a href="/leaderboards">Leaderboards</a>',
                '    <a href="/dashboard">Dashboard</a>',
                '</div>'
            ].join('');
            curtain.appendChild(adminNav);
        }
    }
})();
