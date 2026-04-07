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
