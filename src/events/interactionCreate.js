module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        // Komut durumunu kontrol et
        try {
            const fs = require('fs');
            const path = require('path');
            const statusPath = path.join(__dirname, '../data/commandStatus.json');

            if (fs.existsSync(statusPath)) {
                const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                if (status[interaction.commandName] === false && interaction.user.id !== process.env.OWNER_ID) {
                    return interaction.reply({
                        content: '⛔ Bu komut şu anda kurucu tarafından kapatılmıştır ve kullanılamaz.',
                        ephemeral: true
                    });
                }
            }
        } catch (err) {
            console.error('Komut durumu kontrol edilirken hata:', err);
        }

        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: 'Bu komutu çalıştırırken bir hata oluştu!',
                ephemeral: true
            });
        }
    },
};
