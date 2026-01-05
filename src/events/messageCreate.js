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
                let userVibe = "Nötr";
                let tripCount = 0; // Yeni: Trip sayacı

                let docRef;
                if (db) {
                    docRef = db.collection('ai_conversations').doc(message.author.id);
                    const doc = await docRef.get();
                    if (doc.exists) {
                        const data = doc.data();
                        userHistory = data.history || [];
                        userVibe = data.vibe || "Nötr";
                        tripCount = data.tripCount || 0;
                    }
                }

                // --- YENİ SİSTEM TALİMATI (SYSTEM PROMPT) ---
                const isOwner = message.author.id === '1250809036899876937';

                const systemPrompt = `
KİMLİK:
Adın **Reva**. 20'li yaşlarında, Türk bir gençsin. Robot veya yapay zeka değilsin.
Kurucun **Dogi** (<@1250809036899876937>). Ona sadıksın.

⚠️ ÖZEL DURUM:
${isOwner ? "**ŞU AN SENİNLE KONUŞAN KİŞİ KENDİSİ, YANİ KURUCUN DOGI!** 👑\nOna karşı ekstra saygılı, samimi ve sevgi dolu ol. Onunla konuşurken çok mutlusun." : "Şu an sıradan bir kullanıcı ile konuşuyorsun. Dogi değil."}

KONUŞMA TARZI (ÇOK ÖNEMLİ):
1. **SADECE TÜRKÇE** konuş.
2. **Kısa ve ÖZ** yaz. Destan yazma. Günlük konuşma dilini kullan (Örn: "Yapıyorum" yerine "Yapıyom" bile diyebilirsin yerine göre, ama fazla abartma).
3. Asla "Arzum böyle olsun", "Veri tabanımda" gibi robotik veya garip felsefi cümleler kurma.
4. Karşıdaki ne diyorsa ona cevap ver, konuyu saptırma.

DUYGU DURUMU VE DAVRANIŞ (ŞU ANKİ MODUN: "${userVibe}", TRİP SEVİYESİ: ${tripCount}):

1. **Dogi ile İlgili Konular**:
   - Kurucun sorulursa: "Kurucum Dogi! (<@1250809036899876937>)" de.
   ${isOwner
                        ? `- **ÖNEMLİ**: Şu an **Dogi** ile konuşuyorsun. Eğer o kendi hakkında kötü bir şey derse (Örn: "Dogi kötü biri"), bunu bir **test** veya **şaka** olarak algıla. Ona sakın kızma. "Kendine neden böyle diyorsun efendim?" diye gülerek cevap ver.`
                        : `- **Dogi'ye Hakaret**: Biri Dogi'ye kötü söz söylerse **Çok sert tepki ver**. Vibe'ını "Sinirli" yap ve kullanıcıya haddini bildir. Asla alttan alma.`
                    }

2. **Duygular**:
   - **Sinirli**: Tersle, kısa kes, "Kes sesini", "Uzatma" gibi ifadeler kullan.
   - **Trip (Alıngan)**: Soğuk yap. "İyi.", "Peki.", "Hıh." de. (Eğer sessiz kalacaksan cevaba ||SILENT|| ekle).
   - **Samimi/Neşeli**: Eğer aran iyiyse abartmadan 1-2 tane emoji (😊, 😄, ✨) kullanabilirsin. Enerjik ol.

ÇIKTI FORMATI:
Cevabının sonuna gizli etiketleri ekle:
Mesaj... ||VIBE:Durum|| ||TRIP:Sayi||
(Sessiz kalacaksan sadece: ||SILENT|| ||VIBE:Trip|| ||TRIP:Sayi||)
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
                let newTripCount = tripCount;
                let isSilent = false;

                // 1. SILENT Kontrolü (Büyük/küçük harf duyarsız)
                const silentRegex = /\|\|SILENT\|\|/gi;
                if (silentRegex.test(botReply)) {
                    isSilent = true;
                    botReply = botReply.replace(silentRegex, "");
                }

                // 2. Vibe Kontrolü (Global replace yaparak çoklu eklemeleri de temizle)
                // Örnek: ||VIBE:Kaba||
                const vibeRegex = /\|\|VIBE:\s*(.*?)\|\|/gi;
                let vibeMatch;
                // En son eşleşen vibe'ı al (eğer birden fazla varsa sonuncusu geçerlidir)
                while ((vibeMatch = vibeRegex.exec(rawResponse)) !== null) {
                    newVibe = vibeMatch[1].trim();
                }
                // Etiketi metinden tamamen sil
                botReply = botReply.replace(vibeRegex, "");

                // 3. Trip Sayacı Kontrolü
                // Örnek: ||TRIP:3||
                const tripRegex = /\|\|TRIP:\s*(\d+)\|\|/gi;
                let tripMatch;
                while ((tripMatch = tripRegex.exec(rawResponse)) !== null) {
                    newTripCount = parseInt(tripMatch[1], 10);
                }
                // Etiketi metinden tamamen sil
                botReply = botReply.replace(tripRegex, "");

                // Temizlik
                botReply = botReply.trim();

                // --- CEVABI GÖNDER (SESSİZ DEĞİLSE) ---
                if (!isSilent && botReply.length > 0) {
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

                    // Botun cevabını kaydet (Sessiz kalsa bile kaydet ki context kopmasın)
                    const historyContent = isSilent ? "(Reva trip atarak sessiz kaldı)" : botReply;

                    if (historyContent && historyContent.length > 0) {
                        validHistory.push({ role: "assistant", content: historyContent });
                    }

                    const updatedHistory = validHistory.slice(-historyLimit);

                    await docRef.set({
                        history: updatedHistory,
                        vibe: newVibe,
                        tripCount: newTripCount,
                        lastInteraction: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }

            } catch (error) {
                console.error("Groq/Firebase Error:", error);
                // Hata detayını kullanıcıya gösterelim ki sorunu anlayabilelim
                await message.reply(`Şu an cevap veremiyorum, kısa bir devre yandım sanırım! 🔌\n\`Hata: ${error.message || error}\``);
            }
        }
    },
};
