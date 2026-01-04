const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "../serviceAccountKey.json");

let serviceAccount;

// 1. Öncelik: Environment Variable (Railway vb. için)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (error) {
        console.error("❌ HATA: FIREBASE_SERVICE_ACCOUNT environment değişkeni hatalı formatta!", error);
    }
}
// 2. Öncelik: Yerel Dosya (Bilgisayarın için)
else if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = require(serviceAccountPath);
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log("🔥 Firebase veritabanı bağlantısı başarılı!");
    } catch (error) {
        console.error("❌ HATA: Firebase bağlantısı başlatılamadı:", error);
    }
} else {
    console.warn("⚠️ UYARI: Firebase kimlik bilgileri bulunamadı! (Ne serviceAccountKey.json dosyası ne de FIREBASE_SERVICE_ACCOUNT var)");
}

module.exports = { db, admin };