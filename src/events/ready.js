const { ActivityType, Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`${client.user.tag} olarak giriş yapıldı!`);
        await client.handleCommands();

        let i = 0;
        setInterval(() => {
            const activities = [
                { name: `🏆 ${client.guilds.cache.size} Sunucuya Hizmet`, type: ActivityType.Watching },
                { name: '✨ Kaliteli Hizmet', type: ActivityType.Playing },
                { name: `🔥 Aktif ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)} Kullanıcı`, type: ActivityType.Watching }
            ];

            if (i >= activities.length) i = 0;
            client.user.setActivity(activities[i]);
            i++;
        }, 10000);
    },
};
