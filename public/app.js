const socket = io();

let currentRequestId = localStorage.getItem("currentRequestId") || null;
let currentShopId = localStorage.getItem("currentShopId") || null;

const shopsCard = document.getElementById("shopsCard");
const shopsContainer = document.getElementById("shopsContainer");
const requestCard = document.getElementById("requestCard");
const selectedShopName = document.getElementById("selectedShopName");
const shoppingListInput = document.getElementById("shoppingList");
const parseBtn = document.getElementById("parseBtn");
const parseSourceDiv = document.getElementById("parseSource");
const resultsCard = document.getElementById("resultsCard");
const resultsContainer = document.getElementById("resultsContainer");
const backToShopsBtn = document.getElementById("backToShopsBtn");
const categoriesWrapper = document.getElementById("categoriesWrapper");
const historyCard = document.getElementById("historyCard");

let allShops = [];
let selectedShop = null;
let activeCategory = "All";
let currentSearchRecommendations = [];
let searchAborter = null;
let userLat = null;
let userLng = null;

let mapInstance = null;
let routingControl = null;
let shopMarker = null;

function showSection(section) {
  shopsCard.style.display = "none";
  requestCard.style.display = "none";
  resultsCard.style.display = "none";
  historyCard.style.display = "none";
  categoriesWrapper.style.display = "none";

  if (section === "shops") {
    shopsCard.style.display = "block";
    categoriesWrapper.style.display = "block";
  } else if (section === "request") {
    requestCard.style.display = "block";
  } else if (section === "results") {
    resultsCard.style.display = "block";
  } else if (section === "history") {
    historyCard.style.display = "block";
  }
}

function renderCategories() {
  const categoriesScroll = document.getElementById("categoriesScroll");
  if (!categoriesScroll) return;
  
  const cats = [
    { name: "All", icon: "🛒" },
    { name: "Grocery", icon: "🍎" },
    { name: "Medical", icon: "💊" },
    { name: "Clothes", icon: "👕" },
    { name: "Hardware", icon: "🔧" },
    { name: "Stationery", icon: "📚" }
  ];
  
  categoriesScroll.innerHTML = cats.map(c => `
    <div class="category-item ${activeCategory === c.name ? 'active' : ''}" onclick="filterByCategory('${c.name}')">
      <div class="category-icon">${c.icon}</div>
      <span>${c.name}</span>
    </div>
  `).join("");
}

window.filterByCategory = (cat) => {
  activeCategory = cat;
  renderCategories();
  renderShopsUI();
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadShops();

  if (currentRequestId) {
    socket.emit("join_request", currentRequestId);
    showSection("results");
    resultsContainer.innerHTML = `<p class="muted">📡 Reconnecting to request...</p>`;
    refreshResults();
  } else if (currentShopId) {
    const shop = allShops.find(s => s.id === currentShopId);
    if (shop) window.selectShop(currentShopId);
  } else {
    showSection("shops");
  }
});

async function loadShops() {
  renderCategories();
  shopsCard.style.cssText = "border:none; padding:0; background:transparent; box-shadow:none;";
  
  if (shopsContainer) {
    shopsContainer.innerHTML = `<div class="empty-state">
      <div style="font-size:30px; margin-bottom:10px;">📍</div>
      Locating you & fetching real shops...
    </div>`;
  }
  
  const shopSearchInput = document.getElementById("shopSearchInput");
  if (shopSearchInput) {
    let searchTimer;
    shopSearchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        handleSearchChange();
      }, 300);
    });
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        userLat = position.coords.latitude;
        userLng = position.coords.longitude;
        await fetchRealShopsAndRender(userLat, userLng);
      },
      async (err) => {
        console.warn("Geolocation blocked or failed:", err);
        userLat = 28.6315;
        userLng = 77.2167;
        await fetchRealShopsAndRender(userLat, userLng);
      },
      { timeout: 10000 }
    );
  } else {
    userLat = 28.6315;
    userLng = 77.2167;
    await fetchRealShopsAndRender(userLat, userLng);
  }
}

async function fetchRealShopsAndRender(lat, lng) {
  try {
    await fetch(`/api/real-shops?lat=${lat}&lng=${lng}`);
  } catch (e) {
    console.error("Failed to fetch real shops:", e);
  }
  await fetchShops();
}

async function fetchShops() {
  try {
    let url = "/api/shops";
    if (userLat && userLng) {
      url += `?lat=${userLat}&lng=${userLng}`;
    }
    const res = await fetch(url);
    allShops = await res.json();
    allShops.sort((a, b) => a.distanceKm - b.distanceKm);
    renderShopsUI();
  } catch (err) {
    if(shopsContainer) shopsContainer.innerHTML = `<div class="empty-state">Error loading shops.</div>`;
  }
}

async function handleSearchChange() {
  const searchInput = document.getElementById("shopSearchInput");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
  
  if (searchTerm.length >= 2) {
    if (searchAborter) searchAborter.abort();
    searchAborter = new AbortController();
    
    try {
      const res = await fetch(`/api/recommendations?item=${encodeURIComponent(searchTerm)}`, { signal: searchAborter.signal });
      if (!res.ok) throw new Error("API Error");
      const data = await res.json();
      currentSearchRecommendations = Array.isArray(data) ? data : [];
    } catch(e) {
      if (e.name !== 'AbortError') {
        currentSearchRecommendations = [];
      } else {
        return; // Wait for the next active request to finish
      }
    }
  } else {
    currentSearchRecommendations = [];
  }
  
  renderShopsUI();
}

function inferCategory(searchTerm) {
  const term = searchTerm.toLowerCase();
  
  const keywords = {
    "Clothes": ["shirt", "tshirt", "t-shirt", "jeans", "pant", "trouser", "top", "dress", "shoe", "clothes", "wear", "jacket", "kurta", "saree", "kurti", "apparel", "garment"],
    "Grocery": ["milk", "bread", "egg", "rice", "dal", "sugar", "salt", "butter", "grocery", "vegetable", "fruit", "oil", "biscuit", "snack", "chips", "atta", "flour", "soap", "shampoo", "masala", "spices", "paneer", "curd", "yogurt", "water"],
    "Stationery": ["pen", "pencil", "book", "notebook", "paper", "eraser", "stationery", "marker", "stapler", "ruler", "scale", "file", "folder", "glue", "chart", "color", "paint"],
    "Medical": ["medicine", "tablet", "syrup", "pill", "bandage", "paracetamol", "medical", "pharmacy", "drug", "ointment", "cream", "crocin", "dolo", "mask", "sanitizer", "injection", "fever", "cough", "cold"],
    "Hardware": ["hammer", "nail", "screw", "wrench", "pipe", "wire", "hardware", "tool", "drill", "paint", "brush", "bulb", "switch", "socket", "tape", "glue", "fevicol"]
  };

  for (const [category, words] of Object.entries(keywords)) {
    for (const word of words) {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(term)) {
        return category;
      }
    }
  }
  return null;
}

function renderShopsUI() {
  if (!shopsContainer) return;
  
  let filtered = allShops;
  if (activeCategory !== "All") {
    filtered = filtered.filter(s => {
      const cat = s.category.toLowerCase();
      const target = activeCategory.toLowerCase();
      return cat.includes(target) || (target === "clothes" && cat.includes("cloth"));
    });
  }

  const searchInput = document.getElementById("shopSearchInput");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (searchTerm) {
    const recShopIds = currentSearchRecommendations.map(r => r.shopId);
    const inferredCat = inferCategory(searchTerm);
    
    filtered = filtered.filter(s => {
      const nameMatch = s.name.toLowerCase().includes(searchTerm);
      const isRecommended = recShopIds.includes(s.id);
      
      let categoryMatch = false;
      if (inferredCat) {
        const cat = s.category.toLowerCase();
        const target = inferredCat.toLowerCase();
        categoryMatch = cat.includes(target) || (target === "clothes" && cat.includes("cloth"));
      }

      return nameMatch || isRecommended || categoryMatch;
    });
    
    filtered.sort((a, b) => {
      // 1. History recommendations (Best match)
      const aRec = currentSearchRecommendations.find(r => r.shopId === a.id);
      const bRec = currentSearchRecommendations.find(r => r.shopId === b.id);
      const aYes = aRec ? aRec.yesCount : 0;
      const bYes = bRec ? bRec.yesCount : 0;
      
      if (aYes !== bYes) return bYes - aYes;
      
      // 2. Name Match
      const aNameMatch = a.name.toLowerCase().includes(searchTerm);
      const bNameMatch = b.name.toLowerCase().includes(searchTerm);
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;

      // 3. Inferred Category Match
      if (inferredCat) {
        const aCatMatch = a.category.toLowerCase().includes(inferredCat.toLowerCase()) || (inferredCat.toLowerCase() === "clothes" && a.category.toLowerCase().includes("cloth"));
        const bCatMatch = b.category.toLowerCase().includes(inferredCat.toLowerCase()) || (inferredCat.toLowerCase() === "clothes" && b.category.toLowerCase().includes("cloth"));
        if (aCatMatch && !bCatMatch) return -1;
        if (!aCatMatch && bCatMatch) return 1;
      }
      
      // 4. Distance
      return a.distanceKm - b.distanceKm;
    });
  }
  
  if (filtered.length === 0) {
    shopsContainer.innerHTML = `<div class="empty-state">No shops found matching your criteria. Try adjusting your search!</div>`;
    return;
  }
  
  shopsContainer.innerHTML = `<div class="shops-grid">` + filtered.map(s => {
    const rating = (Math.random() * 1 + 3.8).toFixed(1); 
    const time = Math.floor(s.distanceKm * 12) + 5; 
    
    const recData = currentSearchRecommendations.find(r => r.shopId === s.id);
    const recBadge = recData ? `<div style="font-size:12px; color:var(--green); font-weight:bold; margin-bottom:4px;">🔥 High chance of having this item</div>` : "";
    
    const customImageStyle = s.images && s.images.length > 0 ? `style="background-image: url('${s.images[0]}');"` : "";

    return `
      <div class="shop-card" onclick="selectShop('${s.id}')">
        <div class="shop-image ${s.category}" ${customImageStyle}></div>
        <div class="shop-details">
          ${recBadge}
          <h3>${s.name}</h3>
          <div class="shop-meta">
            <span class="rating">⭐ ${rating}</span>
            <span class="shop-meta-dot"></span>
            <span>${time} mins</span>
            <span class="shop-meta-dot"></span>
            <span>${s.distanceKm} km</span>
          </div>
          <div class="shop-tags">${s.category} • Free Delivery</div>
          <button class="btn-primary">Shop Now</button>
        </div>
      </div>
    `;
  }).join("") + `</div>`;
}

window.selectShop = (shopId) => {
  selectedShop = allShops.find(s => s.id === shopId);
  if (!selectedShop) return;

  currentShopId = shopId;
  selectedShopName.textContent = selectedShop.name;
  
  document.getElementById('recommendationsBox').style.display = 'none';

  showSection("request");
  
  // Map Logic
  const mapContainer = document.getElementById('shopMapContainer');
  const routeBtn = document.getElementById('showRouteBtn');
  
  if (selectedShop.lat && selectedShop.lng) {
    mapContainer.style.display = 'block';
    routeBtn.style.display = 'block'; 
    routeBtn.textContent = '📍 Show Route from My Location';
    routeBtn.disabled = false;
    
    setTimeout(() => {
      if (!mapInstance) {
        mapInstance = L.map('shopMap').setView([selectedShop.lat, selectedShop.lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(mapInstance);
      } else {
        mapInstance.setView([selectedShop.lat, selectedShop.lng], 15);
        if (routingControl) {
          mapInstance.removeControl(routingControl);
          routingControl = null;
        }
      }
      
      if (shopMarker) mapInstance.removeLayer(shopMarker);
      shopMarker = L.marker([selectedShop.lat, selectedShop.lng]).addTo(mapInstance)
        .bindPopup(`<b>${selectedShop.name}</b>`).openPopup();
        
      mapInstance.invalidateSize();
    }, 100);
  } else {
    mapContainer.style.display = 'none';
  }
};

const showRouteBtn = document.getElementById('showRouteBtn');
if (showRouteBtn) {
  showRouteBtn.addEventListener('click', () => {
    if (!userLat || !userLng) {
      alert("Please allow location access to calculate the route.");
      return;
    }
    
    if (!selectedShop || !selectedShop.lat || !selectedShop.lng) return;
    
    showRouteBtn.textContent = 'Calculating Route...';
    showRouteBtn.disabled = true;
    
    if (routingControl) {
      mapInstance.removeControl(routingControl);
    }
    
    routingControl = L.Routing.control({
      waypoints: [
        L.latLng(userLat, userLng),
        L.latLng(selectedShop.lat, selectedShop.lng)
      ],
      routeWhileDragging: false,
      show: false, // Hide turn-by-turn text box
      addWaypoints: false,
      fitSelectedRoutes: true,
      lineOptions: {
        styles: [{color: '#FF5A5F', weight: 4}]
      }
    }).addTo(mapInstance);
    
    routingControl.on('routesfound', function(e) {
      const distance = e.routes[0].summary.totalDistance / 1000;
      const time = Math.round(e.routes[0].summary.totalTime / 60);
      showRouteBtn.textContent = `📍 ${distance.toFixed(1)} km away (~${time} mins)`;
    });
    
    routingControl.on('routingerror', function() {
      showRouteBtn.textContent = '📍 Route not found. Try Google Maps.';
      showRouteBtn.disabled = false;
    });
  });
}

backToShopsBtn.addEventListener("click", () => {
  currentRequestId = null;
  localStorage.removeItem("currentRequestId");

  shoppingListInput.value = "";
  parseSourceDiv.textContent = "";

  cleanupBillMaps();
  showSection("shops");
});

window.closeHistory = () => {
  showSection("shops");
};

window.showHistory = async () => {
  const email = localStorage.getItem('userEmail');
  if(!email) return alert("Please log in first to view history.");
  
  showSection('history');
  document.getElementById('historyContainer').innerHTML = "<div class='empty-state'>Loading history...</div>";
  
  try {
    const res = await fetch(`/api/user/history?email=${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    
    if(data.length === 0) {
      document.getElementById('historyContainer').innerHTML = "<div class='empty-state'>No past requests found.</div>";
      return;
    }
    
    document.getElementById('historyContainer').innerHTML = data.map(req => {
      const date = new Date(req.createdAt).toLocaleString();
      const pingsHtml = (req.Pings || []).map(p => {
        const statusIcon = p.status === 'yes' ? '✅' : p.status === 'no' ? '❌' : p.status === 'partial' ? '🟠' : '⏳';
        return `<div style="margin-top: 4px;">${statusIcon} <b>${p.item}</b> at <span class="muted">${p.shopName || 'Unknown Shop'}</span></div>`;
      }).join('');
      
      return `
        <div class="result-group" style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px; cursor: pointer; border-radius: 8px; padding: 10px; transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'" onclick="viewHistoryRequest('${req.id}')">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <div class="muted" style="font-size:12px;">${date}</div>
            <div style="font-size:12px; color: var(--primary); font-weight: 500;">View Details ➔</div>
          </div>
          ${pingsHtml || '<div class="muted">No items in this request</div>'}
        </div>
      `;
    }).join('');
    
  } catch(e) {
    document.getElementById('historyContainer').innerHTML = "<div class='empty-state'>Failed to load history.</div>";
  }
};

window.viewHistoryRequest = async (requestId) => {
  currentRequestId = requestId;
  localStorage.setItem("currentRequestId", requestId);
  socket.emit("join_request", currentRequestId);
  showSection("results");
  document.getElementById("resultsContainer").innerHTML = `<div class="empty-state">Loading order details...</div>`;
  await refreshResults();
};

// Recommendations Debounce Logic
let typingTimer;
shoppingListInput.addEventListener('input', () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(async () => {
    const text = shoppingListInput.value.trim();
    if(text.length < 3) {
      document.getElementById('recommendationsBox').style.display = 'none';
      return;
    }
    
    // Take the last item in the list
    const words = text.split(',');
    const lastItem = words[words.length - 1].trim();
    if(!lastItem || lastItem.length < 3) return;
    
    try {
      const res = await fetch(`/api/recommendations?item=${encodeURIComponent(lastItem)}`);
      const data = await res.json();
      
      // Filter out if best shop is already the selected one
      const bestShop = data.find(s => s.shopId !== selectedShop.id);
      
      if(bestShop) {
        document.getElementById('recommendationsBox').style.display = 'flex';
        document.getElementById('recommendationsBox').style.alignItems = 'center';
        document.getElementById('recommendationText').innerHTML = `For "<b>${lastItem}</b>", <b>${bestShop.shopName}</b> usually has it in stock.`;
        document.getElementById('recSwitchBtn').onclick = () => {
           window.selectShop(bestShop.shopId);
           shoppingListInput.value = text; // preserve text
        };
      } else {
        document.getElementById('recommendationsBox').style.display = 'none';
      }
    } catch(e) {
      console.error(e);
    }
  }, 1000);
});

parseBtn.addEventListener("click", async () => {
  const text = shoppingListInput.value.trim();
  if (!text) return alert("Please type a shopping list first.");
  if (!selectedShop) return alert("Please select a shop first.");

  parseBtn.disabled = true;
  parseBtn.textContent = "Processing...";

  try {
    const parseRes = await fetch("/api/parse-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const parseData = await parseRes.json();
    const parsedItems = parseData.items;

    parseSourceDiv.textContent = parseData.source === "gemini"
      ? "✅ Parsed using Gemini API"
      : "⚙️ Parsed using local fallback engine";

    const userEmail = localStorage.getItem("userEmail") || "";

    const broadcastRes = await fetch("/api/direct-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: selectedShop.id, items: parsedItems, userEmail })
    });
    const broadcastData = await broadcastRes.json();

    currentRequestId = broadcastData.requestId;
    localStorage.setItem("currentRequestId", currentRequestId);

    socket.emit("join_request", currentRequestId);

    showSection("results");
    resultsContainer.innerHTML = `<p class="muted">📡 Sent request to ${selectedShop.name}. Waiting for response...</p>`;

    await refreshResults();
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    parseBtn.disabled = false;
    parseBtn.textContent = "🔍 Parse & Send Request";
  }
});

socket.on("connect", () => {
  if (currentRequestId) socket.emit("join_request", currentRequestId);
});

socket.on("ping_update", () => {
  if (currentRequestId) refreshResults();
});

socket.on("new_shop_added", () => {
  if (typeof fetchShops === "function") fetchShops();
});

async function refreshResults() {
  if (!currentRequestId) return;
  try {
    const res = await fetch(`/api/results/${currentRequestId}`);
    if (!res.ok) throw new Error("Request not found");
    const data = await res.json();
    renderResults(data);
  } catch (err) {
    currentRequestId = null;
    localStorage.removeItem("currentRequestId");
    showSection("shops");
  }
}

function renderResults(data) {
  const itemsMap = data.items || {};
  let userId = data.userId || "guest_";
  // Attempt to parse out user ID/email nicely
  if (userId.startsWith('user_')) {
    const cachedEmail = localStorage.getItem('userEmail');
    if (cachedEmail) userId = cachedEmail;
  }
  const userName = userId.startsWith('guest_') ? 'Guest' : userId.split('@')[0];

  const html = Object.entries(itemsMap)
    .map(([item, shops]) => {
      const s = shops[0];
      if (!s) return "";

      const status = s.status || "pending";
      const label =
        status === "yes" ? "✅ In Stock" :
          status === "no" ? "❌ Out of Stock" :
            status === "partial" ? "🟠 Partial Stock" :
              "⏳ Waiting...";

      let extraUI = "";
      if (status === "yes" || status === "partial") {
        if (!s.userAgreedToPay) {
          extraUI = `<button class="btn-primary" style="margin-top: 10px; width: 100%; font-size: 14px;" onclick="agreeToPay('${currentRequestId}', '${s.pingId}')">Want to pay? Product will be ready</button>`;
        } else {
          if (s.paymentStatus === 'confirmed') {
             let timeStr = "Just now";
             if (s.updatedAt) {
               const d = new Date(s.updatedAt);
               timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
             }

             const shopObj = allShops.find(shp => shp.id === s.shopId);
             const sLat = s.lat != null ? s.lat : (shopObj && shopObj.lat != null ? shopObj.lat : null);
             const sLng = s.lng != null ? s.lng : (shopObj && shopObj.lng != null ? shopObj.lng : null);

             let locationMapUI = "";
             if (sLat && sLng) {
               locationMapUI = `
                 <div style="margin-top: 16px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                   <div style="padding: 10px 14px; background: #f8f9fa; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 600; color: var(--text); display: flex; align-items: center; justify-content: space-between;">
                     <span>📍 Shop Pickup Location</span>
                     <span style="font-size: 12px; color: var(--muted);">${s.shopName}</span>
                   </div>
                   <div id="billMap-${s.pingId}" style="height: 200px; width: 100%;"></div>
                   <button id="billRouteBtn-${s.pingId}" class="btn-secondary" style="width: 100%; border-radius: 0; border: none; padding: 12px; font-weight: 600; border-top: 1px solid var(--border); background: #f8f9fa;" onclick="showBillRoute('${s.pingId}', ${sLat}, ${sLng})">📍 Show Route from My Location</button>
                 </div>
                 <div style="margin-top: 10px; text-align: center;">
                   <a href="https://www.google.com/maps/dir/?api=1&destination=${sLat},${sLng}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #1a73e8; text-decoration: none; font-weight: 600; padding: 6px 14px; background: rgba(26,115,232,0.08); border-radius: 8px;">
                     🗺️ Open in Google Maps ↗
                   </a>
                 </div>
               `;
             } else {
               locationMapUI = `
                 <div style="margin-top: 14px; padding: 10px 14px; background: #f8f9fa; border-radius: 8px; font-size: 13px; color: var(--muted); text-align: center; border: 1px solid var(--border);">
                   📍 Merchant has not set precise map coordinates yet.
                 </div>
               `;
             }

             extraUI = `
               <div style="margin-top: 20px; padding: 24px; background: white; border-radius: 16px; border: 2px dashed var(--green); text-align: left; box-shadow: 0 8px 24px rgba(0,166,153,0.12);">
                 <h3 style="margin: 0 0 16px 0; color: var(--green); font-size: 18px; text-align: center; letter-spacing: -0.5px;">🧾 DIGITAL BILL</h3>
                 <div style="font-size: 15px; margin-bottom: 8px; display: flex; justify-content: space-between;"><strong>Order ID:</strong> <span>${s.orderNumber}</span></div>
                 <div style="font-size: 15px; margin-bottom: 8px; display: flex; justify-content: space-between;"><strong>Item:</strong> <span style="font-weight:600;">${item}</span></div>
                 <div style="font-size: 15px; margin-bottom: 8px; display: flex; justify-content: space-between;"><strong>Amount Paid:</strong> <span style="color:var(--green); font-weight:700;">₹${s.price}</span></div>
                 <div style="font-size: 15px; margin-bottom: 8px; display: flex; justify-content: space-between;"><strong>Billed To:</strong> <span style="text-transform: capitalize;">${userName}</span></div>
                 <div style="font-size: 15px; margin-bottom: 8px; display: flex; justify-content: space-between;"><strong>Time:</strong> <span class="muted">${timeStr}</span></div>
                 <hr style="border-top: 1px dashed rgba(0,166,153,0.3); margin: 16px 0;" />
                 <div style="font-size: 14px; color: var(--muted); text-align: center;">Pick up from <strong style="color:var(--text);">${s.shopName}</strong></div>
                 ${locationMapUI}
               </div>
             `;
          } else if (s.paymentStatus === 'sent') {
             extraUI = `
               <div style="margin-top: 10px; padding: 10px; background: #fff3e0; border-radius: 8px; font-size: 14px; color: #e65100; text-align: center;">
                 ⏳ Payment sent! Waiting for shopkeeper to confirm...
               </div>
             `;
          } else if (s.price) {
             const upiUrl = s.shopUpiId ? encodeURIComponent(`upi://pay?pa=${s.shopUpiId}&pn=${s.shopName}&am=${s.price}`) : '';
             const qrImage = upiUrl ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${upiUrl}" style="margin: 10px auto; display: block;" />` : `<div class="muted" style="text-align:center; padding: 10px;">UPI ID not available for this shop</div>`;
             
             extraUI = `
               <div style="margin-top: 16px; padding: 20px; background: white; border-radius: 16px; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                 <div style="font-size: 15px; margin-bottom: 12px; color: var(--text);"><strong>Shopkeeper message:</strong> ${s.shopkeeperMessage || "Please pay the amount."}</div>
                 <div style="font-size: 20px; font-weight: 800; text-align: center; margin: 16px 0; color: var(--primary);">Amount: ₹${s.price}</div>
                 ${qrImage}
                 <button class="btn-primary" style="margin-top: 16px; width: 100%; font-size: 15px;" onclick="paymentSent('${currentRequestId}', '${s.pingId}')">I Have Paid via UPI</button>
               </div>
             `;
          } else {
             extraUI = `<div class="muted" style="margin-top: 5px; font-size: 13px;">Waiting for shopkeeper to quote price...</div>`;
          }
        }
      }

      return `
        <div class="result-group" style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
          <div class="shop-row ${status}">
            <div>
              <strong>${item}</strong><br/>
              <span class="muted">${s.shopName}</span>
            </div>
            <span class="status-badge ${status}">${label}</span>
          </div>
          ${extraUI}
        </div>`;
    })
    .join("");

  cleanupBillMaps();
  resultsContainer.innerHTML = html || '<div class="empty-state">No items sent.</div>';
  initBillMaps(itemsMap);
}

const billMaps = {};
const billRoutingControls = {};

function cleanupBillMaps() {
  Object.keys(billMaps).forEach((id) => {
    try {
      if (billRoutingControls[id] && billMaps[id]) {
        billMaps[id].removeControl(billRoutingControls[id]);
      }
      billMaps[id].remove();
    } catch (e) {}
    delete billMaps[id];
    delete billRoutingControls[id];
  });
}

function initBillMaps(itemsMap) {
  setTimeout(() => {
    Object.entries(itemsMap).forEach(([item, shops]) => {
      const s = shops[0];
      if (!s || s.paymentStatus !== 'confirmed') return;

      const shopObj = allShops.find(shp => shp.id === s.shopId);
      const sLat = s.lat != null ? s.lat : (shopObj && shopObj.lat != null ? shopObj.lat : null);
      const sLng = s.lng != null ? s.lng : (shopObj && shopObj.lng != null ? shopObj.lng : null);

      if (sLat && sLng) {
        const mapEl = document.getElementById(`billMap-${s.pingId}`);
        if (mapEl && !billMaps[s.pingId]) {
          try {
            const map = L.map(`billMap-${s.pingId}`).setView([sLat, sLng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap'
            }).addTo(map);

            L.marker([sLat, sLng]).addTo(map)
              .bindPopup(`<b>${s.shopName}</b>`).openPopup();

            billMaps[s.pingId] = map;
            setTimeout(() => { map.invalidateSize(); }, 200);
          } catch (e) {
            console.warn("Error initializing bill map:", e);
          }
        }
      }
    });
  }, 100);
}

window.showBillRoute = (pingId, sLat, sLng) => {
  const btn = document.getElementById(`billRouteBtn-${pingId}`);
  if (!userLat || !userLng) {
    if (navigator.geolocation) {
      if (btn) btn.textContent = '📍 Getting your location...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userLat = pos.coords.latitude;
          userLng = pos.coords.longitude;
          calculateBillRoute(pingId, sLat, sLng);
        },
        (err) => {
          alert("Please allow location access to calculate the route.");
          if (btn) btn.textContent = '📍 Show Route from My Location';
        }
      );
      return;
    } else {
      alert("Please allow location access to calculate the route.");
      return;
    }
  }
  calculateBillRoute(pingId, sLat, sLng);
};

function calculateBillRoute(pingId, sLat, sLng) {
  const btn = document.getElementById(`billRouteBtn-${pingId}`);
  const map = billMaps[pingId];
  if (!map) return;

  if (btn) {
    btn.textContent = 'Calculating Route...';
    btn.disabled = true;
  }

  if (billRoutingControls[pingId]) {
    try {
      map.removeControl(billRoutingControls[pingId]);
    } catch (e) {}
    billRoutingControls[pingId] = null;
  }

  const routingCtrl = L.Routing.control({
    waypoints: [
      L.latLng(userLat, userLng),
      L.latLng(sLat, sLng)
    ],
    routeWhileDragging: false,
    show: false,
    addWaypoints: false,
    fitSelectedRoutes: true,
    lineOptions: {
      styles: [{ color: '#00a699', weight: 4 }]
    }
  }).addTo(map);

  billRoutingControls[pingId] = routingCtrl;

  routingCtrl.on('routesfound', function(e) {
    const distance = e.routes[0].summary.totalDistance / 1000;
    const time = Math.round(e.routes[0].summary.totalTime / 60);
    if (btn) btn.textContent = `📍 ${distance.toFixed(1)} km away (~${time} mins)`;
  });

  routingCtrl.on('routingerror', function() {
    if (btn) {
      btn.textContent = '📍 Route not found. Open Google Maps below.';
      btn.disabled = false;
    }
  });
}

window.agreeToPay = async (requestId, pingId) => {
  try {
    const res = await fetch("/api/user/agree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, pingId })
    });
    if (!res.ok) throw new Error("Failed to agree");
    // UI will update via socket
  } catch (e) {
    alert(e.message);
  }
};

window.paymentSent = async (requestId, pingId) => {
  try {
    const res = await fetch("/api/user/payment-sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, pingId })
    });
    if (!res.ok) throw new Error("Failed to mark payment as sent");
  } catch (e) {
    alert(e.message);
  }
};
