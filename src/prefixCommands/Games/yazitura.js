const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'yazitura',
    aliases: ['yt', 'coinflip'],
    description: 'Yazı tura atar.',
    async execute(message, args) {
        const choices = ['Yazı', 'Tura'];
        const result = choices[Math.floor(Math.random() * choices.length)];

        // Gelişmiş bir embed
        const embed = new EmbedBuilder()
            .setColor(result === 'Yazı' ? 'Gold' : 'Silver')
            .setTitle('🪙 Yazı Tura')
            .setDescription(`Havaya fırlatılan para **${result}** geldi!`)
            .setTimestamp()
            .setFooter({ text: `${message.author.username} tarafından atıldı`, iconURL: message.author.displayAvatarURL() });

        // Görsel eklemek istersen buraya .setThumbnail(...) ekleyebilirsin
        // Şimdilik sadece embed ile dönüyoruz.

        await message.reply({ embeds: [embed] });
    }
};
