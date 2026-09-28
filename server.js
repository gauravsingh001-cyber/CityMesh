require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const { parseShoppingList } = require("./gemini");

// New dependencies
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sequelize, User, Shop, Request, Ping, initDB } = require("./db");
const { Op } = require("sequelize");
const { sendVerificationEmail } = require("./email");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Initialize DB
initDB();

// -------------------------------------------------------------------------
// Seed DB from existing JSON files (Migration)
// -------------------------------------------------------------------------
const migrateData = async () => {
  try {
    const usersPath = path.join(__dirname, "data", "users.json");
    if (fs.existsSync(usersPath)) {
      const usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
      for (const u of usersData) {
        const exists = await User.findByPk(u.id);
        if (!exists) {
          let pw = u.password;
          if (pw && !pw.startsWith('$2a$')) pw = await bcrypt.hash(pw, 10);
          await User.create({
            id: u.id,
            email: u.email,
            password: pw,
            lat: u.lat,
            lng: u.lng,
            isShopkeeper: u.isShopkeeper || false,
            isVerified: true // mark old users as verified
          });
        }
      }
    }
    
    const shopsPath = path.join(__dirname, "data", "shops.json");
    if (fs.existsSync(shopsPath)) {
      const shopsData = JSON.parse(fs.readFileSync(shopsPath, "utf-8"));
      for (const s of shopsData) {
        const exists = await Shop.findByPk(s.id);
        if (!exists) {
          await Shop.create({
            id: s.id,
            name: s.name,
            category: s.category,
            phone: s.phone || "",
            lat: s.lat,
            lng: s.lng,
            distanceKm: s.distanceKm || 0,
            successScore: s.successScore || 0,
            status: s.status || "online",
            ownerEmail: s.ownerEmail || ""
          });
        }
      }
    }
  } catch (err) {
    console.error("Migration error:", err);
  }
};

// Run migration after a short delay to ensure DB sync
setTimeout(migrateData, 2000);

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== "your_google_client_id_here") {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ where: { googleId: profile.id } });
      if (!user) {
        user = await User.findOne({ where: { email: profile.emails[0].value } });
        if (user) {
          user.googleId = profile.id;
          user.isVerified = true;
          await user.save();
        } else {
          user = await User.create({
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
            googleId: profile.id,
            email: profile.emails[0].value,
            isVerified: true
          });
        }
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }));
}

const requests = {}; // In-memory requests for real-time tracking

// 1. Parse shopping list via Gemini
app.post("/api/parse-list", async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Shopping list text is required" });
  }
  const result = await parseShoppingList(text);
  res.json(result);
});

// 2. Direct Request
app.post("/api/direct-request", async (req, res) => {
  const { shopId, items, userEmail } = req.body;
  if (!shopId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "shopId and items[] are required" });
  }

  const requestId = uuidv4();
  const shop = await Shop.findByPk(shopId);

  if (!shop) {
    return res.status(404).json({ error: "Shop not found" });
  }

  let userId = null;
  if (userEmail) {
    const user = await User.findOne({ where: { email: userEmail } });
    if (user) userId = user.id;
  }

  // Create Request in DB
  await Request.create({ id: requestId, userId });

  const pingsData = items.map(({ item, category }) => {
    return {
      id: uuidv4(),
      requestId,
      shopId: shop.id,
      shopName: shop.name,
      item,
      category,
      status: "pending"
    };
  });

  // Create Pings in DB
  await Ping.bulkCreate(pingsData);

  pingsData.forEach((ping) => {
    // Send to socket room with pingId backward compatibility
    io.to(`shop_${shop.id}`).emit("new_ping", { ...ping, pingId: ping.id });
  });

  res.json({ requestId, pingsSent: pingsData.length, pings: pingsData.map(p => ({...p, pingId: p.id})) });
});

// 3. Shopkeeper: get all pings (pending and resolved)
app.get("/api/shopkeeper/:shopId/pings", async (req, res) => {
  const { shopId } = req.params;
  const mine = await Ping.findAll({ 
    where: { shopId },
    order: [['createdAt', 'DESC']],
    limit: 100 // Limit history to last 100 requests for performance
  });
  res.json(mine.map(p => ({...p.dataValues, pingId: p.id})));
});

// 4. Shopkeeper responds
app.post("/api/shopkeeper/respond", async (req, res) => {
  const { requestId, pingId, response } = req.body;
  
  const ping = await Ping.findOne({ where: { id: pingId, requestId } });
  if (!ping) return res.status(404).json({ error: "Ping not found" });

  ping.status = response; 
  await ping.save();

  if (response === "yes" || response === "partial") {
    const shop = await Shop.findByPk(ping.shopId);
    if (shop) {
      shop.successScore = (shop.successScore || 0) + 1;
      await shop.save();
    }
  }

  const emitPing = { ...ping.dataValues, pingId: ping.id };
  io.to(`request_${requestId}`).emit("ping_update", emitPing);
  res.json({ ok: true, ping: emitPing });
});

// 4.5 User agrees to pay
app.post("/api/user/agree", async (req, res) => {
  const { requestId, pingId } = req.body;
  
  const ping = await Ping.findOne({ where: { id: pingId, requestId } });
  if (!ping) return res.status(404).json({ error: "Ping not found" });

  ping.userAgreedToPay = true; 
  await ping.save();

  const emitPing = { ...ping.dataValues, pingId: ping.id };
  io.to(`shop_${ping.shopId}`).emit("update_ping", emitPing);
  io.to(`request_${requestId}`).emit("ping_update", emitPing);
  res.json({ ok: true, ping: emitPing });
});

// 4.6 Shopkeeper sends manual message & quotes price
app.post("/api/shopkeeper/send-message", async (req, res) => {
  const { requestId, pingId, message, price } = req.body;
  
  const ping = await Ping.findOne({ where: { id: pingId, requestId } });
  if (!ping) return res.status(404).json({ error: "Ping not found" });

  ping.shopkeeperMessage = message; 
  if (price !== undefined) ping.price = price;
  await ping.save();

  const emitPing = { ...ping.dataValues, pingId: ping.id };
  io.to(`shop_${ping.shopId}`).emit("update_ping", emitPing);
  io.to(`request_${requestId}`).emit("ping_update", emitPing);
  res.json({ ok: true, ping: emitPing });
});

// 4.7 User marks payment as sent
app.post("/api/user/payment-sent", async (req, res) => {
  const { requestId, pingId } = req.body;
  const ping = await Ping.findOne({ where: { id: pingId, requestId } });
  if (!ping) return res.status(404).json({ error: "Ping not found" });

  ping.paymentStatus = 'sent';
  await ping.save();

  const emitPing = { ...ping.dataValues, pingId: ping.id };
  io.to(`shop_${ping.shopId}`).emit("update_ping", emitPing);
  io.to(`request_${requestId}`).emit("ping_update", emitPing);
  res.json({ ok: true, ping: emitPing });
});

// 4.8 Shopkeeper confirms payment and generates order
app.post("/api/shopkeeper/confirm-payment", async (req, res) => {
  const { requestId, pingId } = req.body;
  const ping = await Ping.findOne({ where: { id: pingId, requestId } });
  if (!ping) return res.status(404).json({ error: "Ping not found" });

  ping.paymentStatus = 'confirmed';
  ping.orderNumber = '#ORD-' + Math.floor(10000 + Math.random() * 90000);
  await ping.save();

  const emitPing = { ...ping.dataValues, pingId: ping.id };
  io.to(`shop_${ping.shopId}`).emit("update_ping", emitPing);
  io.to(`request_${requestId}`).emit("ping_update", emitPing);
  res.json({ ok: true, ping: emitPing });
});


// 5. Get aggregated live results
app.get("/api/results/:requestId", async (req, res) => {
  const request = await Request.findByPk(req.params.requestId);
  if (!request) return res.status(404).json({ error: "Request not found" });

  const pings = await Ping.findAll({ where: { requestId: request.id } });
  
  const grouped = {};
  pings.forEach(({ item }) => (grouped[item] = []));

  // Pre-fetch all involved shops to avoid DB queries in loop
  const shopIds = [...new Set(pings.map(p => p.shopId))];
  const shops = await Shop.findAll({ where: { id: shopIds } });
  const shopMap = {};
  shops.forEach(s => shopMap[s.id] = s);

  pings.forEach((ping) => {
    const shop = shopMap[ping.shopId];
    grouped[ping.item].push({
      pingId: ping.id,
      shopId: ping.shopId,
      shopName: ping.shopName,
      status: ping.status,
      userAgreedToPay: ping.userAgreedToPay,
      shopkeeperMessage: ping.shopkeeperMessage,
      price: ping.price,
      paymentStatus: ping.paymentStatus,
      orderNumber: ping.orderNumber,
      updatedAt: ping.updatedAt,
      shopUpiId: shop ? shop.upiId : null,
      distanceKm: shop ? shop.distanceKm : null,
      successScore: shop ? shop.successScore : 0,
      lat: shop ? shop.lat : null,
      lng: shop ? shop.lng : null
    });
  });

  Object.keys(grouped).forEach((item) => {
    grouped[item].sort((a, b) => {
      const statusRank = (s) => (s === "yes" ? 0 : s === "partial" ? 1 : s === "no" ? 3 : 2);
      if (statusRank(a.status) !== statusRank(b.status)) return statusRank(a.status) - statusRank(b.status);
      if (b.successScore !== a.successScore) return b.successScore - a.successScore;
      return a.distanceKm - b.distanceKm;
    });
  });

  res.json({ requestId: request.id, userId: request.userId, items: grouped });
});

// 5.5 User History
app.get("/api/user/history", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const userRequests = await Request.findAll({
      where: { userId: user.id },
      include: [Ping],
      order: [['createdAt', 'DESC']]
    });

    res.json(userRequests);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// 5.6 Smart Recommendations
app.get("/api/recommendations", async (req, res) => {
  const { item } = req.query;
  if (!item) return res.status(400).json({ error: "Item query required" });

  try {
    // Find shops with highest 'yes' count for this item
    const results = await Ping.findAll({
      attributes: [
        'shopId',
        'shopName',
        [sequelize.fn('COUNT', sequelize.col('id')), 'yesCount']
      ],
      where: {
        item: { [Op.like]: `%${item}%` },
        status: 'yes'
      },
      group: ['shopId', 'shopName'],
      order: [[sequelize.col('yesCount'), 'DESC']],
      limit: 20
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

// -------------------------------------------------------------------------
// Authentication (Email OTP & Google)
// -------------------------------------------------------------------------

app.post("/api/auth/signup", async (req, res) => {
  const { email, password, lat, lng } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  
  try {
    let user = await User.findOne({ where: { email } });
    if (user) {
      if (!user.isVerified) {
        // Resend OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        user.verificationToken = otp;
        user.password = await bcrypt.hash(password, 10);
        await user.save();
        await sendVerificationEmail(user.email, otp);
        return res.json({ success: true, message: "OTP resent. Please verify.", requireVerification: true, email: user.email });
      }
      return res.status(400).json({ error: "User already exists" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = crypto.randomInt(100000, 999999).toString();
    
    user = await User.create({
      id: `user_${Date.now()}`,
      email,
      password: hashedPassword,
      lat: lat || null,
      lng: lng || null,
      verificationToken: otp,
      isVerified: false
    });
    
    await sendVerificationEmail(user.email, otp);
    res.json({ success: true, message: "Please verify your email", requireVerification: true, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during signup" });
  }
});

app.post("/api/auth/verify", async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.isVerified) return res.status(400).json({ error: "User is already verified" });
    
    if (user.verificationToken === otp) {
      user.isVerified = true;
      user.verificationToken = null;
      await user.save();
      return res.json({ success: true, user: { id: user.id, email: user.email } });
    } else {
      return res.status(400).json({ error: "Invalid OTP" });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.isVerified) return res.status(403).json({ error: "Please verify your email first", requireVerification: true, email: user.email });
    
    if (!user.password) return res.status(401).json({ error: "Please login with Google" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid email or password" });
    
    res.json({ success: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/api/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/?error=GoogleLoginFailed' }),
  (req, res) => {
    res.redirect(`/?googleAuthSuccess=true&email=${encodeURIComponent(req.user.email)}`);
  }
);

// 6. Shop Registration
app.post("/api/shops/register", async (req, res) => {
  const { name, category, phone, lat, lng, email, password, upiId, images } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: "Name and category are required" });
  }
  
  try {
    if (email && password) {
      let user = await User.findOne({ where: { email } });
      if (!user) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
          id: `shopkeeper_${Date.now()}`,
          email,
          password: hashedPassword,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          isShopkeeper: true,
          isVerified: true // auto-verify shopkeepers for now
        });
      }
    }

    const newShop = await Shop.create({
      id: `shop_${Date.now()}`,
      name: name.trim(),
      category,
      phone: phone ? phone.trim() : "",
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      distanceKm: 0,
      successScore: 0,
      status: "online",
      ownerEmail: email || "",
      upiId: upiId || "",
      images: Array.isArray(images) ? images : []
    });

    io.emit("new_shop_added", newShop);
    res.json({ ok: true, shop: newShop });
  } catch (err) {
    res.status(500).json({ error: "Error registering shop" });
  }
});

// 6.5 Shop Update Profile
app.post("/api/shops/update", async (req, res) => {
  const { shopId, upiId, images } = req.body;
  if (!shopId) return res.status(400).json({ error: "Shop ID is required" });

  try {
    const shop = await Shop.findByPk(shopId);
    if (!shop) return res.status(404).json({ error: "Shop not found" });

    shop.upiId = upiId || "";
    if (Array.isArray(images)) shop.images = images;
    await shop.save();

    // Optionally notify connected clients about shop update if needed
    // io.emit("shop_updated", shop);

    res.json({ ok: true, shop });
  } catch (err) {
    res.status(500).json({ error: "Error updating shop" });
  }
});

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(1));
}

// 7. Overpass API
app.get("/api/real-shops", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "lat and lng are required" });

  const radius = 1000;
  const overpassQuery = `
    [out:json];
    (
      nwr["shop"](around:${radius},${lat},${lng});
      nwr["amenity"="pharmacy"](around:${radius},${lat},${lng});
    );
    out center;
  `;

  try {
    const response = await fetch("https://lz4.overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(overpassQuery)}`
    });

    if (!response.ok) throw new Error(`Overpass API failed`);
    const data = await response.json();
    let newShopsCount = 0;

    for (const el of data.elements) {
      const osmId = "osm_" + el.id;
      if (el.tags) {
        const existing = await Shop.findByPk(osmId);
        if (!existing) {
          let category = "General";
          const shopType = el.tags.shop || "";
          const amenityType = el.tags.amenity || "";

          if (amenityType === "pharmacy" || shopType === "chemist") category = "Medical";
          else if (shopType === "supermarket" || shopType === "convenience") category = "Grocery";
          else if (shopType === "hardware") category = "Hardware";
          else if (shopType === "stationery") category = "Stationery";
          else if (shopType === "clothes" || shopType === "boutique") category = "Clothes";
          else if (shopType === "shoes") category = "Shoes";
          else if (shopType === "mobile_phone" || shopType === "electronics") category = "Electronics";
          else if (shopType === "mall") category = "Mall";
          else if (shopType === "optician") category = "Optician";
          else if (shopType && shopType !== "yes") {
             category = shopType.replace(/_/g, " ");
             category = category.charAt(0).toUpperCase() + category.slice(1);
          }

          const elLat = el.lat || (el.center && el.center.lat);
          const elLon = el.lon || (el.center && el.center.lon);
          
          if (elLat && elLon) {
            const distance = getDistanceFromLatLonInKm(lat, lng, elLat, elLon);
            await Shop.create({
              id: osmId,
              name: el.tags.name || `${category} Store`,
              category,
              phone: el.tags.phone || "",
              distanceKm: distance,
              successScore: 0,
              lat: elLat,
              lng: elLon
            });
            newShopsCount++;
          }
        }
      }
    }

    if (newShopsCount > 0) io.emit("new_shop_added");
    res.json({ ok: true, elementsFound: data.elements.length, added: newShopsCount });
  } catch (err) {
    console.error("Overpass API failed:", err.message);
    res.status(500).json({ error: "Failed to fetch real shops" });
  }
});

// 8. Utility endpoints
app.get("/api/shops", async (req, res) => {
  const { lat, lng } = req.query;
  try {
    const shops = await Shop.findAll();
    
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      
      for (const s of shops) {
        if (s.lat && s.lng) {
          s.dataValues.distanceKm = getDistanceFromLatLonInKm(userLat, userLng, s.lat, s.lng);
        }
      }
    }
    res.json(shops);
  } catch(err) {
    res.status(500).json({error: "Server error"});
  }
});

io.on("connection", (socket) => {
  socket.on("join_request", (requestId) => {
    socket.join(`request_${requestId}`);
  });
  socket.on("join_shop", (shopId) => {
    socket.join(`shop_${shopId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CityMesh server running at http://localhost:${PORT}`);
});
