// Loading Event
window.addEventListener('DOMContentLoaded', function() {
    const loader = document.querySelector('.loader');
    loader.style.display = 'flex';
});

window.addEventListener('load', function() {
    const loader = document.querySelector('.loader');
    loader.style.display = 'none';
});
// -----------------------------------------------------------
// Light - Dark Mode Toggle Event
const lightModeButton = document.getElementById('light-mode');
const darkModeButton = document.getElementById('dark-mode');
const themeStylesheet = document.getElementById('theme-stylesheet');

window.addEventListener('DOMContentLoaded', () => {
    const revilTheme = localStorage.getItem('revilTheme');
    if (revilTheme) {
        document.getElementById('theme-stylesheet').setAttribute('href', revilTheme);
    }
});

lightModeButton.addEventListener('click', () => {
    themeStylesheet.setAttribute('href', 'CSS/Main.css');
    localStorage.setItem('revilTheme', 'CSS/Main.css');
    document.querySelector('.loader').style.backgroundColor = '#ebf6ff';
});

darkModeButton.addEventListener('click', () => {
    themeStylesheet.setAttribute('href', 'CSS/Main-Dark.css');
    localStorage.setItem('revilTheme', 'CSS/Main-Dark.css');
    document.querySelector('.loader').style.backgroundColor = '#001021';
});
// -----------------------------------------------------------
// Site Side Go Up
const goUpButton = document.getElementById('go-up');

goUpButton.style.display = 'none';

window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
        goUpButton.style.display = 'block';
    } else {
        goUpButton.style.display = 'none';
    }
});

goUpButton.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});
// -----------------------------------------------------------
// About-Box Media Display Event
window.addEventListener('DOMContentLoaded', function() {
    const aboutCloseBtn = document.getElementById('about-close');
    const aboutOpenBtn = document.getElementById('about-open');
    const aboutSection = document.querySelector('.about');
    const hiringSection = document.querySelector('.hiring');

    function handleAboutVisibility() {
        const isAboutSectionOff = aboutSection.classList.contains('off');
        const windowWidth = window.innerWidth;

        // Check if window width is less than 900px
        if (windowWidth < 900) {
            // Hide about section
            aboutSection.classList.add('off');
            aboutOpenBtn.style.display = 'flex';
            aboutCloseBtn.style.display = 'none';
        } else {
            // Show about section if it's off and window width is greater than or equal to 900px
            if (isAboutSectionOff) {
                aboutSection.classList.remove('off');
                hiringSection.classList.add('off');
            }
            
            // Hide both buttons if window width is 900px or more
            aboutOpenBtn.style.display = 'none';
            aboutCloseBtn.style.display = 'none';
        }
    }

    // Initial check on page load
    handleAboutVisibility();

    // Update visibility when window is resized
    window.addEventListener('resize', handleAboutVisibility);

    aboutCloseBtn.addEventListener('click', function() {
        aboutSection.classList.add('off');
        aboutOpenBtn.style.display = 'flex';
        aboutCloseBtn.style.display = 'none';
    });

    aboutOpenBtn.addEventListener('click', function() {
        aboutSection.classList.remove('off');
        aboutOpenBtn.style.display = 'none';
        aboutCloseBtn.style.display = 'block';
    });
});
// -----------------------------------------------------------
// Underline Event & // Landing Sections Display Event
function moveUnderline(button, sectionId) {
    var underline = document.querySelector('.underline');
    underline.style.transform = 'translateX(' + button.offsetLeft + 'px)';
    underline.style.width = button.offsetWidth + 'px';
    toggleSection(sectionId);
}
// About Sections Displays ON
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
// Default Display by Word
document.addEventListener('DOMContentLoaded', function() {
    var defaultButton = document.getElementById('btn2');
    moveUnderline(defaultButton, 'Word');
});
// -----------------------------------------------------------
// Landing Details Title Place Transform
function toggleLandingElements() {
    var DetailsSection = document.getElementById('Details');
    var titleElement = document.getElementById('landing-title');
    var hrElement = document.getElementById('landing-hr');

    if (DetailsSection && titleElement && hrElement) {
        if (DetailsSection.classList.contains('off')) {
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
    const text = "Hey there! I'm Mohammed Ahmed, a Front-End Enthusiast on a mission to create awesome digital experiences! Embracing my 19 years of existence, I embark on a thrilling journey of learning and growth, armed with a treasure trove of experience that belies my age. Experience isn't just a word for me it's my compass, guiding my code and my outlook on life. With every project, I aim to break limits and exceed expectations. Curious to delve deeper into my world? Feel free to explore further or check out my Gallery. My Plans is to continue learn to innovation ignites like a flame!";
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
// Hire Display Event
document.addEventListener('DOMContentLoaded', function() {
    const hireButton = document.getElementById('hire');
    const partnerButton = document.getElementById('partner');
    const closeButton = document.getElementById('hiring-close');
    const hiringSection = document.querySelector('.hiring');
    const aboutSection = document.querySelector('.about');
    const aboutOpenBtn = document.getElementById('about-open');
    const aboutCloseBtn = document.getElementById('about-close');

    hireButton.addEventListener('click', function() {
        hiringSection.classList.remove('off');
        aboutSection.classList.add('off');
    });
    
    partnerButton.addEventListener('click', function() {
        hiringSection.classList.remove('off');
        aboutSection.classList.add('off');
        aboutOpenBtn.style.display = 'none';
        aboutCloseBtn.style.display = 'block';
        
        // Scroll to the top of the page
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    closeButton.addEventListener('click', function() {
        hiringSection.classList.add('off');
        aboutSection.classList.remove('off');
    });
});

// Numbers Only IN Num Input
const numInput = document.querySelector('#Num');

numInput.addEventListener('input', function(event) {
    // Get the value of the input field
    let inputValue = numInput.value;

    // Replace any non-numeric characters with an empty string
    inputValue = inputValue.replace(/\D/g, '');

    // Update the input field value
    numInput.value = inputValue;
});

// Hire Send Input Event
document.addEventListener("DOMContentLoaded", function() {
    const sendButton = document.querySelector('.send button');
    const formFields = document.querySelectorAll('.hiring input, .hiring textarea');
    const alertMessage = document.getElementById('alert');

    sendButton.classList.add('disabled');

    function checkFields() {
        let allFieldsFilled = true;
        formFields.forEach(field => {
            if (field.value.trim() === '' && field.hasAttribute('required') && field.id !== 'Num') {
                allFieldsFilled = false;
            }
        });
        return allFieldsFilled;
    }

    function handleButtonState() {
        if (checkFields()) {
            sendButton.classList.remove('disabled');
        } else {
            sendButton.classList.add('disabled');
        }
    }

    function showAlert(message) {
        alertMessage.innerText = message;
        setTimeout(function() {
            alertMessage.innerText = '';
        }, 5000);
    }

    formFields.forEach(field => {
        field.addEventListener('input', function() {
            handleButtonState();
            if (alertMessage.innerText !== '') {
                alertMessage.innerText = '';
            }
        });
    });

    sendButton.addEventListener('click', function(event) {
        if (!checkFields()) {
            event.preventDefault();
            showAlert('Please fill in all required fields.');
        }
    });
});

// Whats App Hire Button
document.addEventListener('DOMContentLoaded', function() {
    const whatsappButton = document.getElementById('whatsapp');

    whatsappButton.addEventListener('click', function() {
        window.open("https://wa.me/+201001308280", "_blank");
    });
});

// Hire Send Event
function sendMail() {
    (function(){
        emailjs.init("RbjrnyhMd8ZaJx0x0"); // Account Publick Key
    })();

    var name = document.querySelector("#Name").value;
    var email = document.querySelector("#Email").value;
    var num = document.querySelector("#Num").value;
    var message = document.querySelector("#Message").value;
    var alertMessage = document.getElementById('alert');

    if (name.trim() === '' || email.trim() === '' || message.trim() === '') {
        alertMessage.innerText = 'Please fill in all required fields.';
        setTimeout(function() {
            alertMessage.innerText = '';
        }, 5000);
        return;
    }

    var params = {
        Name: name,
        Email: email,
        Num: num,
        Message: message,
    };

    var serviceID = "service_u7bmpuq"; // Email Service ID
    var templateID = "template_5jqeioc"; // Email template ID

    emailjs.send(serviceID, templateID, params)
    .then( res => {
        alertMessage.innerText = "Done!!, Wilk Be In Touch Soon.";
        setTimeout(function() {
            alertMessage.innerText = '';
        }, 5000);
    })
    .catch();
}
// -----------------------------------------------------------
// CV Download Button
document.addEventListener('DOMContentLoaded', function() {
    const cvButton = document.getElementById('cv');
    const cvFilePath = '/Files/MohammedAhmedCV.pdf';

    cvButton.addEventListener('click', function() {
        // إنشاء عنصر رابط
        const link = document.createElement('a');
        link.href = cvFilePath;
        link.download = 'CV.pdf';

        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);
    });
});
// -----------------------------------------------------------
// Certificate Modal Image
document.addEventListener("DOMContentLoaded", function() {
    const certificateImages = document.querySelectorAll('.certificate-gallery .img img');
    
    const whImg = document.querySelector('.wh-img');
    
    const modalImgCloseBtn = document.getElementById('modal-img-close');
    
    certificateImages.forEach(function(image) {
        image.addEventListener('click', function() {
            const src = image.getAttribute('src');
            const alt = image.getAttribute('alt');
            
            const whImgContainer = document.querySelector('.wh-img .modal-img img');
            whImgContainer.setAttribute('src', src);
            whImgContainer.setAttribute('alt', alt);
            
            whImg.classList.remove('off');
        });
    });

    modalImgCloseBtn.addEventListener('click', function() {
        whImg.classList.add('off');
    });
});
// -----------------------------------------------------------
// Partenrs Infinte Slider
var copy = document.querySelector(".partenrs-logo-slide").cloneNode(true);
document.querySelector(".partenrs-slider").appendChild(copy);
// -----------------------------------------------------------
