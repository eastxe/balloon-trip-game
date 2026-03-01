// ==============================
// Game Configuration
// ==============================
// Configuration will be loaded from external config.json file
let CONFIG = null;

// ==============================
// Load Configuration
// ==============================
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error('Failed to load config.json');
        }
        CONFIG = await response.json();
        console.log('Configuration loaded successfully:', CONFIG);
    } catch (error) {
        console.error('Error loading configuration:', error);
        // Fallback to default configuration
        CONFIG = {
            canvas: {
                width: 800,
                height: 450
            },
            player: {
                radius: 20,
                startX: 150,
                startY: 225,
                gravity: 0.4,
                linearDragX: 0.96,
                linearDragY: 0.95,
                tapForceX: 4.0,
                tapForceY: -9.5,
                maxVelocity: 15,
                color: '#FFD700'
            },
            obstacle: {
                width: 60,
                height: 120,
                gapHeight: 180,
                color: '#FF4444',
                speed: 3,
                spawnInterval: 1800
            },
            colors: {
                sky: '#87CEEB',
                ground: '#E0F6FF'
            }
        };
        console.log('Using fallback configuration');
    }
}

// ==============================
// Game State
// ==============================
const gameState = {
    isRunning: false,
    isWaiting: false,  // True when game is started but waiting for first input
    score: 0,
    hp: 0,
    distance: 0,
    scrollSpeed: 0,
    difficulty: 1.0,
    movingStarChance: 0.1,
    player: {
        x: 0,
        y: 0,
        vx: 0,  // X velocity
        vy: 0   // Y velocity
    },
    stars: [],
    balloons: [],
    lastStarTime: 0,
    lastStarY: 0,
    lastBalloonTime: 0,
    animationFrameId: null,
    gateChain: {
        active: false,
        count: 0
    }
};

// ==============================
// DOM Elements
// ==============================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score-display');
const hpDisplay = document.getElementById('hp-display');
const gameOverScreen = document.getElementById('game-over');
const finalScoreDisplay = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');

// ==============================
// Canvas Setup
// ==============================
function setupCanvas() {
    canvas.width = CONFIG.canvas.width;
    canvas.height = CONFIG.canvas.height;
}

// ==============================
// Game Initialization
// ==============================
function initGame() {
    setupCanvas();

    // Reset game state
    gameState.player.x = CONFIG.player.startX;
    gameState.player.y = CONFIG.player.startY;
    gameState.player.vx = 0;
    gameState.player.vy = 0;
    gameState.stars = [];
    gameState.balloons = [];
    gameState.score = 0;
    gameState.hp = CONFIG.game.maxHP;
    gameState.distance = 0;
    gameState.scrollSpeed = CONFIG.scroll.speed;
    gameState.difficulty = 1.0;
    gameState.movingStarChance = 0.1;
    gameState.isWaiting = true;
    gameState.lastStarTime = 0;
    gameState.lastStarY = CONFIG.canvas.height / 2;
    gameState.lastBalloonTime = 0;
    gameState.gateChain.active = false;
    gameState.gateChain.count = 0;

    updateScoreDisplay();
    updateHPDisplay();

    // Hide game over screen
    gameOverScreen.classList.add('hidden');

    // Start game immediately in waiting state
    gameState.isRunning = true;
    gameLoop();
}

// ==============================
// Start Real Game (after first input)
// ==============================
function startRealGame() {
    if (!gameState.isWaiting) return;

    gameState.isWaiting = false;
    gameState.lastStarTime = Date.now();
    gameState.lastBalloonTime = Date.now();
}

// ==============================
// Player Physics Update
// ==============================
function updatePlayer() {
    // Skip physics if waiting for first input
    if (gameState.isWaiting) return;

    const player = gameState.player;

    // Apply gravity
    player.vy += CONFIG.player.gravity;

    // Apply horizontal drag
    player.vx *= CONFIG.player.drag;

    // Cap velocities
    player.vy = Math.max(-CONFIG.player.maxVelocityY, Math.min(CONFIG.player.maxVelocityY, player.vy));
    player.vx = Math.max(-CONFIG.player.maxVelocityX, Math.min(CONFIG.player.maxVelocityX, player.vx));

    // Update position
    player.x += player.vx;
    player.y += player.vy;

    // Clamp X position to screen boundaries
    const minX = CONFIG.player.radius;
    const maxX = CONFIG.canvas.width - CONFIG.player.radius;
    player.x = Math.max(minX, Math.min(maxX, player.x));

    // Clamp Y position at top (but don't game over)
    const minY = CONFIG.player.radius;
    if (player.y < minY) {
        player.y = minY;
        player.vy = 0; // Stop upward movement
    }

    // Check sea collision (game over)
    if (player.y + CONFIG.player.radius > CONFIG.canvas.height - CONFIG.sea.height) {
        gameOver();
    }
}

// ==============================
// Scroll System
// ==============================
function updateScroll() {
    // Gradually increase scroll speed
    if (gameState.scrollSpeed < CONFIG.scroll.maxSpeed) {
        gameState.scrollSpeed += CONFIG.scroll.acceleration;
    }

    // Update distance traveled
    gameState.distance += gameState.scrollSpeed;

    // Update difficulty based on distance
    updateDifficulty();
}

// ==============================
// Difficulty System
// ==============================
function updateDifficulty() {
    // Find current difficulty phase
    const phases = CONFIG.game.difficultyPhases;
    let currentPhase = phases[0];

    for (const phase of phases) {
        if (gameState.distance >= phase.distance) {
            currentPhase = phase;
        }
    }

    gameState.difficulty = currentPhase.multiplier;
    gameState.movingStarChance = currentPhase.movingStarChance;
}

// ==============================
// Star Management
// ==============================
function spawnStar() {
    // Don't spawn if waiting for first input
    if (gameState.isWaiting) return;

    const now = Date.now();

    // Calculate spawn interval with variance and difficulty
    const variance = Math.random() * CONFIG.star.spawnIntervalVariance - CONFIG.star.spawnIntervalVariance / 2;
    let spawnInterval = (CONFIG.star.baseSpawnInterval + variance) / gameState.difficulty;

    // Reduce interval if in gate chain for faster succession
    if (gameState.gateChain.active && gameState.gateChain.count > 1) {
        spawnInterval *= 0.6; // Gates come 40% faster when chaining
    }

    if (now - gameState.lastStarTime > spawnInterval) {
        // Choose pattern based on probability
        const pattern = choosePattern();

        // Generate stars based on pattern
        generateStarPattern(pattern);

        gameState.lastStarTime = now;
    }
}

function choosePattern() {
    // If gate chaining is active and enabled
    if (CONFIG.star.gateChaining.enabled && gameState.gateChain.active) {
        // Check if we should continue the chain
        if (Math.random() < CONFIG.star.gateChaining.chainProbability &&
            gameState.gateChain.count < CONFIG.star.gateChaining.maxChainLength) {
            gameState.gateChain.count++;
            return 'gate';
        } else {
            // End the chain
            gameState.gateChain.active = false;
            gameState.gateChain.count = 0;
        }
    }

    const rand = Math.random();
    let cumulative = 0;

    for (const [pattern, probability] of Object.entries(CONFIG.star.patterns)) {
        cumulative += probability;
        if (rand < cumulative) {
            // If gate pattern is chosen, start a potential chain
            if (pattern === 'gate' && CONFIG.star.gateChaining.enabled) {
                gameState.gateChain.active = true;
                gameState.gateChain.count = 1;
            }
            return pattern;
        }
    }

    return 'single'; // Fallback
}

function generateStarPattern(pattern) {
    const seaLevel = CONFIG.canvas.height - CONFIG.sea.height;
    const minY = 50;
    const maxY = seaLevel - 50;
    const spawnX = CONFIG.canvas.width;

    switch (pattern) {
        case 'single':
            // Single star with safe vertical distance from last star
            const y = clampY(generateSafeY(minY, maxY));
            createStar(spawnX, y);
            gameState.lastStarY = y;
            break;

        case 'gate':
            // Two stars creating a gate to fly through
            const gateY = Math.random() * (maxY - minY - CONFIG.star.minVerticalGap) + minY;
            createStar(spawnX, gateY);
            createStar(spawnX, gateY + CONFIG.star.minVerticalGap);
            gameState.lastStarY = gateY + CONFIG.star.minVerticalGap / 2;
            break;

        case 'stairs':
            // Diagonal stairs pattern
            const stairCount = 3;
            const stairStartY = Math.random() * (maxY - minY - 150) + minY;
            const stairDirection = Math.random() < 0.5 ? 1 : -1;

            for (let i = 0; i < stairCount; i++) {
                createStar(
                    spawnX + i * 80,
                    clampY(stairStartY + i * 50 * stairDirection)
                );
            }
            gameState.lastStarY = stairStartY + (stairCount - 1) * 50 * stairDirection;
            break;

        case 'wave':
            // Wave pattern of moving stars
            const waveCount = 4;
            const waveStartY = Math.random() * (maxY - minY - 100) + minY + 50;

            for (let i = 0; i < waveCount; i++) {
                const waveY = waveStartY + Math.sin(i * Math.PI / 2) * 40;
                createStar(
                    spawnX + i * 70,
                    clampY(waveY),
                    'vertical'
                );
            }
            gameState.lastStarY = waveStartY;
            break;

        case 'cluster':
            // Cluster of stars to create challenging area
            // Ensure vertical spacing between stars on same X is at least half screen height
            const clusterY = Math.random() * (maxY - minY - 120) + minY + 60;
            createStar(spawnX, clampY(clusterY));
            // Place other stars at different X coordinates to avoid same-X conflicts
            createStar(spawnX + 60, clampY(clusterY - 50));
            createStar(spawnX + 60, clampY(clusterY + 50));
            gameState.lastStarY = clusterY;
            break;
    }
}

function generateSafeY(minY, maxY) {
    // Generate Y coordinate that maintains safe distance from last star
    let y;
    let attempts = 0;

    do {
        y = Math.random() * (maxY - minY) + minY;
        attempts++;
    } while (
        Math.abs(y - gameState.lastStarY) < CONFIG.star.minVerticalGap / 2 &&
        attempts < 10
    );

    return y;
}

function clampY(y) {
    const seaLevel = CONFIG.canvas.height - CONFIG.sea.height;
    return Math.max(50, Math.min(seaLevel - 50, y));
}

function createStar(x, y, forceType = null) {
    // Determine movement type
    let type = forceType || 'static';

    if (!forceType && Math.random() < gameState.movingStarChance) {
        const rand = Math.random();
        let cumulative = 0;

        for (const [movementType, probability] of Object.entries(CONFIG.star.movementTypes)) {
            cumulative += probability;
            if (rand < cumulative) {
                type = movementType;
                break;
            }
        }
    }

    // Add random speed multiplier (0.7 to 1.3 times the base scroll speed)
    const speedMultiplier = 0.7 + Math.random() * 0.6;

    gameState.stars.push({
        x: x,
        y: y,
        radius: CONFIG.star.radius,
        type: type,
        phase: Math.random() * Math.PI * 2,
        amplitude: type === 'vertical' ? 40 : (type === 'circular' ? 30 : 0),
        originalY: y,
        speedMultiplier: speedMultiplier
    });
}

function updateStars() {
    for (let i = gameState.stars.length - 1; i >= 0; i--) {
        const star = gameState.stars[i];

        // Move star left with scroll speed and individual speed multiplier
        star.x -= gameState.scrollSpeed * star.speedMultiplier;

        // Animate moving stars
        if (star.type === 'vertical') {
            star.phase += 0.04;
            star.y = star.originalY + Math.sin(star.phase) * star.amplitude;
        } else if (star.type === 'circular') {
            star.phase += 0.03;
            const offset = star.amplitude;
            star.y = star.originalY + Math.sin(star.phase) * offset;
            star.x += Math.cos(star.phase) * offset * 0.1;
        }

        // Remove off-screen stars
        if (star.x + star.radius < 0) {
            gameState.stars.splice(i, 1);
        }
    }
}

// ==============================
// Balloon Management
// ==============================
function spawnBalloon() {
    // Don't spawn if waiting for first input
    if (gameState.isWaiting) return;

    const now = Date.now();

    if (now - gameState.lastBalloonTime > CONFIG.balloon.spawnInterval) {
        const seaLevel = CONFIG.canvas.height - CONFIG.sea.height;
        const y = Math.random() * (seaLevel - 100) + 50;
        const colorIndex = Math.floor(Math.random() * CONFIG.balloon.colors.length);

        gameState.balloons.push({
            x: CONFIG.canvas.width,
            y: y,
            radius: CONFIG.balloon.radius,
            color: CONFIG.balloon.colors[colorIndex],
            floatPhase: Math.random() * Math.PI * 2,
            missed: false
        });

        gameState.lastBalloonTime = now;
    }
}

function updateBalloons() {
    for (let i = gameState.balloons.length - 1; i >= 0; i--) {
        const balloon = gameState.balloons[i];

        // Move balloon left with reduced scroll speed
        balloon.x -= gameState.scrollSpeed * CONFIG.balloon.scrollSpeedMultiplier;

        // Float animation
        balloon.floatPhase += 0.05;
        const floatOffset = Math.sin(balloon.floatPhase) * CONFIG.balloon.floatSpeed;
        balloon.y += floatOffset;

        // Check if balloon reached left edge (missed)
        if (!balloon.missed && balloon.x + balloon.radius < 0) {
            balloon.missed = true;
            gameState.hp -= CONFIG.game.hpLossPerMissedBalloon;
            updateHPDisplay();

            // Check for game over
            if (gameState.hp <= 0) {
                gameOver();
            }

            // Remove balloon immediately after HP loss
            gameState.balloons.splice(i, 1);
        }
        // Remove off-screen balloons that were already popped
        else if (balloon.x + balloon.radius < -50) {
            gameState.balloons.splice(i, 1);
        }
    }
}

function checkBalloonCollision() {
    const player = gameState.player;

    for (let i = gameState.balloons.length - 1; i >= 0; i--) {
        const balloon = gameState.balloons[i];

        if (!balloon.missed) {
            const dx = player.x - balloon.x;
            const dy = player.y - balloon.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Smaller collision radius (70% of actual size for easier popping)
            const collisionRadius = (CONFIG.player.radius * 0.7) + (balloon.radius * 0.7);

            if (distance < collisionRadius) {
                // Balloon popped!
                gameState.balloons.splice(i, 1);
                gameState.score += 10;
                updateScoreDisplay();
            }
        }
    }
}

// ==============================
// Collision Detection
// ==============================
function checkStarCollisions() {
    const player = gameState.player;

    for (const star of gameState.stars) {
        const dx = player.x - star.x;
        const dy = player.y - star.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Smaller collision radius (60% of actual size)
        const collisionRadius = (CONFIG.player.radius * 0.6) + (star.radius * 0.6);

        if (distance < collisionRadius) {
            gameOver();
            return;
        }
    }
}

// ==============================
// Input Handling
// ==============================
function handleInput(x) {
    if (!gameState.isRunning) return;

    // Start real game on first input
    if (gameState.isWaiting) {
        startRealGame();
    }

    const canvasRect = canvas.getBoundingClientRect();
    const inputX = x - canvasRect.left;
    const canvasWidth = canvasRect.width;

    // Always flap upward
    gameState.player.vy = CONFIG.player.flapForce;

    // Add horizontal force based on input position
    if (inputX < canvasWidth / 2) {
        // Left side: move left
        gameState.player.vx -= CONFIG.player.horizontalForce;
    } else {
        // Right side: move right
        gameState.player.vx += CONFIG.player.horizontalForce;
    }
}

// Mouse events
canvas.addEventListener('mousedown', (e) => {
    handleInput(e.clientX);
});

// Touch events
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInput(touch.clientX);
});

// Keyboard events
document.addEventListener('keydown', (e) => {
    if (!gameState.isRunning) return;

    // Start real game on first input
    if (gameState.isWaiting && (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        startRealGame();
    }

    if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        // Space or Up arrow: flap upward only
        gameState.player.vy = CONFIG.player.flapForce;
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        // Left arrow: move left only (no flap)
        gameState.player.vx -= CONFIG.player.horizontalForce;
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        // Right arrow: move right only (no flap)
        gameState.player.vx += CONFIG.player.horizontalForce;
    }
});

// ==============================
// Rendering
// ==============================
function drawBackground() {
    // Night sky gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.canvas.height - CONFIG.sea.height);
    gradient.addColorStop(0, CONFIG.colors.skyTop);
    gradient.addColorStop(0.5, CONFIG.colors.skyMiddle);
    gradient.addColorStop(1, CONFIG.colors.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height - CONFIG.sea.height);

    // Stars
    ctx.fillStyle = CONFIG.colors.stars;
    const starCount = 50;
    for (let i = 0; i < starCount; i++) {
        const x = (i * 137.5 % CONFIG.canvas.width);
        const y = (i * 73.3 % (CONFIG.canvas.height - CONFIG.sea.height - 50));
        const size = (i % 3) * 0.5 + 0.5;
        const twinkle = Math.sin(Date.now() / 500 + i) * 0.3 + 0.7;
        ctx.globalAlpha = twinkle;
        ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;

    // Sea
    ctx.fillStyle = CONFIG.sea.waveColor;
    ctx.fillRect(0, CONFIG.canvas.height - CONFIG.sea.height, CONFIG.canvas.width, CONFIG.sea.height);

    // Waves
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < CONFIG.canvas.width; x += 20) {
        const y = CONFIG.canvas.height - CONFIG.sea.height + Math.sin((x + Date.now() / 200) / 30) * 5;
        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}

function drawPlayer() {
    const player = gameState.player;
    const size = CONFIG.player.radius;

    // Wing flapping based on vertical velocity
    const wingAngle = Math.sin(Date.now() / 100) * 0.3 + (player.vy < 0 ? -0.5 : 0.2);
    const wingSpread = size * 1.2;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Draw wings
    ctx.fillStyle = '#8B7355';
    ctx.strokeStyle = '#6B5945';
    ctx.lineWidth = 1.5;

    // Left wing
    ctx.beginPath();
    ctx.ellipse(-size * 0.5, 0, wingSpread, size * 0.6, wingAngle - 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right wing
    ctx.beginPath();
    ctx.ellipse(size * 0.5, 0, wingSpread, size * 0.6, -wingAngle + 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw body (main circle)
    ctx.fillStyle = '#A0826D';
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();

    // Draw belly (lighter color)
    ctx.fillStyle = '#D4B896';
    ctx.beginPath();
    ctx.arc(0, size * 0.3, size * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Draw head
    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.arc(0, -size * 0.4, size * 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Draw face area (lighter)
    ctx.fillStyle = '#A0826D';
    ctx.beginPath();
    ctx.arc(0, -size * 0.3, size * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Draw eyes (big and round)
    const eyeSize = size * 0.4;
    const eyeOffset = size * 0.25;

    // Left eye white
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-eyeOffset, -size * 0.4, eyeSize, 0, Math.PI * 2);
    ctx.fill();

    // Right eye white
    ctx.beginPath();
    ctx.arc(eyeOffset, -size * 0.4, eyeSize, 0, Math.PI * 2);
    ctx.fill();

    // Left eye outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(-eyeOffset, -size * 0.4, eyeSize, 0, Math.PI * 2);
    ctx.stroke();

    // Right eye outline
    ctx.beginPath();
    ctx.arc(eyeOffset, -size * 0.4, eyeSize, 0, Math.PI * 2);
    ctx.stroke();

    // Left pupil
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(-eyeOffset, -size * 0.4, eyeSize * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Right pupil
    ctx.beginPath();
    ctx.arc(eyeOffset, -size * 0.4, eyeSize * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(-eyeOffset - eyeSize * 0.2, -size * 0.4 - eyeSize * 0.2, eyeSize * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeOffset - eyeSize * 0.2, -size * 0.4 - eyeSize * 0.2, eyeSize * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Draw beak
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.2);
    ctx.lineTo(-size * 0.15, 0);
    ctx.lineTo(size * 0.15, 0);
    ctx.closePath();
    ctx.fill();

    // Draw ear tufts
    ctx.fillStyle = '#6B5945';
    // Left ear
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, -size * 0.8);
    ctx.lineTo(-size * 0.35, -size * 0.5);
    ctx.lineTo(-size * 0.2, -size * 0.7);
    ctx.closePath();
    ctx.fill();
    // Right ear
    ctx.beginPath();
    ctx.moveTo(size * 0.5, -size * 0.8);
    ctx.lineTo(size * 0.35, -size * 0.5);
    ctx.lineTo(size * 0.2, -size * 0.7);
    ctx.closePath();
    ctx.fill();

    // Draw feet
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, size * 0.8);
    ctx.lineTo(-size * 0.3, size * 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.3, size * 0.8);
    ctx.lineTo(size * 0.3, size * 1.1);
    ctx.stroke();

    ctx.restore();
}

function drawStars() {
    for (const star of gameState.stars) {
        // Draw star glow
        const gradient = ctx.createRadialGradient(
            star.x, star.y, 0,
            star.x, star.y, star.radius * 2
        );
        gradient.addColorStop(0, CONFIG.star.glowColor);
        gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw star shape (5-pointed star)
        ctx.fillStyle = CONFIG.star.color;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const x = star.x + Math.cos(angle) * star.radius;
            const y = star.y + Math.sin(angle) * star.radius;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
    }
}

function drawBalloons() {
    for (const balloon of gameState.balloons) {
        // Draw balloon shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(balloon.x + 2, balloon.y + 2, balloon.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw balloon
        ctx.fillStyle = balloon.color;
        ctx.beginPath();
        ctx.arc(balloon.x, balloon.y, balloon.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw balloon highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(balloon.x - 5, balloon.y - 5, balloon.radius / 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw balloon string
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(balloon.x, balloon.y + balloon.radius);
        ctx.lineTo(balloon.x, balloon.y + balloon.radius + 10);
        ctx.stroke();

        // Visual indicator if balloon was missed
        if (balloon.missed) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.arc(balloon.x, balloon.y, balloon.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}

function render() {
    drawBackground();
    drawStars();
    drawBalloons();
    drawPlayer();

    // Show waiting message if in waiting state
    if (gameState.isWaiting) {
        drawWaitingMessage();
    }
}

function drawWaitingMessage() {
    ctx.save();

    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(10, 22, 40, 0.7)';
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw shadow for all text
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Title
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('バルーントリップ', CONFIG.canvas.width / 2, CONFIG.canvas.height / 2 - 100);

    // Instructions
    ctx.font = '18px Arial';
    ctx.fillStyle = '#E0F6FF';
    ctx.fillText('画面タップ：左右移動＋浮遊', CONFIG.canvas.width / 2, CONFIG.canvas.height / 2 - 40);
    ctx.fillText('← →キー：左右移動 | スペース/↑：浮遊', CONFIG.canvas.width / 2, CONFIG.canvas.height / 2 - 10);
    ctx.fillText('風船を割ろう！星と海を避けよう！', CONFIG.canvas.width / 2, CONFIG.canvas.height / 2 + 20);
    ctx.fillText('風船を逃すとHPが減ります', CONFIG.canvas.width / 2, CONFIG.canvas.height / 2 + 50);

    // Start prompt
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#FFD700';
    const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    ctx.fillText('何か入力してスタート', CONFIG.canvas.width / 2, CONFIG.canvas.height / 2 + 100);

    ctx.restore();
}

// ==============================
// Game Loop
// ==============================
function gameLoop() {
    if (!gameState.isRunning) return;

    // Update systems
    updateScroll();
    updatePlayer();
    spawnStar();
    updateStars();
    spawnBalloon();
    updateBalloons();
    checkStarCollisions();
    checkBalloonCollision();

    // Render
    render();

    // Continue loop
    gameState.animationFrameId = requestAnimationFrame(gameLoop);
}

// ==============================
// Game Over
// ==============================
function gameOver() {
    gameState.isRunning = false;

    if (gameState.animationFrameId) {
        cancelAnimationFrame(gameState.animationFrameId);
    }

    finalScoreDisplay.textContent = gameState.score;
    gameOverScreen.classList.remove('hidden');
}

// ==============================
// UI Updates
// ==============================
function updateScoreDisplay() {
    scoreDisplay.textContent = `スコア: ${gameState.score}`;
}

function updateHPDisplay() {
    hpDisplay.textContent = `HP: ${gameState.hp}`;
    // Change color based on HP level
    if (gameState.hp <= 1) {
        hpDisplay.style.color = '#FF0000';
    } else if (gameState.hp <= 2) {
        hpDisplay.style.color = '#FFA500';
    } else {
        hpDisplay.style.color = '#FF6B9D';
    }
}

// ==============================
// Event Listeners
// ==============================
restartBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    initGame();
});

// Keyboard shortcuts for restart
document.addEventListener('keydown', (e) => {
    // Check if game over screen is visible
    if (!gameOverScreen.classList.contains('hidden')) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            gameOverScreen.classList.add('hidden');
            initGame();
        }
    }
});

// ==============================
// Initialize on Load
// ==============================
window.addEventListener('load', async () => {
    await loadConfig();
    initGame();
});

// Prevent default touch behaviors
document.body.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });
