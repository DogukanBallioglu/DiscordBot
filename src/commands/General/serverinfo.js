const { SlashCommandBuilder, EmbedBuilder, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../../firebase');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sunucu-bilgi')
        .setDescription('Sunucu hakkında detaylı bilgi verir.'),
    async execute(interaction) {
        // Emojiler (Yerel Tanımlama)
        const emojis = {
            owner: '👑',
            id: '🆔',
            calendar: '<:reva_calendar:1458961051113488384>',
            members: '<:reva_members:1458961065403744296>',
            message: '💬',
            stats: '📊',
            moderation: '🛡️',
            back: '<:reva_back:1458957137278406824>',
            next: '<:reva_next:1458957163501195346>',
            info: '<:reva_info:1458970790547558410>',
            join: '📥',
            leave: '📤',
            close: '✖️'
        };

        function getEmojiId(emoji) {
            if (!emoji) return null;
            const match = emoji.match(/<a?:.+:(\d+)>/);
            return match ? match[1] : emoji;
        }

        const { guild } = interaction;

        if (!guild.available) return interaction.reply({ content: 'Sunucu bilgileri şu anda alınamıyor.', ephemeral: true });

        await guild.fetch();
        const owner = await guild.fetchOwner();

        // --- Helper: General Info Embed ---
        const getGeneralEmbed = () => {
            const channels = guild.channels.cache;
            const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
            const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
            const categories = channels.filter(c => c.type === ChannelType.GuildCategory).size;

            const totalMembers = guild.memberCount;
            const botCount = guild.members.cache.filter(m => m.user.bot).size;

            const createdAt = new Date(guild.createdAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

            const verificationLevels = {
                0: 'Yok',
                1: 'Düşük',
                2: 'Orta',
                3: 'Yüksek',
                4: 'Çok Yüksek'
            };

            const embed = new EmbedBuilder()
                .setColor(0x2F3136)
                .setTitle(`${guild.name} - Sunucu Bilgileri`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
                .setDescription(guild.description || 'Sunucu açıklaması yok.')
                .addFields(
                    { name: `${emojis.owner} Sunucu Sahibi`, value: `<@${owner.id}>`, inline: true },
                    { name: `${emojis.id} Sunucu ID`, value: `\`${guild.id}\``, inline: true },
                    { name: `${emojis.calendar} Kuruluş Tarihi`, value: createdAt, inline: false },
                    { name: `${emojis.members} Üyeler`, value: `**Toplam:** ${totalMembers}\n**Bot:** ~${botCount}`, inline: true },
                    { name: `${emojis.message} Kanallar`, value: `**Metin:** ${textChannels}\n**Ses:** ${voiceChannels}\n**Kategori:** ${categories}`, inline: true },
                    { name: `${emojis.stats} Diğer İstatistikler`, value: `**Rol Sayısı:** ${guild.roles.cache.size}\n**Emoji Sayısı:** ${guild.emojis.cache.size}\n**Takviye:** ${guild.premiumSubscriptionCount || 0} (Seviye ${guild.premiumTier})`, inline: false },
                    { name: `${emojis.moderation} Doğrulama Seviyesi`, value: verificationLevels[guild.verificationLevel], inline: true }
                )
                .setFooter({ text: `Sorgulayan: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            if (guild.banner) {
                embed.setImage(guild.bannerURL({ size: 1024 }));
            }
            return embed;
        };

        // --- Helper: Fetch Joined Data ---
        const fetchJoinedMembers = async () => {
            let joinedMembers = [];
            let source = 'api'; // 'db' or 'api'

            // 1. Firebase check
            if (db) {
                try {
                    const doc = await db.collection('guilds').doc(guild.id).get();
                    if (doc.exists && doc.data().joinedMembers) {
                        joinedMembers = doc.data().joinedMembers;
                        source = 'db';
                    }
                } catch (e) {
                    console.error('Firebase fetching error:', e);
                }
            }

            // 2. Fallback to API if DB empty
            if (joinedMembers.length === 0) {
                try {
                    await guild.members.fetch();
                    const members = guild.members.cache
                        .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp)
                        .first(50);

                    joinedMembers = members.map(m => ({
                        id: m.id,
                        tag: m.user.tag,
                        joinedAt: m.joinedTimestamp
                    }));
                    source = 'api';
                } catch (error) {
                    console.log('Member fetch failed:', error);
                }
            }
            return { data: joinedMembers, source };
        };

        // --- Helper: Fetch Left Data ---
        const fetchLeftMembers = async () => {
            let leftMembers = [];
            if (db) {
                try {
                    const doc = await db.collection('guilds').doc(guild.id).get();
                    if (doc.exists && doc.data().leftMembers) {
                        leftMembers = doc.data().leftMembers;
                    }
                } catch (e) { console.error(e); }
            }
            return { data: leftMembers, source: 'db' };
        };

        // --- Helper: Generate List Embed (Paginated) ---
        const generateListEmbed = (title, items, page, source, color = 'Green') => {
            const itemsPerPage = 10;
            const start = page * itemsPerPage;
            const end = start + itemsPerPage;
            const slice = items.slice(start, end);
            const totalPages = Math.ceil(items.length / itemsPerPage) || 1;

            const description = slice.length > 0
                ? slice.map((m, index) => {
                    // Check if this is a "Left Member" record (has leftAt)
                    if (m.leftAt) {
                        const leftTime = Math.floor(m.leftAt / 1000);
                        const joinedTime = m.joinedAt ? Math.floor(m.joinedAt / 1000) : null;

                        let line = `\` ${start + index + 1}. \` **${m.tag}** (<@${m.id}>)\n   ${emojis.leave || '📤'} **Ayrıldı:** <t:${leftTime}:R>`;
                        if (joinedTime) {
                            line += ` | ${emojis.join || '📥'} **Katılmıştı:** <t:${joinedTime}:D>`; // :D for short date, or :R for relative
                        }
                        return line;
                    }

                    // Fallback for "Joined Members"
                    const timeKey = m.joinedAt;
                    return `\` ${start + index + 1}. \` **${m.tag}** (<@${m.id}>)\n   ${emojis.join || '📥'} **Katıldı:** <t:${Math.floor(timeKey / 1000)}:R>`;
                }).join('\n')
                : 'Veri bulunamadı.';

            const footerText = source === 'db'
                ? `Sayfa ${page + 1} / ${totalPages} • Veriler veritabanından çekildi.`
                : `Sayfa ${page + 1} / ${totalPages} • Veriler anlık sunucu listesinden çekildi.`;

            return new EmbedBuilder()
                .setTitle(title)
                .setColor(color)
                .setDescription(description)
                .setFooter({ text: footerText })
                .setTimestamp();
        };

        // --- Helper: Pagination Buttons ---
        const getPaginationButtons = (page, totalItems) => {
            const itemsPerPage = 10;
            const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

            const prevButton = new ButtonBuilder()
                .setCustomId('prev_page')
                .setEmoji(getEmojiId(emojis.back || '⬅️'))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0);

            const nextButton = new ButtonBuilder()
                .setCustomId('next_page')
                .setEmoji(getEmojiId(emojis.next || '➡️'))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1);

            return new ActionRowBuilder().addComponents(prevButton, nextButton);
        };

        // --- Menu Component ---
        const getMenuRow = () => {
            const menu = new StringSelectMenuBuilder()
                .setCustomId('serverinfo_menu')
                .setPlaceholder('Görüntülemek istediğiniz bilgiyi seçin...')
                .addOptions(
                    { label: 'Genel Bilgiler', value: 'general', emoji: getEmojiId(emojis.info || 'ℹ️') },
                    { label: 'Son Girenler', value: 'joined', emoji: getEmojiId(emojis.join || '📥') },
                    { label: 'Son Çıkanlar', value: 'left', emoji: getEmojiId(emojis.leave || '📤') },
                    { label: 'Kapat', value: 'close', emoji: getEmojiId(emojis.close || '✖️') }
                );
            return new ActionRowBuilder().addComponents(menu);
        };

        // --- Init ---
        // Varsayılan: Genel Bilgiler
        let currentView = 'general';
        let currentPage = 0;
        let currentData = [];
        let currentSource = 'api';

        const initialEmbed = getGeneralEmbed();
        const menuRow = getMenuRow();
        const response = await interaction.reply({ embeds: [initialEmbed], components: [menuRow], fetchReply: true });

        // --- Collector ---
        const collector = response.createMessageComponentCollector({ time: 600000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Bu menüyü sadece komutu kullanan kişi kullanabilir.', ephemeral: true });
            }

            // Handle Menu Selection
            if (i.isStringSelectMenu()) {
                const selection = i.values[0];
                await i.deferUpdate();

                if (selection === 'close') {
                    await i.message.delete();
                    return;
                }

                currentView = selection;
                currentPage = 0; // Reset page on view switch

                if (currentView === 'general') {
                    await i.editReply({ embeds: [getGeneralEmbed()], components: [menuRow] });
                }
                else if (currentView === 'joined') {
                    const res = await fetchJoinedMembers();
                    currentData = res.data;
                    currentSource = res.source;
                    const embed = generateListEmbed(`${emojis.join || '📥'} Son Katılan Üyeler`, currentData, currentPage, currentSource, 'Green');
                    const buttons = getPaginationButtons(currentPage, currentData.length);
                    await i.editReply({ embeds: [embed], components: [menuRow, buttons] });
                }
                else if (currentView === 'left') {
                    const res = await fetchLeftMembers();
                    currentData = res.data;
                    currentSource = res.source;
                    const embed = generateListEmbed(`${emojis.leave || '📤'} Son Ayrılan Üyeler`, currentData, currentPage, currentSource, 'Red');
                    const buttons = getPaginationButtons(currentPage, currentData.length);
                    await i.editReply({ embeds: [embed], components: [menuRow, buttons] });
                }
            }

            // Handle Buttons
            if (i.isButton()) {
                await i.deferUpdate();
                if (i.customId === 'prev_page') {
                    if (currentPage > 0) currentPage--;
                } else if (i.customId === 'next_page') {
                    const totalPages = Math.ceil(currentData.length / 10);
                    if (currentPage < totalPages - 1) currentPage++;
                }

                let embed;
                if (currentView === 'joined') {
                    embed = generateListEmbed(`${emojis.join || '📥'} Son Katılan Üyeler`, currentData, currentPage, currentSource, 'Green');
                } else {
                    embed = generateListEmbed(`${emojis.leave || '📤'} Son Ayrılan Üyeler`, currentData, currentPage, currentSource, 'Red');
                }

                const buttons = getPaginationButtons(currentPage, currentData.length);
                await i.editReply({ embeds: [embed], components: [menuRow, buttons] });
            }
        });

        collector.on('end', () => {
            const disabledMenu = StringSelectMenuBuilder.from(getMenuRow().components[0]).setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
            interaction.editReply({ components: [disabledRow] }).catch(() => { });
        });
    }
};
