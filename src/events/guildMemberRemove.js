const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { getGuildSettings } = require('../utils/settingsCache');
const { db } = require('../firebase');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        // --- LOG MEMBER LEAVE TO FIREBASE ---
        try {
            const guildRef = db.collection('guilds').doc(member.guild.id);
            const doc = await guildRef.get();
            let leftMembers = [];

            if (doc.exists && doc.data().leftMembers) {
                leftMembers = doc.data().leftMembers;
            }

            const userTag = member.user ? member.user.tag : 'Bilinmeyen Kullanıcı';
            console.log(`[LOG] Saving left member to Firebase: ${userTag} (${member.id})`);

            leftMembers.unshift({
                id: member.id,
                tag: userTag,
                joinedAt: member.joinedTimestamp,
                leftAt: Date.now()
            });

            // Son 20 kişiyi tutalım
            if (leftMembers.length > 20) leftMembers = leftMembers.slice(0, 20);

            await guildRef.set({ leftMembers }, { merge: true });
        } catch (err) {
            console.error('Leave log write error:', err);
        }
        // ---------------------------------

        try {
            const settings = await getGuildSettings(member.guild.id);
            const logs = settings?.logs;

            if (!logs || !logs.channelId || !logs.memberLog) return;

            const logChannel = member.guild.channels.cache.get(logs.channelId);
            if (!logChannel) return;

            // Atıldı mı yoksa kendi mi çıktı kontrolü (Audit Log)
            let action = 'Sunucudan Ayrıldı';
            let executor = null;

            try {
                const fetchedLogs = await member.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.MemberKick,
                });
                const kickLog = fetchedLogs.entries.first();

                if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 5000) {
                    action = 'Sunucudan Atıldı (Kick)';
                    executor = kickLog.executor;
                } else {
                    // Ban kontrolü
                    const banLogs = await member.guild.fetchAuditLogs({
                        limit: 1,
                        type: AuditLogEvent.MemberBanAdd,
                    });
                    const banLog = banLogs.entries.first();
                    if (banLog && banLog.target.id === member.id && (Date.now() - banLog.createdTimestamp) < 5000) {
                        action = 'Sunucudan Yasaklandı (Ban)';
                        executor = banLog.executor;
                    }
                }
            } catch (e) {
                console.error('Audit Log hatası:', e);
            }

            const embed = new EmbedBuilder()
                .setTitle('📤 Bir Üye Ayrıldı')
                .setColor('Red')
                .setThumbnail(member.user.displayAvatarURL())
                .addFields(
                    { name: 'Kullanıcı', value: `${member.user.tag} (<@${member.id}>)`, inline: false },
                    { name: 'Durum', value: action, inline: true },
                    { name: 'İşlemi Yapan', value: executor ? `${executor.tag} (<@${executor.id}>)` : 'Kendisi / Bilinmiyor', inline: true },
                    { name: 'Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${member.guild.name} Log Sistemi`, iconURL: member.guild.iconURL() });

            logChannel.send({ embeds: [embed] }).catch(() => { });
        } catch (e) {
            console.error('Member Remove Log hatası:', e);
        }
    },
};
