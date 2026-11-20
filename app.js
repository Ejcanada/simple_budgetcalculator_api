/* Heritage Travels front end.
   One file shared by every page except login.html.
   All text from the API is added with textContent (never innerHTML), so it is safe to show. */

// The website and the API are on the same domain, so no full URL is needed
const API_URL = "";

// ==========================================
// SMALL HELPERS
// ==========================================
const $ = (selector, root = document) => root.querySelector(selector);

// Build an element: h("a", { href: "x", class: "btn" }, "Text", otherElement)
function h(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value === true) node.setAttribute(key, "");
        else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
}

// Icons are fixed strings written here, never data from the API
const ICONS = {
    arch: '<path d="M4 21V11a8 8 0 0 1 16 0v10M9 21v-8a3 3 0 0 1 6 0v8M2.5 21h19"/>',
    heart: '<path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.9a4.3 4.3 0 0 1 7.5 2.6c0 5.4-7.5 10-7.5 10Z"/>',
    star: '<path d="m12 3.8 2.5 5.2 5.6.8-4.1 4 1 5.6L12 16.7 7 19.4l1-5.6-4.1-4 5.6-.8L12 3.8Z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
};

function icon(name, size = 20) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICONS[name];
    return svg;
}

function toast(message, type) {
    let box = $("#toasts");
    if (!box) {
        box = h("div", { class: "toasts", id: "toasts", "aria-live": "polite" });
        document.body.append(box);
    }
    const item = h("div", { class: "toast" + (type === "error" ? " is-error" : "") }, message);
    box.append(item);
    setTimeout(() => item.remove(), 3600);
}

// ==========================================
// LOGIN SESSION
// ==========================================
const session = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    clear() { ["token", "email", "name", "role", "currency"].forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }); }
};

function logout() {
    session.clear();
    window.location.href = "login.html";
}

const token = session.get("token");
// No token means the user is not logged in, so go to the login page
if (!token) { window.location.replace("login.html"); }

// Every request sends the login token. A 401 means the login ended.
async function api(path, method = "GET", body) {
    const options = { method: method, headers: { Authorization: "Bearer " + token } };
    if (body !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }
    let response;
    try {
        response = await fetch(API_URL + path, options);
    } catch (e) {
        throw new Error("Can't reach the server. Check your connection and try again.");
    }
    if (response.status === 401) { logout(); throw new Error("Your login ended. Log in again."); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong (error " + response.status + ").");
    }
    return data;
}

// ==========================================
// FORMATTING
// ==========================================
// "50 PHP" -> 50, "Free" -> 0
function parseFee(feeString) {
    const text = String(feeString || "");
    if (text.toLowerCase().includes("free")) return 0;
    const match = text.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
}

// ==========================================
// CURRENCY: prices show in the visitor's own currency
// ==========================================
const CURRENCIES = {
    USD: "US dollar", EUR: "Euro", GBP: "British pound", JPY: "Japanese yen", AUD: "Australian dollar", CAD: "Canadian dollar",
    CNY: "Chinese yuan", PHP: "Philippine peso", INR: "Indian rupee", KRW: "South Korean won", SGD: "Singapore dollar",
    HKD: "Hong Kong dollar", NZD: "New Zealand dollar", CHF: "Swiss franc", SEK: "Swedish krona", NOK: "Norwegian krone",
    DKK: "Danish krone", PLN: "Polish zloty", CZK: "Czech koruna", HUF: "Hungarian forint", RON: "Romanian leu",
    TRY: "Turkish lira", ZAR: "South African rand", NGN: "Nigerian naira", KES: "Kenyan shilling", EGP: "Egyptian pound",
    MAD: "Moroccan dirham", AED: "UAE dirham", SAR: "Saudi riyal", QAR: "Qatari riyal", KWD: "Kuwaiti dinar", ILS: "Israeli shekel",
    JOD: "Jordanian dinar", PKR: "Pakistani rupee", BDT: "Bangladeshi taka", LKR: "Sri Lankan rupee", NPR: "Nepalese rupee",
    THB: "Thai baht", MYR: "Malaysian ringgit", IDR: "Indonesian rupiah", VND: "Vietnamese dong", KHR: "Cambodian riel",
    BRL: "Brazilian real", ARS: "Argentine peso", MXN: "Mexican peso", COP: "Colombian peso", CLP: "Chilean peso",
    PEN: "Peruvian sol", GTQ: "Guatemalan quetzal", ISK: "Icelandic krona", ZMW: "Zambian kwacha", TZS: "Tanzanian shilling"
};

// The country in the browser language (for example "en-PH") picks the starting currency
const REGION_CURRENCY = {
    US: "USD", PH: "PHP", GB: "GBP", JP: "JPY", AU: "AUD", CA: "CAD", CN: "CNY", IN: "INR", KR: "KRW", SG: "SGD", HK: "HKD",
    NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", TR: "TRY", ZA: "ZAR",
    NG: "NGN", KE: "KES", EG: "EGP", MA: "MAD", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", IL: "ILS", JO: "JOD", PK: "PKR",
    BD: "BDT", LK: "LKR", NP: "NPR", TH: "THB", MY: "MYR", ID: "IDR", VN: "VND", KH: "KHR", BR: "BRL", AR: "ARS", MX: "MXN",
    CO: "COP", CL: "CLP", PE: "PEN", GT: "GTQ", IS: "ISK", ZM: "ZMW", TZ: "TZS",
    DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", PT: "EUR", IE: "EUR", FI: "EUR", GR: "EUR"
};

// Used only if the live rates cannot be loaded (units per 1 US dollar, approximate)
const FALLBACK_RATES = {
    USD: 1, EUR: .86, GBP: .75, JPY: 155, AUD: 1.52, CAD: 1.38, CNY: 7.2, PHP: 58, INR: 88, KRW: 1450, SGD: 1.3, HKD: 7.8,
    NZD: 1.7, CHF: .8, SEK: 9.5, NOK: 10.2, DKK: 6.4, PLN: 3.7, CZK: 21, HUF: 340, RON: 4.4, TRY: 42, ZAR: 17.5, NGN: 1500,
    KES: 129, EGP: 48, MAD: 9.3, AED: 3.67, SAR: 3.75, QAR: 3.64, KWD: .31, ILS: 3.3, JOD: .71, PKR: 280, BDT: 122, LKR: 300,
    NPR: 140, THB: 33, MYR: 4.2, IDR: 16500, VND: 26300, KHR: 4020, BRL: 5.4, ARS: 1450, MXN: 18.5, COP: 4000, CLP: 940,
    PEN: 3.4, GTQ: 7.7, ISK: 125, ZMW: 22, TZS: 2500
};

let rates = FALLBACK_RATES;
let ratesAreLive = false;
let homeCurrency = "USD";
const currencyListeners = [];

function detectCurrency() {
    const languages = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ""];
    for (const language of languages) {
        const region = (String(language).split("-")[1] || "").toUpperCase();
        if (REGION_CURRENCY[region]) return REGION_CURRENCY[region];
    }
    return "USD";
}

// Live exchange rates (cached for 12 hours in the browser)
async function loadRates() {
    try {
        const cached = JSON.parse(localStorage.getItem("rates") || "null");
        if (cached && Date.now() - cached.time < 12 * 3600 * 1000) { rates = cached.rates; ratesAreLive = true; return; }
    } catch (e) { /* ignore */ }
    try {
        const response = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await response.json();
        if (data.result === "success" && data.rates && data.rates.USD) {
            rates = data.rates;
            ratesAreLive = true;
            try { localStorage.setItem("rates", JSON.stringify({ time: Date.now(), rates: rates })); } catch (e) { /* ignore */ }
        }
    } catch (e) { console.warn("Using built-in exchange rates:", e); }
}

function convert(amount, from, to) {
    const a = rates[from] || FALLBACK_RATES[from];
    const b = rates[to] || FALLBACK_RATES[to];
    if (!a || !b || from === to) return amount;
    return (amount / a) * b;
}

// Shows an amount that is in currency "from" as the visitor's own currency
function formatMoney(amount, from) {
    const value = convert(Number(amount) || 0, from || homeCurrency, homeCurrency);
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency: homeCurrency, maximumFractionDigits: 0 }).format(value);
    } catch (e) {
        return Math.round(value).toLocaleString() + " " + homeCurrency;
    }
}

// "16 EUR" -> the same fee in the visitor's currency, "Free" stays "Free"
function formatFee(site) {
    if (!site.entry_fee) return "";
    if (/free/i.test(site.entry_fee) && parseFee(site.entry_fee) === 0) return "Free";
    const code = (String(site.entry_fee).match(/\b[A-Z]{3}\b/) || [site.currency])[0];
    return formatMoney(parseFee(site.entry_fee), code);
}

function setCurrency(code, save) {
    homeCurrency = code;
    try { localStorage.setItem("currency", code); } catch (e) { /* ignore */ }
    if (save) api("/auth/currency", "PUT", { currency: code }).catch((e) => console.warn("Could not save currency:", e));
    const select = $("#currency");
    if (select) select.value = code;
    currencyListeners.forEach((fn) => fn());
}

function formatYear(year) {
    if (year === null || year === undefined) return "";
    if (year === 0) return "Natural site";
    if (year < 0) return "Est. " + Math.abs(year) + " BCE";
    return "Est. " + year;
}

function formatDate(iso) {
    const date = new Date(iso);
    if (isNaN(date)) return "";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function plural(count, one, many) { return count + " " + (count === 1 ? one : many); }

function safeImage(path) {
    return typeof path === "string" && path.startsWith("/images/") ? path : "";
}

// ==========================================
// SHARED PAGE PARTS
// ==========================================
const NAV = [
    { page: "home", href: "index.html", label: "Landmarks" },
    { page: "calculator", href: "calculator.html", label: "Budget estimator" },
    { page: "trips", href: "my-trips.html", label: "My trips" },
    { page: "saved", href: "saved.html", label: "Saved places" },
    { page: "matcher", href: "matcher.html", label: "Budget matcher" }
];

function buildHeader() {
    const header = $("#siteHeader");
    if (!header) return;
    const current = document.body.dataset.page;
    const name = session.get("name") || session.get("email") || "";

    const menuButton = h("button", {
        class: "menu-btn", type: "button", "aria-label": "Menu", "aria-expanded": "false", "aria-controls": "siteNav",
        onclick: () => {
            const open = header.classList.toggle("open");
            menuButton.setAttribute("aria-expanded", String(open));
        }
    }, icon("menu", 22));

    const nav = h("nav", { class: "nav", id: "siteNav", "aria-label": "Main" },
        NAV.map((item) => h("a", { href: item.href, "aria-current": item.page === current ? "page" : null }, item.label)),
        h("button", { class: "btn-link nav-logout", type: "button", onclick: logout }, "Log out"));

    const currencySelect = h("select", { class: "cur", id: "currency", "aria-label": "Show prices in" },
        Object.keys(CURRENCIES).sort().map((code) => h("option", { value: code }, code + " - " + CURRENCIES[code])));
    currencySelect.value = homeCurrency;
    currencySelect.addEventListener("change", () => {
        setCurrency(currencySelect.value, true);
        toast("Prices now show in " + CURRENCIES[currencySelect.value] + ".");
    });

    header.append(h("div", { class: "wrap" },
        h("a", { class: "brand", href: "index.html" }, icon("arch", 26), "Heritage Travels"),
        nav,
        currencySelect,
        h("div", { class: "user" },
            session.get("role") === "admin" ? h("span", { class: "badge" }, "Admin") : null,
            h("span", { class: "avatar", "aria-hidden": "true" }, (name[0] || "?").toUpperCase()),
            h("span", { class: "user-name" }, name),
            h("button", { class: "btn-link", type: "button", onclick: logout }, "Log out")),
        menuButton));
}

function buildFooter() {
    const footer = $("#siteFooter");
    if (!footer) return;
    footer.append(h("div", { class: "wrap" }, "Heritage Travels. Budgets are estimates. Real prices change with the season."));
}

function showSkeleton(container, count) {
    container.replaceChildren(...Array.from({ length: count }, () =>
        h("div", { class: "place", "aria-hidden": "true" },
            h("div", { class: "skel skel-media" }),
            h("div", { class: "skel skel-line" }),
            h("div", { class: "skel skel-line short" }))));
}

function showError(container, message, retry) {
    container.replaceChildren(h("div", { class: "notice" },
        h("p", null, message),
        h("button", { class: "btn btn-quiet btn-sm", type: "button", onclick: retry }, "Try again")));
}

function showEmpty(container, title, text, linkLabel, linkHref) {
    container.replaceChildren(h("div", { class: "state" },
        h("h2", null, title),
        h("p", null, text),
        h("a", { class: "btn btn-primary", href: linkHref }, linkLabel)));
}

// ==========================================
// DATA: landmarks and favorites
// ==========================================
let landmarksCache = null;
async function loadLandmarks() {
    if (!landmarksCache) {
        const data = await api("/landmarks");
        landmarksCache = data.landmarks || [];
    }
    return landmarksCache;
}

// Landmark ids the logged-in user saved (favorites table)
let favoriteIds = new Set();
async function loadFavorites() {
    try {
        const data = await api("/favorites");
        favoriteIds = new Set(data.favorites.map((f) => f.landmark && f.landmark.id).filter(Boolean));
    } catch (error) {
        console.error("Could not load saved places:", error);
    }
}

function setHeart(button, site) {
    const on = favoriteIds.has(site.id);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", (on ? "Remove " : "Save ") + site.title + (on ? " from saved places" : " to saved places"));
}

async function toggleFavorite(site, button) {
    const wasSaved = favoriteIds.has(site.id);
    button.disabled = true;
    try {
        if (wasSaved) {
            await api("/favorites/" + site.id, "DELETE");
            favoriteIds.delete(site.id);
            toast("Removed from saved places.");
        } else {
            try {
                await api("/favorites/" + site.id, "POST");
            } catch (error) {
                if (!/already/i.test(error.message)) throw error; // already saved is fine
            }
            favoriteIds.add(site.id);
            toast(site.title + " saved.");
        }
    } catch (error) {
        toast(error.message, "error");
    }
    button.disabled = false;
    setHeart(button, site);
    return favoriteIds.has(site.id);
}

function placeCard(site, onChange) {
    const estimateUrl = "calculator.html?landmark=" + site.id;
    const media = h("div", { class: "place-media" });
    const image = safeImage(site.icon);
    if (image) {
        const img = h("img", { src: image, alt: "", loading: "lazy" });
        img.addEventListener("error", () => img.remove());
        media.append(h("a", { href: estimateUrl, tabindex: "-1", "aria-hidden": "true" }, img));
    }

    const heart = h("button", { class: "heart", type: "button" }, icon("heart", 20));
    setHeart(heart, site);
    media.append(heart);

    const facts = h("ul", { class: "facts" });
    if (site.visitor_rating) facts.append(h("li", null, icon("star", 14), site.visitor_rating));
    if (site.established_year !== null && site.established_year !== undefined) facts.append(h("li", null, formatYear(site.established_year)));
    if (site.entry_fee) {
        const fee = formatFee(site);
        facts.append(h("li", null, fee === "Free" ? h("span", { class: "free" }, "Free entry") : "Entry " + fee));
    }

    const card = h("article", { class: "place" },
        media,
        h("div", { class: "place-body" },
            h("h3", null, site.title),
            h("p", { class: "where" }, [site.city, site.country].filter(Boolean).join(", ")),
            facts,
            h("a", { class: "place-link", href: estimateUrl, "aria-label": "Estimate budget for " + site.title }, "Estimate budget")));

    heart.addEventListener("click", async () => {
        const saved = await toggleFavorite(site, heart);
        if (onChange) onChange(site, saved, card);
    });
    return card;
}

// ==========================================
// PAGE: HOME
// ==========================================
function initHome() {
    const grid = $("#grid");
    const tabs = $("#tabs");
    const filter = $("#filter");
    const count = $("#count");
    const heroStat = $("#heroStat");
    const state = { region: "All", query: "" };
    let landmarks = [];

    // The hero button opens the estimator for the country that was typed
    $("#heroForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const country = $("#heroInput").value.trim();
        window.location.href = country ? "calculator.html?country=" + encodeURIComponent(country) : "calculator.html";
    });

    function render() {
        const query = state.query.trim().toLowerCase();
        const list = landmarks.filter((site) => {
            const inRegion = state.region === "All" || site.region === state.region;
            const text = [site.title, site.country, site.city, site.site_type].join(" ").toLowerCase();
            return inRegion && (!query || text.includes(query));
        });
        count.textContent = list.length === landmarks.length ? plural(list.length, "landmark", "landmarks") : list.length + " of " + landmarks.length + " landmarks";
        if (list.length === 0) {
            grid.replaceChildren(h("div", { class: "state" },
                h("h2", null, "No landmarks match."),
                h("p", null, "Try a different name or choose another region.")));
            return;
        }
        grid.replaceChildren(...list.map((site) => placeCard(site)));
    }

    function renderTabs() {
        const regions = ["All"].concat(Array.from(new Set(landmarks.map((s) => s.region).filter(Boolean))).sort());
        tabs.replaceChildren(...regions.map((region) =>
            h("button", {
                class: "tab", type: "button", "aria-pressed": String(region === state.region),
                onclick: () => {
                    state.region = region;
                    tabs.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-pressed", String(t.textContent === region)));
                    render();
                }
            }, region)));
    }

    filter.addEventListener("input", () => { state.query = filter.value; render(); });

    // Hero caption shows the Colosseum prices in the visitor's currency
    function renderCaption() {
        const caption = $("#heroCaption");
        const site = landmarks.find((s) => /colosseum/i.test(s.title));
        caption.textContent = site ? "Entry " + formatFee(site) + ". Hotel " + formatMoney(site.hotel_rate, site.currency) + " a night." : "";
    }
    currencyListeners.push(() => { if (landmarks.length) { render(); renderCaption(); } });

    async function load() {
        showSkeleton(grid, 6);
        try {
            [landmarks] = await Promise.all([loadLandmarks(), loadFavorites()]);
        } catch (error) {
            count.textContent = "";
            showError(grid, error.message, load);
            return;
        }
        const countries = new Set(landmarks.map((s) => s.country)).size;
        heroStat.textContent = plural(landmarks.length, "landmark", "landmarks") + " in " + plural(countries, "country", "countries") + ".";
        renderTabs();
        render();
        renderCaption();
    }
    load();
}

// ==========================================
// PAGE: BUDGET ESTIMATOR
// ==========================================
const STYLES = {
    budget: {
        mult: 0.5, label: "Backpacker",
        desc: "The lowest cost. You sleep in hostels or simple guesthouses, eat at local eateries and street stalls, and get around by bus, train or on foot. Costs about half of Standard.",
        stay: "A hostel bed or basic guesthouse room.",
        food: "Street food and local eateries.",
        move: "Buses, trains and walking."
    },
    standard: {
        mult: 1, label: "Standard",
        desc: "Comfortable and balanced. You stay in mid-range hotels (about 3 stars), eat at local restaurants and cafes, and mix taxis or ride-hailing with public transport. This is the base rate.",
        stay: "A mid-range hotel room, about 3 stars.",
        food: "Local restaurants and cafes.",
        move: "Taxis or ride-hailing, plus some public transport."
    },
    luxury: {
        mult: 2.5, label: "Luxury",
        desc: "Premium comfort. You stay in 4 to 5 star hotels, eat at fine restaurants, and travel with private drivers or airport transfers. Costs 2.5 times Standard.",
        stay: "A 4 to 5 star hotel room.",
        food: "Fine dining and top-rated restaurants.",
        move: "Private drivers and airport transfers."
    }
};

function estimate(site, days, travelers, mult) {
    const rate = Number(site.hotel_rate) || 0;
    const accom = rate * mult * days * travelers;
    const food = rate * 0.5 * mult * days * travelers;     // food is estimated as 50% of the hotel rate
    const transport = rate * 0.3 * mult * days * travelers; // transport as 30%
    const entry = parseFee(site.entry_fee) * travelers;
    return { accom, food, transport, entry, total: accom + food + transport + entry };
}

function initCalculator() {
    const countrySelect = $("#country");
    const landmarkSelect = $("#landmark");
    const daysInput = $("#days");
    const travelersInput = $("#travelers");
    const mount = $("#ticketMount");
    const params = new URLSearchParams(window.location.search);

    let landmarks = [];
    let printed = false;
    let lastSavedKey = "";

    const clamp = (value, min, max) => Math.min(max, Math.max(min, parseInt(value, 10) || min));
    const currentStyle = () => (document.querySelector('input[name="style"]:checked') || {}).value || "standard";

    // Stepper buttons (the API accepts 1-365 days and 1-100 travelers)
    document.querySelectorAll(".stepper button").forEach((button) => {
        button.addEventListener("click", () => {
            const input = $("#" + button.dataset.target);
            input.value = clamp(parseInt(input.value, 10) + parseInt(button.dataset.step, 10), 1, parseInt(input.max, 10));
            render();
        });
    });
    [daysInput, travelersInput].forEach((input) => {
        input.addEventListener("input", render);
        input.addEventListener("change", () => { input.value = clamp(input.value, 1, parseInt(input.max, 10)); render(); });
    });
    document.querySelectorAll('input[name="style"]').forEach((radio) => radio.addEventListener("change", render));

    function fillLandmarks() {
        const country = countrySelect.value;
        const keep = landmarkSelect.value;
        const list = landmarks.filter((s) => !country || s.country === country);
        landmarkSelect.replaceChildren(
            h("option", { value: "" }, list.length ? "Choose a landmark" : "No landmarks in this country"),
            ...list.map((s) => h("option", { value: String(s.id) }, s.title + " (entry " + formatFee(s) + ")")));
        if (list.some((s) => String(s.id) === keep)) landmarkSelect.value = keep;
    }

    currencyListeners.push(() => { if (landmarks.length) { fillLandmarks(); render(); } });
    countrySelect.addEventListener("change", () => { fillLandmarks(); render(); });
    landmarkSelect.addEventListener("change", render);

    function renderEmpty() {
        mount.replaceChildren(h("div", { class: "ticket-empty" },
            h("h2", null, "Your estimate shows here."),
            h("p", null, "Choose a landmark and your ticket prints with the total and a cost breakdown.")));
    }

    function render() {
        $("#styleDesc").textContent = STYLES[currentStyle()].desc;
        const site = landmarks.find((s) => String(s.id) === landmarkSelect.value);
        if (!site) { renderEmpty(); return; }

        const days = clamp(daysInput.value, 1, 365);
        const travelers = clamp(travelersInput.value, 1, 100);
        const styleKey = currentStyle();
        const est = estimate(site, days, travelers, STYLES[styleKey].mult);
        const cur = site.currency;
        const key = [site.id, days, travelers, styleKey].join("|");
        const isSaved = key === lastSavedKey;

        const st = STYLES[styleKey];
        const rate = Number(site.hotel_rate) || 0;
        const perDay = (share) => formatMoney(rate * share * st.mult, cur);
        const fee = formatFee(site);
        const parts = [
            { label: "Accommodation", value: est.accom, color: "var(--verd)",
              detail: st.stay + " " + plural(days, "day", "days") + " x " + plural(travelers, "traveler", "travelers") + " x " + perDay(1) + " per person per day." },
            { label: "Food and dining", value: est.food, color: "var(--brass)",
              detail: st.food + " Set at half the hotel rate: " + perDay(0.5) + " per person per day." },
            { label: "Local transport", value: est.transport, color: "var(--slate)",
              detail: st.move + " Set at 30% of the hotel rate: " + perDay(0.3) + " per person per day." },
            { label: "Landmark entry", value: est.entry, color: "var(--stamp)",
              detail: fee === "Free" ? "Entry to " + site.title + " is free." : "Entry ticket of " + fee + " x " + plural(travelers, "traveler", "travelers") + ", paid once." }
        ];

        const photo = safeImage(site.icon);
        const saveButton = h("button", { class: "btn btn-primary", type: "button", disabled: isSaved }, isSaved ? "Trip saved" : "Save this trip");
        saveButton.addEventListener("click", async () => {
            const payload = {
                landmark_id: site.id, travel_style: styleKey, days: days, travelers: travelers,
                total_cost: Math.round(est.total * 100) / 100, currency: cur
            };
            if (payload.total_cost > 1000000000) { toast("That total is too large to save. Try fewer days or travelers.", "error"); return; }
            saveButton.disabled = true;
            saveButton.textContent = "Saving";
            try {
                await api("/trips", "POST", payload);
                lastSavedKey = key;
                toast("Trip saved.");
            } catch (error) {
                toast(error.message, "error");
            }
            render();
        });

        const ticket = h("div", { class: "ticket" },
            h("div", { class: "ticket-main" },
                photo ? h("div", { class: "ticket-photo" }, h("img", { src: photo, alt: "" })) : null,
                h("h2", { class: "ticket-title" }, site.title),
                h("p", { class: "ticket-where" }, [site.city, site.country].filter(Boolean).join(", ")),
                h("p", { class: "ticket-meta" }, plural(days, "day", "days") + ", " + plural(travelers, "traveler", "travelers") + ", " + STYLES[styleKey].label + " style"),
                h("div", { class: "split-bar", "aria-hidden": "true" },
                    parts.map((p) => h("i", { style: "width:" + (est.total ? (p.value / est.total) * 100 : 0) + "%;background:" + p.color }))),
                h("ul", { class: "lines" },
                    parts.map((p) => h("li", null,
                        h("span", { class: "dot", style: "background:" + p.color }),
                        p.label,
                        h("span", { class: "fill" }),
                        h("span", { class: "amt" }, formatMoney(p.value, cur)),
                        h("p", { class: "detail" }, p.detail))))),
            h("div", { class: "ticket-stub" },
                h("p", { class: "stub-label" }, "Estimated total"),
                h("p", { class: "stub-total" }, formatMoney(est.total, cur)),
                h("div", { class: "stub-actions" },
                    saveButton,
                    isSaved ? h("a", { class: "btn btn-quiet", href: "my-trips.html" }, "View my trips") : null),
                h("p", { class: "stub-note" }, "Hotel rates are per person, per night. Food and transport are estimated from the hotel rate." +
                    (cur !== homeCurrency ? " Local prices are in " + cur + ", converted at " + (ratesAreLive ? "today's" : "an approximate") + " rate." : ""))));

        if (!printed) {
            printed = true;
            ticket.classList.add("is-printing");
            ticket.addEventListener("animationend", () => ticket.classList.remove("is-printing"), { once: true });
        }
        mount.replaceChildren(ticket);
    }

    async function load() {
        renderEmpty();
        try {
            landmarks = await loadLandmarks();
        } catch (error) {
            landmarkSelect.replaceChildren(h("option", { value: "" }, "Could not load landmarks"));
            showError(mount, error.message, load);
            return;
        }

        const countries = Array.from(new Set(landmarks.map((s) => s.country).filter(Boolean))).sort();
        countrySelect.replaceChildren(h("option", { value: "" }, "All countries"), ...countries.map((c) => h("option", { value: c }, c)));

        // Open with a landmark, a country, and trip details chosen from other pages
        const wantedId = params.get("landmark");
        const wantedSite = landmarks.find((s) => String(s.id) === wantedId);
        const wantedCountry = (params.get("country") || "").trim().toLowerCase();
        if (wantedSite) countrySelect.value = wantedSite.country;
        else if (wantedCountry) {
            const match = countries.find((c) => c.toLowerCase() === wantedCountry) || countries.find((c) => c.toLowerCase().includes(wantedCountry));
            if (match) countrySelect.value = match;
        }
        fillLandmarks();
        if (wantedSite) landmarkSelect.value = String(wantedSite.id);

        if (params.get("days")) daysInput.value = clamp(params.get("days"), 1, 365);
        if (params.get("travelers")) travelersInput.value = clamp(params.get("travelers"), 1, 100);
        const wantedStyle = params.get("style");
        if (STYLES[wantedStyle]) $('input[name="style"][value="' + wantedStyle + '"]').checked = true;
        render();
    }
    load();
}

// ==========================================
// PAGE: MY TRIPS (trips table)
// ==========================================
function initTrips() {
    const list = $("#trips");
    const summary = $("#summary");
    const dialog = $("#confirmDialog");
    let trips = [];
    let byId = new Map();

    function confirmRemove(trip) {
        $("#dlgText").textContent = (trip.landmark ? trip.landmark.title : "This trip") + ", " + plural(trip.days, "day", "days") + " for " + plural(trip.travelers, "traveler", "travelers") + ". This can't be undone.";
        dialog.returnValue = "";
        return new Promise((resolve) => {
            dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
            dialog.showModal();
        });
    }

    function ticket(trip) {
        const site = byId.get(trip.landmark_id) || {};
        const title = trip.landmark ? trip.landmark.title : "Landmark removed";
        const where = trip.landmark ? trip.landmark.country : "";
        const style = STYLES[trip.travel_style] ? STYLES[trip.travel_style].label : trip.travel_style;
        const photo = safeImage(site.icon);
        const reopen = "calculator.html?landmark=" + trip.landmark_id + "&days=" + trip.days + "&travelers=" + trip.travelers + "&style=" + encodeURIComponent(trip.travel_style);

        const removeButton = h("button", { class: "btn-link danger", type: "button" }, "Remove trip");
        removeButton.addEventListener("click", async () => {
            if (!(await confirmRemove(trip))) return;
            removeButton.disabled = true;
            try {
                await api("/trips/" + trip.id, "DELETE");
                trips = trips.filter((t) => t.id !== trip.id);
                toast("Trip removed.");
                render();
            } catch (error) {
                removeButton.disabled = false;
                toast(error.message, "error");
            }
        });

        return h("article", { class: "ticket is-row" },
            h("div", { class: "ticket-main" },
                h("div", { class: "trip-head" },
                    photo ? h("div", { class: "trip-thumb" }, h("img", { src: photo, alt: "", loading: "lazy" })) : null,
                    h("div", null,
                        h("h2", { class: "trip-title" }, trip.landmark ? h("a", { href: reopen }, title) : title),
                        h("p", { class: "ticket-where" }, where))),
                h("div", { class: "tags" },
                    h("span", { class: "tag" }, plural(trip.days, "day", "days")),
                    h("span", { class: "tag" }, plural(trip.travelers, "traveler", "travelers")),
                    h("span", { class: "tag" }, style))),
            h("div", { class: "ticket-stub" },
                h("p", { class: "stub-label" }, "Estimated total"),
                h("p", { class: "stub-total" }, formatMoney(Number(trip.total_cost), trip.currency)),
                h("p", { class: "saved-on" }, "Saved " + formatDate(trip.created_at)),
                h("div", { class: "stub-actions" },
                    trip.landmark ? h("a", { class: "btn btn-quiet btn-sm", href: reopen }, "Open in estimator") : null,
                    removeButton)));
    }

    currencyListeners.push(() => render());
    function render() {
        summary.textContent = trips.length ? plural(trips.length, "saved trip", "saved trips") + ", newest first." : "";
        if (trips.length === 0) {
            showEmpty(list, "No saved trips yet.", "Estimate a budget, then choose Save this trip to keep it here.", "Estimate a budget", "calculator.html");
            return;
        }
        list.replaceChildren(...trips.map(ticket));
    }

    async function load() {
        list.replaceChildren(h("div", { class: "skel", style: "height:170px;border-radius:12px", "aria-hidden": "true" }));
        try {
            const [tripData, landmarks] = await Promise.all([api("/trips"), loadLandmarks().catch(() => [])]);
            trips = tripData.trips || [];
            byId = new Map(landmarks.map((s) => [s.id, s]));
        } catch (error) {
            showError(list, error.message, load);
            return;
        }
        render();
    }
    load();
}

// ==========================================
// PAGE: SAVED PLACES (favorites table)
// ==========================================
function initSaved() {
    const grid = $("#grid");
    const summary = $("#summary");

    function updateSummary() {
        const total = grid.querySelectorAll(".place").length;
        summary.textContent = total ? plural(total, "saved place", "saved places") + "." : "";
        if (total === 0) {
            showEmpty(grid, "Nothing saved yet.", "Choose the heart on any landmark to keep it here.", "Browse landmarks", "index.html");
        }
    }

    async function load() {
        showSkeleton(grid, 3);
        let favorites;
        try {
            const data = await api("/favorites");
            favorites = (data.favorites || []).filter((f) => f.landmark);
        } catch (error) {
            showError(grid, error.message, load);
            return;
        }
        favoriteIds = new Set(favorites.map((f) => f.landmark.id));
        if (favorites.length === 0) { updateSummary(); return; }
        savedList = favorites;
        draw();
    }
    let savedList = [];
    function draw() {
        grid.replaceChildren(...savedList.map((f) => placeCard(f.landmark, (site, saved, card) => {
            if (!saved) { savedList = savedList.filter((x) => x.landmark.id !== site.id); card.remove(); updateSummary(); }
        })));
        updateSummary();
    }
    currencyListeners.push(() => { if (savedList.length) draw(); });
    load();
}

// ==========================================
// PAGE: BUDGET MATCHER
// The visitor enters a total budget. We estimate every landmark with the same
// math as the estimator and keep the ones that fit.
// ==========================================
function initMatcher() {
    const budgetInput = $("#budget");
    const daysInput = $("#days");
    const travelersInput = $("#travelers");
    const results = $("#results");
    const head = $("#matchHead");
    const sortBox = $("#sort");
    const clamp = (value, min, max) => Math.min(max, Math.max(min, parseInt(value, 10) || min));
    const currentStyle = () => (document.querySelector('input[name="style"]:checked') || {}).value || "standard";
    let landmarks = [];
    let sortBy = "cost";
    let shownCurrency = homeCurrency;

    function showCurrency() {
        $("#budgetCur").textContent = homeCurrency;
    }

    function run() {
        $("#styleDesc").textContent = STYLES[currentStyle()].desc;
        if (!landmarks.length) return;
        const budget = parseFloat(budgetInput.value);
        if (!budget || budget <= 0) {
            head.hidden = true;
            results.replaceChildren(h("div", { class: "ticket-empty" },
                h("h2", null, "Enter your budget."),
                h("p", null, "Type how much you can spend in total. Matching landmarks show here.")));
            return;
        }
        const days = clamp(daysInput.value, 1, 365);
        const travelers = clamp(travelersInput.value, 1, 100);
        const styleKey = currentStyle();

        const all = landmarks.map((site) => {
            const est = estimate(site, days, travelers, STYLES[styleKey].mult);
            const total = convert(est.total, site.currency, homeCurrency);
            return { site: site, total: total, spare: budget - total };
        });
        const fits = all.filter((m) => m.spare >= 0);
        fits.sort(sortBy === "cost" ? (a, b) => a.total - b.total : (a, b) => a.spare - b.spare);

        head.hidden = false;
        $("#matchCount").textContent = fits.length === 0 ? "No landmarks fit" : plural(fits.length, "landmark fits", "landmarks fit") + " your budget";
        $("#matchNote").textContent = plural(days, "day", "days") + ", " + plural(travelers, "traveler", "travelers") + ", " + STYLES[styleKey].label + " style";
        sortBox.hidden = fits.length < 2;

        if (fits.length === 0) {
            const cheapest = all.slice().sort((a, b) => a.total - b.total)[0];
            results.replaceChildren(h("div", { class: "state" },
                h("h2", null, "Nothing fits this budget yet."),
                h("p", null, "The lowest estimate is " + cheapest.site.title + " at " + formatMoney(cheapest.total, homeCurrency) + ". Try a bigger budget, fewer days or travelers, or the Backpacker style."),
                styleKey !== "budget" ? h("button", { class: "btn btn-quiet", type: "button", onclick: () => { $('input[name="style"][value="budget"]').checked = true; run(); } }, "Try Backpacker style") : null));
            return;
        }

        const cards = fits.map((m) => {
            const card = placeCard(m.site);
            const link = card.querySelector(".place-link");
            const url = "calculator.html?landmark=" + m.site.id + "&days=" + days + "&travelers=" + travelers + "&style=" + styleKey;
            link.setAttribute("href", url);
            link.textContent = "See the breakdown";
            card.querySelector(".place-body").insertBefore(h("div", { class: "match-total" },
                h("div", null, h("span", { class: "match-label" }, "Estimated total"), h("strong", null, formatMoney(m.total, homeCurrency))),
                h("div", { class: "match-spare" }, formatMoney(m.spare, homeCurrency) + " to spare")), link);
            return card;
        });
        results.replaceChildren(...cards);
    }

    document.querySelectorAll(".stepper button").forEach((button) => {
        button.addEventListener("click", () => {
            const input = $("#" + button.dataset.target);
            input.value = clamp(parseInt(input.value, 10) + parseInt(button.dataset.step, 10), 1, parseInt(input.max, 10));
            run();
        });
    });
    [daysInput, travelersInput].forEach((input) => {
        input.addEventListener("input", run);
        input.addEventListener("change", () => { input.value = clamp(input.value, 1, parseInt(input.max, 10)); run(); });
    });
    budgetInput.addEventListener("input", run);
    $("#matchForm").addEventListener("submit", (event) => { event.preventDefault(); run(); });
    document.querySelectorAll('input[name="style"]').forEach((radio) => radio.addEventListener("change", run));
    sortBox.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
        sortBy = button.dataset.sort;
        sortBox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        run();
    }));

    // When the currency changes, the typed budget is converted so it keeps the same value
    currencyListeners.push(() => {
        const value = parseFloat(budgetInput.value);
        if (value > 0 && shownCurrency !== homeCurrency) {
            budgetInput.value = String(Math.round(convert(value, shownCurrency, homeCurrency)));
        }
        shownCurrency = homeCurrency;
        showCurrency();
        run();
    });

    showCurrency();
    results.replaceChildren(h("div", { class: "skel", style: "height:220px;border-radius:12px", "aria-hidden": "true" }));
    Promise.all([loadLandmarks(), loadFavorites()]).then(([list]) => { landmarks = list; run(); })
        .catch((error) => showError(results, error.message, () => window.location.reload()));
}

// ==========================================
// START
// ==========================================
async function start() {
    // 1. the currency chosen before, else the one saved on the account, else the browser region
    let chosen = session.get("currency");
    let fromAccount = false;
    if (!chosen) {
        try { chosen = (await api("/auth/me")).home_currency; fromAccount = !!chosen; } catch (e) { /* ignore */ }
    }
    const firstTime = !chosen;
    if (!chosen || !CURRENCIES[chosen]) chosen = detectCurrency();
    homeCurrency = chosen;
    try { localStorage.setItem("currency", chosen); } catch (e) { /* ignore */ }
    if (firstTime) api("/auth/currency", "PUT", { currency: chosen }).catch(() => {});

    buildHeader();
    buildFooter();
    if (firstTime) toast("Prices show in " + CURRENCIES[chosen] + ". Change it from the menu at the top.");
    await loadRates();
    const page = document.body.dataset.page;
    if (page === "home") initHome();
    else if (page === "calculator") initCalculator();
    else if (page === "trips") initTrips();
    else if (page === "saved") initSaved();
    else if (page === "matcher") initMatcher();
}
if (token) start();
