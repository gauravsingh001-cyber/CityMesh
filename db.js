const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Initialize SQLite Database
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'data', 'database.sqlite'),
  logging: false
});

const User = sequelize.define('User', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true // Nullable for Google Auth users
  },
  lat: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  lng: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  isShopkeeper: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  verificationToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  googleId: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

const Shop = sequelize.define('Shop', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lat: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  lng: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  distanceKm: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  successScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'online'
  },
  ownerEmail: {
    type: DataTypes.STRING,
    allowNull: true
  },
  upiId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  images: {
    type: DataTypes.JSON,
    defaultValue: []
  }
});

const Request = sequelize.define('Request', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: true // Null for anonymous
  }
});

const Ping = sequelize.define('Ping', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  requestId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  shopId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  shopName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  item: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending'
  },
  userAgreedToPay: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  shopkeeperMessage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  paymentStatus: {
    type: DataTypes.STRING,
    defaultValue: 'pending'
  },
  orderNumber: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

User.hasMany(Request, { foreignKey: 'userId' });
Request.belongsTo(User, { foreignKey: 'userId' });

Request.hasMany(Ping, { foreignKey: 'requestId' });
Ping.belongsTo(Request, { foreignKey: 'requestId' });

Shop.hasMany(Ping, { foreignKey: 'shopId' });
Ping.belongsTo(Shop, { foreignKey: 'shopId' });

// Sync database schema
const initDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('SQLite database connected successfully.');
    // Manual column additions to avoid SQLite alter issues
    try { await sequelize.query('ALTER TABLE Pings ADD COLUMN userAgreedToPay TINYINT(1) DEFAULT 0;'); } catch(e) {}
    try { await sequelize.query('ALTER TABLE Pings ADD COLUMN shopkeeperMessage VARCHAR(255);'); } catch(e) {}
    try { await sequelize.query('ALTER TABLE Shops ADD COLUMN upiId VARCHAR(255);'); } catch(e) {}
    try { await sequelize.query('ALTER TABLE Pings ADD COLUMN price FLOAT;'); } catch(e) {}
    try { await sequelize.query('ALTER TABLE Pings ADD COLUMN paymentStatus VARCHAR(255) DEFAULT "pending";'); } catch(e) {}
    try { await sequelize.query('ALTER TABLE Pings ADD COLUMN orderNumber VARCHAR(255);'); } catch(e) {}
    try { await sequelize.query('ALTER TABLE Shops ADD COLUMN images JSON;'); } catch(e) {}
    
    await sequelize.sync();
    console.log('Database synced.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

module.exports = {
  sequelize,
  User,
  Shop,
  Request,
  Ping,
  initDB
};
