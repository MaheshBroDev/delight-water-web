// equal heights
/*var maxHeight = 0;

$("div.oe1").each(function(){
    if ($(this).height() > maxHeight) { maxHeight = $(this).height(); }
});

$("div.oe1").height(maxHeight);*/

//AOS.init();


/*  water ripple */

/*$(".rippleContent").ripples({
    resolution: 1024,
    dropRadius: 20,
    interactive: true,
    perturbance: 0.02,
});*/

$(document).ready(function(){
    /*$("#sendEmail").on('click', function(){
        Email.send({
            SecureToken : "29cf02a9-f6a1-4668-b9ae-b693a6d22893",
            To : 'maheshkcot95@gmail.com',
            From : "noreply@delightwatersolutions.com",
            Subject : "This is the subject",
            Body : "And this is the body"
        }).then(
            message => alert(message)
        );
    })*/

    // Initialize rain drop effect if element exists
    if ($('.rain').length) {
        createRain();
        
        // Handle window resize for rain effect
        $(window).on('resize', function() {
            createRain();
        });
    }
    
    // Handle menu toggle if elements exist
    if ($('.menu-toggle').length && $('nav').length) {
        $('.menu-toggle').on('click', function() {
            $(this).toggleClass('active');
            $('nav').toggleClass('active');
        });
        
        // Close menu when clicking a link
        $('nav a').on('click', function() {
            $('.menu-toggle').removeClass('active');
            $('nav').removeClass('active');
        });
        
        // Close menu when clicking outside
        $(document).on('click', function(e) {
            if (!$(e.target).closest('nav').length && !$(e.target).closest('.menu-toggle').length) {
                $('.menu-toggle').removeClass('active');
                $('nav').removeClass('active');
            }
        });
    }
    
    // Initialize 3D bubbles if element exists
    if ($('.water-bubbles').length) {
        createBubbles();
    }
})

// Create rain drop effect
function createRain() {
    const rainContainer = document.querySelector('.rain');
    if (!rainContainer) return;
    
    const rainAmount = 200; // Number of drops
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

// Create water bubbles animation
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

// Contact form handling with null checks
var form = document.getElementById("contactForm");

// Only add the event listener if the form exists
if (form) {
    form.addEventListener("submit", handleSubmit);
}

async function handleSubmit(event) {
    event.preventDefault();
    var status = document.getElementById("my-form-status");
    var data = new FormData(event.target);
    fetch(event.target.action, {
        method: form.method,
        body: data,
        headers: {
            'Accept': 'application/json'
        }
    }).then(response => {
        if (status) {
            status.innerHTML = "<div class='alert alert-success'>Thanks for your submission!</div>";
        }
        $('.formContent').addClass('hidden');
        form.reset();
    }).catch(error => {
        if (status) {
            status.innerHTML = "<div class='alert alert-danger'>Oops, Something went wrong!</div>";
        }
    });
}

