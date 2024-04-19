// Underline Event & // Landing Sections Display Event
function moveUnderline(button, sectionId) {
    var underline = document.querySelector('.underline');
    underline.style.transform = 'translateX(' + button.offsetLeft + 'px)';
    underline.style.width = button.offsetWidth + 'px';
    toggleSection(sectionId);
}

function toggleSection(sectionId) {
    var sections = document.querySelectorAll('.about-box');
    sections.forEach(function(sec) {
        if (sec.id === sectionId) {
            sec.classList.remove('off');
        } else {
            sec.classList.add('off');
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    var defaultButton = document.getElementById('btn2');
    moveUnderline(defaultButton, 'Word');
});
// -----------------------------------------------------------
// Landing Information Title
function toggleLandingElements() {
    var infoSection = document.getElementById('Info');
    var titleElement = document.getElementById('landing-title');
    var hrElement = document.getElementById('landing-hr');

    if (infoSection && titleElement && hrElement) {
        if (infoSection.classList.contains('off')) {
            titleElement.style.display = 'block';
            hrElement.style.display = 'block';
        } else {
            titleElement.style.display = 'none';
            hrElement.style.display = 'none';
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    toggleLandingElements();

    var buttons = document.querySelectorAll('.t-btn');
    buttons.forEach(function(button) {
        button.addEventListener('click', function() {
            toggleLandingElements();
        });
    });
});
// -----------------------------------------------------------
// a Word Write
document.addEventListener('DOMContentLoaded', function() {
    const textElement = document.getElementById('the-word');
    const text = "Hey there! I'm Mohammed Ahmed, a Front-End Enthusiast on a mission to create awesome digital experiences! Embracing my 19 years of existence, I embark on a thrilling journey of learning and growth, armed with a treasure trove of experience that belies my age. Experience isn't just a word for me; it's my compass, guiding my code and my outlook on life. With every project, I aim to break limits and exceed expectations. Curious to delve deeper into my world? Feel free to explore further or check out my Gallery. My Plans is to continue learn to innovation ignites like a flame!";
    let index = 0;

    function typeText() {
        if (index < text.length) {
            textElement.innerHTML += text.charAt(index);
            index++;
            setTimeout(typeText, 10);
        }
    }

    typeText();
});
// -----------------------------------------------------------
// Hire Messages Display Event
document.addEventListener('DOMContentLoaded', function() {
    const hireButton = document.getElementById('hire');
    const closeButton = document.getElementById('hiring-close');
    const hiringSection = document.querySelector('.hiring');
    const aboutSection = document.querySelector('.about');

    hireButton.addEventListener('click', function() {
        hiringSection.classList.remove('off');
        aboutSection.classList.add('off');
    });

    closeButton.addEventListener('click', function() {
        hiringSection.classList.add('off');
        aboutSection.classList.remove('off');
    });
});
// -----------------------------------------------------------
// Whats App Hire Button
document.addEventListener('DOMContentLoaded', function() {
    const whatsappButton = document.querySelector('.hire-btn-2');

    whatsappButton.addEventListener('click', function() {
        window.open("https://wa.me/+201001308280", "_blank");
    });
});
// -----------------------------------------------------------
