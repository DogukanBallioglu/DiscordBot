const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Dosya yolları
const commandStatusFile = path.join(__dirname, '../../data/commandStatus.json');
const statusConfigFile = path.join(__dirname, '../../data/statusConfig.json');

// --- Helper Functions ---
function loadJSON(file) {
    try {
        if (!fs.existsSync(file)) return {};
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Activity Types Map
const ActivityTypeMap = {
    'Playing': 0,
    'Streaming': 1,
    'Listening': 2,
    'Watching': 3,
    'Competing': 5
};
const ActivityTypeReverseMap = {
    0: 'Oynuyor',
    1: 'Yayında',
    2: 'Dinliyor',
    3: 'İzliyor',
    5: 'Yarışıyor'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot-yönetim')
        .setDescription('Bot yönetim paneli (Sadece Kurucu)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: 'Bu komutu kullanmak için yetkiniz yok.', ephemeral: true });
        }

        const commandsDir = path.join(__dirname, '..');
        const categories = fs.readdirSync(commandsDir).filter(file => fs.statSync(path.join(commandsDir, file)).isDirectory() && file !== 'Owner');

        // --- Helper Views ---

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
                            { label: 'Profil Ayarları', value: 'profile_settings', emoji: '🖼️' },
                            { label: 'Komut Ayarları', value: 'command_settings', emoji: '⚙️' },
                            { label: 'Durum Yönetimi', value: 'status_settings', emoji: '🟢' }
                        ])
                );
            return { embeds: [embed], components: [row] };
        };

        // 2. Profil Ayarları
        const getProfileSettings = () => {
            const embed = new EmbedBuilder()
                .setTitle('🖼️ Profil Ayarları')
                .setColor('Orange')
                .addFields(
                    { name: 'Mevcut Avatar', value: '[Link](' + (interaction.client.user.avatarURL() || '') + ')', inline: true },
                    { name: 'Mevcut Banner', value: '[Link](' + (interaction.client.user.bannerURL() || '') + ')', inline: true }
                );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('btn_change_avatar').setLabel('Avatar Değiştir').setStyle(ButtonStyle.Primary).setEmoji('👤'),
                    new ButtonBuilder().setCustomId('btn_change_banner').setLabel('Banner Değiştir').setStyle(ButtonStyle.Primary).setEmoji('🏳️'),
                    new ButtonBuilder().setCustomId('back_to_main').setLabel('Geri Dön').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
                );
            return { embeds: [embed], components: [row] };
        };

        // 3. Command Settings
        const getCommandSettings = () => {
            const embed = new EmbedBuilder().setTitle('⚙️ Komut Ayarları').setDescription('Kategori seçin.').setColor('Blue');
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('select_category').setPlaceholder('Kategori Seç...').addOptions(categories.map(c => ({ label: c, value: c, emoji: '📁' })))
            );
            const back = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('back_to_main').setLabel('Ana Menüye Dön').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'));
            return { embeds: [embed], components: [menu, back] };
        };

        // 4. Status Settings (UPDATED)
        const getStatusSettings = () => {
            const config = loadJSON(statusConfigFile);
            const currentStatus = config.status || 'online';
            const activities = config.activities || [];

            let activityList = activities.map((a, i) => `${i + 1}. [${ActivityTypeReverseMap[a.type] || 'Bilinmiyor'}] ${a.text}`).join('\n');
            if (!activityList) activityList = 'Hiç aktivite yok.';

            const embed = new EmbedBuilder()
                .setTitle('🟢 Durum Yönetimi')
                .setDescription(`**Görünürlük Durumu:** ${currentStatus.toUpperCase()}\n\n**Aktif Döngüdeki Durumlar:**\n${activityList}`)
                .setColor('Green')
                .setFooter({ text: 'Not: Durumlar her 10 saniyede bir değişir.' });

            // Row 1: Status Select
            const statusRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_bot_status')
                    .setPlaceholder('Görünürlük Durumu (Online/DND...)')
                    .addOptions([
                        { label: 'Çevrimiçi', value: 'online', emoji: '🟢', default: currentStatus === 'online' },
                        { label: 'Rahatsız Etmeyin', value: 'dnd', emoji: '🔴', default: currentStatus === 'dnd' },
                        { label: 'Boşta', value: 'idle', emoji: '🌙', default: currentStatus === 'idle' },
                        { label: 'Görünmez', value: 'invisible', emoji: '👻', default: currentStatus === 'invisible' },
                    ])
            );

            // Row 2: Edit/Delete Activity Menu (Instead of pure delete)
            let editRow = null;
            if (activities.length > 0) {
                const options = activities.map((a, i) => ({
                    label: `${ActivityTypeReverseMap[a.type] || 'Type ' + a.type}: ${a.text}`.substring(0, 100),
                    value: i.toString(),
                    emoji: '�'
                })).slice(0, 25);

                editRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_edit_activity_menu')
                        .setPlaceholder('Düzenlemek/Silmek için Aktivite Seç...')
                        .addOptions(options)
                );
            }

            // Row 3: Buttons
            const btnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_add_activity').setLabel('Aktivite Ekle').setStyle(ButtonStyle.Success).setEmoji('➕'),
                new ButtonBuilder().setCustomId('back_to_main').setLabel('Geri Dön').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
            );

            const components = [statusRow];
            if (editRow) components.push(editRow);
            components.push(btnRow);

            return { embeds: [embed], components: components };
        };

        // 5. Activity Edit View
        const getActivityEditView = (index) => {
            const config = loadJSON(statusConfigFile);
            const activity = config.activities ? config.activities[index] : null;

            if (!activity) {
                return { content: 'Aktivite bulunamadı veya silinmiş.', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('back_to_status').setLabel('Geri Dön').setStyle(ButtonStyle.Secondary))] };
            }

            const embed = new EmbedBuilder()
                .setTitle('📝 Aktivite Düzenle')
                .setDescription(`**Metin:** ${activity.text}\n**Tip:** ${ActivityTypeReverseMap[activity.type]}`)
                .setColor('Yellow');

            // Row 1: Edit Text Button
            const btnRow1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`btn_edit_text_${index}`).setLabel('Metni Düzenle').setStyle(ButtonStyle.Primary).setEmoji('✏️')
            );

            // Row 2: Select Type
            const typeRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`select_edit_type_${index}`)
                    .setPlaceholder('Tipi Değiştir...')
                    .addOptions([
                        { label: 'Oynuyor', value: '0', emoji: '🎮', default: activity.type === 0 },
                        { label: 'İzliyor', value: '3', emoji: '📺', default: activity.type === 3 },
                        { label: 'Dinliyor', value: '2', emoji: '🎧', default: activity.type === 2 },
                        { label: 'Yarışıyor', value: '5', emoji: '🏆', default: activity.type === 5 },
                    ])
            );

            // Row 3: Delete & Back
            const btnRow2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`btn_delete_activity_${index}`).setLabel('Bu Aktiviteyi Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
                new ButtonBuilder().setCustomId('back_to_status').setLabel('Geri Dön').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
            );

            return { embeds: [embed], components: [btnRow1, typeRow, btnRow2] };
        };


        const reply = await interaction.reply({ ...getMainMenu(), fetchReply: true, ephemeral: true });

        const collector = reply.createMessageComponentCollector({ time: 10 * 60 * 1000 }); // 10 mins

        let currentCategory = null;

        collector.on('collect', async i => {
            // General Validations
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Sadece komutu kullanan kişi işlem yapabilir.', ephemeral: true });

            // --- Navigation & Main Menus ---
            if (i.customId === 'back_to_main') {
                await i.update(getMainMenu());
            }
            else if (i.customId === 'back_to_status') {
                await i.update(getStatusSettings());
            }
            else if (i.customId === 'main_menu_select') {
                const v = i.values[0];
                if (v === 'profile_settings') await i.update(getProfileSettings());
                if (v === 'command_settings') await i.update(getCommandSettings());
                if (v === 'status_settings') await i.update(getStatusSettings());
            }

            // --- Profile Settings ---
            else if (i.customId === 'btn_change_avatar' || i.customId === 'btn_change_banner') {
                const isAvatar = i.customId === 'btn_change_avatar';
                const modal = new ModalBuilder()
                    .setCustomId(isAvatar ? 'modal_avatar' : 'modal_banner')
                    .setTitle(isAvatar ? 'Avatar Değiştir' : 'Banner Değiştir');
                const input = new TextInputBuilder()
                    .setCustomId('url_input')
                    .setLabel('URL')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);
            }

            // --- Command Settings ---
            else if (i.customId === 'back_to_categories') {
                await i.update(getCommandSettings());
            }
            else if (i.customId === 'select_category') {
                currentCategory = i.values[0];
                await updateToCommandList(i, currentCategory);
            }
            else if (i.customId === 'select_command') {
                await toggleCommandStatus(i, i.values[0]);
            }

            // --- Status: Main View ---
            else if (i.customId === 'select_bot_status') {
                const newStatus = i.values[0];
                const config = loadJSON(statusConfigFile);
                config.status = newStatus;
                saveJSON(statusConfigFile, config);
                interaction.client.user.setPresence({ status: newStatus });
                await i.update(getStatusSettings());
            }
            else if (i.customId === 'select_edit_activity_menu') {
                const index = parseInt(i.values[0]);
                await i.update(getActivityEditView(index));
            }
            else if (i.customId === 'btn_add_activity') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_add_activity_simple')
                    .setTitle('Aktivite Ekle');
                const input = new TextInputBuilder()
                    .setCustomId('activity_text')
                    .setLabel('Metin (örn: {serverCount} sunucu)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);
            }

            // --- Status: Detail View ---
            else if (i.customId.startsWith('btn_edit_text_')) {
                const index = i.customId.split('_')[3];
                const config = loadJSON(statusConfigFile);
                const activity = config.activities[index];

                const modal = new ModalBuilder()
                    .setCustomId(`modal_edit_activity_${index}`)
                    .setTitle('Aktivite Düzenle');
                const input = new TextInputBuilder()
                    .setCustomId('activity_text_edit')
                    .setLabel('Yeni Metin')
                    .setValue(activity ? activity.text : '')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);
            }
            else if (i.customId.startsWith('select_edit_type_')) {
                const index = parseInt(i.customId.split('_')[3]);
                const newVal = parseInt(i.values[0]);

                const config = loadJSON(statusConfigFile);
                if (config.activities && config.activities[index]) {
                    config.activities[index].type = newVal;
                    saveJSON(statusConfigFile, config);
                }
                await i.update(getActivityEditView(index));
            }
            else if (i.customId.startsWith('btn_delete_activity_')) {
                const index = parseInt(i.customId.split('_')[3]);
                const config = loadJSON(statusConfigFile);
                if (config.activities) {
                    config.activities.splice(index, 1);
                    saveJSON(statusConfigFile, config);
                }
                await i.update(getStatusSettings()); // Go back to list
            }
        });

        // --- GLOBAL MODAL LISTENER ---
        const modalListener = async (modalI) => {
            if (!modalI.isModalSubmit()) return;
            if (modalI.user.id !== interaction.user.id) return;

            if (modalI.customId === 'modal_avatar') {
                const url = modalI.fields.getTextInputValue('url_input');
                await interaction.client.user.setAvatar(url);
                await modalI.reply({ content: 'Avatar güncellendi!', ephemeral: true });
            }
            else if (modalI.customId === 'modal_banner') {
                const url = modalI.fields.getTextInputValue('url_input');
                await interaction.client.user.setBanner(url);
                await modalI.reply({ content: 'Banner güncellendi!', ephemeral: true });
            }
            else if (modalI.customId === 'modal_add_activity_simple') {
                const text = modalI.fields.getTextInputValue('activity_text');
                const config = loadJSON(statusConfigFile);
                if (!config.activities) config.activities = [];

                // Add with DEFAULT type (0 = Playing) as requested
                config.activities.push({ text: text, type: 0 });
                saveJSON(statusConfigFile, config);

                await modalI.deferUpdate(); // Close modal nicely
                await reply.edit(getStatusSettings()); // Update main message
            }
            else if (modalI.customId.startsWith('modal_edit_activity_')) {
                const index = parseInt(modalI.customId.split('_')[3]);
                const text = modalI.fields.getTextInputValue('activity_text_edit');

                const config = loadJSON(statusConfigFile);
                if (config.activities && config.activities[index]) {
                    config.activities[index].text = text;
                    saveJSON(statusConfigFile, config);
                }

                await modalI.deferUpdate();
                await reply.edit(getActivityEditView(index));
            }
        };

        interaction.client.on('interactionCreate', modalListener);
        collector.on('end', () => interaction.client.removeListener('interactionCreate', modalListener));

        // --- Command List Helper ---
        async function updateToCommandList(i, category) {
            const categoryPath = path.join(commandsDir, category);
            const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
            const status = loadJSON(commandStatusFile);

            if (commandFiles.length === 0) return i.reply({ content: 'Komut yok.', ephemeral: true });

            const options = commandFiles.map(file => {
                const cmdData = require(path.join(categoryPath, file));
                const cmdName = cmdData.data ? cmdData.data.name : file.replace('.js', '');
                const mapStatus = status[cmdName] === false ? false : true;
                return {
                    label: `${cmdName} (${mapStatus ? 'Açık' : 'Kapalı'})`,
                    value: cmdName,
                    emoji: mapStatus ? '🟢' : '🔴'
                };
            });

            const embed = new EmbedBuilder()
                .setTitle(`${category} Komutları`)
                .setDescription('Açmak/kapatmak istediğiniz komutu seçin.')
                .setColor('Yellow');

            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('select_command').setPlaceholder('Komut Seç...').addOptions(options)
            );
            const back = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('back_to_categories').setLabel('Kategori Listesine Dön').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
            );

            await i.update({ embeds: [embed], components: [menu, back] });
        }

        async function toggleCommandStatus(i, cmdName) {
            const status = loadJSON(commandStatusFile);
            if (status[cmdName] === false) delete status[cmdName];
            else status[cmdName] = false;
            saveJSON(commandStatusFile, status);
            await updateToCommandList(i, currentCategory);
        }
    },
};
