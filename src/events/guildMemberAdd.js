const { Events } = require('discord.js');
const { db } = require('../firebase');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Botun kendisine rol vermeye çalışmasını engelleyelim (isteğe bağlı)
        if (member.user.bot) return;

        try {
            const doc = await db.collection('guilds').doc(member.guild.id).get();

            if (!doc.exists) return; // Sunucu verisi yoksa işlem yapma

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
        } catch (error) {
            console.error(`Otorol verilirken hata oluştu:`, error);
        }
    },
};
