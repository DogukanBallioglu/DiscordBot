const { Events, AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('../utils/settingsCache');

module.exports = {
    name: Events.GuildRoleUpdate,
    async execute(oldRole, newRole) {
        if (!newRole.guild) return;

        const settings = await getGuildSettings(newRole.guild.id);
        const logs = settings?.logs;

        if (!logs || !logs.channelId || !logs.roleLog) return;

        const logChannel = newRole.guild.channels.cache.get(logs.channelId);
        if (!logChannel) return;

        // İsim veya renk değişmediyse loglama (gereksiz spam önleme)
        if (oldRole.name === newRole.name && oldRole.color === newRole.color) return;

        let changes = [];
        if (oldRole.name !== newRole.name) changes.push(`**İsim:** ${oldRole.name} -> ${newRole.name}`);
        if (oldRole.color !== newRole.color) changes.push(`**Renk:** ${oldRole.hexColor} -> ${newRole.hexColor}`);

        let executor = null;
        try {
            const fetchedLogs = await newRole.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.RoleUpdate,
            });
            const roleLog = fetchedLogs.entries.first();

            if (roleLog && roleLog.target.id === newRole.id && (Date.now() - roleLog.createdTimestamp) < 5000) {
                executor = roleLog.executor;
            }
        } catch (e) {
            console.error('Audit Log hatası:', e);
        }

        const embed = new EmbedBuilder()
            .setTitle('👮 Rol Güncellendi')
            .setColor('Yellow')
            .addFields(
                { name: 'Rol', value: `<@&${newRole.id}>`, inline: true },
                { name: 'Değişiklikler', value: changes.join('\n') || 'Bilinmeyen değişiklik', inline: false },
                { name: 'Güncelleyen', value: executor ? `${executor.tag} (<@${executor.id}>)` : 'Bilinmiyor', inline: false },
                { name: 'Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${newRole.guild.name} Log Sistemi`, iconURL: newRole.guild.iconURL() });

        logChannel.send({ embeds: [embed] }).catch(() => { });
    },
};
