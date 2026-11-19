// The website and the API are on the same domain, so no full URL is needed
const API_URL = "";

// ==========================================
// LOGIN CHECK (runs on every page except login.html)
// ==========================================
function getToken() {
    try { return localStorage.getItem("token"); } catch (e) { return null; }
}

function logout() {
    try {
        localStorage.removeItem("token");
        localStorage.removeItem("email");
    } catch (e) { /* ignore */ }
    window.location.href = "login.html";
}

// No token means the user is not logged in, so go to the login page
if (!getToken()) {
    window.location.href = "login.html";
}

// Every API request sends the login token
const FETCH_OPTIONS = { headers: { Authorization: "Bearer " + getToken() } };

// Add a Logout link with the user's email to the navigation bar
const navLinks = document.querySelector(".nav-links");
if (navLinks) {
    let email = "";
    try { email = localStorage.getItem("email") || ""; } catch (e) { /* ignore */ }
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = email ? "Logout (" + email + ")" : "Logout";
    link.addEventListener("click", (e) => { e.preventDefault(); logout(); });
    li.appendChild(link);
    navLinks.appendChild(li);
}

// Shared Function: Para sa pag-extract ng numero sa entry fee
function parseFee(feeString) {
    if (feeString.toLowerCase().includes('free')) return 0;
    const match = feeString.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
}

// ==========================================
// FAVORITES (saved landmarks of the logged-in user)
// ==========================================
let favoriteIds = new Set();

async function loadFavorites() {
    try {
        const response = await fetch(`${API_URL}/favorites`, FETCH_OPTIONS);
        if (response.status === 401) { logout(); return; }
        const data = await response.json();
        favoriteIds = new Set(data.favorites.map(f => f.landmark.id));
    } catch (error) {
        console.error("Could not load favorites:", error);
    }
}

async function toggleFavorite(landmarkId, button) {
    const isSaved = favoriteIds.has(landmarkId);
    try {
        const response = await fetch(`${API_URL}/favorites/${landmarkId}`, {
            method: isSaved ? "DELETE" : "POST",
            headers: FETCH_OPTIONS.headers
        });
        if (response.status === 401) { logout(); return; }
        if (response.ok || response.status === 409) {
            if (isSaved) { favoriteIds.delete(landmarkId); } else { favoriteIds.add(landmarkId); }
            button.textContent = favoriteIds.has(landmarkId) ? "♥ Saved" : "♡ Save";
        }
    } catch (error) {
        console.error("Favorite failed:", error);
    }
}

// Shared Function: Para mag-display ng cards
function displayData(landmarks, gridElement) {
    gridElement.innerHTML = "";
    if (landmarks.length === 0) {
        gridElement.innerHTML = "<p>No landmarks available.</p>";
        return;
    }
    landmarks.forEach(site => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src=".${site.icon}" alt="${site.title}" class="card-img" onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
            <div class="card-content">
                <h3>${site.title}</h3>
                <p><strong>Country:</strong> ${site.country}</p>
                <p><strong>Entry Fee:</strong> <span class="fee">${site.entry_fee}</span></p>
            </div>
        `;
        // Save button (adds or removes the landmark in the favorites table)
        const favButton = document.createElement('button');
        favButton.type = 'button';
        favButton.className = 'fav-btn';
        favButton.style.cssText = 'margin: 0 15px 15px; padding: 8px 14px; border: 1px solid #2a9d8f; background: white; color: #2a9d8f; border-radius: 6px; cursor: pointer; font-weight: bold;';
        favButton.textContent = favoriteIds.has(site.id) ? "♥ Saved" : "♡ Save";
        favButton.addEventListener('click', () => toggleFavorite(site.id, favButton));
        card.appendChild(favButton);
        gridElement.appendChild(card);
    });
}

// ==========================================
// 1. HOMEPAGE LOGIC
// ==========================================
const heroCalculateBtn = document.getElementById('heroCalculateBtn');
if (heroCalculateBtn) {
    const searchInput = document.getElementById('searchInput');
    const resultsGrid = document.getElementById('resultsGrid');

    // Pag pinindot ang button, ipapasa ang bansa sa URL papunta sa calculator.html
    heroCalculateBtn.addEventListener('click', () => {
        const country = searchInput.value.trim();
        if (country) {
            window.location.href = `calculator.html?country=${encodeURIComponent(country)}`;
        } else {
            window.location.href = `calculator.html`; // Kung walang tinype, diretso pa rin
        }
    });

    // I-load ang lahat ng landmarks sa gallery ng homepage
    async function loadHomeGallery() {
        try {
            const response = await fetch(`${API_URL}/landmarks`, FETCH_OPTIONS);
            if (response.status === 401) { logout(); return; }
            const data = await response.json();
            await loadFavorites();
            displayData(data.landmarks, resultsGrid);
        } catch (error) {
            console.error("Fetch failed:", error);
        }
    }
    loadHomeGallery();
}

// ==========================================
// 2. CALCULATOR PAGE LOGIC
// ==========================================
const calculatorSection = document.getElementById('calculatorSection');
if (calculatorSection) {
    let allLandmarks = [];
    let styleMultiplier = 1;
    let styleName = "standard";
    let lastTrip = null;

    const landmarkSelect = document.getElementById('landmarkSelect');
    const countryDisplay = document.getElementById('countryDisplay');
    const tripDuration = document.getElementById('tripDuration');
    const travelerCount = document.getElementById('travelerCount');
    const calculateBtn = document.getElementById('calculateBtn');
    const dashboard = document.getElementById('dashboard');
    const styleBtns = document.querySelectorAll('.style-btn');

    // Kunin ang bansa mula sa URL (e.g. calculator.html?country=Philippines)
    const urlParams = new URLSearchParams(window.location.search);
    const selectedCountry = urlParams.get('country') || "All Countries";
    countryDisplay.value = selectedCountry.toUpperCase();

    // I-load at i-filter ang dropdown
    async function initCalculator() {
        try {
            const response = await fetch(`${API_URL}/landmarks`, FETCH_OPTIONS);
            if (response.status === 401) { logout(); return; }
            const data = await response.json();
            allLandmarks = data.landmarks;

            // Kung may tinype na bansa, i-filter natin. Kung wala, ipakita lahat.
            let filteredLandmarks = allLandmarks;
            if (selectedCountry !== "All Countries") {
                filteredLandmarks = allLandmarks.filter(site => 
                    site.country.toLowerCase().includes(selectedCountry.toLowerCase())
                );
            }

            landmarkSelect.innerHTML = '<option value="">Select a landmark...</option>';
            if (filteredLandmarks.length === 0) {
                landmarkSelect.innerHTML = '<option value="">No landmarks found for this country.</option>';
            } else {
                filteredLandmarks.forEach(site => {
                    const option = document.createElement('option');
                    option.value = site.id;
                    option.textContent = `${site.title} - ${site.entry_fee}`;
                    landmarkSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Fetch failed:", error);
        }
    }
    initCalculator();

    // Travel Style Button Logic
    styleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            styleBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            styleMultiplier = parseFloat(e.target.dataset.multiplier);
            styleName = styleMultiplier < 1 ? "budget" : (styleMultiplier > 1 ? "luxury" : "standard");
        });
    });

    // Compute Budget Logic
    calculateBtn.addEventListener('click', () => {
        const selectedId = parseInt(landmarkSelect.value);
        if (!selectedId) return alert("Please select a landmark from the dropdown first.");

        const site = allLandmarks.find(l => l.id === selectedId);
        const days = parseInt(tripDuration.value) || 1;
        const travelers = parseInt(travelerCount.value) || 1;
        
        const baseEntryFee = parseFee(site.entry_fee);
        
        // Dynamically use the new local hotel_rate from the API
        const baseAccom = site.hotel_rate * styleMultiplier;
        // Estimate food as 50% of accommodation, transport as 30%
        const baseFood = (site.hotel_rate * 0.5) * styleMultiplier;
        const baseTrans = (site.hotel_rate * 0.3) * styleMultiplier;

        const totalEntry = baseEntryFee * travelers; 
        const totalAccom = baseAccom * days * travelers;
        const totalFood = baseFood * days * travelers;
        const totalTrans = baseTrans * days * travelers;
        const grandTotal = totalEntry + totalAccom + totalFood + totalTrans;

        // Display results cleanly with the dynamic local currency attached
        document.getElementById('totalBudgetDisplay').textContent = `${grandTotal.toLocaleString()} ${site.currency}`;
        document.getElementById('budgetSubtitle').textContent = `Based on ${days} days x ${travelers} travelers at ${site.title} (in Local Currency)`;
        
        document.getElementById('costAccom').textContent = `${totalAccom.toLocaleString()} ${site.currency}`;
        document.getElementById('costFood').textContent = `${totalFood.toLocaleString()} ${site.currency}`;
        document.getElementById('costTransport').textContent = `${totalTrans.toLocaleString()} ${site.currency}`;
        document.getElementById('costEntry').textContent = `${totalEntry.toLocaleString()} ${site.currency}`;

        dashboard.style.display = 'block';

        // Remember this estimate so the user can save it in the trips table
        lastTrip = {
            landmark_id: site.id,
            travel_style: styleName,
            days: days,
            travelers: travelers,
            total_cost: Math.round(grandTotal * 100) / 100,
            currency: site.currency
        };
        saveTripBtn.disabled = false;
        saveTripBtn.textContent = "Save this trip";
        tripMessage.textContent = "";
    });

    // "Save this trip" button (created here, so calculator.html does not need to change)
    const saveTripBtn = document.createElement('button');
    saveTripBtn.type = 'button';
    saveTripBtn.className = 'calc-submit';
    saveTripBtn.textContent = "Save this trip";
    saveTripBtn.style.marginTop = "15px";
    const tripMessage = document.createElement('p');
    tripMessage.style.marginTop = "10px";
    dashboard.appendChild(saveTripBtn);
    dashboard.appendChild(tripMessage);

    saveTripBtn.addEventListener('click', async () => {
        if (!lastTrip) return;
        saveTripBtn.disabled = true;
        try {
            const response = await fetch(`${API_URL}/trips`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: FETCH_OPTIONS.headers.Authorization },
                body: JSON.stringify(lastTrip)
            });
            if (response.status === 401) { logout(); return; }
            if (response.ok) {
                saveTripBtn.textContent = "Saved ✓";
                tripMessage.textContent = "Your trip was saved.";
            } else {
                saveTripBtn.disabled = false;
                tripMessage.textContent = "Could not save the trip. Please try again.";
            }
        } catch (error) {
            saveTripBtn.disabled = false;
            tripMessage.textContent = "Cannot reach the server. Please try again.";
        }
    });
}
