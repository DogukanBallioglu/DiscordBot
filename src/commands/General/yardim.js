const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('yardım')
        .setDescription('Botun komutlarını ve kategorilerini listeler.'),

    async execute(interaction) {
        // Invite Link
        const inviteLink = 'https://discord.com/oauth2/authorize?client_id=1456962521989910549&permissions=8&integration_type=0&scope=bot+applications.commands';

        // Komut Klasörlerini (Kategorileri) Oku
        const commandsPath = path.join(__dirname, '..');
        const prefixCommandsPath = path.join(__dirname, '../../prefixCommands');

        const slashFolders = fs.readdirSync(commandsPath).filter(file => fs.statSync(path.join(commandsPath, file)).isDirectory());
        let prefixFolders = [];

        if (fs.existsSync(prefixCommandsPath)) {
            prefixFolders = fs.readdirSync(prefixCommandsPath).filter(file => fs.statSync(path.join(prefixCommandsPath, file)).isDirectory());
        }

        // Klasöleri Birleştir ve Tekilleştir (Set kullanarak)
        const commandFolders = [...new Set([...slashFolders, ...prefixFolders])];

        // Kategori İsimlerini Emojilerle Eşleştir (İsteğe bağlı güzel görünüm için)
        // Emojiler (Yerel Tanımlama)
        const emojis = {
            moderation: '🛡️',
            general: '✨',
            fun: '🎮',
            owner: '👑',
            folder: '📁'
        };

        const categoryEmojis = {
            'Moderation': emojis.moderation,
            'General': emojis.general,
            'Games': emojis.fun,
            'Owner': emojis.owner
        };

        const categoryNames = {
            'Moderation': 'Moderasyon',
            'General': 'Genel',
            'Games': 'Eğlence / Oyun',
            'Owner': 'Sahip / Kurucu'
        };

        // Ana Menü Embed'i
        const generateMainMenu = () => {
            const embed = new EmbedBuilder()
                .setTitle('🤖 Bot Yardım Menüsü')
                .setDescription('Aşağıdaki menüden komutlarını görmek istediğiniz kategoriyi seçiniz.')
                .setColor('Blurple')
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .addFields(
                    { name: '🌐 Bağlantılar', value: `[Botu Sunucuna Ekle](${inviteLink})`, inline: false }
                );

            // Select Menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('help_category_select')
                .setPlaceholder('Bir kategori seçin...')
                .addOptions(
                    commandFolders.map(folder => ({
                        label: categoryNames[folder] || folder,
                        value: folder,
                        emoji: categoryEmojis[folder] || emojis.folder || '📁',
                        description: `${folder} kategorisindeki komutları listeler.`
                    }))
                );

            // Invite Button
            const inviteButton = new ButtonBuilder()
                .setLabel('Botu Davet Et')
                .setStyle(ButtonStyle.Link)
                .setURL(inviteLink);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);
            const row2 = new ActionRowBuilder().addComponents(inviteButton);

            return { embeds: [embed], components: [row1, row2] };
        };

        const response = await interaction.reply({ ...generateMainMenu(), flags: MessageFlags.Ephemeral });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000 // 5 dakika
        });

        collector.on('collect', async i => {
            if (i.customId === 'help_category_select') {
                const selectedCategory = i.values[0];

                // Seçilen kategorideki dosyaları oku (Slash Komutları)
                const categoryPath = path.join(commandsPath, selectedCategory);
                let commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

                // Prefix Komutlarını da Kontrol Et (Özellikle Games için)
                const prefixCommandsPath = path.join(__dirname, '../../prefixCommands', selectedCategory);
                let prefixCommandFiles = [];
                if (fs.existsSync(prefixCommandsPath)) {
                    prefixCommandFiles = fs.readdirSync(prefixCommandsPath).filter(file => file.endsWith('.js'));
                }

                const embed = new EmbedBuilder()
                    .setTitle(`${categoryEmojis[selectedCategory] || emojis.folder || '📁'} ${categoryNames[selectedCategory] || selectedCategory} Komutları`)
                    .setColor('Blue')
                    .setDescription('Aşağıda bu kategorideki komutlar listelenmiştir.');

                const fields = [];

                // 1. Slash Komutlarını Ekle
                commandFiles.forEach(file => {
                    try {
                        // Cache'den silerek taze veri al (Geliştirme aşamasında yararlı, prod için gereksiz olabilir ama zararı yok)
                        const filePath = path.join(categoryPath, file);
                        delete require.cache[require.resolve(filePath)];
                        const cmd = require(filePath);

                        if (cmd.data && cmd.data.name) {
                            fields.push({
                                name: `/${cmd.data.name}`,
                                value: cmd.data.description || 'Açıklama yok.',
                                inline: false
                            });
                        }
                    } catch (err) {
                        console.error(`Slash komutu yüklenirken hata: ${file}`, err);
                    }
                });

                // 2. Prefix Komutlarını Ekle
                prefixCommandFiles.forEach(file => {
                    try {
                        const filePath = path.join(prefixCommandsPath, file);
                        delete require.cache[require.resolve(filePath)];
                        const cmd = require(filePath);

                        if (cmd.name) {
                            fields.push({
                                name: `r!${cmd.name}`,
                                value: `${cmd.description || 'Açıklama yok.'} ${cmd.aliases ? `\n(Alternatif: ${cmd.aliases.map(a => `r!${a}`).join(', ')})` : ''}`,
                                inline: false
                            });
                        }
                    } catch (err) {
                        console.error(`Prefix komutu yüklenirken hata: ${file}`, err);
                    }
                });

                if (fields.length === 0) {
                    embed.addFields({ name: 'Komut Yok', value: 'Bu kategoride henüz komut bulunmuyor.' });
                } else {
                    // Embed limit koruması (25 field sınırı)
                    if (fields.length > 25) {
                        const remaining = fields.length - 25;
                        fields.splice(25);
                        fields.push({ name: `...ve ${remaining} komut daha`, value: 'Daha fazla bilgi için diğer sayfaları kontrol edin.' });
                    }

                    embed.addFields(fields);
                }

                // Buton satırını koru, select menüyü güncellemek yerine interactionı güncelle
                // Eğer buton satırını (invite) tekrar göndermek istiyorsak generateMainMenu'den alabiliriz veya yeniden oluşturabiliriz.
                // Kullanıcı tekrar seçim yapabilsin diye menüyü de tekrar gönderiyoruz.

                // Menüyü tekrar oluştur ama placeholder güncelle veya aynı kalsın
                // Basitçe main menu bileşenlerini yeniden kullanıyoruz
                const mainLayout = generateMainMenu();
                // Sadece embed'i değiştiriyoruz
                await i.update({ embeds: [embed], components: mainLayout.components });
            }
        });
    }
};
