// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Menu toggle functionality with null check
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('nav');
    
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            nav.classList.toggle('active');
        });
        
        // Close menu when clicking a link
        const navLinks = document.querySelectorAll('nav a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('active');
                nav.classList.remove('active');
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('nav') && !e.target.closest('.menu-toggle')) {
                menuToggle.classList.remove('active');
                nav.classList.remove('active');
            }
        });
    }
    
    // Initialize animations if elements exist
    const rainContainer = document.querySelector('.rain');
    if (rainContainer) {
        createRain();
        // Recreate rain effect on window resize
        window.addEventListener('resize', createRain);
    }
    
    const bubblesContainer = document.querySelector('.water-bubbles');
    if (bubblesContainer) {
        createBubbles();
    }
    
    // Initialize Product Showcase Enhancements
    initializeProductShowcase();
});

// Rain drop effect function
function createRain() {
    const rainContainer = document.querySelector('.rain');
    if (!rainContainer) return;
    
    const rainAmount = 200;
    let i = 1;
    let drops = '';

    while (i < rainAmount) {
        const randoHundo = (Math.floor(Math.random() * (98 - 1 + 1) + 1));
        const delay = (Math.random() * 20).toFixed(2);
        const duration = (Math.random() * 0.5 + 0.7).toFixed(2);

        drops += `<div class="drop" style="left: ${randoHundo}%; animation-delay: ${delay}s; animation-duration: ${duration}s;">
            <div class="stem" style="animation-delay: ${delay}s; animation-duration: ${duration}s;"></div>
            <div class="splat" style="animation-delay: ${delay}s; animation-duration: ${duration}s;"></div>
        </div>`;
        i++;
    }

    rainContainer.innerHTML = drops;
}

// Bubble animation function
function createBubbles() {
    const bubblesContainer = document.querySelector('.water-bubbles');
    if (!bubblesContainer) return;
    
    const bubbleCount = 15;

    for (let i = 0; i < bubbleCount; i++) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble-3d';
        
        // Random sizes
        const size = Math.random() * 40 + 20;
        bubble.style.width = `${size}px`;
        bubble.style.height = `${size}px`;
        
        // Random positions
        const xStart = Math.random() * 300;
        const yStart = Math.random() * 300;
        
        // Random movements
        const xMove = (Math.random() - 0.5) * 100;
        const yMove = (Math.random() - 0.5) * 100;
        
        // Random durations
        const floatDuration = Math.random() * 4 + 4;
        const rotateDuration = Math.random() * 6 + 6;
        
        // Apply custom properties
        bubble.style.setProperty('--x-start', `${xStart}px`);
        bubble.style.setProperty('--y-start', `${yStart}px`);
        bubble.style.setProperty('--x-move', `${xMove}px`);
        bubble.style.setProperty('--y-move', `${yMove}px`);
        bubble.style.setProperty('--float-duration', `${floatDuration}s`);
        bubble.style.setProperty('--rotate-duration', `${rotateDuration}s`);
        
        // Random delays
        bubble.style.animationDelay = `${Math.random() * -10}s`;
        
        bubblesContainer.appendChild(bubble);
    }
}

// Product Showcase Enhancements
function initializeProductShowcase() {
    // Image Loading Enhancement
    const productImages = document.querySelectorAll('.product-image img');
    
    productImages.forEach(img => {
        if (img.complete) {
            img.classList.add('loaded');
        } else {
            img.addEventListener('load', () => {
                img.classList.add('loaded');
            });
        }
    });
    
    // Intersection Observer for Product Cards Animation
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationDelay = `${entry.target.dataset.delay || 0}s`;
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observe product cards and features
    const observableElements = document.querySelectorAll('.product-showcase-card, .product-card, .feature-highlight');
    observableElements.forEach((el, index) => {
        el.dataset.delay = (index * 0.1).toString();
        observer.observe(el);
    });
    
    // Product Card Tilt Effect
    const productCards = document.querySelectorAll('.product-showcase-card, .product-card');
    
    productCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / centerY * -10;
            const rotateY = (x - centerX) / centerX * 10;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(20px)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0)';
        });
    });
    
    // Product Image Zoom on Hover
    const productShowcases = document.querySelectorAll('.product-showcase-card');
    
    productShowcases.forEach(showcase => {
        const img = showcase.querySelector('img');
        const overlay = showcase.querySelector('.product-overlay');
        
        if (img && overlay) {
            showcase.addEventListener('mouseenter', () => {
                img.style.transform = 'scale(1.1)';
                overlay.style.opacity = '1';
                overlay.style.transform = 'translateY(0)';
            });
            
            showcase.addEventListener('mouseleave', () => {
                img.style.transform = 'scale(1)';
                overlay.style.opacity = '0';
                overlay.style.transform = 'translateY(20px)';
            });
        }
    });
    
    // Smooth CTA Button Interactions
    const ctaButtons = document.querySelectorAll('.cta-btn');
    
    ctaButtons.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-3px) scale(1.02)';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translateY(0) scale(1)';
        });
        
        btn.addEventListener('click', (e) => {
            // Create ripple effect
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            
            const rect = btn.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            
            btn.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
    
    // Product Specs Tags Animation
    const specTags = document.querySelectorAll('.spec-tag');
    
    specTags.forEach((tag, index) => {
        tag.style.animationDelay = `${index * 0.1}s`;
        tag.addEventListener('mouseenter', () => {
            tag.style.transform = 'translateY(-2px) scale(1.05)';
            tag.style.boxShadow = '0 4px 12px rgba(0, 210, 255, 0.3)';
        });
        
        tag.addEventListener('mouseleave', () => {
            tag.style.transform = 'translateY(0) scale(1)';
            tag.style.boxShadow = 'none';
        });
    });
}
