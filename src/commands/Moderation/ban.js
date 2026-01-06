const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../../utils/settingsCache');
const { db } = require('../../firebase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bir kullanıcıyı sunucudan yasaklar.')
        .addUserOption(option =>
            option.setName('kullanıcı')
                .setDescription('Yasaklanacak kullanıcı')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('sebep')
                .setDescription('Yasaklama sebebi')
                .setRequired(false)),
    // .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers), // Herkes görebilsin, yetki kontrolü içeride yapılıyor

    async execute(interaction) {
        // Hedef kullanıcı ve sebep
        const targetUser = interaction.options.getUser('kullanıcı');
        const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';

        // Helper: Hata Embed'i
        const errorEmbed = (msg) => new EmbedBuilder().setColor('Red').setDescription(msg);

        // Kendini banlamaya çalışma kontrolü
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ embeds: [errorEmbed('❌ Kendini yasaklayamazsın!')], ephemeral: true });
        }

        const member = interaction.guild.members.cache.get(targetUser.id);

        // 1. Yetki Kontrolü (Admin her zaman kullanabilir)
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {

            // Veritabanından ayarları çek
            const settings = await getGuildSettings(interaction.guild.id);
            const banSettings = settings?.moderation?.ban;

            // Eğer ayar hiç yapılmamışsa veya yetkili rol kullanıcıda yoksa
            if (!banSettings || !banSettings.authorizedRole || !interaction.member.roles.cache.has(banSettings.authorizedRole)) {
                return interaction.reply({ embeds: [errorEmbed('❌ Bu komutu kullanmak için gerekli yetkiye sahip değilsiniz.')], ephemeral: true });
            }

            // Limit ve Süre Kontrolü (Limitsiz ayarlanmışsa 0 veya undefined olabilir)
            if (banSettings.limit > 0) {
                // Kullanıcının kişisel ban verilerini çek (db'den)
                // Yapı: users/{userId}/moderation_stats/{guildId} -> { banCount: 0, lastBanReset: timestamp }

                const statsRef = db.collection('users').doc(interaction.user.id).collection('moderation_stats').doc(interaction.guild.id);
                const statsDoc = await statsRef.get();
                let stats = statsDoc.exists ? statsDoc.data() : { banCount: 0, lastBanReset: Date.now() };

                // Zaman aşımı kontrolü (Sıfırlama günü gelmiş mi?)
                if (banSettings.resetIntervalDays > 0) {
                    const now = Date.now();
                    const lastReset = stats.lastBanReset || now;
                    const daysPassed = (now - lastReset) / (1000 * 60 * 60 * 24);

                    if (daysPassed >= banSettings.resetIntervalDays) {
                        // Süre dolmuş, hakkı sıfırla
                        stats.banCount = 0;
                        stats.lastBanReset = now;
                    }
                }

                // Limit kontrol
                if (stats.banCount >= banSettings.limit) {
                    return interaction.reply({
                        embeds: [errorEmbed(`🛑 Ban limitinizi doldurdunuz! (**${banSettings.limit}** hak).\nLütfen sürenin dolmasını bekleyin veya yöneticilerden ek hak isteyin.`)],
                        ephemeral: true
                    });
                }

                // Hakkı düş (Arttır) - İşlem başarılı olursa kaydedeceğiz
                // Şimdilik işlemi devam ettiriyoruz, en son başarılı olursa db güncelleyeceğiz.
                // Not: Asenkron sorunları olmasın diye burada bekletiyoruz.
                stats.banCount = (stats.banCount || 0) + 1;
                await statsRef.set(stats, { merge: true });
            }
        }

        // 2. Yasaklama İşlemi
        if (!member) {
            return interaction.reply({ embeds: [errorEmbed('❌ Kullanıcı sunucuda bulunamadı veya erişilemiyor.')], ephemeral: true });
        }

        if (!member.bannable) {
            return interaction.reply({ embeds: [errorEmbed('❌ Bu kullanıcıyı yasaklayamam. (Yetkim yetmiyor veya rolü benden yüksek)')], ephemeral: true });
        }

        if (interaction.user.id === member.id) {
            return interaction.reply({ embeds: [errorEmbed('❌ Kendini yasaklayamazsın.')], ephemeral: true });
        }

        try {
            await member.ban({ reason: `${interaction.user.tag} tarafından: ${reason}` });

            // Ban Hakkı Bilgisi Oluştur
            let limitMsg = "Yönetici";
            let footerText = `${interaction.guild.name} Güvenlik`;

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                const settings = await getGuildSettings(interaction.guild.id);
                const banSettings = settings?.moderation?.ban;

                if (banSettings && banSettings.limit > 0) {
                    const statsRef = db.collection('users').doc(interaction.user.id).collection('moderation_stats').doc(interaction.guild.id);
                    const statsDoc = await statsRef.get();
                    const stats = statsDoc.data(); // Güncellenmiş hali
                    limitMsg = `${stats.banCount}/${banSettings.limit}`;

                    // Footer için hesaplama
                    const remaining = Math.max(0, banSettings.limit - stats.banCount);
                    let timeStr = "";

                    if (banSettings.resetIntervalDays > 0) {
                        const nextReset = stats.lastBanReset + (banSettings.resetIntervalDays * 24 * 60 * 60 * 1000);
                        const diff = nextReset - Date.now();
                        if (diff > 0) {
                            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                            const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                            timeStr = ` | Sıfırlanma: ${d}g ${h}s`;
                        } else {
                            timeStr = " | Sıfırlanma: Yakında";
                        }
                    }
                    footerText = `Kalan Hak: ${remaining}${timeStr}`;
                } else {
                    footerText = "Kalan Hak: Sınırsız";
                }
            } else {
                footerText = "Yetkili: Sınırsız Erişim";
            }

            const successEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('🔨 Bir Kullanıcı Yasaklandı')
                .setDescription(`**${targetUser.tag}** sunucudan yasaklandı.`)
                .addFields(
                    { name: 'Sebep', value: reason, inline: true },
                    { name: 'Yetkili', value: interaction.user.tag, inline: true },
                    { name: 'Kullanım', value: limitMsg, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: footerText, iconURL: interaction.user.displayAvatarURL() });

            await interaction.reply({ embeds: [successEmbed] });

            // --- LOGLAMA ---
            const settings = await getGuildSettings(interaction.guild.id);
            const logs = settings?.logs;

            if (logs && logs.channelId && logs.penaltyLog) {
                const logChannel = interaction.guild.channels.cache.get(logs.channelId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🔨 Ban İşlemi')
                        .setColor('DarkRed')
                        .setThumbnail(targetUser.displayAvatarURL())
                        .addFields(
                            { name: 'Yasaklanan', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: false },
                            { name: 'Sebep', value: reason, inline: false },
                            { name: 'Yetkili', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                            { name: 'Kullanılan Hak', value: limitMsg, inline: true },
                            { name: 'Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                        )
                        .setTimestamp()
                        .setFooter({ text: `${interaction.guild.name} Ceza Log`, iconURL: interaction.guild.iconURL() });

                    logChannel.send({ embeds: [logEmbed] }).catch(() => { });
                }
            }

        } catch (error) {
            console.error(error);
            return interaction.reply({ embeds: [errorEmbed('❌ Yasaklama işlemi sırasında bir hata oluştu.')], ephemeral: true });
        }
    }
};
