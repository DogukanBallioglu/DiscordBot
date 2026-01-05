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
        const commandFolders = fs.readdirSync(commandsPath).filter(file => fs.statSync(path.join(commandsPath, file)).isDirectory());

        // Kategori İsimlerini Emojilerle Eşleştir (İsteğe bağlı güzel görünüm için)
        const categoryEmojis = {
            'Moderation': '🛡️',
            'General': '✨',
            'Games': '🎮',
            'Owner': '👑'
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
                        emoji: categoryEmojis[folder] || '📁',
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

                // Seçilen kategorideki dosyaları oku
                const categoryPath = path.join(commandsPath, selectedCategory);
                const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

                const embed = new EmbedBuilder()
                    .setTitle(`${categoryEmojis[selectedCategory] || '📁'} ${categoryNames[selectedCategory] || selectedCategory} Komutları`)
                    .setColor('Blue')
                    .setDescription('Aşağıda bu kategorideki komutlar listelenmiştir.');

                if (commandFiles.length === 0) {
                    embed.addFields({ name: 'Komut Yok', value: 'Bu kategoride henüz komut bulunmuyor.' });
                } else {
                    const fields = commandFiles.map(file => {
                        try {
                            const cmd = require(path.join(categoryPath, file));
                            // slash command data
                            if (cmd.data && cmd.data.name) {
                                return {
                                    name: `/${cmd.data.name}`,
                                    value: cmd.data.description || 'Açıklama yok.',
                                    inline: false
                                };
                            }
                        } catch (err) {
                            console.error(`Komut yüklenirken hata: ${file}`, err);
                        }
                        return null;
                    }).filter(Boolean); // null olanları temizle

                    // Embed limit koruması (25 field sınırı)
                    if (fields.length > 25) {
                        const remaining = fields.length - 25;
                        fields.splice(25);
                        fields.push({ name: `...ve ${remaining} komut daha`, value: 'Daha fazla bilgi için diğer sayfaları kontrol edin (Bu özellik eklenebilir).' });
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
