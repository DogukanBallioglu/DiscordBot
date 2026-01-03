const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Botun gecikme süresini gösterir.'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setDescription(`Gecikme süresi: **${Date.now() - interaction.createdTimestamp}ms**`)
            .setColor(0x00AE86)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
