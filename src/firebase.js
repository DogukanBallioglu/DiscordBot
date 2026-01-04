const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "../serviceAccountKey.json");

let db;

if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    db = admin.firestore();
    console.log("🔥 Firebase veritabanı bağlantısı başarılı!");
} else {
    console.warn("⚠️ UYARI: serviceAccountKey.json dosyası bulunamadı! Firebase bağlanamadı.");
}

module.exports = { db, admin };