const { permissions, PermissionsBitField } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('./settingsCache');
const { db, admin } = require('../firebase');

// Kullanıcı XP'sini getiren fonksiyon (Cache + DB)
// Performans için basit bir in-memory cache kullanabiliriz
const xpCache = new Map(); // key: guildId-userId, value: { xp, level, lastXpTime }

const getRankData = async (guildId, userId) => {
    const key = `${guildId}-${userId}`;
    if (xpCache.has(key)) return xpCache.get(key);

    const doc = await db.collection('guilds').doc(guildId).collection('users').doc(userId).get();
    let data = { xp: 0, level: 1, lastXpTime: 0 };
    if (doc.exists) {
        data = doc.data();
    }
    xpCache.set(key, data);
    return data;
};

const processedXP = async (message, rankConfig) => {
    if (!rankConfig.enabled) return;
    if (message.author.bot) return;

    const userId = message.author.id;
    const guildId = message.guild.id;
    const key = `${guildId}-${userId}`;

    let userData = await getRankData(guildId, userId);

    // Cooldown Kontrolü
    const now = Date.now();
    const cooldownMs = rankConfig.cooldown * 1000;

    // lastXpTime varsa ve cooldown henüz dolmadıysa geri dön
    if (userData.lastXpTime && (now - userData.lastXpTime) < cooldownMs) {
        return;
    }

    // Rastgele XP Hesaplama
    const xpGain = Math.floor(Math.random() * (rankConfig.maxXp - rankConfig.minXp + 1)) + rankConfig.minXp;

    userData.xp += xpGain;
    userData.lastXpTime = now;

    // Level Hesaplama Formülü: 5 * (lvl ^ 2) + 50 * lvl + 100
    // Basit bir artan zorluk eğrisi
    const currentLevelXp = 5 * Math.pow(userData.level, 2) + 50 * userData.level + 100;

    let leveledUp = false;
    let oldLevel = userData.level;

    if (userData.xp >= currentLevelXp) {
        userData.level++;
        userData.xp -= currentLevelXp; // XP'yi sıfırlama, kalanını aktar (Tier sistemi gibi)
        // Alternatif: Toplam XP tutulur, formül toplam XP'ye göre çalışır. 
        // Ancak bu sistemde level başına XP barını doldurma mantığı daha yaygındır.
        // Ama genelde toplam XP artar, level da artar. 
        // Düzeltme: Genelde toplam XP'den level hesaplanmaz, level için gereken XP'ye ulaşınca level artar ve bar sıfırlanır ya da toplam XP hep artar.
        // Basitlik için: XP seviye sınırını geçince level artar, XP birikmeye devam eder (total xp mantığı değil, current level xp mantığı).
        // Yani user 100 XP'ye ulaşınca level 2 olur ve XP'si 0'dan (veya artandan) tekrar başlar.
        leveledUp = true;
    }

    // Cache Güncelle
    xpCache.set(key, userData);

    // DB Güncelle (Fire-and-forget, await etmeye gerek yok performansı düşürmemek için, ama hata yönetimi için catch ekle)
    db.collection('guilds').doc(guildId).collection('users').doc(userId).set(userData, { merge: true }).catch(console.error);

    if (leveledUp) {
        // 1. Duyuru Mesajı
        if (rankConfig.announceMessage) {
            let channel = message.channel;
            if (rankConfig.announceChannel) {
                const targetChannel = message.guild.channels.cache.get(rankConfig.announceChannel);
                if (targetChannel) channel = targetChannel;
            }

            // Güzel bir level up mesajı
            channel.send(`🎉 Tebrikler <@${userId}>! **Level ${userData.level}** oldun! 🚀`).catch(() => { });
        }

        // 2. Rol Ödülleri
        if (rankConfig.roleRewards && rankConfig.roleRewards.length > 0) {
            // Bu level için bir ödül var mı?
            const reward = rankConfig.roleRewards.find(r => r.level === userData.level);
            if (reward) {
                const role = message.guild.roles.cache.get(reward.roleId);
                if (role) {
                    message.member.roles.add(role).catch(err => console.error("Rol verilemedi:", err));
                    message.channel.send(`🎁 **Ödül Kazandın:** <@&${reward.roleId}> rolü verildi!`).catch(() => { });
                }
            }
        }
    }
};

const updateUserRank = async (guildId, userId, newData) => {
    const key = `${guildId}-${userId}`;
    const currentData = await getRankData(guildId, userId);
    const mergedData = { ...currentData, ...newData };

    xpCache.set(key, mergedData);
    await db.collection('guilds').doc(guildId).collection('users').doc(userId).set(mergedData, { merge: true });

    return mergedData;
};

const getLeaderboard = async (guildId, limit = 10) => {
    try {
        const snapshot = await db.collection('guilds').doc(guildId).collection('users')
            .orderBy('level', 'desc')
            .orderBy('xp', 'desc')
            .limit(limit)
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Leaderboard fetch error:', error);
        return [];
    }
};

module.exports = { processedXP, getRankData, updateUserRank, getLeaderboard };
