const { Events, AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('../utils/settingsCache');

module.exports = {
    name: Events.ChannelDelete,
    async execute(channel) {
        if (!channel.guild) return;

        const settings = await getGuildSettings(channel.guild.id);
        const logs = settings?.logs;

        // Log sistemi kapalıysa veya Kanal Logları aktif değilse çık
        if (!logs || !logs.channelId || !logs.channelLog) return;

        const logChannel = channel.guild.channels.cache.get(logs.channelId);
        if (!logChannel) return;

        // Audit Log'dan kimin sildiğini bul
        let executor = null;
        try {
            const fetchedLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelDelete,
            });
            const deletionLog = fetchedLogs.entries.first();

            // Logun hedefi silinen kanalsa ve log yeni ise (5 saniye tolerans)
            if (deletionLog && deletionLog.target.id === channel.id && (Date.now() - deletionLog.createdTimestamp) < 5000) {
                executor = deletionLog.executor;
            }
        } catch (e) {
            console.error('Audit Log hatası:', e);
        }

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Kanal Silindi')
            .setColor('Red')
            .addFields(
                { name: 'Kanal Adı', value: channel.name, inline: true },
                { name: 'Kanal ID', value: channel.id, inline: true },
                { name: 'Silen Kişi', value: executor ? `${executor.tag} (<@${executor.id}>)` : 'Bilinmiyor', inline: false },
                { name: 'Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${channel.guild.name} Log Sistemi`, iconURL: channel.guild.iconURL() });

        logChannel.send({ embeds: [embed] }).catch((err) => console.error('Log gönderilemedi:', err));
    },
};
