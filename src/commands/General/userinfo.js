const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kullanici-bilgi')
        .setDescription('Kullanıcı hakkında bilgi verir.')
        .addUserOption(option =>
            option.setName('hedef')
                .setDescription('Bilgisi istenen kullanıcı')
                .setRequired(false)),
    async execute(interaction) {
        // Banner verisi için kullanıcıyı "force: true" ile çekmemiz lazım
        const targetUser = await interaction.client.users.fetch(interaction.options.getUser('hedef')?.id || interaction.user.id, { force: true });
        const member = await interaction.guild.members.fetch(targetUser.id);

        // Tarih formatlama
        const createdAt = new Date(targetUser.createdAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        const joinedAt = new Date(member.joinedAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

        // Rolleri al
        const roles = member.roles.cache
            .filter(r => r.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(r => r)
            .slice(0, 10)
            .join(', ') || 'Rolü Yok';

        // 1. Genel Bilgiler Embedi
        const generalEmbed = new EmbedBuilder()
            .setColor(member.displayHexColor)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setAuthor({ name: `${targetUser.username} - Genel Bilgiler`, iconURL: targetUser.displayAvatarURL() })
            .addFields(
                { name: '🆔 Kullanıcı ID', value: `\`${targetUser.id}\``, inline: true },
                { name: '👤 Kullanıcı Adı', value: `\`${targetUser.tag}\``, inline: true },
                { name: '🤖 Bot mu?', value: targetUser.bot ? 'Evet' : 'Hayır', inline: true },
                { name: '📅 Hesap Oluşturma', value: createdAt, inline: false },
            )
            .setFooter({ text: `Sorgulayan: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        // 2. Sunucu Bilgileri Embedi
        const serverEmbed = new EmbedBuilder()
            .setColor(member.displayHexColor)
            .setThumbnail(member.displayAvatarURL({ dynamic: true, size: 256 }))
            .setAuthor({ name: `${targetUser.username} - Sunucu Bilgileri`, iconURL: member.displayAvatarURL() })
            .addFields(
                { name: '🏷️ Sunucu Takma Adı', value: member.nickname || 'Yok', inline: true },
                { name: '📥 Sunucuya Katılma', value: joinedAt, inline: true },
                { name: '👑 En Yüksek Rol', value: `${member.roles.highest}`, inline: false },
                { name: `🎭 Rolleri (${member.roles.cache.size - 1})`, value: roles, inline: false }
            )
            .setFooter({ text: `Sorgulayan: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        // 3. Avatar Embedi
        const avatarEmbed = new EmbedBuilder()
            .setColor(member.displayHexColor)
            .setAuthor({ name: `${targetUser.username} - Profil Fotoğrafı`, iconURL: targetUser.displayAvatarURL() })
            .setImage(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setFooter({ text: `Sorgulayan: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        // 4. Banner Embedi
        const bannerEmbed = new EmbedBuilder()
            .setColor(member.displayHexColor)
            .setAuthor({ name: `${targetUser.username} - Banner`, iconURL: targetUser.displayAvatarURL() })
            .setFooter({ text: `Sorgulayan: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        if (targetUser.banner) {
            bannerEmbed.setImage(targetUser.bannerURL({ dynamic: true, size: 1024 }));
        } else {
            bannerEmbed.setDescription('❌ **Kullanıcının bannerı yok.**');
        }

        // Seçim Menüsünü Oluştur
        const select = new StringSelectMenuBuilder()
            .setCustomId('userinfo_menu')
            .setPlaceholder('Görüntülemek istediğiniz bilgiyi seçin')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Genel Bilgiler')
                    .setDescription('Kullanıcının Discord genelindeki bilgileri')
                    .setValue('general')
                    .setEmoji('🌍'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Sunucu Bilgileri')
                    .setDescription('Kullanıcının bu sunucudaki bilgileri')
                    .setValue('server')
                    .setEmoji('🏰'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Avatar Gör')
                    .setDescription('Kullanıcının profil fotoğrafını büyük boyutta gösterir')
                    .setValue('avatar')
                    .setEmoji('🖼️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Banner Gör')
                    .setDescription('Kullanıcının profil bannerını gösterir')
                    .setValue('banner')
                    .setEmoji('🚩'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Kapat')
                    .setDescription('Menüyü kapatır ve mesajı siler')
                    .setValue('close')
                    .setEmoji('❌'),
            );

        const row = new ActionRowBuilder().addComponents(select);

        const response = await interaction.reply({
            embeds: [generalEmbed],
            components: [row]
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Bu menüyü sadece komutu kullanan kişi kontrol edebilir.', ephemeral: true });
            }

            const selection = i.values[0];

            if (selection === 'general') {
                await i.update({ embeds: [generalEmbed] });
            } else if (selection === 'server') {
                await i.update({ embeds: [serverEmbed] });
            } else if (selection === 'avatar') {
                await i.update({ embeds: [avatarEmbed] });
            } else if (selection === 'banner') {
                await i.update({ embeds: [bannerEmbed] });
            } else if (selection === 'close') {
                await i.message.delete().catch(() => { });
                collector.stop();
            }
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => { });
        });
    },
};
