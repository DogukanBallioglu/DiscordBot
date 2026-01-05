const { Events } = require('discord.js');
const Groq = require('groq-sdk');

let groq;
const cooldowns = new Map();
const spamMap = new Map();

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot) return;

        if (!process.env.GROQ_API_KEY) {
            console.warn("GROQ_API_KEY eksik. Lütfen .env dosyanızı veya ortam değişkenlerinizi kontrol edin.");
            return;
        }

        // --- MODERASYON / GUARD KONTROLLERİ ---
        const { processedXP } = require('../utils/rankUtils');
        const { getGuildSettings } = require('../utils/settingsCache');
        // EmbedBuilder'ı import ediyoruz
        const { PermissionsBitField, EmbedBuilder } = require('discord.js');

        if (message.guild) {
            const settings = await getGuildSettings(message.guild.id);

            // Yönetici yetkisi veya Kurucu ise KORUMA kontrollerini atla
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) { //&& message.author.id !== process.env.OWNER_ID) {

                const guard = settings?.guard;

                if (guard) {
                    // Helper: Ayarları Normalize Et
                    const normalize = (val) => {
                        if (typeof val === 'boolean') return { enabled: val, exemptRoles: [], exemptChannels: [], warningEnabled: true };
                        if (!val) return { enabled: false, exemptRoles: [], exemptChannels: [], warningEnabled: true };
                        if (!val.exemptChannels) val.exemptChannels = [];
                        if (val.warningEnabled === undefined) val.warningEnabled = true;
                        return val;
                    };

                    const badWordsConfig = normalize(guard.badWords);
                    const linksConfig = normalize(guard.links);
                    const adsConfig = normalize(guard.ads);
                    const spamConfig = normalize(guard.spam);

                    // Helper: Rol ve Kanal Kontrolü (Muaf mı?)
                    const isExempt = (config) => {
                        if (!config.enabled) return true; // Kapalıysa "muaf" sayılır

                        // Rol Kontrolü
                        if (config.exemptRoles && config.exemptRoles.length > 0) {
                            if (message.member.roles.cache.hasAny(...config.exemptRoles)) return true;
                        }

                        // Kanal Kontrolü
                        if (config.exemptChannels && config.exemptChannels.includes(message.channel.id)) {
                            return true;
                        }

                        return false;
                    };

                    // Ortak Uyarı Fonksiyonu
                    const sendWarning = async (reason) => {
                        try {
                            const embed = new EmbedBuilder()
                                .setColor('Red')
                                .setDescription(`${message.author}, ${reason}`)
                                .setFooter({ text: 'Bu mesaj 5 saniye sonra silinecektir.' });

                            const msg = await message.channel.send({ content: `${message.author}`, embeds: [embed] });
                            setTimeout(() => msg.delete().catch(() => { }), 5000);
                        } catch (e) {
                            console.error('Uyarı mesajı gönderilemedi:', e);
                        }
                    };

                    // 1. Küfür Koruması
                    if (badWordsConfig.enabled && !isExempt(badWordsConfig)) {
                        // "?" kaldırıldı, yanlış pozitifleri önlemek için Regex sınırları (boundary) eklendi.
                        const badWords = ["mk", "amk", "aq", "orospu", "piç", "yavşak", "sik", "yarrak", "oç"];
                        const contentLower = message.content.toLowerCase();

                        // Kelimeyi "içeren" değil, kelime "başlangıçı" uyanları bul.
                        // Örn: "eksik" ("sik" içerir ama başında boşluk yok) -> EŞLEŞMEZ (Güvenli)
                        // "siktir" ("sik" ile başlar) -> EŞLEŞİR (Yakalar)
                        // " koç " ("oç" içerir ama başında k var) -> EŞLEŞMEZ (Güvenli)
                        if (badWords.some(word => new RegExp(`(^|\\s)${word}`, 'i').test(contentLower))) {
                            try {
                                if (message.deletable) await message.delete();
                                if (badWordsConfig.warningEnabled !== false) await sendWarning("bu sunucuda küfür yasaktır! 🤬");
                                return;
                            } catch (err) { }
                        }
                    }

                    // 2. Link Koruması
                    if (linksConfig.enabled && !isExempt(linksConfig)) {
                        const linkRegex = /((https?:\/\/[^\s]+)|(www\.[^\s]+))/gi;
                        const links = message.content.match(linkRegex);

                        if (links) {
                            // İzin verilen GIF ve Resim domainleri
                            const allowedDomains = ["tenor.com", "giphy.com", "imgur.com", "media.discordapp.net", "cdn.discordapp.com", "discord.com", "discordapp.com"];

                            // Linklerden HERHANGİ BİRİ izin verilenler listesinde DEĞİLSE yasakla
                            const isBannedLink = links.some(link => !allowedDomains.some(domain => link.toLowerCase().includes(domain)));

                            if (isBannedLink) {
                                try {
                                    if (message.deletable) await message.delete();
                                    if (linksConfig.warningEnabled !== false) await sendWarning("bu sunucuda link paylaşmak yasaktır! (Sadece GIF/Resim serbest) 🔗");
                                    return;
                                } catch (err) { }
                            }
                        }
                    }

                    // 3. Reklam Koruması
                    if (adsConfig.enabled && !isExempt(adsConfig)) {
                        const adRegex = /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/gi;
                        if (adRegex.test(message.content)) {
                            try {
                                if (message.deletable) await message.delete();
                                if (adsConfig.warningEnabled !== false) await sendWarning("bu sunucuda reklam yapmak yasaktır! 📢");
                                return;
                            } catch (err) { }
                        }
                    }

                    // 4. Spam Koruması
                    if (spamConfig.enabled && !isExempt(spamConfig)) {
                        const LIMIT = 5;
                        const TIME_WINDOW = 5000;

                        if (!spamMap.has(message.author.id)) {
                            spamMap.set(message.author.id, { count: 1, firstMessageTime: Date.now() });
                        } else {
                            const userData = spamMap.get(message.author.id);
                            const now = Date.now();

                            if (now - userData.firstMessageTime < TIME_WINDOW) {
                                userData.count++;
                                if (userData.count >= LIMIT) {
                                    try {
                                        if (message.deletable) await message.delete();
                                        if (userData.count === LIMIT && spamConfig.warningEnabled !== false) {
                                            await sendWarning("çok hızlı mesaj gönderiyorsun! Spam yapma! 🔇");
                                        }
                                        return;
                                    } catch (err) { }
                                }
                            } else {
                                spamMap.set(message.author.id, { count: 1, firstMessageTime: now });
                            }
                        }
                    }
                }
            }

            // --- RANK SİSTEMİ ---
            if (settings && settings.rank) {
                await processedXP(message, settings.rank);
            }
        }

        // --- AI (YAPAY ZEKA) İŞLEMLERİ ---

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
                    const warningMessage = await message.reply(`Lütfen tekrar mesaj göndermeden önce ${timeLeft} saniye bekle.`);

                    const interval = setInterval(async () => {
                        const currentTime = Date.now();
                        const remaining = Math.round((expirationTime - currentTime) / 1000);

                        if (remaining <= 0) {
                            clearInterval(interval);
                            try {
                                await warningMessage.delete();
                            } catch (e) {
                                // Mesaj zaten silinmiş olabilir veya hata oluşmuş olabilir
                            }
                        } else {
                            try {
                                await warningMessage.edit(`Lütfen tekrar mesaj göndermeden önce ${remaining} saniye bekle.`);
                            } catch (e) {
                                clearInterval(interval);
                            }
                        }
                    }, 1000);

                    return;
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
