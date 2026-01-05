const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, RoleSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ComponentType } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../../utils/settingsCache');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guard')
        .setDescription('Sunucu koruma sistemlerini yönetir.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        if (!interaction.guild) return interaction.reply({ content: 'Bu komut sadece sunucularda kullanılabilir.', ephemeral: true });

        if (interaction.user.id !== interaction.guild.ownerId && interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: 'Bu komutu sadece sunucu sahibi ve bot sahibi kullanabilir.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // Ayarları Getir ve Normalize Et (Eski bool yapısını yeni obje yapısına çevir)
        let settings = await getGuildSettings(interaction.guild.id);
        let guard = settings?.guard || {};

        // Helper: Yapıyı kontrol et ve düzelt
        const normalizeGuard = (val) => {
            if (typeof val === 'boolean') return { enabled: val, exemptRoles: [] };
            if (!val) return { enabled: false, exemptRoles: [] };
            return val;
        };

        guard.badWords = normalizeGuard(guard.badWords);
        guard.links = normalizeGuard(guard.links);
        guard.ads = normalizeGuard(guard.ads);
        guard.spam = normalizeGuard(guard.spam);

        // Emojiler
        const EMOJIS = {
            shield: '🛡️',
            check: '✅',
            cross: '❌',
            badWords: '🤬',
            links: '🔗',
            ads: '📢',
            spam: '💬'
        };

        // Ana Menü Oluşturucu
        const generateMainMenu = () => {
            const embed = new EmbedBuilder()
                .setTitle(`${EMOJIS.shield} ${interaction.guild.name} Koruma Paneli`)
                .setDescription('Aşağıdaki menüden yönetmek istediğiniz koruma sistemini seçin.')
                .addFields(
                    { name: `${EMOJIS.badWords} Küfür Koruması`, value: guard.badWords.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`, inline: true },
                    { name: `${EMOJIS.links} Link Koruması`, value: guard.links.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`, inline: true },
                    { name: `${EMOJIS.ads} Reklam Koruması`, value: guard.ads.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`, inline: true },
                    { name: `${EMOJIS.spam} Spam Koruması`, value: guard.spam.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`, inline: true }
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
                            { label: 'Spam Koruması', value: 'spam', emoji: '💬' }
                        ])
                );

            return { embeds: [embed], components: [row] };
        };

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
                .setDescription(`Şu anki durum: ** ${config.enabled ? `${EMOJIS.check} Aktif` : `${EMOJIS.cross} Kapalı`}**\n\nBu korumadan etkilenmeyecek rolleri aşağıdan seçebilirsiniz.`)
                .setColor(config.enabled ? 'Green' : 'Red');

            if (config.exemptRoles && config.exemptRoles.length > 0) {
                embed.addFields({
                    name: `${EMOJIS.shield} Muaf Roller`,
                    value: config.exemptRoles.map(r => `< @& ${r}> `).join(', ') || 'Yok'
                });
            } else {
                embed.addFields({ name: `${EMOJIS.shield} Muaf Roller`, value: 'Hiçbir rol muaf değil.' });
            }

            // 1. Satır: Rol Seçimi
            const roleRow = new ActionRowBuilder()
                .addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId(`exempt_roles_${type} `)
                        .setPlaceholder('Muaf tutulacak rolleri seçin (Min: 0, Max: 25)')
                        .setMinValues(0)
                        .setMaxValues(25)
                        .addDefaultRoles(config.exemptRoles || [])
                );

            // 2. Satır: Kontrol Butonları
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`toggle_${type} `)
                        .setLabel(config.enabled ? 'Korumayı Kapat' : 'Korumayı Aç')
                        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('back_main')
                        .setLabel('Geri Dön')
                        .setStyle(ButtonStyle.Secondary)
                );

            return { embeds: [embed], components: [roleRow, buttonRow] };
        };

        // İlk Mesajı Gönder
        const message = await interaction.editReply(generateMainMenu());

        // Collector
        const collector = message.createMessageComponentCollector({
            time: 300000 // 5 dakika
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Bu menüyü sadece komutu kullanan kişi yönetebilir.', ephemeral: true });
            }

            await i.deferUpdate();

            const id = i.customId;

            // Ana Menü Seçimi
            if (id === 'main_select') {
                const selectedType = i.values[0];
                await i.editReply(generateDetailMenu(selectedType));
            }
            // Geri Dön Butonu
            else if (id === 'back_main') {
                await i.editReply(generateMainMenu());
            }
            // Toggle (Aç/Kapat) Butonları
            else if (id.startsWith('toggle_')) {
                const type = id.split('_')[1];
                guard[type].enabled = !guard[type].enabled;

                await updateGuildSettings(interaction.guild.id, { guard });
                await i.editReply(generateDetailMenu(type));
            }
            // Rol Seçimi
            else if (id.startsWith('exempt_roles_')) {
                const type = id.split('_')[2]; // exempt_roles_badWords
                guard[type].exemptRoles = i.values; // Seçilen rol ID'leri

                await updateGuildSettings(interaction.guild.id, { guard });
                await i.editReply(generateDetailMenu(type));
            }
        });

        collector.on('end', () => {
            // Interaction süresi bittiğinde mesajı düzenle veya sil (Ephemeral olduğu için kullanıcı kapatana kadar kalır ama interaction biter)
        });
    }
};
