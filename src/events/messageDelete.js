const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { getGuildSettings } = require('../utils/settingsCache');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild || message.author?.bot) return;

        try {
            const settings = await getGuildSettings(message.guild.id);
            const logs = settings?.logs;

            if (!logs || !logs.channelId || !logs.messageLog) return;

            const logChannel = message.guild.channels.cache.get(logs.channelId);
            if (!logChannel) return;

            // Audit Log kontrolü (Mesajı başkası mı sildi?)
            let executor = null;
            try {
                const fetchedLogs = await message.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.MessageDelete,
                });
                const deletionLog = fetchedLogs.entries.first();

                // Eğer son 5 saniye içinde silindiyse ve hedef mesajın sahibi değilse ve kanal aynıysa
                if (deletionLog && deletionLog.target.id === message.author.id && deletionLog.extra.channel.id === message.channel.id && (Date.now() - deletionLog.createdTimestamp) < 5000) {
                    executor = deletionLog.executor;
                }
            } catch (e) { }

            const content = message.content ? (message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content) : '*Metin içeriği yok (Resim/Embed olabilir)*';

            // Eğer varsa resimlerin linklerini al
            const attachments = message.attachments.size > 0 ? message.attachments.map(a => a.proxyURL).join('\n') : 'Yok';

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Bir Mesaj Silindi')
                .setColor('Red')
                .addFields(
                    { name: 'Mesaj Sahibi', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
                    { name: 'Kanal', value: `<#${message.channel.id}>`, inline: true },
                    { name: 'Silen Kişi', value: executor ? `${executor.tag} (<@${executor.id}>)` : 'Kendisi / Bilinmiyor', inline: true },
                    { name: 'Mesaj İçeriği', value: content, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${message.guild.name} Log Sistemi`, iconURL: message.guild.iconURL() });

            if (attachments !== 'Yok') {
                embed.addFields({ name: 'Ekler (Resim/Dosya)', value: attachments, inline: false });
            }

            logChannel.send({ embeds: [embed] }).catch(() => { });
        } catch (e) {
            console.error('Message Delete Log hatası:', e);
        }
    },
};
