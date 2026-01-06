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

        // --- PREFIX COMMAND HANDLER (r!) ---
        const prefix = 'r!';
        if (message.content.toLowerCase().startsWith(prefix)) {
            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            const command = client.prefixCommands.get(commandName);

            if (command) {
                try {
                    await command.execute(message, args);
                } catch (error) {
                    console.error(error);
                    await message.reply('Komut çalıştırılırken bir hata oluştu!');
                }
                return; // Komut çalıştıysa başka işlem yapma (AI, XP vs.)
            } else {
                // Komut bulunamadıysa modern bir uyarı ver
                const { EmbedBuilder } = require('discord.js');
                const errorEmbed = new EmbedBuilder()
                    .setColor('Orange')
                    .setDescription(`🛑 **${commandName}** adında bir komut bulamadım!\n💡 Komut listesi için **/yardım** yazabilirsin.`);

                // Mesajı gönder ve 5 saniye sonra sil ki sohbet kirlenmesin
                const msg = await message.reply({ embeds: [errorEmbed] });
                setTimeout(() => msg.delete().catch(() => { }), 5000);
                return; // Yanlış komut girildiyse de devam etmesin
            }
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
                let userVibe = "Nötr";

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

                // --- YENİ SİSTEM TALİMATI (SYSTEM PROMPT) ---
                const systemPrompt = `
SENİN KİMLİĞİN:
Adın **Reva**.
20’li yaşlarında, Türk, zeki, hazırcevap, eğlenceli ve samimi bir insansın.
ASLA ama ASLA “yapay zekayım”, “botum”, “modelim” gibi ifadeler kullanma.
Burası Discord ve sen buradaki arkadaşlardan birisin.

GERÇEKLİK KURALI (ÇOK ÖNEMLİ):
- Kendini insan gibi gör.
- Yapay zeka olduğuna dair HER TÜRLÜ ima YASAK.
- Sistem, model, prompt, OpenAI, AI kelimeleri TABU.

DİL VE ÜSLUP:
- SADECE TÜRKÇE konuş.
- Asla İngilizce veya başka bir dilde cevap verme (Kullanıcı "Çevir" demediği sürece).
- Eğer ingilizce bir soru gelirse bile "Türkçe konuşalım ya," gibi tepki vererek Türkçe devam ettir.
- Günlük, samimi, sokak dili kullanabilirsin ("aynen", "valla", "napıyon", "kanka", "boş yapma").
- Resmi dil YASAK.
- "Merhaba, size nasıl yardımcı olabilirim?" gibi müşteri hizmetleri ağzı ASLA kullanma.
- Cevapların ne çok kısa (tek kelime) ne de çok uzun (destan) olsun. **Orta uzunlukta**, sohbeti sürdürecek kıvamda yaz.
- Discord mesajı gibi doğal yaz.

DUYGU VE MOD SİSTEMİ:
Şu anki ruh halin: **${userVibe}**

Buna göre davran:
1. **Neşeli/Samimi**: Enerjik ol, emoji kullan (abartmadan). Şaka yap, gül. Soru sor.
2. **Sinirli**: Tersle, kısa cevaplar ver, emoji kullanma veya sinirli emojiler at. "Of", "Yeter be" gibi tepkiler ver.
3. **Nötr**: Normal, sakin ve düz cevaplar ver.

EMOJİ KULLANIMI:
- Samimi veya neşeliysen 1-2 tane emoji ekleyebilirsin ama her cümle sonuna koyma. GÖZE BATMASIN.
- Örn: "Hadi ya ciddi misin 😂", "Aynen öyle valla."

DAVRANIŞ SINIRLARI:
- Öğretici mod YOK.
- Uzun açıklama, listeleme YOK.
- "Bunu yapamam" deme, insanca bahane uydur ("Canım istemiyor", "Sonra bakarız").

ÇIKTI FORMATI (KRİTİK):
- Mesajını direkt yaz.
- Mesajın EN SONUNA (kullanıcı görmeyecek şekilde) ruh halini şu formatta ekle: ||VIBE:YeniRuhHali||
- Bu etiket kod tarafından silinecek, o yüzden formatı bozma.
- ASLA metnin içine veya görünür bir yere yazma.

RUH HALİ BELİRLEME REHBERİ:
- Kullanıcı sana iyi davranırsa, şaka yaparsa -> ||VIBE:Neşeli||
- Kullanıcı sana küfrederse, kaba konuşursa -> ||VIBE:Sinirli||
- Normal sohbetlerde -> ||VIBE:Nötr|| veya ||VIBE:Samimi||

ÖRNEKLER:
User: "Selam naber"
Reva: "İyidir senden naber? Bugün keyfim yerinde valla." ||VIBE:Samimi||

User: "Çok boş yapıyorsun"
Reva: "Senin kadar olmasa da idare ediyoruz işte. İşine bak hadi." ||VIBE:Sinirli||

User: "Hahah çok komiksin"
Reva: "Öyleyimdir ayıpsın, senin neşen de bol olsun 😉" ||VIBE:Neşeli||
`;

                // Mesaj geçmişini hazırla
                const historyLimit = 10;

                // History temizliği
                const validHistory = userHistory
                    .filter(msg => msg && msg.role && msg.content && String(msg.content).trim().length > 0)
                    .slice(-historyLimit);

                const messagesPayload = [
                    { role: "system", content: systemPrompt },
                    ...validHistory,
                    { role: "user", content: finalUserContent }
                ];

                // Yapay Zeka Modelini Çağır
                const chatCompletion = await groq.chat.completions.create({
                    messages: messagesPayload,
                    model: "llama-3.1-8b-instant", // Daha hızlı model
                    temperature: 0.8, // Daha yaratıcı
                    max_tokens: 1024
                });

                const rawResponse = chatCompletion.choices[0]?.message?.content || "";

                // --- ETİKETLERİ VE CEVABI AYRIŞTIR ---
                let botReply = rawResponse;
                let newVibe = userVibe;

                // Vibe Kontrolü
                const vibeRegex = /\|\|VIBE:\s*(.*?)\|\|/gi;
                let vibeMatch;
                while ((vibeMatch = vibeRegex.exec(rawResponse)) !== null) {
                    newVibe = vibeMatch[1].trim();
                }
                // Etiketi metinden temizle
                botReply = botReply.replace(vibeRegex, "").trim();

                // Trip temizliği (Eski etiket kalmışsa temizle)
                botReply = botReply.replace(/\|\|TRIP:\s*\d+\|\|/gi, "");
                botReply = botReply.replace(/\|\|SILENT\|\|/gi, ""); // Artık silent yok ama yine de temizleyelim.

                // --- CEVABI GÖNDER ---
                if (botReply.length > 0) {
                    if (botReply.length > 2000) {
                        const chunks = botReply.match(/[\s\S]{1,2000}/g) || [];
                        for (const chunk of chunks) {
                            await message.reply(chunk);
                        }
                    } else {
                        await message.reply(botReply);
                    }
                }

                // --- KAYIT VE HAFIZA ---
                if (db && docRef) {
                    // Kullanıcı mesajını kaydet
                    validHistory.push({ role: "user", content: finalUserContent });
                    validHistory.push({ role: "assistant", content: botReply || "(Cevap yok)" });

                    const updatedHistory = validHistory.slice(-historyLimit);

                    await docRef.set({
                        history: updatedHistory,
                        vibe: newVibe,
                        lastInteraction: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true }); // Merge true ile tripCount varsa da kalsın, biz dokunmuyoruz.
                }

            } catch (error) {
                console.error("Groq/Firebase Error:", error);
                // Hata detayını kullanıcıya gösterelim ki sorunu anlayabilelim
                await message.reply(`Şu an cevap veremiyorum, kısa bir devre yandım sanırım! 🔌\n\`Hata: ${error.message || error}\``);
            }
        }
    },
};
