const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Durum dosyasının yolu
const statusFile = path.join(__dirname, '../../data/commandStatus.json');

// Durumları yükle
function loadStatus() {
    try {
        const data = fs.readFileSync(statusFile, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

// Durumu kaydet
function saveStatus(status) {
    fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot-yönetim')
        .setDescription('Bot yönetim paneli (Sadece Kurucu)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        // Kurucu ID kontrolü
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: 'Bu komutu kullanmak için yetkiniz yok.', ephemeral: true });
        }

        const commandsDir = path.join(__dirname, '..');
        const categories = fs.readdirSync(commandsDir).filter(file => fs.statSync(path.join(commandsDir, file)).isDirectory() && file !== 'Owner');

        // --- Helper Functions for Views ---

        // 1. Ana Menü
        const getMainMenu = () => {
            const embed = new EmbedBuilder()
                .setTitle('🤖 Bot Yönetim Paneli')
                .setDescription('Lütfen yapmak istediğiniz işlemi seçin.')
                .setColor('Blurple')
                .setThumbnail(interaction.client.user.displayAvatarURL());

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('main_menu_select')
                        .setPlaceholder('Bir işlem seçin...')
                        .addOptions([
                            {
                                label: 'Profil Ayarları',
                                description: 'Bot avatarı ve bannerı değiştir',
                                value: 'profile_settings',
                                emoji: '🖼️'
                            },
                            {
                                label: 'Komut Ayarları',
                                description: 'Komutları aç/kapat',
                                value: 'command_settings',
                                emoji: '⚙️'
                            },
                            {
                                label: 'Durum Yönetimi',
                                description: 'Aktivite ve durum ayarla',
                                value: 'status_settings',
                                emoji: '🟢'
                            }
                        ])
                );

            return { embeds: [embed], components: [row] };
        };

        // 2. Profil Ayarları
        const getProfileSettings = () => {
            const embed = new EmbedBuilder()
                .setTitle('🖼️ Profil Ayarları')
                .setDescription('Botun profil görünümünü buradan değiştirebilirsiniz.')
                .setColor('Orange')
                .addFields(
                    { name: 'Mevcut Avatar', value: '[Görüntüle](' + (interaction.client.user.avatarURL() || '') + ')', inline: true },
                    { name: 'Mevcut Banner', value: '[Görüntüle](' + (interaction.client.user.bannerURL() || '') + ')', inline: true }
                );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_change_avatar')
                        .setLabel('Avatar Değiştir')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('👤'),
                    new ButtonBuilder()
                        .setCustomId('btn_change_banner')
                        .setLabel('Banner Değiştir')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏳️'),
                    new ButtonBuilder()
                        .setCustomId('back_to_main')
                        .setLabel('Geri Dön')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            return { embeds: [embed], components: [row] };
        };

        // 3. Command Settings (Category List)
        const getCommandSettings = () => {
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Komut Ayarları')
                .setDescription('İşlem yapmak istediğiniz kategoriyi seçin.')
                .setColor('Blue');

            const categoryMenu = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_category')
                        .setPlaceholder('Bir kategori seçin...')
                        .addOptions(
                            categories.map(cat => ({
                                label: cat,
                                value: cat,
                                emoji: '📁'
                            }))
                        )
                );

            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_to_main')
                        .setLabel('Ana Menüye Dön')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            return { embeds: [embed], components: [categoryMenu, backRow] };
        };

        // 4. Status Settings
        const getStatusSettings = () => {
            const botPresence = interaction.guild?.members.me?.presence;
            const botStatus = botPresence?.status || 'offline';
            const botActivity = botPresence?.activities[0]?.name || 'Yok';

            const embed = new EmbedBuilder()
                .setTitle('🟢 Durum Yönetimi')
                .setDescription('Botun durumunu ve aktivitesini ayarlayın.')
                .setColor('Green')
                .addFields(
                    { name: 'Mevcut Durum', value: botStatus, inline: true },
                    { name: 'Mevcut Aktivite', value: botActivity, inline: true }
                );

            // Row 1: Status (Online, Idle, etc)
            const statusRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_status')
                        .setPlaceholder('Görünürlük Durumu Seç...')
                        .addOptions([
                            { label: 'Çevrimiçi', value: 'online', emoji: '🟢' },
                            { label: 'Rahatsız Etmeyin', value: 'dnd', emoji: '🔴' },
                            { label: 'Boşta', value: 'idle', emoji: '🌙' },
                            { label: 'Görünmez', value: 'invisible', emoji: '👻' },
                        ])
                );

            // Row 2: Activity Type
            const activityTypeRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_activity_type')
                        .setPlaceholder('Aktivite Tipi Seç...')
                        .addOptions([
                            { label: 'Oynuyor', value: 'Playing', emoji: '🎮' },
                            { label: 'İzliyor', value: 'Watching', emoji: '📺' },
                            { label: 'Dinliyor', value: 'Listening', emoji: '🎧' },
                            { label: 'Yarışıyor', value: 'Competing', emoji: '🏆' },
                        ])
                );

            // Row 3: Buttons
            const btnRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_set_activity_text')
                        .setLabel('Aktivite Yazısını Değiştir')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✏️'),
                    new ButtonBuilder()
                        .setCustomId('back_to_main')
                        .setLabel('Geri Dön')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            return { embeds: [embed], components: [statusRow, activityTypeRow, btnRow] };
        };

        const reply = await interaction.reply({ ...getMainMenu(), fetchReply: true, ephemeral: true });

        const collector = reply.createMessageComponentCollector({ time: 600000 });
        let currentCategory = null;

        collector.on('collect', async i => {
            // Modal hariç diğer etkileşimler için
            if (i.isStringSelectMenu() || i.isButton()) {
                // Main Menu Selection
                if (i.customId === 'main_menu_select') {
                    const selected = i.values[0];
                    if (selected === 'profile_settings') await i.update(getProfileSettings());
                    if (selected === 'command_settings') await i.update(getCommandSettings());
                    if (selected === 'status_settings') await i.update(getStatusSettings());
                }

                // Back Navigation
                else if (i.customId === 'back_to_main') {
                    await i.update(getMainMenu());
                }
                else if (i.customId === 'back_to_categories') {
                    await i.update(getCommandSettings());
                }

                // Command Settings Logic
                else if (i.customId === 'select_category') {
                    currentCategory = i.values[0];
                    await updateToCommandList(i, currentCategory, commandsDir);
                }
                else if (i.customId === 'select_command') {
                    const selectedCommand = i.values[0];
                    await toggleCommandStatus(i, selectedCommand);
                }

                // Profile Settings Logic
                else if (i.customId === 'btn_change_avatar') {
                    const modal = new ModalBuilder()
                        .setCustomId('modal_avatar')
                        .setTitle('Avatar Değiştir');

                    const input = new TextInputBuilder()
                        .setCustomId('avatar_url')
                        .setLabel('Yeni Avatar URL')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    await i.showModal(modal);
                }
                else if (i.customId === 'btn_change_banner') {
                    const modal = new ModalBuilder()
                        .setCustomId('modal_banner')
                        .setTitle('Banner Değiştir');

                    const input = new TextInputBuilder()
                        .setCustomId('banner_url')
                        .setLabel('Yeni Banner URL')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    await i.showModal(modal);
                }

                // Status Settings Logic
                else if (i.customId === 'select_status') {
                    const status = i.values[0];
                    try {
                        await interaction.client.user.setStatus(status);
                        await i.update(getStatusSettings());
                    } catch (e) {
                        // Hata olursa kullanıcıya bildirip menüyü yenileyelim
                        await i.update(getStatusSettings());
                        await i.followUp({ content: 'Durum güncellenemedi: ' + e.message, ephemeral: true });
                    }
                }
                else if (i.customId === 'select_activity_type') {
                    const typeStr = i.values[0];
                    // ActivityType enum: Playing=0, Streaming=1, Listening=2, Watching=3, Competing=5
                    const ActivityTypes = {
                        'Playing': 0,
                        'Watching': 3,
                        'Listening': 2,
                        'Competing': 5
                    };

                    const currentActivity = interaction.client.user.presence.activities[0];
                    const currentName = currentActivity ? currentActivity.name : 'Bot';

                    try {
                        await interaction.client.user.setActivity(currentName, { type: ActivityTypes[typeStr] });
                        await i.update(getStatusSettings());
                    } catch (e) {
                        await i.update(getStatusSettings());
                        await i.followUp({ content: 'Aktivite güncellenemedi: ' + e.message, ephemeral: true });
                    }
                }
                else if (i.customId === 'btn_set_activity_text') {
                    const modal = new ModalBuilder()
                        .setCustomId('modal_activity_text')
                        .setTitle('Aktivite Metni');

                    const input = new TextInputBuilder()
                        .setCustomId('activity_text')
                        .setLabel('Yeni Metin')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: Yardım için /help')
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    await i.showModal(modal);
                }
            }
        });

        // Modal Listener
        const modalListener = async (modalInteraction) => {
            if (!modalInteraction.isModalSubmit()) return;
            if (modalInteraction.user.id !== interaction.user.id) return;
            // Check if this modal interaction relates to a modal we opened
            // We can't strictly check message reference because we showed the modal from the interaction, not a message component directly often
            // But we can check customIds

            try {
                if (modalInteraction.customId === 'modal_avatar') {
                    const url = modalInteraction.fields.getTextInputValue('avatar_url');
                    await interaction.client.user.setAvatar(url);
                    await modalInteraction.reply({ content: 'Avatar başarıyla güncellendi!', ephemeral: true });
                }
                else if (modalInteraction.customId === 'modal_banner') {
                    const url = modalInteraction.fields.getTextInputValue('banner_url');
                    await interaction.client.user.setBanner(url);
                    await modalInteraction.reply({ content: 'Banner başarıyla güncellendi!', ephemeral: true });
                }
                else if (modalInteraction.customId === 'modal_activity_text') {
                    const text = modalInteraction.fields.getTextInputValue('activity_text');
                    const currentActivity = interaction.client.user.presence.activities[0];
                    const type = currentActivity ? currentActivity.type : 0;

                    await interaction.client.user.setActivity(text, { type: type });
                    // Modal submit sonrası mesajı güncellemek için, modalInteraction.update kullanamayız çünkü modal'ın bir önceki mesajı yoktur doğrudan.
                    // Fakat reply.edit() yapabiliriz çünkü 'reply' değişkeni execute scope'unda.
                    await modalInteraction.deferUpdate(); // Modal'ı kapat
                    await reply.edit(getStatusSettings()); // Ana mesajı güncelle
                }
            } catch (error) {
                if (!modalInteraction.replied && !modalInteraction.deferred) {
                    await modalInteraction.reply({ content: 'İşlem başarısız: ' + error.message, ephemeral: true });
                } else {
                    await modalInteraction.followUp({ content: 'İşlem sırasında hata oluştu: ' + error.message, ephemeral: true });
                }
            }
        };

        interaction.client.on('interactionCreate', modalListener);

        collector.on('end', () => {
            interaction.client.removeListener('interactionCreate', modalListener);
        });

        // Helper function for Command List
        async function updateToCommandList(i, category, baseDir) {
            const categoryPath = path.join(baseDir, category);
            const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
            const status = loadStatus();

            if (commandFiles.length === 0) {
                return i.reply({ content: 'Bu kategoride komut bulunamadı.', ephemeral: true });
            }

            const commandOptions = commandFiles.map(file => {
                const cmdName = require(path.join(categoryPath, file)).data.name;
                const emoji = status[cmdName] === false ? '🔴' : '🟢';
                const label = `${cmdName} (${status[cmdName] === false ? 'Kapalı' : 'Açık'})`;

                return {
                    label: label,
                    value: cmdName,
                    description: status[cmdName] === false ? 'Açmak için seçin' : 'Kapatmak için seçin',
                    emoji: emoji
                };
            });

            const commandEmbed = new EmbedBuilder()
                .setTitle(`${category} Kategorisi`)
                .setDescription('Durumunu değiştirmek istediğiniz komutu seçin.\n🟢 = Açık (Herkese Görünür)\n🔴 = Kapalı (Sadece Size Görünür)')
                .setColor('Yellow');

            const commandMenu = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_command')
                        .setPlaceholder('Bir komut seçin...')
                        .addOptions(commandOptions)
                );

            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_to_categories')
                        .setLabel('Geri Dön / Kategori Seç')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await i.update({ embeds: [commandEmbed], components: [commandMenu, backButton] });
        }

        async function toggleCommandStatus(i, commandName) {
            const status = loadStatus();
            if (status[commandName] === false) {
                delete status[commandName];
            } else {
                status[commandName] = false;
            }
            saveStatus(status);
            await updateToCommandList(i, currentCategory, commandsDir);
        }
    },
};
