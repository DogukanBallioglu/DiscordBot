const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionsBitField,
    ComponentType,
    ChannelType,
    MessageFlags
} = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../../utils/settingsCache');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranksystem')
        .setDescription('Gelişmiş seviye sistemini yapılandırır.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        if (!interaction.guild) return;

        // Yetki Kontrolü (Admin veya Kurucu)
        // Yetki Kontrolü (Sunucu Sahibi veya Bot Sahibi)
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: 'Bu komutu sadece yönetici yetkisine sahip kullanıcılar ve bot sahibi kullanabilir.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Ayarları Çek
        let settings = await getGuildSettings(interaction.guild.id);
        let rankConfig = settings?.rank || {
            enabled: false, minXp: 15, maxXp: 25, cooldown: 60, announceMessage: true, announceChannel: null, roleRewards: []
        };

        // --- GÖRSEL OLUŞTURUCULAR ---

        const getStatusEmoji = (status) => status ? '✅' : '❌';

        const generateEmbed = () => {
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${interaction.guild.name} Rank Sistemi`)
                .setDescription('Sunucunuzdaki seviye sistemini buradan detaylıca yönetebilirsiniz.')
                .setColor('Gold')
                .addFields(
                    { name: 'Durum', value: rankConfig.enabled ? '✅ **Aktif**' : '❌ **Kapalı**', inline: true },
                    { name: 'XP Oranı (Min-Max)', value: `${rankConfig.minXp} - ${rankConfig.maxXp}`, inline: true },
                    { name: 'Cooldown (Saniye)', value: `${rankConfig.cooldown}sn`, inline: true },
                    { name: 'Level Duyurusu', value: rankConfig.announceMessage ? '✅ Açık' : '❌ Kapalı', inline: true },
                    { name: 'Duyuru Kanalı', value: rankConfig.announceChannel ? `<#${rankConfig.announceChannel}>` : '💬 Mesajın Yazıldığı Kanal', inline: true }
                );

            // Rol Ödülleri Listesi
            let rolesText = "Henüz bir ödül ayarlanmamış.";
            if (rankConfig.roleRewards && rankConfig.roleRewards.length > 0) {
                // Level'a göre sırala
                const sortedRewards = [...rankConfig.roleRewards].sort((a, b) => a.level - b.level);
                rolesText = sortedRewards.map(r => `**Level ${r.level}:** <@&${r.roleId}>`).join('\n');
            }
            embed.addFields({ name: '🎁 Rol Ödülleri', value: rolesText });

            return embed;
        };

        const generateComponents = () => {
            const rows = [];

            // 1. Satır: Ana Kontroller
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('toggle_system')
                    .setLabel(rankConfig.enabled ? 'Sistemi Kapat' : 'Sistemi Aç')
                    .setStyle(rankConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('edit_xp')
                    .setLabel('XP Ayarları')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚡'),
                new ButtonBuilder()
                    .setCustomId('toggle_announce')
                    .setLabel(`Duyuru: ${rankConfig.announceMessage ? 'Açık' : 'Kapalı'}`)
                    .setStyle(ButtonStyle.Secondary)
            ));

            // 2. Satır: Duyuru Kanalı Seçimi
            rows.push(new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('select_channel')
                    .setPlaceholder('Level duyurusu için özel kanal seç (Opsiyonel)')
                    .setChannelTypes(ChannelType.GuildText)
                    .setMinValues(0) // 0 seçilirse kaldırmak demek
                    .setMaxValues(1)
                    .setDisabled(!rankConfig.announceMessage)
            ));

            // 3. Satır: Mevcut Ödülleri Düzenleme Menüsü (Varsa)
            if (rankConfig.roleRewards && rankConfig.roleRewards.length > 0) {
                const rewardOptions = rankConfig.roleRewards
                    .sort((a, b) => a.level - b.level)
                    .slice(0, 25) // Select menu max 25 opsiyon
                    .map(r => ({
                        label: `Level ${r.level} Ödülü`,
                        description: `Level ${r.level} olana verilen rolü düzenle/sil`,
                        value: `manage_reward_${r.level}`,
                        emoji: '🎁'
                    }));

                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('manage_rewards')
                        .setPlaceholder('Düzenlemek veya silmek için bir ödül seçin...')
                        .addOptions(rewardOptions)
                ));
            }

            // 4. Satır: Rol Ödülü Ekleme Butonu
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('add_reward_start')
                    .setLabel('Yeni Rol Ödülü Ekle')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('➕'),
                new ButtonBuilder()
                    .setCustomId('clear_rewards')
                    .setLabel('Tüm Ödülleri Sıfırla')
                    .setStyle(ButtonStyle.Danger)
            ));

            return rows;
        };

        // --- İLK MESAJ ---
        const message = await interaction.editReply({
            embeds: [generateEmbed()],
            components: generateComponents()
        });

        // --- COLLECTOR ---
        const collector = message.createMessageComponentCollector({
            time: 600000 // 10 dakika
        });

        collector.on('collect', async (i) => {
            // Sadece komutu kullanan yönetebilir
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Bu menüyü sadece komutu çalıştıran yönetici kullanabilir.', flags: MessageFlags.Ephemeral });
            }

            const id = i.customId;

            // 1. SİSTEMİ AÇ/KAPAT
            if (id === 'toggle_system') {
                rankConfig.enabled = !rankConfig.enabled;
                await updateGuildSettings(interaction.guild.id, { rank: rankConfig });
                await i.update({ embeds: [generateEmbed()], components: generateComponents() });
            }

            // 2. DUYURU AÇ/KAPAT
            else if (id === 'toggle_announce') {
                rankConfig.announceMessage = !rankConfig.announceMessage;
                await updateGuildSettings(interaction.guild.id, { rank: rankConfig });
                await i.update({ embeds: [generateEmbed()], components: generateComponents() });
            }

            // 3. XP AYARLARI (MODAL)
            else if (id === 'edit_xp') {
                const modal = new ModalBuilder()
                    .setCustomId('xp_modal')
                    .setTitle('XP ve Cooldown Ayarları');

                const minXpInput = new TextInputBuilder()
                    .setCustomId('min_xp')
                    .setLabel('Mesaj Başına Min XP')
                    .setStyle(TextInputStyle.Short)
                    .setValue(rankConfig.minXp.toString())
                    .setRequired(true);

                const maxXpInput = new TextInputBuilder()
                    .setCustomId('max_xp')
                    .setLabel('Mesaj Başına Max XP')
                    .setStyle(TextInputStyle.Short)
                    .setValue(rankConfig.maxXp.toString())
                    .setRequired(true);

                const coolInput = new TextInputBuilder()
                    .setCustomId('cooldown')
                    .setLabel('Bekleme Süresi (Saniye)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(rankConfig.cooldown.toString())
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(minXpInput),
                    new ActionRowBuilder().addComponents(maxXpInput),
                    new ActionRowBuilder().addComponents(coolInput)
                );

                await i.showModal(modal);

                try {
                    const submitted = await i.awaitModalSubmit({
                        time: 60000,
                        filter: (m) => m.customId === 'xp_modal' && m.user.id === interaction.user.id
                    });

                    const min = parseInt(submitted.fields.getTextInputValue('min_xp'));
                    const max = parseInt(submitted.fields.getTextInputValue('max_xp'));
                    const cd = parseInt(submitted.fields.getTextInputValue('cooldown'));

                    if (isNaN(min) || isNaN(max) || isNaN(cd)) {
                        await submitted.reply({ content: 'Lütfen geçerli sayılar girin!', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    rankConfig.minXp = min;
                    rankConfig.maxXp = max;
                    rankConfig.cooldown = cd;

                    await updateGuildSettings(interaction.guild.id, { rank: rankConfig });
                    await submitted.update({ embeds: [generateEmbed()], components: generateComponents() });
                } catch (err) {
                    // Modal zaman aşımı vs.
                }
            }

            // 4. KANAL SEÇİMİ
            else if (id === 'select_channel') {
                // Eğer seçim yapıldıysa o kanalı, yapılmadıysa (seçim kaldırıldıysa) null
                rankConfig.announceChannel = i.values.length > 0 ? i.values[0] : null;
                await updateGuildSettings(interaction.guild.id, { rank: rankConfig });
                await i.update({ embeds: [generateEmbed()], components: generateComponents() });
            }

            // 5. ROL ÖDÜLÜ SIFIRLAMA
            else if (id === 'clear_rewards') {
                rankConfig.roleRewards = [];
                await updateGuildSettings(interaction.guild.id, { rank: rankConfig });
                await i.update({ embeds: [generateEmbed()], components: generateComponents() });
            }

            // 6. ROL ÖDÜLÜ EKLEME BAŞLANGICI
            else if (id === 'add_reward_start') {
                // Burada adım adım gideceğiz. Önce level soracağız (Modal), sonra Rol (Select Menu).
                // Ancak Modal'dan sonra Select Menu göstermek için interaction zincirini kırmamalıyız.
                const modal = new ModalBuilder()
                    .setCustomId('reward_level_modal')
                    .setTitle('Hangi Levelde Verilsin?');

                const levelInput = new TextInputBuilder()
                    .setCustomId('reward_level')
                    .setLabel('Level Sayısı (Örn: 5)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(levelInput));
                await i.showModal(modal);

                try {
                    const submitted = await i.awaitModalSubmit({
                        time: 60000,
                        filter: (m) => m.customId === 'reward_level_modal' && m.user.id === interaction.user.id
                    });

                    const level = parseInt(submitted.fields.getTextInputValue('reward_level'));
                    if (isNaN(level) || level < 1) {
                        await submitted.reply({ content: 'Geçersiz level!', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    // Şimdi Rol Seçimi İste
                    const roleSelectRow = new ActionRowBuilder().addComponents(
                        new RoleSelectMenuBuilder()
                            .setCustomId('select_reward_role')
                            .setPlaceholder(`${level}. seviye için rol seçin...`)
                            .setMinValues(1)
                            .setMaxValues(1)
                    );

                    // Modal'a reply olarak (ephemeral) rol menüsünü atıyoruz
                    const roleMsg = await submitted.reply({
                        content: `**Level ${level}** için verilecek rolü seçin:`,
                        components: [roleSelectRow],
                        flags: MessageFlags.Ephemeral,
                        fetchReply: true
                    });

                    const roleSelection = await roleMsg.awaitMessageComponent({
                        componentType: ComponentType.RoleSelect,
                        time: 60000
                    });

                    const roleId = roleSelection.values[0];

                    // Mevcut varsa güncelle, yoksa ekle
                    // Basitçe push edelim, aynı level varsa üstüne yaz (filter)
                    rankConfig.roleRewards = rankConfig.roleRewards.filter(r => r.level !== level);
                    rankConfig.roleRewards.push({ level, roleId });

                    await updateGuildSettings(interaction.guild.id, { rank: rankConfig });

                    await roleSelection.update({ content: `✅ **Level ${level}** için <@&${roleId}> rolü ayarlandı!`, components: [] });

                    // Ana paneli de güncelle
                    await interaction.editReply({ embeds: [generateEmbed()], components: generateComponents() });

                } catch (err) {
                    // Timeout
                }
            }

            // 7. ÖDÜL SEÇİMİ (DETAY GÖRÜNTÜLEME)
            else if (id === 'manage_rewards') {
                const level = parseInt(i.values[0].replace('manage_reward_', ''));
                const reward = rankConfig.roleRewards.find(r => r.level === level);

                if (!reward) {
                    await i.update({ embeds: [generateEmbed()], components: generateComponents() });
                    return;
                }

                const detailEmbed = new EmbedBuilder()
                    .setTitle(`🛠️ Level ${level} Ödül Düzenleme`)
                    .setDescription(`Bu seviye için ayarlanan mevcut rol: <@&${reward.roleId}>`)
                    .setColor('Blue');

                const detailRows = [];
                // Rol Değiştirme Menüsü
                detailRows.push(new ActionRowBuilder().addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId(`update_role_${level}`)
                        .setPlaceholder('Rolü değiştirmek için yeni bir rol seçin...')
                        .setMinValues(1)
                        .setMaxValues(1)
                ));

                // Sil ve Geri Dön Butonları
                detailRows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`delete_reward_${level}`)
                        .setLabel('Bu Ödülü Sil')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('back_to_main')
                        .setLabel('Geri Dön')
                        .setStyle(ButtonStyle.Secondary)
                ));

                await i.update({ embeds: [detailEmbed], components: detailRows });
            }

            // 8. ROL GÜNCELLEME (DETAY SAYFASINDAN)
            else if (id.startsWith('update_role_')) {
                const level = parseInt(id.replace('update_role_', ''));
                const newRoleId = i.values[0];

                // Update config
                const rewardIndex = rankConfig.roleRewards.findIndex(r => r.level === level);
                if (rewardIndex > -1) {
                    rankConfig.roleRewards[rewardIndex].roleId = newRoleId;
                }

                await updateGuildSettings(interaction.guild.id, { rank: rankConfig });

                const detailEmbed = new EmbedBuilder()
                    .setTitle(`🛠️ Level ${level} Ödül Düzenleme`)
                    .setDescription(`✅ **Güncellendi!**\nBu seviye için yeni rol: <@&${newRoleId}>`)
                    .setColor('Green');

                const detailRows = [];
                detailRows.push(new ActionRowBuilder().addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId(`update_role_${level}`)
                        .setPlaceholder('Rolü tekrar değiştirmek için seçin...')
                        .setMinValues(1)
                        .setMaxValues(1)
                ));
                detailRows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`delete_reward_${level}`)
                        .setLabel('Bu Ödülü Sil')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('back_to_main')
                        .setLabel('Ana Menüye Dön')
                        .setStyle(ButtonStyle.Secondary)
                ));

                await i.update({ embeds: [detailEmbed], components: detailRows });
            }

            // 9. ÖDÜL SİLME
            else if (id.startsWith('delete_reward_')) {
                const level = parseInt(id.replace('delete_reward_', ''));

                rankConfig.roleRewards = rankConfig.roleRewards.filter(r => r.level !== level);
                await updateGuildSettings(interaction.guild.id, { rank: rankConfig });

                // Ana menüye dön
                await i.update({ embeds: [generateEmbed()], components: generateComponents() });
            }

            // 10. GERİ DÖN
            else if (id === 'back_to_main') {
                await i.update({ embeds: [generateEmbed()], components: generateComponents() });
            }
        });

        // --- MODAL HANDLING (Aynı etkileşim içinde modal dinlemek için event listener kullanmamız lazım) ---
        // Ancak interaction.awaitModalSubmit kullanımı daha temizdir ama burada collector içinde olduğumuz için
        // global 'interactionCreate' eventi bu modalları yakalayacak. 
        // BU YÜZDEN: Modalları collector içinde handle edemeyiz çünkü modal submit ayrı bir interaction tipidir.
        // ÇÖZÜM: 'interactionCreate' eventine bu modalları dinleyecek kod eklemek yerine, 
        // burada `awaitModalSubmit` kullanabiliriz.
    }
};
