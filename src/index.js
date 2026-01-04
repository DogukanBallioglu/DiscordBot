const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();
require('./firebase');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
client.commandArray = [];

const functionFiles = fs.readdirSync('./src/functions').filter(file => file.endsWith('.js'));

for (const file of functionFiles) {
    require(`./functions/${file}`)(client);
}

client.handleEvents();

client.login(process.env.DISCORD_TOKEN);
