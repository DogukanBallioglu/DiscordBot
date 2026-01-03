const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sunucu-bilgi')
        .setDescription('Sunucu hakkında detaylı bilgi verir.'),
    async execute(interaction) {
        const { guild } = interaction;

        // Sunucu sahibini ve detayları tam çekelim
        await guild.fetch();
        const owner = await guild.fetchOwner();

        // Kanalları türlerine göre sayalım
        const channels = guild.channels.cache;
        const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
        const categories = channels.filter(c => c.type === ChannelType.GuildCategory).size;

        // Üyeleri sayalım
        const totalMembers = guild.memberCount;
        // Not: Kesin bot/insan ayrımı için tüm üyeleri fetch etmek gerekir ama bu işlem büyük sunucularda yavaştır.
        // Şimdilik sadece toplam sayıyı gösterelim veya cache'dekileri kullanalım.
        const botCount = guild.members.cache.filter(m => m.user.bot).size; // Sadece cache'dekiler

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
                { name: '👥 Üyeler', value: `**Toplam:** ${totalMembers}`, inline: true },
                { name: '💬 Kanallar', value: `**Metin:** ${textChannels}\n**Ses:** ${voiceChannels}\n**Kategori:** ${categories}`, inline: true },
                { name: '📊 Diğer İstatistikler', value: `**Rol Sayısı:** ${guild.roles.cache.size}\n**Emoji Sayısı:** ${guild.emojis.cache.size}\n**Takviye:** ${guild.premiumSubscriptionCount || 0} (Seviye ${guild.premiumTier})`, inline: false },
                { name: '🛡️ Doğrulama Seviyesi', value: verificationLevels[guild.verificationLevel], inline: true }
            )
            .setFooter({ text: `Sorgulayan: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        if (guild.banner) {
            embed.setImage(guild.bannerURL({ size: 1024 }));
        }

        await interaction.reply({ embeds: [embed] });
    },
};
