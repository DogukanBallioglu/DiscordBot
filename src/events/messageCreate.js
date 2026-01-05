const { Events } = require('discord.js');
const Groq = require('groq-sdk');

let groq;
const cooldowns = new Map();

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

        // Bot etiketlendi mi veya yanıt verildi mi (yanıt verilen mesaj botunsa) kontrol et
        const isMentioned = message.mentions.users.has(client.user.id);
        const isReplyToBot = message.reference && (await message.fetchReference().catch(() => null))?.author.id === client.user.id;

        // Sadece bot etiketlendiğinde çalışsın (User request specifically mentioned talking to AI, usually via mention)
        // Ancak "reply atılırsa" dendiği için, bota reply atıldığında da çalışması mantıklı olabilir. 
        // Kodun mevcut hali sadece mention'a bakıyor. Kullanıcı "reply atılırsa reply atılan mesaj hakkında..." dedi.
        // Bu genellikle botun mesajına reply atılması veya bot etiketlenerek başkasına reply atılması senaryolarını kapsar.
        // Mevcut mantığı koruyarak mention check'i tutuyorum.

        if (isMentioned) {
            // 10 Saniye Cooldown Kontrolü
            const now = Date.now();
            const cooldownAmount = 10 * 1000;

            if (cooldowns.has(message.author.id)) {
                const expirationTime = cooldowns.get(message.author.id) + cooldownAmount;

                if (now < expirationTime) {
                    const timeLeft = Math.round((expirationTime - now) / 1000);
                    return message.reply(`Lütfen tekrar mesaj göndermeden önce ${timeLeft} saniye bekle.`);
                }
            }

            cooldowns.set(message.author.id, now);
            setTimeout(() => cooldowns.delete(message.author.id), cooldownAmount);

            // Etiketi mesajdan çıkar
            let query = message.content.replace(/<@!?\d+>/g, '').trim();

            // Reply kontrolü ve Context ekleme
            let contextMessage = "";
            if (message.reference && message.reference.messageId) {
                try {
                    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                    if (repliedMessage.content) {
                        contextMessage = `Kullanıcı şu mesaja yanıt veriyor: "${repliedMessage.content}".\nBu mesaja dayanarak cevap ver.\n`;
                    }
                } catch (error) {
                    console.error("Reply mesajı alınamadı:", error);
                }
            }

            if (!query && !contextMessage) {
                return message.reply('Merhaba! Bana bir soru sorabilirsin.');
            }

            const finalUserContent = contextMessage ? `${contextMessage} Kullanıcının sorusu: ${query}` : query;

            try {
                // Yazıyor... göstergesi
                await message.channel.sendTyping();

                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: "Sen yardımsever bir Discord asistanısın. Sadece Türkçe konuş. Asla başka dillerden kelime kullanma. Kullanıcının sorularına net, doğru ve sadece Türkçe cevaplar ver. Eğer bir mesaja yanıt veriliyorsa, konuyu dağıtmadan o mesaj bağlamında kal."
                        },
                        {
                            role: "user",
                            content: finalUserContent,
                        },
                    ],
                    model: "llama-3.3-70b-versatile",
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
                // Rate limit hatası vs. olursa kullanıcıya bildirmemek bazen daha iyidir ama burada genel hata mesajı var.
                await message.reply("Üzgünüm, bir hata oluştu ve isteğini işleyemedim.");
            }
        }
    },
};
