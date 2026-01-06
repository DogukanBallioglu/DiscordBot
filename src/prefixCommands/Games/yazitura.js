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
            .setColor(result === 'Yazı' ? 'Gold' : '#C0C0C0')
            .setTitle('🪙 Yazı Tura')
            .setDescription(`Havaya fırlatılan para **${result}** geldi!`)
            .setTimestamp()
            .setFooter({ text: `${message.author.username} tarafından atıldı`, iconURL: message.author.displayAvatarURL() });

        // Görsel eklemek istersen buraya .setThumbnail(...) ekleyebilirsin
        // Şimdilik sadece embed ile dönüyoruz.

        // Buton Ekle (Tekrar At)
        const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('reroll_coin')
                    .setLabel('Tekrar At')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Secondary)
            );

        const response = await message.reply({ embeds: [embed], components: [row] });

        // Collector Oluştur
        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'reroll_coin') {
                if (i.user.id !== message.author.id) {
                    return i.reply({ content: 'Bu butonu sadece komutu kullanan kişi kullanabilir.', flags: 64 }); // Ephemeral
                }

                const newResult = choices[Math.floor(Math.random() * choices.length)];

                const newEmbed = EmbedBuilder.from(embed)
                    .setColor(newResult === 'Yazı' ? 'Gold' : '#C0C0C0')
                    .setDescription(`Havaya fırlatılan para **${newResult}** geldi!`);

                await i.update({ embeds: [newEmbed] });
            }
        });

        collector.on('end', () => {
            // Süre bitince butonu devre dışı bırak
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    ButtonBuilder.from(row.components[0]).setDisabled(true)
                );
            response.edit({ components: [disabledRow] }).catch(() => { });
        });
    }
};
