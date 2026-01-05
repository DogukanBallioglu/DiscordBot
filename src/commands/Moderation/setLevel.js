const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { updateUserRank } = require('../../utils/rankUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlevel')
        .setDescription('Bir kullanıcının seviyesini manuel olarak ayarlar.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('Seviyesi ayarlanacak kullanıcı')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Yeni seviye')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000)),

    async execute(interaction) {
        if (!interaction.guild) return;

        // Yetki Kontrolü (Admin veya Kurucu)
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: 'Bu komutu kullanmak için Yönetici yetkisine sahip olmalısınız.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const target = interaction.options.getUser('target');
        const level = interaction.options.getInteger('level');
        const guildId = interaction.guild.id;

        await updateUserRank(guildId, target.id, { level: level, xp: 0 });

        const embed = new EmbedBuilder()
            .setColor('Green')
            .setTitle('✅ Seviye Güncellendi')
            .setDescription(`${target} kullanıcısının seviyesi **${level}** olarak ayarlandı.`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
