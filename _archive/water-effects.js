/**
 * Water Effects for Delight Water Website
 * Creates interactive water elements and animations
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all water effects
    initWaterDrops();
    initRippleEffect();
    initEnhancedBubbles();
    initCursorRipples();
    initFishAnimation();
    initParallaxEffect();
    enhanceIconAnimations(); // Add this line
    createRainEffect();
});

/**
 * Creates random water drops with varied properties
 */
function initWaterDrops() {
    const container = document.querySelector('.hero-water-drops');
    if (!container) return;
    
    // Create 50 water drops with random properties
    for (let i = 0; i < 50; i++) {
        const drop = document.createElement('div');
        drop.className = 'water-drop';
        
        // Randomize drop properties
        const width = Math.random() * 3 + 1;
        const height = Math.random() * 70 + 30;
        const opacity = Math.random() * 0.4 + 0.2;
        const delay = Math.random() * 5;
        const speed = Math.random() * 2 + 1;
        const leftPos = Math.random() * 100;
        const blur = Math.random() < 0.3 ? Math.random() * 2 : 0;
        
        // Apply random styles
        drop.style.setProperty('--drop-width', `${width}px`);
        drop.style.setProperty('--drop-height', `${height}px`);
        drop.style.setProperty('--drop-opacity', opacity);
        drop.style.setProperty('--drop-delay', `${delay}s`);
        drop.style.setProperty('--drop-speed', `${speed}s`);
        drop.style.setProperty('--drop-blur', `${blur}px`);
        drop.style.left = `${leftPos}%`;
        
        container.appendChild(drop);
    }
}

/**
 * Creates water ripple effect that follows mouse movement
 */
function initRippleEffect() {
    const container = document.querySelector('.water-ripple-container');
    if (!container) return;
    
    // Add ripple on mouse move with throttling
    let lastRippleTime = 0;
    document.addEventListener('mousemove', (e) => {
        const now = Date.now();
        if (now - lastRippleTime > 300) {
            lastRippleTime = now;
            createRipple(e.clientX, e.clientY, container);
        }
    });
    
    // Add ripple on touch move with throttling
    document.addEventListener('touchmove', (e) => {
        const now = Date.now();
        if (now - lastRippleTime > 300) {
            lastRippleTime = now;
            const touch = e.touches[0];
            createRipple(touch.clientX, touch.clientY, container);
        }
    }, { passive: true });
}

/**
 * Creates a single ripple effect at specified coordinates
 */
function createRipple(x, y, container) {
    const ripple = document.createElement('div');
    ripple.className = 'water-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    
    // Random size between 100-200px
    const size = Math.random() * 100 + 100;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    
    container.appendChild(ripple);
    
    // Remove the ripple when animation ends
    setTimeout(() => {
        ripple.remove();
    }, 2000);
}

/**
 * Creates floating bubbles with 3D effects
 */
function initEnhancedBubbles() {
    const container = document.querySelector('.enhanced-bubbles');
    if (!container) return;
    
    // Create 20 enhanced bubbles
    for (let i = 0; i < 20; i++) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble-enhanced';
        
        // Randomize bubble properties
        const size = Math.random() * 50 + 20;
        const xStart = Math.random() * 100;
        const yStart = Math.random() * 100;
        const xMove = (Math.random() - 0.5) * 100;
        const yMove = (Math.random() - 0.5) * 100;
        const floatDuration = Math.random() * 10 + 8;
        const bobDuration = Math.random() * 4 + 2;
        const bobDistance = Math.random() * 30 + 10;
        const glowDuration = Math.random() * 3 + 2;
        
        // Apply styles
        bubble.style.setProperty('--bubble-size', `${size}px`);
        bubble.style.setProperty('--x-start', `${xStart}%`);
        bubble.style.setProperty('--y-start', `${yStart}%`);
        bubble.style.setProperty('--x-move', `${xMove}px`);
        bubble.style.setProperty('--y-move', `${yMove}px`);
        bubble.style.setProperty('--float-duration', `${floatDuration}s`);
        bubble.style.setProperty('--bob-duration', `${bobDuration}s`);
        bubble.style.setProperty('--bob-distance', `${bobDistance}px`);
        bubble.style.setProperty('--glow-duration', `${glowDuration}s`);
        
        container.appendChild(bubble);
    }
}

/**
 * Adds water ripple effect that follows cursor clicks
 */
function initCursorRipples() {
    document.addEventListener('click', (e) => {
        // Create ripple element
        const ripple = document.createElement('div');
        ripple.className = 'cursor-ripple';
        ripple.style.left = `${e.clientX}px`;
        ripple.style.top = `${e.clientY}px`;
        document.body.appendChild(ripple);
        
        // Remove ripple after animation completes
        setTimeout(() => {
            ripple.remove();
        }, 1000);
    });
}

/**
 * Animate fish swimming across the screen
 */
function initFishAnimation() {
    const fishContainer = document.querySelector('.fish-container');
    if (!fishContainer) return;
    
    // Add CSS for fish animation
    const style = document.createElement('style');
    style.textContent = `
        .fish-container {
            position: absolute;
            width: 100%;
            height: 100%;
            overflow: hidden;
            pointer-events: none;
            z-index: 1;
        }
        
        .fish {
            position: absolute;
            width: 100px;
            height: 50px;
            opacity: 0.7;
            fill: #ffffff;
            filter: drop-shadow(0 0 5px rgba(0,153,255,0.5));
        }
        
        .fish-1 {
            top: 20%;
            left: -100px;
        }
        
        .fish-2 {
            top: 40%;
            left: -100px;
        }
        
        .fish-3 {
            top: 60%;
            left: -100px;
        }
        
        @keyframes swimFish {
            0% {
                transform: translateX(-100px) scaleX(1);
            }
            45% {
                transform: translateX(calc(100vw + 100px)) scaleX(1);
            }
            50% {
                transform: translateX(calc(100vw + 100px)) scaleX(-1);
            }
            95% {
                transform: translateX(-100px) scaleX(-1);
            }
            100% {
                transform: translateX(-100px) scaleX(1);
            }
        }
        
        .fish-body {
            fill: rgba(255, 255, 255, 0.7);
        }
        
        .fish-eye {
            fill: #005c99;
        }
        
        .fish-tail {
            fill: rgba(255, 255, 255, 0.8);
            transform-origin: left center;
            animation: fishTail 0.6s ease-in-out infinite alternate;
        }
        
        @keyframes fishTail {
            from { transform: rotateZ(0deg); }
            to { transform: rotateZ(20deg); }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Add parallax effect to water elements
 */
function initParallaxEffect() {
    const elements = document.querySelectorAll('.bubble, .enhanced-bubbles, .water-ripple-container');
    
    window.addEventListener('mousemove', (e) => {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        
        elements.forEach(element => {
            const speed = parseFloat(element.getAttribute('data-speed') || 0.05);
            const xOffset = (x - 0.5) * 50 * speed;
            const yOffset = (y - 0.5) * 50 * speed;
            
            element.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
        });
    });
    
    // For mobile devices, use device orientation
    window.addEventListener('deviceorientation', (e) => {
        if (!e.beta || !e.gamma) return;
        
        const x = e.gamma / 30; // -30 to 30
        const y = e.beta / 30;  // -30 to 30
        
        elements.forEach(element => {
            const speed = parseFloat(element.getAttribute('data-speed') || 0.05);
            const xOffset = x * 50 * speed;
            const yOffset = y * 50 * speed;
            
            element.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
        });
    }, true);
}

/**
 * Create random animated water rain effect
 */
function createRainEffect() {
    const rainContainer = document.querySelector('.rain');
    if (!rainContainer) return;
    
    // Clear any existing raindrops
    rainContainer.innerHTML = '';
    
    // Create random raindrops
    for (let i = 0; i < 200; i++) {
        const drop = document.createElement('div');
        drop.className = 'drop';
        
        // Random positioning and animation timing
        const leftPosition = Math.random() * 98 + 1;
        const delay = Math.random() * 5;
        const duration = Math.random() * 0.5 + 0.7;
        
        drop.style.left = `${leftPosition}%`;
        drop.style.animationDelay = `${delay}s`;
        drop.style.animationDuration = `${duration}s`;
        
        // Add stem and splat elements
        const stem = document.createElement('div');
        stem.className = 'stem';
        stem.style.animationDelay = `${delay}s`;
        stem.style.animationDuration = `${duration}s`;
        drop.appendChild(stem);
        
        const splat = document.createElement('div');
        splat.className = 'splat';
        splat.style.animationDelay = `${delay}s`;
        splat.style.animationDuration = `${duration}s`;
        drop.appendChild(splat);
        
        rainContainer.appendChild(drop);
    }
}

/**
 * Enhance icon animations with interactive effects
 */
function enhanceIconAnimations() {
    // Add ripple effect to icons when clicked
    const allIcons = document.querySelectorAll('.service-icon, .strength-icon, .contact-icon, .social-icon');
    
    allIcons.forEach(icon => {
        icon.addEventListener('click', function(e) {
            // Create a ripple effect
            const ripple = document.createElement('div');
            ripple.style.cssText = `
                position: absolute;
                width: 100%;
                height: 100%;
                background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%);
                border-radius: 50%;
                opacity: 0;
                top: 0;
                left: 0;
                transform: scale(0);
                transition: transform 0.5s ease-out, opacity 0.5s ease-out;
            `;
            
            this.style.overflow = 'hidden';
            this.style.position = 'relative';
            this.appendChild(ripple);
            
            // Trigger animation
            setTimeout(() => {
                ripple.style.transform = 'scale(1.5)';
                ripple.style.opacity = '1';
            }, 10);
            
            // Clean up
            setTimeout(() => {
                ripple.remove();
            }, 500);
        });
    });
    
    // Make service icons float on mouseover
    const serviceIcons = document.querySelectorAll('.service-icon');
    serviceIcons.forEach(icon => {
        icon.addEventListener('mouseover', function() {
            this.classList.add('water-drop-icon');
        });
        
        icon.addEventListener('mouseout', function() {
            setTimeout(() => {
                this.classList.remove('water-drop-icon');
            }, 1000);
        });
    });
}

// Call rain effect creator when DOM loads and window resizes
window.addEventListener('load', createRainEffect);
window.addEventListener('resize', createRainEffect);
