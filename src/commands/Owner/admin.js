const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits, ActivityType, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { db } = require('../../firebase');

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

function getEmojiId(emoji) {
    if (!emoji) return null;
    const match = emoji.match(/<a?:.+:(\d+)>/);
    return match ? match[1] : emoji;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot-yönetim')
        .setDescription('Bot yönetim paneli (Sadece Kurucu)'),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Emojiler (Yerel Tanımlama)
            const emojis = {
                bot: '🤖',
                profile: '🖼️',
                settings: '<:reva_settings:1458948250139758723>',
                online: '<:reva_online:1458877679020544001>',
                server: '🖥️',
                avatar: '<:reva_avatar:1458959681832616009>',
                banner: '<:reva_banner:1458959854227034274>',
                folder: '📁',
                dnd: '<:reva_dnd:1458877671281922152>',
                idle: '<:reva_idle:1458877685877964872>',
                offline: '<:reva_offline:1458877691729281088>',
                note: '📝',
                add: '<:reva_add:1458954045082566778>',
                edit: '<:reva_edit:1458958102098608301>',
                fun: '🎮',
                watching: '📺',
                listening: '🎧',
                competing: '🏆',
                trash: '<:reva_trash:1458958507268247764>',
                back: '<:reva_back:1458957137278406824>',
                success: '<:reva_yes:1458949796806000771>',
                error: '<:reva_no:1458949780809191695>',
                search: '🔎',
                command_on: '<a:reva_command_on:1458854900556501182>',
                command_off: '<:reva_command_off:1458854966738424098>'
            };

            if (interaction.user.id !== process.env.OWNER_ID) {
                return interaction.editReply({ content: 'Bu komutu kullanmak için yetkiniz yok.' });
            }

            const commandsDir = path.join(__dirname, '..');
            const categories = fs.readdirSync(commandsDir).filter(file => fs.statSync(path.join(commandsDir, file)).isDirectory() && file !== 'Owner');

            // --- Helper Views ---

            // 1. Ana Menü
            const getMainMenu = () => {
                const embed = new EmbedBuilder()
                    .setTitle(`${emojis.bot || '🤖'} Bot Yönetim Paneli`)
                    .setDescription('Lütfen yapmak istediğiniz işlemi seçin.')
                    .setColor('Blurple')
                    .setThumbnail(interaction.client.user.displayAvatarURL());

                const row = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('main_menu_select')
                            .setPlaceholder('Bir işlem seçin...')
                            .addOptions([
                                { label: 'Profil Ayarları', value: 'profile_settings', emoji: getEmojiId(emojis.profile || '🖼️') },
                                { label: 'Komut Ayarları', value: 'command_settings', emoji: getEmojiId(emojis.settings || '⚙️') },
                                { label: 'Durum Yönetimi', value: 'status_settings', emoji: getEmojiId(emojis.online || '🟢') },
                                { label: 'Sunucu Yönetimi', value: 'server_settings', emoji: getEmojiId(emojis.server || '🖥️') }
                            ])
                    );
                return { embeds: [embed], components: [row] };
            };

            // 2. Profil Ayarları
            const getProfileSettings = () => {
                const embed = new EmbedBuilder()
                    .setTitle(`${emojis.profile || '🖼️'} Profil Ayarları`)
                    .setColor('Orange')
                    .addFields(
                        { name: 'Mevcut Avatar', value: '[Link](' + (interaction.client.user.avatarURL() || '') + ')', inline: true },
                        { name: 'Mevcut Banner', value: '[Link](' + (interaction.client.user.bannerURL() || '') + ')', inline: true }
                    );

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('btn_change_avatar').setLabel('Avatar Değiştir').setStyle(ButtonStyle.Primary).setEmoji(getEmojiId(emojis.avatar || '👤')),
                        new ButtonBuilder().setCustomId('btn_change_banner').setLabel('Banner Değiştir').setStyle(ButtonStyle.Primary).setEmoji(getEmojiId(emojis.banner || '🏳️')),
                        new ButtonBuilder().setCustomId('back_to_main').setLabel('Geri Dön').setStyle(ButtonStyle.Secondary).setEmoji(getEmojiId(emojis.back || '⬅️'))
                    );
                return { embeds: [embed], components: [row] };
            };

            // 3. Command Settings
            const getCommandSettings = () => {
                const embed = new EmbedBuilder().setTitle(`${emojis.settings || '⚙️'} Komut Ayarları`).setDescription('Kategori seçin.').setColor('Blue');
                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_category').setPlaceholder('Kategori Seç...').addOptions(categories.map(c => ({ label: c, value: c, emoji: getEmojiId(emojis.folder || '📁') })))
                );
                const back = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('back_to_main').setLabel('Ana Menüye Dön').setStyle(ButtonStyle.Secondary).setEmoji(getEmojiId(emojis.back || '⬅️')));
                return { embeds: [embed], components: [menu, back] };
            };

            // 4. Status Settings
            const getStatusSettings = () => {
                const config = loadJSON(statusConfigFile);
                const currentStatus = config.status || 'online';
                const activities = config.activities || [];

                let activityList = activities.map((a, i) => `${i + 1}. [${ActivityTypeReverseMap[a.type] || 'Bilinmiyor'}] ${a.text}`).join('\n');
                if (!activityList) activityList = 'Hiç aktivite yok.';

                const embed = new EmbedBuilder()
                    .setTitle(`${emojis.online || '🟢'} Durum Yönetimi`)
                    .setDescription(`**Görünürlük Durumu:** ${currentStatus.toUpperCase()}\n\n**Aktif Döngüdeki Durumlar:**\n${activityList}`)
                    .setColor('Green')
                    .setFooter({ text: 'Not: Durumlar her 10 saniyede bir değişir.' });

                // Row 1: Status Select
                const statusRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_bot_status')
                        .setPlaceholder('Görünürlük Durumu (Online/DND...)')
                        .addOptions([
                            { label: 'Çevrimiçi', value: 'online', emoji: getEmojiId(emojis.online || '🟢'), default: currentStatus === 'online' },
                            { label: 'Rahatsız Etmeyin', value: 'dnd', emoji: getEmojiId(emojis.dnd || '🔴'), default: currentStatus === 'dnd' },
                            { label: 'Boşta', value: 'idle', emoji: getEmojiId(emojis.idle || '🌙'), default: currentStatus === 'idle' },
                            { label: 'Görünmez', value: 'invisible', emoji: getEmojiId(emojis.offline || '👻'), default: currentStatus === 'invisible' },
                        ])
                );

                // Row 2: Edit/Delete Activity Menu
                let editRow = null;
                if (activities.length > 0) {
                    const options = activities.map((a, i) => ({
                        label: `${ActivityTypeReverseMap[a.type] || 'Type ' + a.type}: ${a.text}`.substring(0, 100),
                        value: i.toString(),
                        emoji: getEmojiId(emojis.note || '📝')
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
                    new ButtonBuilder().setCustomId('btn_add_activity').setLabel('Aktivite Ekle').setStyle(ButtonStyle.Success).setEmoji(getEmojiId(emojis.add || '➕')),
                    new ButtonBuilder().setCustomId('back_to_main').setLabel('Geri Dön').setStyle(ButtonStyle.Secondary).setEmoji(getEmojiId(emojis.back || '⬅️'))
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
                    .setTitle(`${emojis.note || '📝'} Aktivite Düzenle`)
                    .setDescription(`**Metin:** ${activity.text}\n**Tip:** ${ActivityTypeReverseMap[activity.type]}`)
                    .setColor('Yellow');

                // Row 1: Edit Text Button
                const btnRow1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`btn_edit_text_${index}`).setLabel('Metni Düzenle').setStyle(ButtonStyle.Primary).setEmoji(getEmojiId(emojis.edit || '✏️'))
                );

                // Row 2: Select Type
                const typeRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`select_edit_type_${index}`)
                        .setPlaceholder('Tipi Değiştir...')
                        .addOptions([
                            { label: 'Oynuyor', value: '0', emoji: getEmojiId(emojis.fun || '🎮'), default: activity.type === 0 },
                            { label: 'İzliyor', value: '3', emoji: getEmojiId(emojis.watching || '📺'), default: activity.type === 3 },
                            { label: 'Dinliyor', value: '2', emoji: getEmojiId(emojis.listening || '🎧'), default: activity.type === 2 },
                            { label: 'Yarışıyor', value: '5', emoji: getEmojiId(emojis.competing || '🏆'), default: activity.type === 5 },
                        ])
                );

                // Row 3: Delete & Back
                const btnRow2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`btn_delete_activity_${index}`).setLabel('Bu Aktiviteyi Sil').setStyle(ButtonStyle.Danger).setEmoji(getEmojiId(emojis.trash || '🗑️')),
                    new ButtonBuilder().setCustomId('back_to_status').setLabel('Geri Dön').setStyle(ButtonStyle.Secondary).setEmoji(getEmojiId(emojis.back || '⬅️'))
                );

                return { embeds: [embed], components: [btnRow1, typeRow, btnRow2] };
            };

            // 6. Server Management Menu
            const getServerManagementMenu = () => {
                const guilds = interaction.client.guilds.cache.map(g => ({ label: g.name.substring(0, 100), value: g.id, description: `${g.memberCount} üye` })).slice(0, 25);

                const embed = new EmbedBuilder()
                    .setTitle(`${emojis.server || '🖥️'} Sunucu Yönetimi`)
                    .setDescription(`Bot şu an **${interaction.client.guilds.cache.size}** sunucuda bulunuyor.\nİşlem yapmak istediğiniz sunucuyu seçin.`)
                    .setColor('Purple');

                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_server_action')
                        .setPlaceholder('Sunucu Seç...')
                        .addOptions(guilds)
                );

                const back = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('back_to_main').setLabel('Ana Menüye Dön').setStyle(ButtonStyle.Secondary).setEmoji(getEmojiId(emojis.back || '⬅️'))
                );

                return { embeds: [embed], components: [menu, back] };
            };

            // 7. Server Detail View
            const getServerDetailView = async (guildId) => {
                const guild = interaction.client.guilds.cache.get(guildId);
                if (!guild) return { content: 'Sunucu bulunamadı (Bot ayrılmış olabilir).', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('back_to_servers').setLabel('Geri Dön').setStyle(ButtonStyle.Secondary).setEmoji(getEmojiId(emojis.back || '⬅️')))] };

                await guild.fetch();
                const owner = await interaction.client.users.fetch(guild.ownerId).catch(() => null);

                // Check Database Data Existence
                const docGuild = await db.collection('guilds').doc(guildId).get();
                const docSettings = await db.collection('guildSettings').doc(guildId).get();
                const hasData = docGuild.exists || docSettings.exists;

                const embed = new EmbedBuilder()
                    .setTitle(`${emojis.search || '🔎'} Sunucu Detayı: ${guild.name}`)
                    .setThumbnail(guild.iconURL())
                    .setColor('DarkVividPink')
                    .addFields(
                        { name: 'ID', value: guild.id, inline: true },
                        { name: 'Üye Sayısı', value: `${guild.memberCount}`, inline: true },
                        { name: 'Sahibi', value: owner ? `${owner.tag} (${owner.id})` : 'Bilinmiyor', inline: true },
                        { name: 'Oluşturulma', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: 'Bot Katılma', value: `<t:${Math.floor(guild.joinedTimestamp / 1000)}:R>`, inline: true },
                        { name: 'Veritabanı Durumu', value: hasData ? `${emojis.success || '✅'} Veri Var` : `${emojis.error || '❌'} Veri Yok`, inline: true }
                    );

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`btn_leave_server_${guild.id}`).setLabel('Sunucudan Çık').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
                    new ButtonBuilder()
                        .setCustomId(`btn_delete_data_${guild.id}`)
                        .setLabel(hasData ? 'Verileri Sil (DB)' : 'Veri Bulunamadı')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(getEmojiId(emojis.trash || '🗑️'))
                        .setDisabled(!hasData),
                    new ButtonBuilder().setCustomId('back_to_servers').setLabel('Geri Dön').setStyle(ButtonStyle.Secondary).setEmoji(getEmojiId(emojis.back || '⬅️'))
                );

                return { embeds: [embed], components: [row] };
            };

            const reply = await interaction.editReply({ ...getMainMenu() });

            // STRICT FILTER: Only allow interactions for THIS specific message
            const filter = (i) => i.user.id === interaction.user.id && i.message.id === reply.id;
            const collector = reply.createMessageComponentCollector({ filter, time: 300000 }); // 5 mins

            let currentCategory = null;

            collector.on('collect', async i => {
                // Double check (redundant but safe)
                if (i.message.id !== reply.id) return;

                // General Validations
                if (i.user.id !== interaction.user.id) return i.reply({ content: 'Sadece komutu kullanan kişi işlem yapabilir.', flags: MessageFlags.Ephemeral });

                // --- Navigation & Main Menus ---
                if (i.customId === 'back_to_main') {
                    await i.update(getMainMenu());
                }
                else if (i.customId === 'back_to_status') {
                    await i.update(getStatusSettings());
                }
                else if (i.customId === 'back_to_servers') {
                    await i.update(getServerManagementMenu());
                }
                else if (i.customId === 'main_menu_select') {
                    const v = i.values[0];
                    if (v === 'profile_settings') await i.update(getProfileSettings());
                    if (v === 'command_settings') await i.update(getCommandSettings());
                    if (v === 'status_settings') await i.update(getStatusSettings());
                    if (v === 'server_settings') await i.update(getServerManagementMenu());
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
                    // Do not defer here immediately if toggleCommandStatus also does UI updates that might conflict
                    // But to prevent "Unknown interaction", we MUST defer if the operation takes time.
                    // The issue is likely race conditions.
                    await toggleCommandStatus(i, i.values[0]);
                }

                // --- Server Management ---
                else if (i.customId === 'select_server_action') {
                    const guildId = i.values[0];
                    const view = await getServerDetailView(guildId);
                    await i.update(view);
                }
                else if (i.customId.startsWith('btn_leave_server_')) {
                    const guildId = i.customId.split('_')[3];
                    const guild = interaction.client.guilds.cache.get(guildId);

                    if (guild) {
                        try {
                            await guild.leave();
                            await i.reply({ content: `Bot **${guild.name}** sunucusundan başarıyla ayrıldı.`, flags: MessageFlags.Ephemeral });

                            // UI clean up / update
                            try {
                                await i.message.edit(getServerManagementMenu());
                            } catch (uiError) {
                                // Msg might be deleted or not editable
                                console.error('UI update error:', uiError);
                            }

                        } catch (e) {
                            if (!i.replied && !i.deferred) {
                                await i.reply({ content: `Hata: ${e.message}`, flags: MessageFlags.Ephemeral });
                            } else {
                                await i.followUp({ content: `Hata: ${e.message}`, flags: MessageFlags.Ephemeral });
                            }
                        }
                    } else {
                        await i.reply({ content: 'Sunucu zaten bulunamıyor.', flags: MessageFlags.Ephemeral });
                    }
                }
                else if (i.customId.startsWith('btn_delete_data_')) {
                    const guildId = i.customId.split('_')[3];
                    try {
                        // Delete from 'guilds' collection
                        await db.collection('guilds').doc(guildId).delete();
                        // Delete from 'guildSettings' collection
                        await db.collection('guildSettings').doc(guildId).delete();

                        await i.reply({ content: `Sunucu verileri (ID: ${guildId}) tüm koleksiyonlardan (guilds, guildSettings) başarıyla silindi.`, flags: MessageFlags.Ephemeral });
                    } catch (e) {
                        if (!i.replied && !i.deferred) {
                            await i.reply({ content: `Hata: ${e.message}`, flags: MessageFlags.Ephemeral });
                        } else {
                            await i.followUp({ content: `Hata: ${e.message}`, flags: MessageFlags.Ephemeral });
                        }
                    }
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
                    await i.update(getStatusSettings());
                }
            });

            // --- GLOBAL MODAL LISTENER ---
            const modalListener = async (modalI) => {
                if (!modalI.isModalSubmit()) return;
                if (modalI.user.id !== interaction.user.id) return;

                try {
                    if (modalI.customId === 'modal_avatar') {
                        const url = modalI.fields.getTextInputValue('url_input');
                        await interaction.client.user.setAvatar(url);
                        await modalI.reply({ content: 'Avatar güncellendi!', flags: MessageFlags.Ephemeral });
                    }
                    else if (modalI.customId === 'modal_banner') {
                        const url = modalI.fields.getTextInputValue('url_input');
                        await interaction.client.user.setBanner(url);
                        await modalI.reply({ content: 'Banner güncellendi!', flags: MessageFlags.Ephemeral });
                    }
                    else if (modalI.customId === 'modal_add_activity_simple') {
                        const text = modalI.fields.getTextInputValue('activity_text');
                        const config = loadJSON(statusConfigFile);
                        if (!config.activities) config.activities = [];
                        config.activities.push({ text: text, type: 0 });
                        saveJSON(statusConfigFile, config);

                        await modalI.deferUpdate();
                        await interaction.editReply(getStatusSettings());
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
                        await interaction.editReply(getActivityEditView(index));
                    }
                } catch (error) {
                    console.error('Modal Action Error:', error);
                    if (!modalI.replied && !modalI.deferred) {
                        await modalI.reply({ content: `Hata oluştu: ${error.message}`, flags: MessageFlags.Ephemeral });
                    }
                }
            };

            interaction.client.on('interactionCreate', modalListener);
            collector.on('end', () => interaction.client.removeListener('interactionCreate', modalListener));

            // --- Command List Helper ---
            async function updateToCommandList(i, category) {
                const categoryPath = path.join(commandsDir, category);
                const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
                const status = loadJSON(commandStatusFile);

                if (commandFiles.length === 0) return i.reply({ content: 'Komut yok.', flags: MessageFlags.Ephemeral });

                const options = commandFiles.map(file => {
                    const cmdData = require(path.join(categoryPath, file));
                    const cmdName = cmdData.data ? cmdData.data.name : file.replace('.js', '');
                    const mapStatus = status[cmdName] === false ? false : true;
                    return {
                        label: `${cmdName} (${mapStatus ? 'Açık' : 'Kapalı'})`,
                        value: cmdName,
                        emoji: mapStatus ? getEmojiId(emojis.command_on || '🟩') : getEmojiId(emojis.command_off || '🟥')
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
                    new ButtonBuilder().setCustomId('back_to_categories').setLabel('Kategori Listesine Dön').setStyle(ButtonStyle.Secondary).setEmoji(getEmojiId(emojis.back || '⬅️'))
                );

                if (!i.deferred && !i.replied) {
                    await i.update({ embeds: [embed], components: [menu, back] });
                } else {
                    await i.editReply({ embeds: [embed], components: [menu, back] });
                }
            }

            async function toggleCommandStatus(i, cmdName) {
                const status = loadJSON(commandStatusFile);
                if (status[cmdName] === false) delete status[cmdName];
                else status[cmdName] = false;
                saveJSON(commandStatusFile, status);
                await updateToCommandList(i, currentCategory);
            }
        } catch (error) {
            console.error('Admin command error:', error);
            await interaction.editReply({ content: `Bir hata oluştu: ${error.message}` });
        }
    },
};
