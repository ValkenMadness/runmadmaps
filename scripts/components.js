// Shared site components — nav and footer
// Injected into every page via components.js

function renderNav() {
    var isAdmin = localStorage.getItem('rmm_admin') === 'true';
    var nav = document.createElement('header');
    nav.className = 'site-nav';
    nav.innerHTML = [
        '<div class="nav-inner">',
        '    <a href="/" class="nav-logo">',
        '        <img src="/public/images/logo.svg" alt="Run Mad Maps" />',
        '        <span class="nav-brand">RUN MAD MAPS</span>',
        '    </a>',
        '    <nav class="nav-links">',
        '        <a href="/" class="nav-link">Map</a>',
        '        <a href="/about" class="nav-link">About</a>',
        (isAdmin ? '        <a href="/shop" class="nav-link">Shop</a>' : ''),
        (isAdmin ? '        <a href="/intelligence" class="nav-link">Intelligence</a>' : ''),
        (isAdmin ? '        <a href="/leaderboards" class="nav-link">Leaderboards</a>' : ''),
        (isAdmin ? '        <a href="/dashboard" class="nav-link nav-link-gated">Dashboard</a>' : ''),
        '    </nav>',
        '    <button class="nav-toggle" aria-label="Toggle menu">',
        '        <span></span>',
        '        <span></span>',
        '        <span></span>',
        '    </button>',
        '</div>'
    ].join('');
    document.body.prepend(nav);

    // Highlight current page — treat /map same as /
    var path = window.location.pathname;
    var normPath = (path === '/map') ? '/' : path;
    nav.querySelectorAll('.nav-link').forEach(function(link) {
        var href = link.getAttribute('href');
        var normHref = (href === '/map') ? '/' : href;
        if (normHref === normPath) {
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
    var isAdmin = localStorage.getItem('rmm_admin') === 'true';
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = [
        '<div class="footer-inner">',
        '    <div class="footer-brand">',
        '        <img src="/public/images/logo.svg" alt="Run Mad Maps" class="footer-logo" />',
        '        <p class="footer-tagline">Your Cape Peninsula Trail Intelligence Companion</p>',
        '    </div>',
        '    <div class="footer-links">',
        '        <a href="/">Map</a>',
        '        <a href="/about">About</a>',
        (isAdmin ? '        <a href="/shop">Shop</a>' : ''),
        (isAdmin ? '        <a href="/intelligence">Intelligence</a>' : ''),
        (isAdmin ? '        <a href="/leaderboards">Leaderboards</a>' : ''),
        (isAdmin ? '        <a href="/dashboard">Dashboard</a>' : ''),
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
    // Skip footer on map page — map is full-bleed, no footer
    var path = window.location.pathname;
    if (path !== '/' && path !== '/map') {
        renderFooter();
    }
});
