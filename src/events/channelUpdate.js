const { Events, AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('../utils/settingsCache');

module.exports = {
    name: Events.ChannelUpdate,
    async execute(oldChannel, newChannel) {
        if (!newChannel.guild) return;

        const settings = await getGuildSettings(newChannel.guild.id);
        const logs = settings?.logs;

        if (!logs || !logs.channelId || !logs.channelLog) return;

        const logChannel = newChannel.guild.channels.cache.get(logs.channelId);
        if (!logChannel) return;

        // Sadece isim veya konu değişikliklerini loglayalım, her şeyi değil
        if (oldChannel.name === newChannel.name && oldChannel.topic === newChannel.topic) return;

        const embed = new EmbedBuilder()
            .setTitle('📝 Kanal Güncellendi')
            .setColor('Yellow')
            .addFields(
                { name: 'Kanal', value: `<#${newChannel.id}>`, inline: true },
                { name: 'Eski İsim', value: oldChannel.name, inline: true },
                { name: 'Yeni İsim', value: newChannel.name, inline: true },
                { name: 'Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${newChannel.guild.name} Log Sistemi`, iconURL: newChannel.guild.iconURL() });

        logChannel.send({ embeds: [embed] }).catch(() => { });
    },
};
