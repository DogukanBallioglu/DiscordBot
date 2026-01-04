const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType, PermissionFlagsBits } = require('discord.js');
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
        .setName('yonetim')
        .setDescription('Bot yönetim paneli (Sadece Kurucu)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        // Kurucu ID kontrolü
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: 'Bu komutu kullanmak için yetkiniz yok.', ephemeral: true });
        }

        const commandsDir = path.join(__dirname, '..');
        // Kategorileri al (Owner klasörü hariç)
        const categories = fs.readdirSync(commandsDir).filter(file => fs.statSync(path.join(commandsDir, file)).isDirectory() && file !== 'Owner');

        // Ana Menü Embed
        const mainEmbed = new EmbedBuilder()
            .setTitle('Bot Yönetim Paneli')
            .setDescription('Lütfen işlem yapmak istediğiniz kategoriyi seçin.')
            .setColor('Blue');

        // Kategori Seçim Menüsü
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

        const reply = await interaction.reply({ embeds: [mainEmbed], components: [categoryMenu], fetchReply: true });

        // Collector oluştur
        const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 600000 }); // 10 dakika
        const buttonCollector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600000 });

        let currentCategory = null;

        // Menü etkileşimleri
        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Bu menüyü sadece komutu kullanan kişi yönetebilir.', ephemeral: true });
            }

            if (i.customId === 'select_category') {
                currentCategory = i.values[0];
                await updateToCommandSelection(i, currentCategory, commandsDir);
            } else if (i.customId === 'select_command') {
                const selectedCommand = i.values[0];
                await toggleCommandStatus(i, selectedCommand);
            }
        });

        // Buton etkileşimleri (Geri butonu)
        buttonCollector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return;

            if (i.customId === 'back_to_categories') {
                await i.update({ embeds: [mainEmbed], components: [categoryMenu] });
            }
        });

        async function updateToCommandSelection(i, category, baseDir) {
            const categoryPath = path.join(baseDir, category);
            const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
            const status = loadStatus();

            if (commandFiles.length === 0) {
                return i.reply({ content: 'Bu kategoride komut bulunamadı.', ephemeral: true });
            }

            const commandOptions = commandFiles.map(file => {
                const cmdName = require(path.join(categoryPath, file)).data.name;
                const isDisabled = status[cmdName] === false; // false means disabled means... wait. Let's decide: true=active, false=disabled? Or status keys exist = disabled?
                // Let's say: stored value 'false' means disabled. undefined or 'true' means enabled.
                // Status icon
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
            // Toggle
            if (status[commandName] === false) {
                delete status[commandName]; // Enable (remove from disabled list)
            } else {
                status[commandName] = false; // Disable
            }
            saveStatus(status);

            // Refresh the menu to show new state
            // We need to know the category again. "currentCategory" variable handles this scope.
            await updateToCommandSelection(i, currentCategory, commandsDir);
        }
    },
};
