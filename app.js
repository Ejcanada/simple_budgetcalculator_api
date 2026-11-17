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
    });
}
