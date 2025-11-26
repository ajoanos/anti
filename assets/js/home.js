import { appendTokenToUrl, ACTIVE_TOKEN } from './app.js';
import { games } from './games-data.js';

// Utils
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// 1. Hero Randomization
let lastRandomIndex = -1;
let colorIndex = 0;
const cardColors = [
    'linear-gradient(135deg, rgba(242, 109, 111, 0.15), rgba(242, 109, 111, 0.05))', // Pink
    'linear-gradient(135deg, rgba(109, 213, 250, 0.15), rgba(109, 213, 250, 0.05))', // Teal
    'linear-gradient(135deg, rgba(255, 195, 160, 0.15), rgba(255, 195, 160, 0.05))'  // Peach
];

function updateGreeting() {
    const greetingElement = document.getElementById('hero-greeting');
    const badgeElement = document.getElementById('hero-badge');
    const iconElement = document.getElementById('hero-time-icon');
    const heroSection = document.getElementById('hero-section');

    if (!greetingElement) return;

    const hour = new Date().getHours();
    let greeting = '';
    let badge = '';
    let icon = '';
    let themeClass = '';

    if (hour >= 5 && hour < 12) {
        greeting = 'Dzień dobry!<br>Zacznijcie dzień razem';
        badge = 'Poranek';
        icon = '🌅';
        themeClass = 'v2-hero--morning';
    } else if (hour >= 12 && hour < 18) {
        greeting = 'Miłego popołudnia<br>we dwoje';
        badge = 'Popołudnie';
        icon = '☀️';
        themeClass = 'v2-hero--afternoon';
    } else if (hour >= 18 && hour < 22) {
        greeting = 'Gotowi na<br>gorący wieczór?';
        badge = 'Wieczór';
        icon = '🔥';
        themeClass = 'v2-hero--evening';
    } else {
        greeting = 'Noc jest młoda...<br>Bawcie się dobrze';
        badge = 'Noc';
        icon = '🌙';
        themeClass = 'v2-hero--night';
    }

    greetingElement.innerHTML = greeting;
    badgeElement.textContent = badge;
    iconElement.textContent = icon;

    // Remove old theme classes and add new one
    heroSection.classList.remove('v2-hero--morning', 'v2-hero--afternoon', 'v2-hero--evening', 'v2-hero--night');
    heroSection.classList.add(themeClass);
}

function renderHeroGame() {
    const heroCard = document.getElementById('hero-card');
    const heroIcon = document.getElementById('hero-icon');
    const heroTitle = document.getElementById('hero-title');
    const heroDesc = document.getElementById('hero-desc');
    const heroLink = document.getElementById('hero-link');

    if (!heroCard) return;

    let randomIndex;
    do {
        randomIndex = Math.floor(Math.random() * games.length);
    } while (randomIndex === lastRandomIndex && games.length > 1);

    lastRandomIndex = randomIndex;
    const randomGame = games[randomIndex];

    // Cycle colors
    heroCard.style.background = cardColors[colorIndex];
    colorIndex = (colorIndex + 1) % cardColors.length;

    heroIcon.textContent = randomGame.icon;
    heroTitle.textContent = randomGame.title;
    heroDesc.textContent = randomGame.desc;
    heroLink.href = appendTokenToUrl(randomGame.link, ACTIVE_TOKEN);

    updateGreeting();
}

function renderGameGrid() {
    const grid = document.getElementById('games-grid');
    if (!grid) return;

    grid.innerHTML = ''; // Clear existing content
    games.forEach(game => {
        const card = document.createElement('a');
        card.href = appendTokenToUrl(game.link, ACTIVE_TOKEN);
        card.className = 'v2-grid-item';
        card.dataset.category = game.category;

        card.innerHTML = `
      <div class="v2-grid-card">
        <div class="v2-grid-content">
          <div class="v2-grid-icon">${game.icon}</div>
          <h3 class="v2-grid-title">${game.title}</h3>
          <p class="v2-grid-desc">${game.desc}</p>
        </div>
        <div class="v2-grid-action">
          <button class="v2-grid-btn">Zagraj</button>
        </div>
      </div>
    `;
        grid.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderHeroGame();
    renderGameGrid();

    // Random Button Logic
    const randomBtn = document.getElementById('random-game-btn');
    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            const heroCard = document.getElementById('hero-card');

            // Start exit animation
            heroCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            heroCard.style.transform = 'rotateY(90deg)';
            heroCard.style.opacity = '0';

            setTimeout(() => {
                renderHeroGame();

                // Start enter animation
                heroCard.style.transform = 'rotateY(0deg)';
                heroCard.style.opacity = '1';

                // Cleanup after animation finishes
                setTimeout(() => {
                    heroCard.style.transition = '';
                    heroCard.style.transform = '';
                    heroCard.style.opacity = '';
                }, 300);
            }, 300);
        });
    }

    // Filter Logic
    document.querySelectorAll('.v2-mood-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.v2-mood-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const filter = pill.dataset.filter;
            const items = document.querySelectorAll('.v2-grid-item');

            items.forEach(item => {
                if (filter === 'all' || item.dataset.category === filter) {
                    item.style.display = 'flex';
                    item.style.animation = 'fadeInStagger 0.5s ease forwards';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
});
