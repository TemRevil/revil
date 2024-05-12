// Gallery Search Event
document.getElementById('Search').addEventListener('keyup', function(event) {
    var searchTerms = this.value.toLowerCase().split(' ');
    var matchingCards = [];
    var matchingUiCards = [];
    
    // Loop through each card data
    data.forEach(function(cardData) {
        var cardName = cardData.name.toLowerCase();
        var tags = cardData.tags.map(tag => tag.toLowerCase()); // Get lowercase tags
        var description = cardData.description ? cardData.description.join(' ').toLowerCase() : ''; // Join and lowercase description if available

        // Check if card matches all search terms
        if (
            searchTerms.every(searchTerm => {
                if (searchTerm.includes(' ')) {
                    const [term, relatedTerm] = searchTerm.split(' ');
                    return (
                        (cardName.includes(term) && tags.includes(relatedTerm)) ||
                        (tags.includes(term) && cardName.includes(relatedTerm))
                    );
                } else {
                    return (
                        cardName.includes(searchTerm) ||
                        tags.some(tag => tag.includes(searchTerm)) ||
                        description.includes(searchTerm)
                    );
                }
            })
        ) {
            matchingCards.push(cardData); // Add matching card data to array
        }
    });

    // Loop through each UI data
    uiData.forEach(function(uiItem) {
        var description = uiItem.description.join(' ').toLowerCase(); // Join and lowercase description

        // Check if UI item matches any search term
        if (searchTerms.every(searchTerm => description.includes(searchTerm))) {
            matchingUiCards.push(uiItem); // Add matching UI item to array
        }
    });

    // Display matching cards in UI
    displayCards(matchingCards, matchingUiCards);
});

// Function to display matching cards in UI
function displayCards(cards, uiCards) {
    const galleryCards = document.querySelectorAll('.gallery-cards .card');
    const galleryUiCards = document.querySelectorAll('.gallery-ui .card-ui');

    // Hide all cards
    galleryCards.forEach(card => {
        card.style.display = 'none';
    });
    galleryUiCards.forEach(card => {
        card.style.display = 'none';
    });

    // Show only matching gallery cards
    cards.forEach(card => {
        const cardName = card.name.toLowerCase();
        const description = card.description ? card.description.join(' ').toLowerCase() : '';
        const matchingCard = Array.from(galleryCards).find(cardElement => {
            const cardElementName = cardElement.querySelector('.card-name').textContent.toLowerCase();
            const cardElementDescription = cardElement.querySelector('.card-dis').textContent.toLowerCase();
            return (
                cardElementName.includes(cardName) ||
                cardElementDescription.includes(cardName)
            );
        });

        if (matchingCard) {
            matchingCard.style.display = 'block';
        }
    });

    // Show only matching UI cards
    uiCards.forEach(uiItem => {
        const matchingUICard = Array.from(galleryUiCards).find(uiCard => {
            return uiCard.id === uiItem.id;
        });

        if (matchingUICard) {
            matchingUICard.style.display = 'block';
        }
    });
}
// -----------------------------------------------------------------
// Gallery Cards / Ui Display Event
function toggleView(view) {
    const galleryCards = document.querySelector('.gallery-cards');
    const galleryUi = document.querySelector('.gallery-ui');

    if (view === 'sites') {
        galleryCards.classList.remove('off');
        galleryUi.classList.add('off');
    } else if (view === 'ui') {
        galleryCards.classList.add('off');
        galleryUi.classList.remove('off');
    }
}
// -----------------------------------------------------------------
// Card Preview Event "Images Slider IN Cards"
document.addEventListener("DOMContentLoaded", function() {
    var cardImgs = document.getElementsByClassName('card-img');
    var currentSlides = [];

    // Loop through each card-img element
    Array.from(cardImgs).forEach(function(cardImg) {
        var slides = cardImg.querySelectorAll('.slides img');
        var currentSlide = 0;
        currentSlides.push({
            slides: slides,
            currentSlide: currentSlide
        });

        // Function to show slide
        function showSlide(n, slides) {
            if (n >= slides.length) {
                currentSlide = 0;
            } else if (n < 0) {
                currentSlide = slides.length - 1;
            } else {
                currentSlide = n;
            }

            slides.forEach(function(slide) {
                slide.classList.remove('card-img-active');
            });

            slides[currentSlide].classList.add('card-img-active');
        }

        // Show the first slide immediately when the page loads
        showSlide(0, slides);

        // Function to move to next slide
        function nextSlide(slides) {
            currentSlides.forEach(function(cardSlides) {
                showSlide(cardSlides.currentSlide + 1, cardSlides.slides);
                cardSlides.currentSlide = (cardSlides.currentSlide + 1) % cardSlides.slides.length;
            });
        }

        // Set interval for automatic slide change
        var interval = setInterval(function() {
            nextSlide(slides);
        }, 5000);

        // Attach event listeners to card-img element
        cardImg.addEventListener('mouseenter', function() {
            clearInterval(interval); // Stop automatic slide change on mouse enter
        });

        cardImg.addEventListener('mouseleave', function() {
            interval = setInterval(function() {
                nextSlide(slides);
            }, 6000); // Resume automatic slide change on mouse leave
        });
    });

    // Function to register events after updating elements inside the slider
    function registerEvents() {
        leftButton.addEventListener('click', function() {
            prevSlide();
        });

        rightButton.addEventListener('click', function() {
            nextSlide();
        });

        var slides = slider.querySelectorAll('img');
        slides.forEach(function(slide, index) {
            slide.addEventListener('click', function() {
                setActiveSlide(index);
            });
        });
    }
});
// -----------------------------------------------------------------
// TAGS Show
document.addEventListener("DOMContentLoaded", function() {
    // Function to display tags dynamically
    function displayTags(tagsDiv, tagsArray) {
        // Clear any existing tags
        tagsDiv.innerHTML = '';

        // Check if there are more than 3 tags
        if (tagsArray.length > 3) {
            // Display first 3 tags
            for (let i = 0; i < 3; i++) {
                const tag = document.createElement('div');
                tag.classList.add('tag', `tag-${tagsArray[i].toLowerCase()}`);
                tag.textContent = tagsArray[i];
                tagsDiv.appendChild(tag);
            }

            // Display remaining tags count
            const moreTags = document.createElement('div');
            moreTags.classList.add('tag', 'tag-more');
            moreTags.textContent = `+${tagsArray.length - 3} More`;
            tagsDiv.appendChild(moreTags);
        } else {
            // Display all tags if there are 3 or less
            tagsArray.forEach(tagText => {
                const tag = document.createElement('div');
                tag.classList.add('tag', `tag-${tagText.toLowerCase()}`);
                tag.textContent = tagText;
                tagsDiv.appendChild(tag);
            });
        }
    }

    // Get the card elements
    const cards = document.querySelectorAll('.card');

    // Loop through each card
    cards.forEach((card, index) => {
        // Get the tags-div element inside the card
        const tagsDiv = card.querySelector('.tags-div');

        // Get the tags from the data
        const tagsArray = data[index].tags;

        // Display tags
        displayTags(tagsDiv, tagsArray);
    });
});
// -----------------------------------------------------------------
// Link Visit
document.addEventListener("DOMContentLoaded", function() {
    // Getting all "Visit" buttons
    var visitButtons = document.querySelectorAll('.card-btn.card-site');

    // Assigning click event to each "Visit" button
    visitButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            // Finding the parent element of the "Visit" button to get its associated information
            var card = button.closest('.view-link');

            // Getting the specific link inside the parent element of the "Visit" button
            var link = card.getAttribute('data-link');

            // Opening the specified link in a new window
            window.open(link, '_blank');
        });
    });
});
// -----------------------------------------------------------------
// Modal Slider Event
document.addEventListener("DOMContentLoaded", function() {
    var leftButton = document.getElementById('left');
    var rightButton = document.getElementById('right');
    var slider = document.querySelector('.img-slider');
    var sliderView = document.getElementById('img-slider-view');

    // Display the first image immediately
    updateSliderView();

    // Function to update active image view
    function updateSliderView() {
        var activeSlide = slider.querySelector('.active');
        if (activeSlide) {
            var activeSrc = activeSlide.getAttribute('src');
            sliderView.setAttribute('src', activeSrc);
        }
    }

    // Function to set active class to the clicked image
    function setActiveSlide(index) {
        var slides = slider.querySelectorAll('img');
        slides.forEach(function(slide) {
            slide.classList.remove('active');
        });
        slides[index].classList.add('active');
        updateSliderView();
        scrollToActiveSlide();
    }

    // Function to switch to the next slide
    function nextSlide() {
        var slides = slider.querySelectorAll('img');
        var currentIndex = Array.from(slides).findIndex(function(slide) {
            return slide.classList.contains('active');
        });
        setActiveSlide((currentIndex + 1) % slides.length);
    }

    // Function to switch to the previous slide
    function prevSlide() {
        var slides = slider.querySelectorAll('img');
        var currentIndex = Array.from(slides).findIndex(function(slide) {
            return slide.classList.contains('active');
        });
        setActiveSlide((currentIndex - 1 + slides.length) % slides.length);
    }

    // Function to register events after updating elements inside the slider
    function registerEvents() {
        leftButton.addEventListener('click', function() {
            prevSlide();
        });

        rightButton.addEventListener('click', function() {
            nextSlide();
        });

        var slides = slider.querySelectorAll('img');
        slides.forEach(function(slide, index) {
            slide.addEventListener('click', function() {
                setActiveSlide(index);
            });
        });
    }

    // Function to ensure that the active image is fully visible inside the slider
    function scrollToActiveSlide() {
        var activeSlide = slider.querySelector('.active');
        if (activeSlide) {
            var sliderRect = slider.getBoundingClientRect();
            var slideRect = activeSlide.getBoundingClientRect();
            if (slideRect.left < sliderRect.left || slideRect.right > sliderRect.right) {
                var scrollAmount = activeSlide.offsetLeft - slider.offsetLeft;
                slider.scroll({
                    left: scrollAmount,
                    behavior: 'smooth' // Enable smooth scrolling
                });
            }
        }
    }

    // Adding event listener to the slider to activate the "active" class when clicking on images
    slider.addEventListener('click', function(event) {
        if (event.target.tagName === 'IMG') {
            var clickedImage = event.target;
            var slides = slider.querySelectorAll('img');
            slides.forEach(function(slide) {
                slide.classList.remove('active');
            });
            clickedImage.classList.add('active');
            updateSliderView();
        }
    });

    // Registering events after updating elements inside the slider
    registerEvents();
});
// -----------------------------------------------------------------
// Modal Original Event
const modalCloseBtn = document.getElementById('modal-close');
// Modal Open/Close Event
document.addEventListener('DOMContentLoaded', function() {
    const modalCloseBtn = document.getElementById('modal-close');
    const modal = document.querySelector('.modal');
    const whElement = document.querySelector('.wh-sites');

    // Function to open the modal
    function openModal() {
        whElement.classList.remove('off'); // إزالة الكلاس off لإظهار العناصر
        modal.classList.remove('off'); // إزالة الكلاس off لإظهار العناصر
    }

    // Function to close the modal
    function closeModal() {
        whElement.classList.add('off'); // إضافة الكلاس off لإخفاء العناصر
        modal.classList.add('off'); // إضافة الكلاس off لإخفاء العناصر
    }

    // Open modal when clicking on view button
    viewButtons.forEach(button => {
        button.addEventListener('click', openModal);
    });

    // Close modal when clicking on modal close button
    modalCloseBtn.addEventListener('click', closeModal);

    // Close modal when pressing "Esc" key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeModal();
        }
    });
});

// Getting the "View" button in each card
const viewButtons = document.querySelectorAll('.card-btn#card-view');

// Getting the modal
const modal = document.querySelector('.modal');

// Getting elements inside the modal to update them with information from the card
const cardNameInModal = document.querySelectorAll('.modal .card-name');
const cardTagsInModal = document.querySelector('.modal .tags-div');
const cardDescriptionInModal = document.querySelector('.modal .text');
const imgSliderView = document.getElementById('img-slider-view');
const imgSlider = document.querySelector('.modal .img-slider');
const cardContentInModal = document.querySelector('.modal .card-dis.text'); // Added this line

// Assigning click event to the "View" button in each card "The Main Event IN Modal"
viewButtons.forEach(button => {
    button.addEventListener('click', function() {
        // Finding the parent element of the "View" button to get its associated information
        const card = button.closest('.card');

        // Getting the card name
        const cardName = card.querySelector('.align').textContent;

        // Getting the card data from the data.js file
        const cardData = data.find(item => item.name === cardName);

        // Displaying the modal
        modal.style.display = 'block';

        // Changing the display value in WH to flex
        const whSites = document.querySelector('.wh-sites');
        whSites.style.display = 'flex';

        // Displaying card information inside the modal
        cardNameInModal.forEach(element => {
            element.textContent = cardData.name;
        });

        // Replacing tags inside cardTagsInModal with appropriate tags from the card data
        cardTagsInModal.innerHTML = ''; // Clear any existing content
        const tagsLabel = document.createElement('p');
        tagsLabel.classList.add('align');
        tagsLabel.textContent = 'Tags : ';
        cardTagsInModal.appendChild(tagsLabel); // Add the tags label
        cardData.tags.forEach(tag => {
            const tagElement = document.createElement('div');
            tagElement.classList.add('tag', `tag-${tag.toLowerCase()}`); // Add the class for each tag
            tagElement.textContent = tag;
            cardTagsInModal.appendChild(tagElement);
        });


        cardDescriptionInModal.textContent = card.querySelector('.text').textContent;

        // Get the data-link value from the card and update it in the modal
        const cardLink = card.getAttribute('data-link');
        const viewLink = document.querySelector('.modal .view-link');
        viewLink.setAttribute('data-link', cardLink);

        const teamContainer = document.getElementById('team');
        teamContainer.innerHTML = ''; // Clear any previously existing team members

        // Adding team members inside the modal
        cardData.creators.forEach(creator => {
            const teamCard = document.createElement('div');
            teamCard.classList.add('team-card', 'flex', 'row', 'transition');

            const teamImg = document.createElement('div');
            teamImg.classList.add('team-img', 'img');
            const img = document.createElement('img');
            img.src = `${creator.image}`;
            img.alt = `${creator.name}'s image`;
            teamImg.appendChild(img);

            const teamName = document.createElement('p');
            teamName.classList.add('text');
            teamName.textContent = creator.name;

            teamCard.appendChild(teamImg);
            teamCard.appendChild(teamName);

            teamContainer.appendChild(teamCard);
        });

        const cardVersionInModal = document.getElementById('card-vir');
        const cardViewsInModal = document.getElementById('card-viwes');
        const cardLanguagesInModal = document.querySelector('.modal .script-data');

        // Displaying card data inside the modal
        cardVersionInModal.textContent = `${cardData.version}`;
        cardViewsInModal.textContent = `${cardData.views}`;

        // Displaying languages used in the card
        cardLanguagesInModal.innerHTML = '';
        cardData.languages.forEach(language => {
            const langElement = document.createElement('div');
            langElement.classList.add('script-data-lang', 'flex', 'row');

            // Update the HTML element based on the language
            let htmlContent = '';
            switch (language.name.toLowerCase()) {
                case 'html':
                    htmlContent = `
                        <i class="fa-brands fa-html5" style="color: #f06529;"></i>
                        <p class="text">${language.name}</p>
                        <span class="lang-p text" style="width: ${language.percentage}%;">${language.percentage}%</span>
                    `;
                    break;
                case 'css':
                    htmlContent = `
                        <i class="fa-brands fa-css3-alt" style="color: #2965f1;"></i>
                        <p class="text">${language.name}</p>
                        <span class="lang-p text" style="width: ${language.percentage}%;">${language.percentage}%</span>
                    `;
                    break;
                case 'javascript':
                    htmlContent = `
                        <i class="fa-brands fa-square-js" style="color: #f0db4f;"></i>
                        <p class="text">${language.name}</p>
                        <span class="lang-p text" style="width: ${language.percentage}%;">${language.percentage}%</span>
                    `;
                    break;
                default:
                    htmlContent = `
                        <i class="fa-brands fa-code" style="color: #000;"></i>
                        <p class="text">${language.name}</p>
                        <span class="lang-p text" style="width: ${language.percentage}%;">${language.percentage}%</span>
                    `;
                    break;
            }

            langElement.innerHTML = htmlContent;

            cardLanguagesInModal.appendChild(langElement);

            // Add the HTML data div for each language with appropriate class name
            const htmlDataDiv = document.createElement('div');
            htmlDataDiv.classList.add(`${language.name.toLowerCase()}-data`);
            const pDataDiv = document.createElement('div');
            pDataDiv.classList.add(`${language.name.toLowerCase()}-p`, 'transition');
            pDataDiv.style.width = `${language.percentage}%`; // Apply the same width as the percentage
            htmlDataDiv.appendChild(pDataDiv);
            cardLanguagesInModal.appendChild(htmlDataDiv);
        });

        // Add Coding Percentage title
        const codingPercentageTitle = document.createElement('p');
        codingPercentageTitle.classList.add('script-data-title');
        codingPercentageTitle.style.fontSize = '30px';
        codingPercentageTitle.textContent = 'Coding Percentage';
        cardLanguagesInModal.insertBefore(codingPercentageTitle, cardLanguagesInModal.firstChild);

        // Add Data Collected By title
        const dataCollectedByTitle = document.createElement('p');
        dataCollectedByTitle.classList.add('script-data-title');
        dataCollectedByTitle.textContent = 'Data Collected By ';
        const githubIcon = document.createElement('i');
        githubIcon.classList.add('fa-brands', 'fa-github');
        dataCollectedByTitle.appendChild(githubIcon);
        cardLanguagesInModal.appendChild(dataCollectedByTitle);

        // Adding images inside the modal
        const cardImages = card.querySelectorAll('.img img');
        imgSliderView.src = cardImages[0].src; // Update the main image

        imgSlider.innerHTML = ''; // Clear any previously existing images

        cardImages.forEach((image, index) => {
            const img = document.createElement('img');
            img.classList.add('transition', 'img-slider-slice'); // Add img-slider-slice class
            img.src = image.src;
            img.alt = 'img-slide';

            // Add "active" class to the first image only
            if (index === 0) {
                img.classList.add('active');
            }

            imgSlider.appendChild(img);
        });

        // Displaying card content inside the modal
        const cardContent = card.querySelector('.card-dis.text').innerHTML;
        cardContentInModal.innerHTML = cardContent;
    });
});

// Function to get the color of a language based on its name
function getLanguageColor(language) {
    switch (language.toLowerCase()) {
        case 'html':
            return '#f06529';
        case 'css':
            return '#2965f1';
        case 'javascript':
            return '#f0db4f';
        default:
            return '#000'; // Default color
    }
}

// Function to register events after updating elements inside the slider
function registerEvents() {
    leftButton.addEventListener('click', function() {
        prevSlide();
    });

    rightButton.addEventListener('click', function() {
        nextSlide();
    });

    var slides = slider.querySelectorAll('img');
    slides.forEach(function(slide, index) {
        slide.addEventListener('click', function() {
            setActiveSlide(index);
        });
    });
}
// -----------------------------------------------------------------
// -----------------------------------------------------------------
// Function to close UI Modal
function closeUI() {
    const whUI = document.querySelector('.wh-ui');
    const modalUI = document.querySelector('.modal-ui');

    // Add the 'off' class back to wh-ui and modal-ui
    whUI.classList.add('off');
    modalUI.classList.add('off');
}

// Get the close button element
const closeButton = document.getElementById('modal-ui-close');

// Add event listener to the close button
closeButton.addEventListener('click', closeUI);

// Close UI when pressing "Esc" key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeUI();
    }
});
// -----------------------------------------------------------------
// Ui Code View Main Display
function showCode(language) {
    // Hide all code views
    document.querySelectorAll('.view-html-code, .view-css-code, .view-javascript-code').forEach(code => {
        code.classList.add('off');
    });
    
    // Show the selected code view
    document.querySelector(`.view-${language}-code`).classList.remove('off');
}
// -----------------------------------------------------------------
// Modal Code View
// Function to show UI and load code for specific card
function showUI(id, htmlURL, cssURL, startHtmlLine, endHtmlLine, startCssLine, endCssLine) {
    const whUI = document.querySelector('.wh-ui');
    const modalUI = document.querySelector('.modal-ui');

    // Remove the 'off' class from wh-ui and modal-ui
    whUI.classList.remove('off');
    modalUI.classList.remove('off');

    // Move the iframe from card-ui to view-ui inside the modal-ui
    const cardIframe = document.querySelector(`#${id} .card-ui-view iframe`);
    const viewUiContainer = document.querySelector('.modal-ui .view-ui');
    viewUiContainer.innerHTML = ''; // Clear previous content
    viewUiContainer.appendChild(cardIframe.cloneNode(true)); // Clone the iframe and append it to view-ui

    // Load HTML content for the specific card
    fetch(htmlURL)
        .then(response => response.text())
        .then(html => {
            // Split the HTML content into lines
            const htmlLines = html.split('\n');
            // Extract lines for HTML code based on start and end line numbers
            const selectedHtml = htmlLines.slice(startHtmlLine - 1, endHtmlLine).join('\n');
            // Display selected HTML code with Prism highlighting
            const viewHtmlCode = document.querySelector('.view-html-code');
            viewHtmlCode.textContent = selectedHtml;
            Prism.highlightElement(viewHtmlCode);
        });

    // Load CSS content for the specific card
    fetch(cssURL)
        .then(response => response.text())
        .then(css => {
            // Split the CSS content into lines
            const cssLines = css.split('\n');
            // Extract lines for CSS code based on start and end line numbers
            const selectedCss = cssLines.slice(startCssLine - 1, endCssLine).join('\n');
            // Display selected CSS code with Prism highlighting
            const viewCssCode = document.querySelector('.view-css-code');
            viewCssCode.textContent = selectedCss;
            Prism.highlightElement(viewCssCode);
        });
}

// Load UI data from data.js and show UI for each card
uiData.forEach(data => {
    // Check if the required properties exist in data
    if (data.htmlLines && data.cssLines && data.htmlLines.includes(',') && data.cssLines.includes(',')) {
        // Get HTML and CSS URLs
        const htmlURL = data.htmlURL;
        const cssURL = data.cssURL;

        // Split HTML and CSS lines if they are valid
        const startHtmlLine = parseInt(data.htmlLines.split(',')[0]);
        const endHtmlLine = parseInt(data.htmlLines.split(',')[1]);
        const startCssLine = parseInt(data.cssLines.split(',')[0]);
        const endCssLine = parseInt(data.cssLines.split(',')[1]);

        // Get the card element
        const card = document.getElementById(data.id);

        // Add event listener to the view button
        const viewButton = card.querySelector('.btn-ui-view');
        viewButton.addEventListener('click', () => showUI(data.id, htmlURL, cssURL, startHtmlLine, endHtmlLine, startCssLine, endCssLine));
    } else {
        console.error('Invalid data:', data);
    }
});
// -----------------------------------------------------------------
// Function to copy code
document.getElementById('copy-code').addEventListener('click', function() {
    const selectedCode = document.querySelector('input[name="ui-code-radio"]:checked + .name').textContent;
    const codeBlock = document.querySelector(`.view-${selectedCode.toLowerCase()}-code`);
    const alertCopy = document.querySelector('.alert-code');
    
    // Copy the code to clipboard
    navigator.clipboard.writeText(codeBlock.textContent)
    .then(() => {
        alertCopy.textContent = 'Copied To Clipboard';
        // Show the message temporarily
        setTimeout(() => {
            alertCopy.textContent = ''; // Clear the message
        }, 2000); // 2000 milliseconds = 2 seconds
    })
    .catch(err => {
        console.error('Error copying code: ', err);
    });
});
// -----------------------------------------------------------------
