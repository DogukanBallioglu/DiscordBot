const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { updateUserRank } = require('../../utils/rankUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rankset')
        .setDescription('Kullanıcı rank işlemlerini yönetir.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        // 1. İşlem Seçimi (Zorunlu)
        .addStringOption(option =>
            option.setName('işlem')
                .setDescription('Yapılacak işlemi seçin.')
                .setRequired(true)
                .addChoices(
                    { name: 'Sıfırla', value: 'sıfırla' },
                    { name: 'Level Ayarla', value: 'level_ayarla' }
                ))
        // 2. Üye Seçimi (Zorunlu)
        .addUserOption(option =>
            option.setName('üye')
                .setDescription('İşlem yapılacak üye')
                .setRequired(true))
        // 3. Seviye Seçimi (Opsiyonel - Sadece level_ayarla için gerekli)
        .addIntegerOption(option =>
            option.setName('seviye')
                .setDescription('Yeni seviye (Sadece level ayarlarken gereklidir)')
                .setRequired(false)
                .setMinValue(1)),

    async execute(interaction) {
        if (!interaction.guild) return;

        // Yetki Kontrolü (Sunucu Sahibi veya Bot Sahibi)
        if (interaction.user.id !== interaction.guild.ownerId && interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: 'Bu komutu sadece sunucu sahibi ve bot sahibi kullanabilir.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const islem = interaction.options.getString('işlem');
        const target = interaction.options.getUser('üye');
        const level = interaction.options.getInteger('seviye');
        const guildId = interaction.guild.id;

        try {
            // SIFIRLA İŞLEMİ
            if (islem === 'sıfırla') {
                await updateUserRank(guildId, target.id, { level: 1, xp: 0 });

                const embed = new EmbedBuilder()
                    .setColor('Red')
                    .setTitle('♻️ Rank Sıfırlandı')
                    .setDescription(`${target} kullanıcısının rank verileri başarıyla sıfırlandı.`)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // LEVEL AYARLA İŞLEMİ
            if (islem === 'level_ayarla') {
                // Seviye girilmemişse hata ver
                if (!level) {
                    return interaction.editReply({
                        content: '❌ **Hata:** Level ayarlamak için lütfen `seviye` kısmına bir sayı giriniz.'
                    });
                }

                // Level set edildiğinde karışıklık olmaması için XP'yi sıfırlıyoruz.
                await updateUserRank(guildId, target.id, { level: level, xp: 0 });

                const embed = new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('✅ Seviye Güncellendi')
                    .setDescription(`${target} kullanıcısının seviyesi **${level}** olarak ayarlandı.`)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'İşlem sırasında bir hata oluştu.' });
        }
    }
};
