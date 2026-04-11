// Shared site components — nav and footer
// Injected into every page except landing curtain

function renderNav() {
    var nav = document.createElement('header');
    nav.className = 'site-nav';
    nav.innerHTML = [
        '<div class="nav-inner">',
        '    <a href="/" class="nav-logo">',
        '        <img src="/public/images/logo.svg" alt="Run Mad Maps" />',
        '        <span class="nav-brand">RUN MAD MAPS</span>',
        '    </a>',
        '    <nav class="nav-links">',
        '        <a href="/map" class="nav-link">Map</a>',
        '        <a href="/about" class="nav-link">About</a>',
        '        <a href="/shop" class="nav-link">Shop</a>',
        '        <a href="/intelligence" class="nav-link">Intelligence</a>',
        '        <a href="/leaderboards" class="nav-link">Leaderboards</a>',
        '        <a href="/dashboard" class="nav-link nav-link-gated">Dashboard</a>',
        '    </nav>',
        '    <button class="nav-toggle" aria-label="Toggle menu">',
        '        <span></span>',
        '        <span></span>',
        '        <span></span>',
        '    </button>',
        '</div>'
    ].join('');
    document.body.prepend(nav);

    // Highlight current page
    var path = window.location.pathname;
    nav.querySelectorAll('.nav-link').forEach(function(link) {
        if (link.getAttribute('href') === path) {
            link.classList.add('active');
        }
    });

    // Mobile toggle
    var toggle = nav.querySelector('.nav-toggle');
    var links = nav.querySelector('.nav-links');
    toggle.addEventListener('click', function() {
        links.classList.toggle('open');
        toggle.classList.toggle('open');
    });
}

function renderFooter() {
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = [
        '<div class="footer-inner">',
        '    <div class="footer-brand">',
        '        <img src="/public/images/logo.svg" alt="Run Mad Maps" class="footer-logo" />',
        '        <p class="footer-tagline">Your Cape Peninsula Trail Intelligence Companion</p>',
        '    </div>',
        '    <div class="footer-links">',
        '        <a href="/map">Map</a>',
        '        <a href="/about">About</a>',
        '        <a href="/shop">Shop</a>',
        '        <a href="/intelligence">Intelligence</a>',
        '        <a href="/leaderboards">Leaderboards</a>',
        '        <a href="/dashboard">Dashboard</a>',
        '    </div>',
        '    <div class="footer-legal">',
        '        <p>&copy; ' + new Date().getFullYear() + ' Run Mad Maps. All rights reserved.</p>',
        '        <p class="footer-location">Cape Town, South Africa</p>',
        '        <div class="footer-legal-links">',
        '            <a href="/privacy">Privacy Policy</a>',
        '            <span class="sep">&middot;</span>',
        '            <a href="/terms">Terms of Service</a>',
        '            <span class="sep">&middot;</span>',
        '            <a href="/cookies">Cookie Policy</a>',
        '            <span class="sep">&middot;</span>',
        '            <a href="/acceptable-use">Acceptable Use</a>',
        '        </div>',
        '    </div>',
        '</div>'
    ].join('');
    document.body.appendChild(footer);
}

document.addEventListener('DOMContentLoaded', function() {
    renderNav();
    renderFooter();
});
