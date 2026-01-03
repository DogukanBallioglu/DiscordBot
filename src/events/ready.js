const { ActivityType } = require('discord.js');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`${client.user.tag} olarak giriş yapıldı!`);
        await client.handleCommands();

        let i = 0;
        setInterval(() => {
            const activities = [
                { name: `${client.guilds.cache.size} Sunucuya Hizmet`, type: ActivityType.Watching },
                { name: 'Kaliteli Hizmet', type: ActivityType.Playing }
            ];

            if (i >= activities.length) i = 0;
            client.user.setActivity(activities[i]);
            i++;
        }, 10000);
    },
};
