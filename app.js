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

// Shared Function: send a request with the login token and a JSON body
async function apiRequest(path, method, body) {
    const options = { method: method, headers: { Authorization: "Bearer " + getToken() } };
    if (body !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_URL}${path}`, options);
    if (response.status === 401) { logout(); throw new Error("Login required"); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { throw new Error(typeof data.detail === "string" ? data.detail : "Request failed."); }
    return data;
}

// Landmark ids the logged-in user saved as favorites
let favoriteIds = new Set();

async function loadFavorites() {
    try {
        const data = await apiRequest("/favorites", "GET");
        favoriteIds = new Set(data.favorites.map(f => f.landmark.id));
    } catch (error) {
        console.error("Could not load favorites:", error);
    }
}

// Shared Function: make text safe before putting it inside HTML
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
            <img src=".${escapeHtml(site.icon)}" alt="${escapeHtml(site.title)}" class="card-img" onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
            <div class="card-content">
                <h3>${escapeHtml(site.title)}</h3>
                <p><strong>Country:</strong> ${escapeHtml(site.country)}</p>
                <p><strong>Entry Fee:</strong> <span class="fee">${escapeHtml(site.entry_fee)}</span></p>
            </div>
        `;

        // Save / Saved button (favorites table)
        const saveBtn = document.createElement('button');
        saveBtn.className = 'fav-btn';
        const showState = () => {
            saveBtn.textContent = favoriteIds.has(site.id) ? '♥ Saved' : '♡ Save';
            saveBtn.classList.toggle('saved', favoriteIds.has(site.id));
        };
        showState();
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            try {
                if (favoriteIds.has(site.id)) {
                    await apiRequest(`/favorites/${site.id}`, "DELETE");
                    favoriteIds.delete(site.id);
                } else {
                    await apiRequest(`/favorites/${site.id}`, "POST");
                    favoriteIds.add(site.id);
                }
            } catch (error) {
                alert(error.message);
            }
            saveBtn.disabled = false;
            showState();
        });
        card.querySelector('.card-content').appendChild(saveBtn);
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

        // Remember this result so "Save this trip" can store it in the trips table
        lastEstimate = { landmark_id: site.id, nights: days, travelers: travelers, total: grandTotal, currency: site.currency };
        saveTripMsg.textContent = "";
        dashboard.style.display = 'block';
        loadReviews(site.id);
    });

    // ---------- Save this trip (trips table) ----------
    let lastEstimate = null;
    const saveTripBtn = document.getElementById('saveTripBtn');
    const saveTripMsg = document.getElementById('saveTripMsg');
    const tripsList = document.getElementById('tripsList');

    async function loadTrips() {
        try {
            const data = await apiRequest("/trips", "GET");
            tripsList.innerHTML = "";
            if (data.trips.length === 0) {
                tripsList.textContent = "No saved trips yet.";
                return;
            }
            data.trips.forEach(trip => {
                const row = document.createElement('div');
                row.className = 'trip-row';
                const text = document.createElement('span');
                const name = trip.landmark ? trip.landmark.title : "Deleted landmark";
                text.textContent = `${name}: ${trip.nights} days, ${trip.travelers} travelers, ` +
                    `${Number(trip.total).toLocaleString()} ${trip.currency || ""}`;
                const del = document.createElement('button');
                del.className = 'small-btn';
                del.textContent = 'Delete';
                del.addEventListener('click', async () => {
                    try { await apiRequest(`/trips/${trip.id}`, "DELETE"); loadTrips(); }
                    catch (error) { alert(error.message); }
                });
                row.appendChild(text);
                row.appendChild(del);
                tripsList.appendChild(row);
            });
        } catch (error) {
            console.error("Could not load trips:", error);
        }
    }
    loadTrips();

    saveTripBtn.addEventListener('click', async () => {
        if (!lastEstimate) return;
        saveTripBtn.disabled = true;
        try {
            await apiRequest("/trips", "POST", lastEstimate);
            saveTripMsg.textContent = "Trip saved.";
            loadTrips();
        } catch (error) {
            saveTripMsg.textContent = error.message;
        }
        saveTripBtn.disabled = false;
    });

    // ---------- Reviews (reviews table) ----------
    const reviewList = document.getElementById('reviewList');
    const reviewRating = document.getElementById('reviewRating');
    const reviewComment = document.getElementById('reviewComment');
    const reviewBtn = document.getElementById('reviewBtn');
    const reviewMsg = document.getElementById('reviewMsg');

    async function loadReviews(landmarkId) {
        try {
            const data = await apiRequest(`/landmarks/${landmarkId}/reviews`, "GET");
            reviewList.innerHTML = "";
            if (data.reviews.length === 0) {
                reviewList.textContent = "No reviews yet. Be the first!";
                return;
            }
            data.reviews.forEach(review => {
                const row = document.createElement('p');
                const who = review.user ? review.user.full_name : "User";
                row.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)} ${who}` +
                    (review.comment ? `: ${review.comment}` : "");
                reviewList.appendChild(row);
            });
        } catch (error) {
            console.error("Could not load reviews:", error);
        }
    }

    reviewBtn.addEventListener('click', async () => {
        if (!lastEstimate) return;
        reviewBtn.disabled = true;
        try {
            await apiRequest(`/landmarks/${lastEstimate.landmark_id}/reviews`, "POST", {
                rating: parseInt(reviewRating.value),
                comment: reviewComment.value.trim() || null
            });
            reviewMsg.textContent = "Review posted.";
            reviewComment.value = "";
            loadReviews(lastEstimate.landmark_id);
        } catch (error) {
            reviewMsg.textContent = error.message;
        }
        reviewBtn.disabled = false;
    });
}
