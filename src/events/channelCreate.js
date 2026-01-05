const { Events, AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('../utils/settingsCache');

module.exports = {
    name: Events.ChannelCreate,
    async execute(channel) {
        if (!channel.guild) return;

        const settings = await getGuildSettings(channel.guild.id);
        const logs = settings?.logs;

        if (!logs || !logs.channelId || !logs.channelLog) return;

        const logChannel = channel.guild.channels.cache.get(logs.channelId);
        if (!logChannel) return;

        let executor = null;
        try {
            const fetchedLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelCreate,
            });
            const creationLog = fetchedLogs.entries.first();

            if (creationLog && creationLog.target.id === channel.id && (Date.now() - creationLog.createdTimestamp) < 5000) {
                executor = creationLog.executor;
            }
        } catch (e) {
            console.error('Audit Log hatası:', e);
        }

        const embed = new EmbedBuilder()
            .setTitle('📝 Yeni Kanal Oluşturuldu')
            .setColor('Green')
            .addFields(
                { name: 'Kanal Adı', value: `<#${channel.id}> (${channel.name})`, inline: true },
                { name: 'Kanal ID', value: channel.id, inline: true },
                { name: 'Oluşturan Kişi', value: executor ? `${executor.tag} (<@${executor.id}>)` : 'Bilinmiyor', inline: false },
                { name: 'Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${channel.guild.name} Log Sistemi`, iconURL: channel.guild.iconURL() });

        logChannel.send({ embeds: [embed] }).catch(() => { });
    },
};
