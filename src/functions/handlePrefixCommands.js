const fs = require('fs');

module.exports = (client) => {
    client.handlePrefixCommands = async () => {
        client.prefixCommands = new Map();

        try {
            const commandFolders = fs.readdirSync('./src/prefixCommands');

            for (const folder of commandFolders) {
                const commandFiles = fs.readdirSync(`./src/prefixCommands/${folder}`).filter(file => file.endsWith('.js'));

                for (const file of commandFiles) {
                    const command = require(`../prefixCommands/${folder}/${file}`);
                    if (command.name) {
                        client.prefixCommands.set(command.name, command);
                        // Alias'ları da (takma adları) ekleyelim ki hızlı çalışsın
                        if (command.aliases && Array.isArray(command.aliases)) {
                            command.aliases.forEach(alias => {
                                client.prefixCommands.set(alias, command);
                            });
                        }
                    }
                }
            }
            console.log('Prefix (r!) komutları başarıyla yüklendi.');
        } catch (error) {
            // Klasör yoksa veya hata varsa
            console.warn('Prefix commands yüklenirken bir durum oluştu (Klasör boş olabilir):', error.message);
        }
    };
};
