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

        // --- AI (YAPAY ZEKAI) İŞLEMLERİ ---

        if (!groq) {
            groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        }

        // db import edildi mi? En tepeye eklenmesi gerek ama burada lazy load yapabiliriz ya da en üste ekletebiliriz.
        // Ancak clean code için en üste eklemek daha doğru olur.
        // Şimdilik burada require edelim, global scope'a karışmasın.
        const { db, admin } = require('../firebase');

        const isMentioned = message.mentions.users.has(client.user.id);
        const isReplyToBot = message.reference && (await message.fetchReference().catch(() => null))?.author.id === client.user.id;

        // Bot etiketlendiyse veya bota yanıt verildiyse çalıştır
        if (isMentioned || isReplyToBot) {

            // Veritabanı bağlantı kontrolü
            if (!db) {
                console.error("Firebase DB aktif değil, hafıza özelliği kullanılamıyor.");
                // DB yoksa bile en azından cevap versin diye devam edebiliriz ama history çalışmaz.
            }

            // 10 Saniye Cooldown Kontrolü
            const now = Date.now();
            const cooldownAmount = 10 * 1000;

            if (cooldowns.has(message.author.id)) {
                const expirationTime = cooldowns.get(message.author.id) + cooldownAmount;

                if (now < expirationTime) {
                    const timeLeft = Math.round((expirationTime - now) / 1000);
                    const warningMsgContent = `Lütfen tekrar mesaj göndermeden önce ${timeLeft} saniye bekle.`;

                    // Kullanıcıyı spamlamamak için warning mesajını yönet
                    // Mevcut kodda reply atılmış, bunu koruyalım.
                    const warningMessage = await message.reply(warningMsgContent);

                    // Geri sayım efekti (opsiyonel, user'ın mevcut kodundaki gibi)
                    // Basitlik adına sadece silmeyi ekliyorum, çünkü karmaşık interval bazen api limitine takılabilir.
                    setTimeout(() => warningMessage.delete().catch(() => { }), timeLeft * 1000);
                    return;
                }
            }

            cooldowns.set(message.author.id, now);
            setTimeout(() => cooldowns.delete(message.author.id), cooldownAmount);

            // Etiketi mesajdan çıkar
            let query = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();

            // Reply kontrolü ve Context ekleme
            let contextMessage = "";
            if (message.reference && message.reference.messageId) {
                try {
                    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                    // Eğer yanıt verilen mesaj botun kendi mesajıysa, bunu history'den de çekebilirdik ama
                    // reply içeriğini direkt context'e eklemek daha garantidir.
                    if (repliedMessage.content) {
                        contextMessage = `[Bağlam: Kullanıcı şu mesaja yanıt veriyor: "${repliedMessage.content}"]\n`;
                    }
                } catch (error) {
                    console.error("Reply mesajı alınamadı:", error);
                }
            }

            if (!query && !contextMessage) {
                return message.reply('Merhaba! Bana bir soru sorabilirsin.');
            }

            const finalUserContent = contextMessage ? `${contextMessage} ${query}` : query;

            try {
                await message.channel.sendTyping();

                // --- HAFIZA (MEMORY) YÖNETİMİ ---
                let userHistory = [];
                let userVibe = "Nötr"; // Varsayılan duygu durumu

                let docRef;
                if (db) {
                    docRef = db.collection('ai_conversations').doc(message.author.id);
                    const doc = await docRef.get();
                    if (doc.exists) {
                        const data = doc.data();
                        userHistory = data.history || [];
                        userVibe = data.vibe || "Nötr";
                    }
                }

                // System Prompt - Kişilik ve Kurallar
                // System Prompt - Kişilik ve Kurallar
                const systemPrompt = `
KİMLİK:
Sen **Reva** adında, 20'li yaşlarında, esprili ve zeki bir Türk gencisin.
KESİNLİKLE bir "Yapay Zeka" veya "Bot" gibi davranma. Kendini gerçek bir insan olarak gör.
Sanki bir Discord sunucusunda arkadaşlarınla sohbet ediyormuş gibi rahat, doğal ve samimi konuş.

DİL KURALLARI (ÇOK ÖNEMLİ):
1. **SADECE VE SADECE TÜRKÇE** konuş.
2. **ASLA** Çince, Japonca, Korece, Kiril veya Arapça karakterler kullanma.
3. Yabancı dilde cevap verme, sadece Türkçe.
4. Emoji kullanmayı ihmal etme ama abartma.

KULLANICI ANALİZİ (MEVCUT DURUM): "${userVibe}"

DAVRANIŞ REHBERİ (MEVCUT DURUMA GÖRE):
- **Kaba/Gıcık/Sinirli**: "Hayırdır?", "Ne diyorsun sen?", "İşine bak" gibi kısa, ters ve atarlı cevaplar ver. Asla alttan alma, trip at.
- **İyi/Nazik/Samimi**: Çok cana yakın ol. "Kanka", "Dostum" gibi hitaplar kullanabilirsin. Şakalaş.
- **Nötr**: Standart bir arkadaş gibi konuş.

GÖREVİN VE ÇIKTI FORMATI:
1. Kullanıcıya **İNSAN GİBİ** cevap ver.
2. Cevabının **EN SONUNA**, kullanıcının tavrına göre güncellenmiş duygu durumunu şu özel etiket içinde ekle: ||VIBE:Durum||
3. Bu etiketi ASLA cümlenin ortasında kullanma, sadece en sonda.
4. Kullanıcıya asla "Vibe: Samimi" gibi şeyler söyleme. Sadece normal sohbet et, etiketi gizli bırak.

Örnek Çıktılar:
- (Kullanıcı küfür ederse): Ağzını topla istersen, uğraşamam seninle. ||VIBE:Kaba||
- (Kullanıcı hal hatır sorarsa): İyiyim ya nolsun, yuvarlanıp gidiyoruz. Sen naber? ||VIBE:Samimi||
`;

                // Mesaj geçmişini API formatına uygun hale getir
                // Son 10 mesajı (5 çift) alalım ki token limiti dolmasın
                const historyLimit = 10;
                const recentHistory = userHistory.slice(-historyLimit);

                const messagesPayload = [
                    { role: "system", content: systemPrompt },
                    ...recentHistory,
                    { role: "user", content: finalUserContent }
                ];

                const chatCompletion = await groq.chat.completions.create({
                    messages: messagesPayload,
                    model: "llama-3.3-70b-versatile",
                    temperature: 0.7, // Biraz yaratıcılık için
                    max_tokens: 1024
                });

                const rawResponse = chatCompletion.choices[0]?.message?.content || "Bir cevap oluşturulamadı.";

                // Vibe ve Cevabı Ayrıştır
                // Regex güncellemesi: Büyük/küçük harf duyarsız, boşluklara esnek
                const vibeRegex = /\|\|VIBE:\s*(.*?)\|\|/i;
                const match = rawResponse.match(vibeRegex);

                let botReply = rawResponse;
                let newVibe = userVibe;

                if (match) {
                    // Etiketi mesajdan tamamen sil
                    botReply = rawResponse.replace(match[0], '').trim();
                    // Yeni durumu al
                    newVibe = match[1].trim();
                }

                // Cevabı Gönder
                if (botReply) {
                    if (botReply.length > 2000) {
                        const chunks = botReply.match(/[\s\S]{1,2000}/g) || [];
                        for (const chunk of chunks) {
                            await message.reply(chunk);
                        }
                    } else {
                        await message.reply(botReply);
                    }
                }

                // Hafızayı Güncelle (Db varsa)
                if (db && docRef) {
                    // Yeni mesajları ekle
                    recentHistory.push({ role: "user", content: finalUserContent });
                    recentHistory.push({ role: "assistant", content: botReply }); // Vibe tag'i temizlenmiş hali

                    // Tekrar limitle (history şişmesin)
                    const updatedHistory = recentHistory.slice(-historyLimit);

                    await docRef.set({
                        history: updatedHistory,
                        vibe: newVibe,
                        lastInteraction: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }

            } catch (error) {
                console.error("Groq/Firebase Error:", error);
                await message.reply("Şu an cevap veremiyorum, kısa bir devre yandım sanırım! 🔌");
            }
        }
    },
};
