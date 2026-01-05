const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../../utils/rankUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('top')
        .setDescription('Sunucudaki en yüksek seviyeli kullanıcıları listeler.'),

    async execute(interaction) {
        if (!interaction.guild) return;
        await interaction.deferReply();

        const leaderboard = await getLeaderboard(interaction.guild.id, 10);

        if (leaderboard.length === 0) {
            return interaction.editReply('Henüz sıralamaya giren kimse yok.');
        }

        const topEmbed = new EmbedBuilder()
            .setTitle(`🏆 ${interaction.guild.name} - En İyiler (TOP 10)`)
            .setColor('Gold')
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
            .setFooter({ text: 'Sıralama anlık güncellenir.' })
            .setTimestamp();

        let description = '';
        const medals = ['🥇', '🥈', '🥉'];

        for (let i = 0; i < leaderboard.length; i++) {
            const user = leaderboard[i];
            const medal = i < 3 ? medals[i] : `**#${i + 1}**`;

            // Kullanıcı ismini cache'den bulmaya çalışalım yoksa ID gösterelim
            // Toplu fetch yapmak daha iyi olabilir ama 10 kişi için döngüde fetch de kabul edilebilir (yavaş olabilir)
            // Sadece ID ile mention atmak en hafifi: <@ID>
            description += `${medal} <@${user.id}> \n└ **Level:** ${user.level} • **XP:** ${user.xp}\n\n`;
        }

        topEmbed.setDescription(description);

        await interaction.editReply({ embeds: [topEmbed] });
    }
};
