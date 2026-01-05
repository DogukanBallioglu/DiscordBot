const { db } = require('../firebase');

const settingsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 dakika

async function getGuildSettings(guildId) {
    if (settingsCache.has(guildId)) {
        const { data, timestamp } = settingsCache.get(guildId);
        if (Date.now() - timestamp < CACHE_TTL) {
            return data;
        }
    }

    try {
        const doc = await db.collection('guildSettings').doc(guildId).get();
        let data = {};
        if (doc.exists) {
            data = doc.data();
        }

        // Varsayılan ayarlar
        const defaultSettings = {
            guard: {
                badWords: { enabled: false, exemptRoles: [] },
                links: { enabled: false, exemptRoles: [] },
                ads: { enabled: false, exemptRoles: [] },
                spam: { enabled: false, exemptRoles: [] }
            },
            rank: {
                enabled: false,
                minXp: 15,
                maxXp: 25,
                cooldown: 60,
                announceMessage: true,
                announceChannel: null,
                roleRewards: [] // [{ level: 1, roleId: "..." }]
            }
        };

        const mergedData = { ...defaultSettings, ...data, guard: { ...defaultSettings.guard, ...(data.guard || {}) } };

        settingsCache.set(guildId, {
            data: mergedData,
            timestamp: Date.now()
        });

        return mergedData;
    } catch (error) {
        console.error('Firebase ayarları alınırken hata:', error);
        return null;
    }
}

async function updateGuildSettings(guildId, newSettings) {
    try {
        await db.collection('guildSettings').doc(guildId).set(newSettings, { merge: true });

        // Cache'i güncelle
        const current = settingsCache.get(guildId) || { data: {} };
        settingsCache.set(guildId, {
            data: { ...current.data, ...newSettings },
            timestamp: Date.now()
        });

        return true;
    } catch (error) {
        console.error('Firebase ayarları güncellenirken hata:', error);
        return false;
    }
}

module.exports = {
    getGuildSettings,
    updateGuildSettings
};
