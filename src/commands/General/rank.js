const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getRankData } = require('../../utils/rankUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Kendi seviyenizi veya başka bir kullanıcının seviyesini görüntüler.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('Seviyesine bakmak istediğiniz kullanıcı')
                .setRequired(false)),

    async execute(interaction) {
        if (!interaction.guild) return;
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('target') || interaction.user;
        const guildId = interaction.guild.id;

        const data = await getRankData(guildId, targetUser.id);

        // Şimdilik sadece Embed, ileride Canvas (resimli) yapılabilir.
        // İlerleme çubuğu hesaplama (Basit görselleştirme)
        const currentLevelXp = 5 * Math.pow(data.level, 2) + 50 * data.level + 100;
        const progress = Math.min(Math.max(data.xp / currentLevelXp, 0), 1);
        const barLength = 10;
        const filled = Math.round(progress * barLength);
        const empty = barLength - filled;
        const progressBar = '🟦'.repeat(filled) + '⬜'.repeat(empty);

        const embed = new EmbedBuilder()
            .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() })
            .setTitle('🏆 Kullanıcı Seviye Kartı')
            .setColor('Gold')
            .addFields(
                { name: 'Seviye', value: `**${data.level}**`, inline: true },
                { name: 'Toplam XP', value: `${data.xp} / ${currentLevelXp} (Current Lvl)`, inline: true },
                { name: 'İlerleme', value: `${progressBar} %${Math.floor(progress * 100)}`, inline: false }
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `${interaction.guild.name} Rank Sistemi` });

        await interaction.editReply({ embeds: [embed] });
    }
};
