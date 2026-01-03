const { Events } = require('discord.js');
const Groq = require('groq-sdk');

let groq;

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot) return;

        if (!process.env.GROQ_API_KEY) {
            console.warn("GROQ_API_KEY eksik. Lütfen .env dosyanızı veya ortam değişkenlerinizi kontrol edin.");
            return;
        }

        if (!groq) {
            groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        }

        // Bot etiketlendi mi kontrol et
        if (message.mentions.users.has(client.user.id)) {
            // Etiketi mesajdan çıkar
            const query = message.content.replace(/<@!?\d+>/g, '').trim();

            if (!query) {
                return message.reply('Merhaba! Bana bir soru sorabilirsin.');
            }

            try {
                // Yazıyor... göstergesi
                await message.channel.sendTyping();

                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: "Sen yardımsever bir Discord asistanısın. Türkçe cevap ver."
                        },
                        {
                            role: "user",
                            content: query,
                        },
                    ],
                    model: "llama3-8b-8192",
                });

                const response = chatCompletion.choices[0]?.message?.content || "Bir cevap oluşturulamadı.";

                // Discord 2000 karakter limiti kontrolü
                if (response.length > 2000) {
                    const chunks = response.match(/[\s\S]{1,2000}/g) || [];
                    for (const chunk of chunks) {
                        await message.reply(chunk);
                    }
                } else {
                    await message.reply(response);
                }

            } catch (error) {
                console.error("Groq API Error:", error);
                await message.reply("Üzgünüm, bir hata oluştu ve isteğini işleyemedim.");
            }
        }
    },
};
