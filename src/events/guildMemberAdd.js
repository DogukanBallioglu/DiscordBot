const { Events, EmbedBuilder } = require('discord.js');
const { db } = require('../firebase');
const { getGuildSettings } = require('../utils/settingsCache');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // --- OTOROL İŞLEMİ ---
        // Botun kendisine rol vermeye çalışmasını engelleyelim (isteğe bağlı)
        // Otorol botlara da verilebilir, bu kontrolü kaldırabiliriz veya tutabiliriz. Kullanıcı kodu böyleydi.
        if (!member.user.bot) {
            try {
                const doc = await db.collection('guilds').doc(member.guild.id).get();
                if (doc.exists) {
                    const data = doc.data();
                    const autoRoleId = data.autoRoleId;
                    if (autoRoleId) {
                        const role = member.guild.roles.cache.get(autoRoleId);
                        if (role) {
                            await member.roles.add(role);
                            console.log(`${member.user.tag} kullanıcısına ${role.name} rolü verildi.`);
                        } else {
                            console.warn(`Otorol ayarlı (${autoRoleId}) fakat sunucuda bu rol bulunamadı.`);
                        }
                    }
                }
            } catch (error) {
                console.error(`Otorol verilirken hata oluştu:`, error);
            }
        }

        // --- ÜYE LOG İŞLEMİ ---
        try {
            const settings = await getGuildSettings(member.guild.id);
            const logs = settings?.logs;

            if (logs && logs.channelId && logs.memberLog) {
                const logChannel = member.guild.channels.cache.get(logs.channelId);
                if (logChannel) {
                    // Hesap Oluşturulma Tarihi
                    const createdAt = Math.floor(member.user.createdTimestamp / 1000);

                    const embed = new EmbedBuilder()
                        .setTitle('📥 Sunucuya Yeni Üye Katıldı')
                        .setColor('Green')
                        .setThumbnail(member.user.displayAvatarURL())
                        .addFields(
                            { name: 'Kullanıcı', value: `${member.user.tag} (<@${member.id}>)`, inline: false },
                            { name: 'Hesap Oluşturulma', value: `<t:${createdAt}:R>`, inline: true },
                            { name: 'Katılma Tarihi', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: `${member.guild.name} Log Sistemi`, iconURL: member.guild.iconURL() });

                    logChannel.send({ embeds: [embed] }).catch(() => { });
                }
            }
        } catch (e) {
            console.error('Member Log hatası:', e);
        }
    },
};
