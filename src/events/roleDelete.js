const { Events, AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('../utils/settingsCache');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: Events.GuildRoleDelete,
    async execute(role) {
        if (!role.guild) return;

        const emojis = {
            police: '👮'
        };

        const settings = await getGuildSettings(role.guild.id);
        const logs = settings?.logs;

        if (!logs || !logs.channelId || !logs.roleLog) return;

        const logChannel = role.guild.channels.cache.get(logs.channelId);
        if (!logChannel) return;

        let executor = null;
        try {
            const fetchedLogs = await role.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.RoleDelete,
            });
            const roleLog = fetchedLogs.entries.first();

            if (roleLog && roleLog.target.id === role.id && (Date.now() - roleLog.createdTimestamp) < 5000) {
                executor = roleLog.executor;
            }
        } catch (e) {
            console.error('Audit Log hatası:', e);
        }

        const embed = new EmbedBuilder()
            .setTitle(`${emojis.police || '👮'} Rol Silindi`)
            .setColor('Red')
            .addFields(
                { name: 'Rol Adı', value: role.name, inline: true },
                { name: 'Rol ID', value: role.id, inline: true },
                { name: 'Silen Kişi', value: executor ? `${executor.tag} (<@${executor.id}>)` : 'Bilinmiyor', inline: false },
                { name: 'Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${role.guild.name} Log Sistemi`, iconURL: role.guild.iconURL() });

        logChannel.send({ embeds: [embed] }).catch(() => { });
    },
};
