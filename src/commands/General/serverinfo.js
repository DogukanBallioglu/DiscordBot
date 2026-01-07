const { SlashCommandBuilder, EmbedBuilder, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { db } = require('../../firebase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sunucu-bilgi')
        .setDescription('Sunucu hakkında detaylı bilgi verir.'),
    async execute(interaction) {
        const { guild } = interaction;

        // Sunucu sahibini ve detayları tam çekelim
        if (!guild.available) return interaction.reply({ content: 'Sunucu bilgileri şu anda alınamıyor.', ephemeral: true });

        await guild.fetch();
        const owner = await guild.fetchOwner();

        // --- Helper Function: General Info Embed ---
        const getGeneralEmbed = () => {
            // Kanalları türlerine göre sayalım
            const channels = guild.channels.cache;
            const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
            const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
            const categories = channels.filter(c => c.type === ChannelType.GuildCategory).size;

            // Üyeleri sayalım
            const totalMembers = guild.memberCount;
            // Not: Cache üzerinden bot sayısını alıyoruz
            const botCount = guild.members.cache.filter(m => m.user.bot).size;
            const humanCount = totalMembers - botCount; // Tahmini

            // Tarih formatlama
            const createdAt = new Date(guild.createdAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

            // Doğrulama seviyeleri (İngilizce -> Türkçe)
            const verificationLevels = {
                0: 'Yok',
                1: 'Düşük',
                2: 'Orta',
                3: 'Yüksek',
                4: 'Çok Yüksek'
            };

            const embed = new EmbedBuilder()
                .setColor(0x2F3136)
                .setTitle(`${guild.name} - Sunucu Bilgileri`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
                .setDescription(guild.description || 'Sunucu açıklaması yok.')
                .addFields(
                    { name: '👑 Sunucu Sahibi', value: `<@${owner.id}>`, inline: true },
                    { name: '🆔 Sunucu ID', value: `\`${guild.id}\``, inline: true },
                    { name: '📅 Kuruluş Tarihi', value: createdAt, inline: false },
                    { name: '👥 Üyeler', value: `**Toplam:** ${totalMembers}\n**Bot:** ~${botCount}`, inline: true },
                    { name: '💬 Kanallar', value: `**Metin:** ${textChannels}\n**Ses:** ${voiceChannels}\n**Kategori:** ${categories}`, inline: true },
                    { name: '📊 Diğer İstatistikler', value: `**Rol Sayısı:** ${guild.roles.cache.size}\n**Emoji Sayısı:** ${guild.emojis.cache.size}\n**Takviye:** ${guild.premiumSubscriptionCount || 0} (Seviye ${guild.premiumTier})`, inline: false },
                    { name: '🛡️ Doğrulama Seviyesi', value: verificationLevels[guild.verificationLevel], inline: true }
                )
                .setFooter({ text: `Sorgulayan: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            if (guild.banner) {
                embed.setImage(guild.bannerURL({ size: 1024 }));
            }
            return embed;
        };

        // --- Helper Function: Last Joined Embed ---
        const getJoinedEmbed = async () => {
            // 'Son Girenler' için tüm üyeleri çekmemiz gerekiyor.
            // Discord API 'fetch({ limit: 20 })' ile en son gelenleri VERMEZ, rastgele verir.
            // Bu yüzden önce tüm listeyi cache'e alıp (fetch) sonra sıralamalıyız.
            try {
                // Sadece cache'de olmayanları değil, hepsini refresh edelim ki sıralama doğru olsun.
                await guild.members.fetch();
            } catch (error) {
                console.log('Member fetch failed or timed out:', error);
            }

            // Cache artık dolu, sıralama yapabiliriz.
            const members = guild.members.cache
                .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp)
                .first(15);

            // Listeyi oluştur
            const description = members.map((m, index) => {
                return `\` ${index + 1}. \` **${m.user.tag}** (<@${m.id}>)\n   📅 <t:${Math.floor(m.joinedTimestamp / 1000)}:R>`;
            }).join('\n');

            return new EmbedBuilder()
                .setTitle('📥 Son Katılan Üyeler (İlk 15)')
                .setColor('Green')
                .setDescription(description || 'Veri bulunamadı.')
                .setTimestamp();
        };

        // --- Helper Function: Last Left Embed ---
        const getLeftEmbed = async () => {
            if (!db) {
                return new EmbedBuilder()
                    .setTitle('Hata')
                    .setDescription('Veritabanı bağlantısı sağlanamadığı için veri çekilemiyor. Lütfen bot sahibine ulaşın.')
                    .setColor('Red');
            }

            let leftMembers = [];
            try {
                const doc = await db.collection('guilds').doc(guild.id).get();
                if (doc.exists && doc.data().leftMembers) {
                    leftMembers = doc.data().leftMembers;
                }
            } catch (e) {
                console.error('Firebase Error:', e);
                return new EmbedBuilder()
                    .setTitle('Data Hatası')
                    .setDescription('Veri çekilirken bir hata oluştu.')
                    .setColor('Red');
            }

            const description = leftMembers.length > 0
                ? leftMembers.map((m, index) => {
                    return `\` ${index + 1}. \` **${m.tag}** (<@${m.id}>)\n   📅 <t:${Math.floor(m.leftAt / 1000)}:R>`;
                }).join('\n')
                : 'Bot kayıtlarına göre henüz ayrılan bir üye yok. (Sistem yeni aktif edildi)';

            return new EmbedBuilder()
                .setTitle('📤 Son Ayrılan Üyeler (Kayıtlı)')
                .setColor('Red')
                .setDescription(description)
                .setFooter({ text: 'Not: Sadece bot aktifken ve veritabanı bağlıyken ayrılanlar kaydedilir.' })
                .setTimestamp();
        };


        // --- Create Menu ---
        const menu = new StringSelectMenuBuilder()
            .setCustomId('serverinfo_menu')
            .setPlaceholder('Görüntülemek istediğiniz bilgiyi seçin...')
            .addOptions(
                {
                    label: 'Genel Bilgiler',
                    description: 'Sunucu hakkında genel istatistikleri gösterir.',
                    value: 'general',
                    emoji: 'ℹ️'
                },
                {
                    label: 'Son Girenler',
                    description: 'Sunucuya en son katılan üyeleri listeler.',
                    value: 'joined',
                    emoji: '📥'
                },
                {
                    label: 'Son Çıkanlar',
                    description: 'Sunucudan en son ayrılan üyeleri listeler.',
                    value: 'left',
                    emoji: '📤'
                },
                {
                    label: 'Kapat',
                    description: 'Menüyü ve mesajı kapatır.',
                    value: 'close',
                    emoji: '✖️'
                }
            );

        const row = new ActionRowBuilder().addComponents(menu);

        const initialEmbed = getGeneralEmbed();
        const response = await interaction.reply({ embeds: [initialEmbed], components: [row], fetchReply: true });

        // --- Collector ---
        const collector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 600000 }); // 10 dakika

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Bu menüyü sadece komutu kullanan kişi kullanabilir.', ephemeral: true });
            }

            const selection = i.values[0];
            let newEmbed;

            await i.deferUpdate(); // Cevap verildiğini belirt

            if (selection === 'close') {
                await i.message.delete();
                return;
            }

            if (selection === 'general') {
                newEmbed = getGeneralEmbed();
            } else if (selection === 'joined') {
                newEmbed = await getJoinedEmbed();
            } else if (selection === 'left') {
                newEmbed = await getLeftEmbed();
            }

            await i.editReply({ embeds: [newEmbed], components: [row] });
        });

        collector.on('end', () => {
            // Süre bitince menüyü devre dışı bırak
            const disabledMenu = StringSelectMenuBuilder.from(menu).setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
            interaction.editReply({ components: [disabledRow] }).catch(() => { });
        });
    }
};
