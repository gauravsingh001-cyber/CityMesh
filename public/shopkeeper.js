const socket = io();

const shopSelect = document.getElementById("shopSelect");
const pingsContainer = document.getElementById("pingsContainer");

let currentShopId = null;
let shopLat = null;
let shopLng = null;
let pings = [];
let myShops = [];

async function loadShops() {
  const res = await fetch("/api/shops");
  const allShops = await res.json();
  
  const myEmail = localStorage.getItem("userEmail") || "";
  
  // Only show shops manually created (not osm_) AND owned by this user
  const shops = allShops.filter(s => {
    if (s.id.startsWith("osm_")) return false; // Filter out google/overpass maps data
    if (s.ownerEmail && s.ownerEmail !== myEmail) return false; // Filter out other people's shops
    return true; 
  });

  myShops = shops;

  shopSelect.innerHTML = '<option value="">Select Your Shop...</option>' + shops
    .map((s) => `<option value="${s.id}">${s.name} (${s.category})</option>`)
    .join("");
  
  const savedShopId = localStorage.getItem("currentShopId");
  currentShopId = shops.find(s => s.id === savedShopId) ? savedShopId : (shops[0]?.id || null);
  
  if (currentShopId) {
    shopSelect.value = currentShopId;
    socket.emit("join_shop", currentShopId);
    loadPings();
  }
}

shopSelect.addEventListener("change", () => {
  currentShopId = shopSelect.value;
  localStorage.setItem("currentShopId", currentShopId);
  socket.emit("join_shop", currentShopId);
  loadPings();
  const editCard = document.getElementById('editCard');
  if (editCard && editCard.style.display === 'block') {
    openEditProfile();
  }
});

async function loadPings() {
  if (!currentShopId) return;
  const res = await fetch(`/api/shopkeeper/${currentShopId}/pings`);
  pings = await res.json();
  renderPings();
}

socket.on("connect", () => {
  if (currentShopId) socket.emit("join_shop", currentShopId);
});

socket.on("new_ping", (ping) => {
  if (ping.shopId === currentShopId) {
    pings.push(ping);
    renderPings();
  }
});

socket.on("update_ping", (ping) => {
  if (ping.shopId === currentShopId) {
    const idx = pings.findIndex(p => p.pingId === ping.pingId);
    if (idx !== -1) {
      pings[idx] = ping;
      renderPings();
    }
  }
});

function renderPings() {
  const pending = pings.filter((p) => p.status === "pending");
  const resolved = pings.filter((p) => p.status !== "pending");

  if (pings.length === 0) {
    pingsContainer.innerHTML = `<div class="empty-state">No requests yet. Customers can select your shop and send requests directly from the User View!</div>`;
    return;
  }

  const pendingHtml = pending
    .map(
      (p) => `
      <div class="ping-card" id="ping-${p.pingId}">
        <div><strong>📦 ${p.item}</strong> <span class="muted">(${p.category})</span></div>
        <div class="ping-actions">
          <button class="btn-yes" onclick="respond('${p.requestId}','${p.pingId}','yes')">✅ Yes</button>
          <button class="btn-partial" onclick="respond('${p.requestId}','${p.pingId}','partial')">🟠 Partial</button>
          <button class="btn-no" onclick="respond('${p.requestId}','${p.pingId}','no')">❌ No</button>
        </div>
      </div>`
    )
    .join("");

  const resolvedHtml = resolved
    .map(
      (p) => {
        let extraUI = "";
        if (p.userAgreedToPay) {
          if (p.paymentStatus === 'pending') {
            if (!p.price) {
              extraUI = `
                <div style="margin-top: 10px; padding: 10px; background: #e6f4ea; border-radius: 8px;">
                  <div style="font-size: 14px; color: #1e8e3e; margin-bottom: 8px;">✅ User agreed to pay & pick up.</div>
                  <input type="number" id="price-${p.pingId}" placeholder="Total Price (₹)" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px; font-size: 14px;" />
                  <input type="text" id="msg-${p.pingId}" placeholder="Enter message..." style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px; font-size: 14px;" />
                  <button class="btn-primary" style="width: 100%; font-size: 14px;" onclick="sendManualMessage('${p.requestId}', '${p.pingId}')">Quote Price & Request Payment</button>
                </div>
              `;
            } else {
              extraUI = `
                <div style="margin-top: 10px; padding: 10px; background: #f1f3f4; border-radius: 8px; font-size: 14px; border-left: 4px solid #1a73e8;">
                  <strong>You quoted:</strong> ₹${p.price} <br/>
                  <span class="muted">Waiting for user to pay...</span>
                </div>
              `;
            }
          } else if (p.paymentStatus === 'sent') {
            extraUI = `
              <div style="margin-top: 10px; padding: 10px; background: #fff3e0; border-radius: 8px; font-size: 14px; border-left: 4px solid #ff9800;">
                <strong>Payment Sent:</strong> User says they paid ₹${p.price}.<br/><br/>
                <button class="btn-primary" style="width: 100%; font-size: 14px; background: #2e7d32;" onclick="confirmPayment('${p.requestId}', '${p.pingId}')">Confirm Payment Received</button>
              </div>
            `;
          } else if (p.paymentStatus === 'confirmed') {
            extraUI = `
              <div style="margin-top: 10px; padding: 10px; background: #e6f4ea; border-radius: 8px; font-size: 14px; border-left: 4px solid #1e8e3e;">
                <strong>Payment Confirmed!</strong><br/>
                Order Number: <strong style="font-size: 18px;">${p.orderNumber}</strong><br/>
                Keep item ready for pickup!
              </div>
            `;
          }
        }
        
        return `
        <div class="ping-card" style="margin-bottom: 10px;">
          <div class="shop-row ${p.status}">
            <div><strong>${p.item}</strong> <span class="muted">(${p.category})</span></div>
            <span class="status-badge ${p.status}">${p.status.toUpperCase()}</span>
          </div>
          ${extraUI}
        </div>`
      }
    )
    .join("");

  pingsContainer.innerHTML = `
    ${pending.length ? `<h3 class="muted">🔔 Needs Response (${pending.length})</h3>${pendingHtml}` : ""}
    ${resolved.length ? `<h3 class="muted">✅ Already Answered</h3>${resolvedHtml}` : ""}
  `;
}

async function respond(requestId, pingId, response) {
  await fetch("/api/shopkeeper/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, pingId, response })
  });
  const ping = pings.find((p) => p.pingId === pingId);
  if (ping) ping.status = response;
  renderPings();
}

async function sendManualMessage(requestId, pingId) {
  const input = document.getElementById(`msg-${pingId}`);
  const priceInput = document.getElementById(`price-${pingId}`);
  if (!input || !priceInput) return;
  const message = input.value.trim();
  const price = parseFloat(priceInput.value);
  
  if (!price || price <= 0) return alert("Please enter a valid price.");

  try {
    const res = await fetch("/api/shopkeeper/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, pingId, message, price })
    });
    if (!res.ok) throw new Error("Failed to send message");
    
    // UI updates via socket
  } catch (err) {
    alert(err.message);
  }
}

async function confirmPayment(requestId, pingId) {
  try {
    const res = await fetch("/api/shopkeeper/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, pingId })
    });
    if (!res.ok) throw new Error("Failed to confirm payment");
  } catch (err) {
    alert(err.message);
  }
}

loadShops();

const registerBtn = document.getElementById("registerBtn");
const fetchLocationBtn = document.getElementById("fetchLocationBtn");
const locationStatus = document.getElementById("locationStatus");

fetchLocationBtn?.addEventListener("click", () => {
  if (fetchLocationBtn) fetchLocationBtn.textContent = "📍 Locating...";
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        shopLat = position.coords.latitude;
        shopLng = position.coords.longitude;
        if (locationStatus) {
          locationStatus.textContent = "✅ Found";
          locationStatus.style.color = "var(--green)";
        }
        if (fetchLocationBtn) fetchLocationBtn.textContent = "📍 Location Acquired";
        if (registerBtn) registerBtn.disabled = false;
      },
      (err) => {
        console.warn("Geolocation blocked or failed:", err);
        alert("Please allow location access to register your shop.");
        if (fetchLocationBtn) fetchLocationBtn.textContent = "📍 Fetch My Shop Location";
      },
      { timeout: 10000 }
    );
  } else {
    alert("Geolocation is not supported by your browser.");
    if (fetchLocationBtn) fetchLocationBtn.textContent = "📍 Fetch My Shop Location";
  }
});

registerBtn?.addEventListener("click", async () => {
  const name = document.getElementById("regShopName").value.trim();
  const category = document.getElementById("regShopCategory").value;
  const phone = document.getElementById("regShopPhone").value.trim();
  const email = document.getElementById("regShopEmail").value.trim();
  const password = document.getElementById("regShopPassword").value.trim();
  const upiId = document.getElementById("regShopUpi").value.trim();
  const images = [
    document.getElementById("regShopImg1").value.trim(),
    document.getElementById("regShopImg2").value.trim(),
    document.getElementById("regShopImg3").value.trim()
  ].filter(url => url !== "");

  if (!name || !category || !email || !password || !upiId) {
    return alert("Name, Category, Email, Password, and UPI ID are required.");
  }

  if (shopLat === null || shopLng === null) {
    return alert("Please fetch your shop location first.");
  }

  const btn = registerBtn;
  btn.disabled = true;
  btn.textContent = "Registering...";

  try {
    const res = await fetch("/api/shops/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, phone, lat: shopLat, lng: shopLng, email, password, upiId, images })
    });

    if (!res.ok) throw new Error("Registration failed");
    
    const data = await res.json();
    
    // Auto-select the new shop
    localStorage.setItem("currentShopId", data.shop.id);
    localStorage.setItem("userEmail", email);
    
    // Hide registration form
    document.getElementById('registerCard').style.display = 'none';
    
    // Update top bar email display
    const displayEl = document.getElementById('shopkeeperEmailDisplay');
    if (displayEl) displayEl.textContent = "👋 " + email.split('@')[0];
    
    // Reload shops
    await loadShops();
    
    alert("Shop registered successfully! You are now logged in as " + data.shop.name);
    
    // Clear form
    document.getElementById("regShopName").value = "";
    document.getElementById("regShopCategory").value = "";
    document.getElementById("regShopPhone").value = "";
    document.getElementById("regShopImg1").value = "";
    document.getElementById("regShopImg2").value = "";
    document.getElementById("regShopImg3").value = "";
    
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Registration";
  }
});

let editShopLat = null;
let editShopLng = null;
const editFetchLocationBtn = document.getElementById("editFetchLocationBtn");
const editLocationStatus = document.getElementById("editLocationStatus");

editFetchLocationBtn?.addEventListener("click", () => {
  if (editFetchLocationBtn) editFetchLocationBtn.textContent = "📍 Locating...";
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        editShopLat = position.coords.latitude;
        editShopLng = position.coords.longitude;
        if (editLocationStatus) {
          editLocationStatus.textContent = "✅ Updated";
          editLocationStatus.style.color = "var(--green)";
        }
        if (editFetchLocationBtn) editFetchLocationBtn.textContent = "📍 Location Acquired";
      },
      (err) => {
        console.warn("Geolocation blocked or failed:", err);
        alert("Please allow location access to update your shop location.");
        if (editFetchLocationBtn) editFetchLocationBtn.textContent = "📍 Update Shop Location";
      },
      { timeout: 10000 }
    );
  } else {
    alert("Geolocation is not supported by your browser.");
    if (editFetchLocationBtn) editFetchLocationBtn.textContent = "📍 Update Shop Location";
  }
});

function openEditProfile() {
  if (!currentShopId) return alert("Please select a shop first.");
  const shop = myShops.find(s => s.id === currentShopId);
  if (!shop) return alert("Shop not found.");
  
  const nameEl = document.getElementById('editShopName');
  if (nameEl) nameEl.value = shop.name || "";

  const catSelect = document.getElementById('editShopCategory');
  if (catSelect) {
    let matched = false;
    for (let i = 0; i < catSelect.options.length; i++) {
      if (catSelect.options[i].value.toLowerCase() === (shop.category || "").toLowerCase()) {
        catSelect.selectedIndex = i;
        matched = true;
        break;
      }
    }
    if (!matched && shop.category) {
      const opt = document.createElement("option");
      opt.value = shop.category;
      opt.textContent = shop.category;
      catSelect.appendChild(opt);
      catSelect.value = shop.category;
    }
  }

  const phoneEl = document.getElementById('editShopPhone');
  if (phoneEl) phoneEl.value = shop.phone || "";

  const upiEl = document.getElementById('editShopUpi');
  if (upiEl) upiEl.value = shop.upiId || "";

  const img1 = document.getElementById('editShopImg1');
  const img2 = document.getElementById('editShopImg2');
  const img3 = document.getElementById('editShopImg3');
  if (img1) img1.value = (shop.images && shop.images[0]) || "";
  if (img2) img2.value = (shop.images && shop.images[1]) || "";
  if (img3) img3.value = (shop.images && shop.images[2]) || "";

  editShopLat = null;
  editShopLng = null;
  if (editLocationStatus) {
    if (shop.lat && shop.lng) {
      editLocationStatus.textContent = "📍 Set";
      editLocationStatus.style.color = "var(--green)";
    } else {
      editLocationStatus.textContent = "Not set";
      editLocationStatus.style.color = "var(--muted)";
    }
  }
  if (editFetchLocationBtn) {
    editFetchLocationBtn.textContent = "📍 Update Shop Location";
  }

  document.getElementById('editCard').style.display = 'block';
  document.getElementById('registerCard').style.display = 'none';
}

async function updateShopProfile() {
  if (!currentShopId) return;
  const name = document.getElementById("editShopName")?.value.trim();
  const category = document.getElementById("editShopCategory")?.value;
  const phone = document.getElementById("editShopPhone")?.value.trim() || "";
  const upiId = document.getElementById("editShopUpi")?.value.trim();
  const images = [
    document.getElementById("editShopImg1")?.value.trim(),
    document.getElementById("editShopImg2")?.value.trim(),
    document.getElementById("editShopImg3")?.value.trim()
  ].filter(url => Boolean(url));

  if (!name) return alert("Shop name is required.");
  if (!category) return alert("Please select a category.");
  if (!upiId) return alert("UPI ID is required.");
  
  const btn = document.getElementById("updateProfileBtn");
  btn.disabled = true;
  btn.textContent = "Updating...";

  const payload = {
    shopId: currentShopId,
    name,
    category,
    phone,
    upiId,
    images
  };

  if (editShopLat !== null && editShopLng !== null) {
    payload.lat = editShopLat;
    payload.lng = editShopLng;
  }

  try {
    const res = await fetch("/api/shops/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Update failed");
    }
    
    alert("Profile updated successfully!");
    document.getElementById('editCard').style.display = 'none';
    
    await loadShops(); // Refresh the shops data
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Update Profile";
  }
}
