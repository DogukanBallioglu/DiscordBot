const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ComponentType, MessageFlags, ChannelType } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../../utils/settingsCache');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('koruma')
        .setDescription('Sunucu koruma sistemlerini yönetir.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        if (!interaction.guild) return interaction.reply({ content: 'Bu komut sadece sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: 'Bu komutu sadece yönetici yetkisine sahip kullanıcılar ve bot sahibi kullanabilir.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Ayarları Getir ve Normalize Et (Eski bool yapısını yeni obje yapısına çevir)
        let settings = await getGuildSettings(interaction.guild.id);
        let guard = settings?.guard || {};

        // Helper: Yapıyı kontrol et ve düzelt
        const normalizeGuard = (val) => {
            if (typeof val === 'boolean') return { enabled: val, exemptRoles: [], exemptChannels: [], warningEnabled: true };
            if (!val) return { enabled: false, exemptRoles: [], exemptChannels: [], warningEnabled: true };
            if (!val.exemptChannels) val.exemptChannels = [];
            if (val.warningEnabled === undefined) val.warningEnabled = true;
            return val;
        };

        guard.badWords = normalizeGuard(guard.badWords);
        guard.links = normalizeGuard(guard.links);
        guard.ads = normalizeGuard(guard.ads);
        guard.spam = normalizeGuard(guard.spam);

        // Helper: Log Ayarlarını Normalize Et
        if (!settings.logs) {
            settings.logs = {
                channelId: null,
                channelLog: false,
                roleLog: false,
                messageLog: false,
                memberLog: false,
                voiceLog: false,
                penaltyLog: false
            };
        }
        let logs = settings.logs;

        // Emojiler
        const EMOJIS = {
            shield: '🛡️',
            check: '✅',
            cross: '❌',
            badWords: '🤬',
            links: '🔗',
            ads: '📢',
            spam: '💬',
            logs: '📜',
            hammer: '🔨'
        };

        // Helper: Logların herhangi biri açık mı?
        const inputsAreActive = (l) => l.channelLog || l.roleLog || l.messageLog || l.memberLog || l.voiceLog || l.penaltyLog;

        // Ana Menü Oluşturucu
        const generateMainMenu = () => {
            const embed = new EmbedBuilder()
                .setTitle(`${EMOJIS.shield} ${interaction.guild.name} Koruma Paneli`)
                .setDescription('Aşağıdaki menüden yönetmek istediğiniz koruma sistemini seçin.')
                .addFields(
                    { name: `${EMOJIS.badWords} Küfür Koruması`, value: guard.badWords.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`, inline: true },
                    { name: `${EMOJIS.links} Link Koruması`, value: guard.links.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`, inline: true },
                    { name: `${EMOJIS.ads} Reklam Koruması`, value: guard.ads.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`, inline: true },
                    { name: `${EMOJIS.spam} Spam Koruması`, value: guard.spam.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`, inline: true },
                    { name: `${EMOJIS.logs} Log Sistemi`, value: logs.channelId ? (inputsAreActive(logs) ? `${EMOJIS.check} Aktif` : '⚠️ Kanal Var, Log Seçilmedi') : `${EMOJIS.cross} Kapalı`, inline: false }
                )
                .setColor('Blue')
                .setFooter({ text: 'Detaylı ayarlar için menüyü kullanın.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('main_select')
                        .setPlaceholder('Bir koruma sistemi seçin...')
                        .addOptions([
                            { label: 'Küfür Koruması', value: 'badWords', emoji: '🤬' },
                            { label: 'Link Koruması', value: 'links', emoji: '🔗' },
                            { label: 'Reklam Koruması', value: 'ads', emoji: '📢' },
                            { label: 'Spam Koruması', value: 'spam', emoji: '💬' },
                            { label: 'Log Ayarları', value: 'logs', emoji: '📜' }
                        ])
                );

            return { embeds: [embed], components: [row] };
        };

        // Log Menü Oluşturucu
        const generateLogMenu = () => {
            const embed = new EmbedBuilder()
                .setTitle(`${EMOJIS.logs} Log Yönetim Paneli`)
                .setDescription(`
Log Sistemi, sunucudaki önemli olayları kayıt altına alır.
**Şu anki Log Kanalı:** ${logs.channelId ? `<#${logs.channelId}>` : `${EMOJIS.cross} Ayarlanmamış`}

**Aktif Loglar:**
• Kanal Olayları: ${logs.channelLog ? EMOJIS.check : EMOJIS.cross}
• Rol Olayları: ${logs.roleLog ? EMOJIS.check : EMOJIS.cross}
• Mesaj Olayları: ${logs.messageLog ? EMOJIS.check : EMOJIS.cross}
• Üye Olayları (Giriş/Çıkış/Ban): ${logs.memberLog ? EMOJIS.check : EMOJIS.cross}
• Ceza Logları (Ban/Kick/Mute): ${logs.penaltyLog ? EMOJIS.check : EMOJIS.cross}
`)
                .setColor(logs.channelId ? 'Green' : 'Orange');

            // 1. Satır: Kanal Seçimi
            const channelRow = new ActionRowBuilder()
                .addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId('log_channel_select')
                        .setPlaceholder('Logların atılacağı kanalı seçin...')
                        .setChannelTypes(ChannelType.GuildText)
                );

            // 2. Satır: Log Türlerini Aç/Kapat (Multi Select)
            const typeRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('log_type_select')
                        .setPlaceholder('Açmak/Kapatmak istediğiniz logları seçin...')
                        .setMinValues(0)
                        .setMaxValues(5)
                        .addOptions([
                            { label: 'Kanal Olayları (Oluşturma/Silme/Güncelleme)', value: 'channelLog', emoji: '📝', default: logs.channelLog },
                            { label: 'Rol Olayları (Oluşturma/Silme/Güncelleme)', value: 'roleLog', emoji: '👮', default: logs.roleLog },
                            { label: 'Mesaj Olayları (Silme/Düzenleme)', value: 'messageLog', emoji: '📨', default: logs.messageLog },
                            { label: 'Üye Olayları (Giriş/Çıkış/Yasaklama)', value: 'memberLog', emoji: '👥', default: logs.memberLog },
                            { label: 'Ceza Logları (Özel Ban Sistemi vb.)', value: 'penaltyLog', emoji: '🔨', default: logs.penaltyLog }
                        ])
                );

            // 3. Satır: Geri Dön
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_main')
                        .setLabel('Geri Dön')
                        .setStyle(ButtonStyle.Secondary)
                );

            return { embeds: [embed], components: [channelRow, typeRow, buttonRow] };
        };

        // Alt Menü (Detay) Oluşturucu (DEĞİŞMEDİ AMA KOD BÜTÜNLÜĞÜ İÇİN NEXT...)
        // ...
        // ... (Bu kısım replace tool ile korunabilir, ama generateLogMenu'dan sonrası için dikkatli olmalıyım)
        // Burada sadece generateLogMenu'yu ve öncesini değiştirdim.
        // Aşağıdaki handler kısmını da güncellemem gerek.

        /* 
           Wait, replace_file_content replaces a *contiguous block*. 
           I cannot easily replace both the menu generation AND the handler in one go if they are far apart properly without overwriting the DetailMenu generator.
           
           I will replace from the 'let logs = settings.logs;' initialization down to end of 'generateLogMenu'. 
           Then I will do a separate second replacement for the handler logic.
        */

        // This tool call covers initialization and generateLogMenu.

        // ... (See ReplacementContent above)

        // Alt Menü (Detay) Oluşturucu
        const generateDetailMenu = (type) => {
            const config = guard[type];
            const titles = {
                badWords: 'Küfür Koruması',
                links: 'Link Koruması',
                ads: 'Reklam Koruması',
                spam: 'Spam Koruması'
            };

            const embed = new EmbedBuilder()
                .setTitle(`🛠️ ${titles[type]} Ayarları`)
                .setDescription(`
**Durum:** ${config.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`}
**Uyarı Mesajı:** ${config.warningEnabled ? `${EMOJIS.check} Açık` : `${EMOJIS.cross} Kapalı`}

Bu korumadan etkilenmeyecek rolleri ve kanalları aşağıdan seçebilirsiniz.`)
                .setColor(config.enabled ? 'Green' : 'Red');

            if (config.exemptRoles && config.exemptRoles.length > 0) {
                embed.addFields({
                    name: `${EMOJIS.shield} Muaf Roller`,
                    value: config.exemptRoles.map(r => `<@&${r}>`).join(', ') || 'Yok'
                });
            } else {
                embed.addFields({ name: `${EMOJIS.shield} Muaf Roller`, value: 'Hiçbir rol muaf değil.' });
            }

            if (config.exemptChannels && config.exemptChannels.length > 0) {
                embed.addFields({
                    name: `${EMOJIS.shield} Muaf Kanallar`,
                    value: config.exemptChannels.map(c => `<#${c}>`).join(', ') || 'Yok'
                });
            } else {
                embed.addFields({ name: `${EMOJIS.shield} Muaf Kanallar`, value: 'Hiçbir kanal muaf değil.' });
            }

            // 1. Satır: Rol Seçimi
            const roleRow = new ActionRowBuilder()
                .addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId(`exempt_roles_${type}`)
                        .setPlaceholder('Muaf tutulacak rolleri seçin (Min: 0, Max: 25)')
                        .setMinValues(0)
                        .setMaxValues(25)
                        .addDefaultRoles(config.exemptRoles || [])
                );

            // 2. Satır: Kanal Seçimi
            const channelRow = new ActionRowBuilder()
                .addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId(`exempt_channels_${type}`)
                        .setPlaceholder('Muaf tutulacak kanalları seçin (Min: 0, Max: 25)')
                        .setChannelTypes(ChannelType.GuildText)
                        .setMinValues(0)
                        .setMaxValues(25)
                        .addDefaultChannels(config.exemptChannels || [])
                );

            // 3. Satır: Kontrol Butonları
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`toggle_${type}`)
                        .setLabel(config.enabled ? 'Korumayı Kapat' : 'Korumayı Aç')
                        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`toggle_warn_${type}`)
                        .setLabel(config.warningEnabled ? 'Uyarıyı Kapat' : 'Uyarıyı Aç')
                        .setStyle(config.warningEnabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
                        .setEmoji('⚠️'),
                    new ButtonBuilder()
                        .setCustomId('back_main')
                        .setLabel('Geri Dön')
                        .setStyle(ButtonStyle.Secondary)
                );

            return { embeds: [embed], components: [roleRow, channelRow, buttonRow] };
        };

        // İlk Mesajı Gönder
        const message = await interaction.editReply(generateMainMenu());

        // Collector
        const collector = message.createMessageComponentCollector({
            time: 300000 // 5 dakika
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Bu menüyü sadece komutu kullanan kişi yönetebilir.', flags: MessageFlags.Ephemeral });
            }

            await i.deferUpdate();

            const id = i.customId;

            // Ana Menü Seçimi
            if (id === 'main_select') {
                const selectedType = i.values[0];
                if (selectedType === 'logs') {
                    await i.editReply(generateLogMenu());
                } else {
                    await i.editReply(generateDetailMenu(selectedType));
                }
            }
            // Log Kanalı Seçimi
            else if (id === 'log_channel_select') {
                logs.channelId = i.values[0];
                await updateGuildSettings(interaction.guild.id, { logs });
                await i.editReply(generateLogMenu());
            }
            // Log Tipi Seçimi (Multi)
            else if (id === 'log_type_select') {
                const selected = i.values;
                // Reset all first
                logs.channelLog = selected.includes('channelLog');
                logs.roleLog = selected.includes('roleLog');
                logs.messageLog = selected.includes('messageLog');
                logs.memberLog = selected.includes('memberLog');
                logs.penaltyLog = selected.includes('penaltyLog');

                await updateGuildSettings(interaction.guild.id, { logs });
                await i.editReply(generateLogMenu());
            }
            // Geri Dön Butonu
            else if (id === 'back_main') {
                await i.editReply(generateMainMenu());
            }
            // Toggle (Aç/Kapat) Butonları
            else if (id.startsWith('toggle_')) {
                // toggle_warn_badWords vs toggle_badWords ayrımı
                if (id.startsWith('toggle_warn_')) {
                    const type = id.replace('toggle_warn_', '');
                    guard[type].warningEnabled = !guard[type].warningEnabled;

                    await updateGuildSettings(interaction.guild.id, { guard });
                    await i.editReply(generateDetailMenu(type));
                } else {
                    const type = id.split('_')[1];
                    guard[type].enabled = !guard[type].enabled;

                    await updateGuildSettings(interaction.guild.id, { guard });
                    await i.editReply(generateDetailMenu(type));
                }
            }
            // Rol Seçimi
            else if (id.startsWith('exempt_roles_')) {
                const type = id.split('_')[2]; // exempt_roles_badWords
                guard[type].exemptRoles = i.values; // Seçilen rol ID'leri

                await updateGuildSettings(interaction.guild.id, { guard });
                await i.editReply(generateDetailMenu(type));
            }
            // Kanal Seçimi
            else if (id.startsWith('exempt_channels_')) {
                const type = id.split('_')[2]; // exempt_channels_badWords
                guard[type].exemptChannels = i.values; // Seçilen kanal ID'leri

                await updateGuildSettings(interaction.guild.id, { guard });
                await i.editReply(generateDetailMenu(type));
            }
        });

        collector.on('end', () => {
            // Interaction süresi bittiğinde mesajı düzenle veya sil
        });
    }
};
