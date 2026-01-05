const { ActivityType, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`${client.user.tag} olarak giriş yapıldı!`);
        await client.handleCommands();

        const statusFile = path.join(__dirname, '../data/statusConfig.json');

        let i = 0;
        // İlk açılışta hemen bir durum ayarla
        updatePresence(client, i, statusFile);

        setInterval(() => {
            i = updatePresence(client, i, statusFile);
        }, 10000);
    },
};

function updatePresence(client, index, filePath) {
    try {
        if (!fs.existsSync(filePath)) return index;

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const { status, activities } = data;

        if (!activities || activities.length === 0) return index;

        if (index >= activities.length) index = 0;
        const activityConfig = activities[index];

        let text = activityConfig.text
            .replace('{serverCount}', client.guilds.cache.size)
            .replace('{memberCount}', client.guilds.cache.reduce((a, g) => a + g.memberCount, 0));

        client.user.setPresence({
            activities: [{ name: text, type: activityConfig.type }],
            status: status || 'online'
        });

        return index + 1;
    } catch (error) {
        console.error('Status Error:', error);
        return index;
    }
}
