const { Events, EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('../utils/settingsCache');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (!newMessage.guild || newMessage.author?.bot) return;

        const emojis = {
            note: '📝'
        };

        // İçerik değişmediyse (örn. embed yüklendiyse) işlem yapma
        if (oldMessage.content === newMessage.content) return;

        try {
            const settings = await getGuildSettings(newMessage.guild.id);
            const logs = settings?.logs;

            if (!logs || !logs.channelId || !logs.messageLog) return;

            const logChannel = newMessage.guild.channels.cache.get(logs.channelId);
            if (!logChannel) return;

            const oldContent = oldMessage.content ? (oldMessage.content.length > 1000 ? oldMessage.content.substring(0, 1000) + '...' : oldMessage.content) : 'Yok';
            const newContent = newMessage.content ? (newMessage.content.length > 1000 ? newMessage.content.substring(0, 1000) + '...' : newMessage.content) : 'Yok';

            const embed = new EmbedBuilder()
                .setTitle(`${emojis.note || '📝'} Mesaj Düzenlendi`)
                .setColor('Yellow')
                .addFields(
                    { name: 'Mesaj Sahibi', value: `${newMessage.author.tag} (<@${newMessage.author.id}>)`, inline: true },
                    { name: 'Kanal', value: `<#${newMessage.channel.id}>`, inline: true },
                    { name: 'Mesaj Linki', value: `[Tıkla ve Git](${newMessage.url})`, inline: true },
                    { name: 'Eski Mesaj', value: oldContent, inline: false },
                    { name: 'Yeni Mesaj', value: newContent, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${newMessage.guild.name} Log Sistemi`, iconURL: newMessage.guild.iconURL() });

            logChannel.send({ embeds: [embed] }).catch(() => { });
        } catch (e) {
            console.error('Message Update Log hatası:', e);
        }
    },
};
