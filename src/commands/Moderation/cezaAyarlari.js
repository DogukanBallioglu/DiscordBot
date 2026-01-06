const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, RoleSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../../utils/settingsCache');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ceza-ayarları')
        .setDescription('Sunucu ceza ve yetki ayarlarını yapılandırır.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        // Güvenlik Kontrolü: Sadece Yöneticiler
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: '❌ Bu komutu sadece yöneticiler kullanabilir.', ephemeral: true });
        }

        // Yardımcı fonksiyon: Veritabanı verisini al
        const reloadSettings = async () => {
            const settings = await getGuildSettings(interaction.guild.id);
            return settings?.moderation?.ban || { authorizedRole: null, limit: 0, resetIntervalDays: 0 };
        };

        // --- MENÜLER ---

        // 1. Ana Menü
        const showMainMenu = async (targetInteraction) => {
            const embed = new EmbedBuilder()
                .setTitle('⚖️ Ceza Ayarları Yönetimi')
                .setDescription('Lütfen yapılandırmak istediğiniz sistemi aşağıdaki menüden seçin.')
                .setColor('Blurple')
                .setFooter({ text: 'Reva Moderasyon Sistemi' });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('main_menu_select')
                .setPlaceholder('Bir kategori seçin...')
                .addOptions(
                    {
                        label: 'Ban Ayarları',
                        description: 'Ban atma yetkisi ve limitlerini ayarla.',
                        value: 'ban_settings',
                        emoji: '🔨'
                    }
                    // Gelecekte Kick, Mute vb. eklenebilir.
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const payload = { embeds: [embed], components: [row] };
            if (targetInteraction.replied || targetInteraction.deferred) {
                await targetInteraction.editReply(payload);
            } else {
                await targetInteraction.reply({ ...payload, ephemeral: true });
            }
        };

        // 2. Ban Ayarları Menüsü
        const showBanSettings = async (targetInteraction, currentSettings) => {
            const roleId = currentSettings.authorizedRole;
            const roleMention = roleId ? `<@&${roleId}>` : 'Ayarlanmamış';
            const limit = currentSettings.limit || 'Sınırsız'; // 0 ise sınırsız veya yok sayılabilir, ama user limit istiyor
            const days = currentSettings.resetIntervalDays || 'Belirlenmemiş';

            const embed = new EmbedBuilder()
                .setTitle('🔨 Ban Ayarları')
                .setDescription('Belirli bir rol için ban atma hakkı ve süresini buradan ayarlayabilirsiniz.')
                .setColor('Red')
                .addFields(
                    { name: 'Yetkili Rol', value: roleMention, inline: true },
                    { name: 'Ban Hakkı (Limit)', value: `${limit} adet`, inline: true },
                    { name: 'Sıfırlanma Süresi', value: `${days} gün`, inline: true }
                )
                .setFooter({ text: 'Ayarları değiştirmek için aşağıdaki kontrolleri kullanın.' });

            // Rol Seçim Menüsü
            const roleSelect = new RoleSelectMenuBuilder()
                .setCustomId('ban_role_select')
                .setPlaceholder('Ban yetkisi verilecek rolü seçin');

            // Butonlar
            const limitBtn = new ButtonBuilder()
                .setCustomId('set_ban_limit')
                .setLabel('Limit Ayarla')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔢');

            const dayBtn = new ButtonBuilder()
                .setCustomId('set_ban_days')
                .setLabel('Gün Süresi Ayarla')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📅');

            const resetBtn = new ButtonBuilder()
                .setCustomId('reset_ban_settings')
                .setLabel('Ayarları Sıfırla')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️');

            const backBtn = new ButtonBuilder()
                .setCustomId('back_to_main')
                .setLabel('Geri Dön')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️');

            const row1 = new ActionRowBuilder().addComponents(roleSelect);
            const row2 = new ActionRowBuilder().addComponents(limitBtn, dayBtn, resetBtn, backBtn);

            // Hata Düzeltme: Modal submit sonrası veya normal buton sonrası duruma göre güncelleme yap
            // ModalSubmitInteraction için update() kullanılabilir ama bazen editReply gerekebilir.
            // En güvenli yöntem:
            try {
                if (targetInteraction.isModalSubmit && targetInteraction.isModalSubmit()) {
                    // Modal submitleri için update() message component update eder
                    await targetInteraction.update({ embeds: [embed], components: [row1, row2] });
                } else if (targetInteraction.replied || targetInteraction.deferred) {
                    await targetInteraction.editReply({ embeds: [embed], components: [row1, row2] });
                } else {
                    await targetInteraction.update({ embeds: [embed], components: [row1, row2] });
                }
            } catch (e) {
                // Eğer update başarısız olursa (örn: already acknowledged hatası devam ederse) editReply dene
                await targetInteraction.editReply({ embeds: [embed], components: [row1, row2] }).catch(() => { });
            }
        };

        // --- EXECUTION BAŞLANGICI ---
        await showMainMenu(interaction);

        // Collector
        const filter = i => i.user.id === interaction.user.id;
        // 5 dakikalık geniş bir collector
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async i => {
            // NOT: Her etkileşimde veritabanı sorgusu yapıp beklersek, modal açma süresi (3 sn) dolabilir ve "Unknown Interaction" hatası alırız.
            // Bu yüzden "modal aç" butonları için ASLA veritabanı bekleme veya defer yapma.

            if (i.customId === 'main_menu_select') {
                await i.deferUpdate(); // Zaman kazan
                let banSettings = await reloadSettings();

                const selected = i.values[0];
                if (selected === 'ban_settings') {
                    await showBanSettings(i, banSettings);
                }
            }
            else if (i.customId === 'back_to_main') {
                await i.update({});
                await showMainMenu(interaction);
            }
            else if (i.customId === 'reset_ban_settings') {
                await i.deferUpdate();
                // Ayarları varsayılana çevir
                const banSettings = { authorizedRole: null, limit: 0, resetIntervalDays: 0 };
                await updateGuildSettings(interaction.guild.id, { moderation: { ban: banSettings } });

                await showBanSettings(i, banSettings);
            }
            else if (i.customId === 'ban_role_select') {
                await i.deferUpdate();
                let banSettings = await reloadSettings();

                const selectedRoleId = i.values[0];

                // Kaydet
                banSettings.authorizedRole = selectedRoleId;
                await updateGuildSettings(interaction.guild.id, { moderation: { ban: banSettings } });

                await showBanSettings(i, banSettings);
            }
            else if (i.customId === 'set_ban_limit') {
                // Modal Aç (KESİNLİKLE await reloadSettings() YAPMA)
                const modal = new ModalBuilder()
                    .setCustomId('ban_limit_modal')
                    .setTitle('Ban Limiti Ayarla');

                const input = new TextInputBuilder()
                    .setCustomId('limit_input')
                    .setLabel('Kaç adet ban hakkı olsun?')
                    .setPlaceholder('Örn: 3')
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(1)
                    .setMaxLength(3)
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(input);
                modal.addComponents(row);

                await i.showModal(modal);
            }
            else if (i.customId === 'set_ban_days') {
                // Modal Aç (KESİNLİKLE await reloadSettings() YAPMA)
                const modal = new ModalBuilder()
                    .setCustomId('ban_days_modal')
                    .setTitle('Sıfırlanma Süresi');

                const input = new TextInputBuilder()
                    .setCustomId('days_input')
                    .setLabel('Kaç günde bir sıfırlansın?')
                    .setPlaceholder('Örn: 30')
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(1)
                    .setMaxLength(3)
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(input);
                modal.addComponents(row);

                await i.showModal(modal);
            }
        });

        // Modal Collector (Interaction üzerindeki collector sadece componentleri dinler, modalları dinlemez. Modalları ayrı dinleyeceğiz veya global etkileşim eventi kullanacağız ama tek dosya içinde interaction.awaitModalSubmit daha temizdir.)
        // Ancak awaitModalSubmit sürekli dinlemez, one-off'tur. O yüzden bu yapı yerine event listener kullanmak daha doğru olurdu ama `execute` içinde kalmak istiyoruz.
        // Düzeltme: Modal submitleri global `interactionCreate` eventinden gelmez bu scope'a.
        // Ama `awaitModalSubmit` ile bekleyebiliriz button click sonrasında.

        // Modal handling'i collector dışına alıp, collector içinde showModal yaptıktan sonra beklemek concurrency sorunu yaratabilir.
        // En iyisi global bir modal handler yazmaktır ama tek dosyada çözüm için: Client üzerine listener ekleyip silmek.

        const modalHandler = async (modalInteraction) => {
            if (modalInteraction.user.id !== interaction.user.id) return;
            if (!modalInteraction.isModalSubmit()) return;

            // Verileri taze çek
            let banSettings = await reloadSettings();

            if (modalInteraction.customId === 'ban_limit_modal') {
                const value = parseInt(modalInteraction.fields.getTextInputValue('limit_input'));
                if (isNaN(value) || value < 1) {
                    return modalInteraction.reply({ content: 'Lütfen geçerli bir sayı girin.', ephemeral: true });
                }

                banSettings.limit = value;
                await updateGuildSettings(interaction.guild.id, { moderation: { ban: banSettings } });

                // Menüyü güncelle
                await showBanSettings(modalInteraction, banSettings);
            }
            if (modalInteraction.customId === 'ban_days_modal') {
                const value = parseInt(modalInteraction.fields.getTextInputValue('days_input'));
                if (isNaN(value) || value < 1) {
                    return modalInteraction.reply({ content: 'Lütfen geçerli bir sayı girin.', ephemeral: true });
                }

                banSettings.resetIntervalDays = value;
                await updateGuildSettings(interaction.guild.id, { moderation: { ban: banSettings } });

                await showBanSettings(modalInteraction, banSettings);
            }
        };

        interaction.client.on('interactionCreate', modalHandler);

        // Collector bitince listener'ı temizle
        collector.on('end', () => {
            interaction.client.off('interactionCreate', modalHandler);
        });

    }
};
