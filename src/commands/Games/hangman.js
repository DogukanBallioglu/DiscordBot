const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const words = [
    { word: 'ELMA', category: 'Meyve' },
    { word: 'ARMUT', category: 'Meyve' },
    { word: 'BILGISAYAR', category: 'Teknoloji' },
    { word: 'TELEFON', category: 'Teknoloji' },
    { word: 'KALEM', category: 'Eşya' },
    { word: 'KITAP', category: 'Eşya' },
    { word: 'SUNUCU', category: 'Teknoloji' },
    { word: 'DISCORD', category: 'Uygulama' },
    { word: 'TURKIYE', category: 'Ülke' },
    { word: 'ISTANBUL', category: 'Şehir' },
    { word: 'ANKARA', category: 'Şehir' },
    { word: 'IZMIR', category: 'Şehir' },
    { word: 'YAZILIM', category: 'Meslek' },
];

const hangmanStages = [
    `
 __________
 |    │
 |
 |
 |
 |
_|_`,
    `
 __________
 |    │
 |   😵
 |
 |
 |
_|_`,
    `
 __________
 |    │
 |   😵
 |   ()
 |
 |
_|_`,
    `
 __________
 |    │
 |   😵
 |  ┌()
 |
 |
_|_`,
    `
 __________
 |    │
 |   😵
 |  ┌()┐
 |
 |
_|_`,
    `
 __________
 |    │
 |   😵
 |  ┌()┐
 |   /
 |
_|_`,
    `
 __________
 |    │
 |   😵
 |  ┌()┐
 |   /\\
 |
_|_`
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adamasmaca')
        .setDescription('Resimli adam asmaca oyunu oynarsınız.'),
    async execute(interaction) {
        const selection = words[Math.floor(Math.random() * words.length)];
        const word = selection.word;
        const category = selection.category;

        const guessed = [];
        let lives = 6;
        let display = word.split('').map(() => '_');
        let gameOver = false;

        const generateEmbed = (status, feedback = '') => {
            const currentStage = hangmanStages[6 - lives];

            let color = 0x2F3136;
            let topText = feedback;

            if (status === 'win') {
                color = 0x00FF00;
                topText = '**Tebrikler, Kazandın!**';
            } else if (status === 'lose') {
                color = 0xFF0000;
                topText = '**Maalesef Kaybettin!**';
            }

            const wrongLetters = guessed.filter(g => !word.includes(g)).join(', ') || 'Yok';

            // Show full word if lost
            const wordDisplay = status === 'lose' ? word.split('').join(' ') : display.join(' ');

            let description = '';

            if (status === 'playing') {
                description = `
${topText}
**Kelime:** \` ${wordDisplay} \`
**Kategori:** \` ${category} \`
**Yanlış Harfler:** ${wrongLetters}   
**Yanlış Tahmin Hakkı:** ${lives}

\`\`\`
${currentStage}
\`\`\`
                `;
            } else {
                description = `
${topText}
**Kelime:** \` ${wordDisplay} \`
                `;
            }

            const embed = new EmbedBuilder()
                .setDescription(description.trim())
                .setColor(color);

            // Sadece oyun devam ediyorsa footer ekle
            if (status === 'playing') {
                embed.setFooter({ text: 'Oyunu sonlandırmak için "bitir" yazınız.' });
            }

            return embed;
        };

        const message = await interaction.reply({ embeds: [generateEmbed('playing', `**${interaction.client.user.username} - Adam Asmaca**`)], fetchReply: true });

        const filter = m => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({ filter, time: 600000 });

        collector.on('collect', async m => {
            if (gameOver) return;


            const content = m.content.toUpperCase().replace(/İ/g, 'I');
            let feedback = '';

            if (content === 'BITIR') {
                gameOver = true;
                collector.stop();

                const wrongLetters = guessed.filter(g => !word.includes(g)).join(', ') || 'Yok';
                const stoppedEmbed = new EmbedBuilder()
                    .setDescription(`**Oyun Sonlandırıldı!**\n**Kelime:** \` ${word.split('').join(' ')} \`\n**Kategori:** \` ${category} \`\n**Yanlış Harfler:** ${wrongLetters}\n   **Yanlış Tahmin Hakkı:** ${lives}`)
                    .setColor(0xFF0000);

                await m.reply({ embeds: [stoppedEmbed] }).catch(() => m.channel.send({ embeds: [stoppedEmbed] }));
                return;
            }

            if (content.length === 1) {
                if (guessed.includes(content)) {
                    const warnEmbed = new EmbedBuilder()
                        .setDescription('**Bu harf söylendi**')
                        .setColor(0xFFA500);
                    await m.reply({ embeds: [warnEmbed] }).catch(() => { });
                    return;
                }

                guessed.push(content);

                if (word.includes(content)) {
                    feedback = '**Çok İyisin!**';
                    for (let i = 0; i < word.length; i++) {
                        if (word[i] === content) display[i] = content;
                    }
                } else {
                    feedback = '**Yanlış Harf!**';
                    lives--;
                }
            } else {
                if (content === word) {
                    display = word.split('');
                    feedback = '**Doğru Kelime!**';
                } else {
                    lives -= 2;
                    feedback = '**Yanlış Kelime!**';
                }
            }

            if (lives <= 0) {
                gameOver = true;
                collector.stop();
                await m.reply({ embeds: [generateEmbed('lose')] }).catch(() => m.channel.send({ embeds: [generateEmbed('lose')] }));
            } else if (!display.includes('_')) {
                gameOver = true;
                collector.stop();
                await m.reply({ embeds: [generateEmbed('win')] }).catch(() => m.channel.send({ embeds: [generateEmbed('win')] }));
            } else {
                await m.reply({ embeds: [generateEmbed('playing', feedback)] }).catch(() => m.channel.send({ embeds: [generateEmbed('playing', feedback)] }));
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.followUp({ content: 'Süre doldu!', ephemeral: true }).catch(() => { });
            }
        });
    },
};
