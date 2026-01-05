const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const { db } = require('../../firebase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('otorol')
        .setDescription('Otorol yönetim panelini açar.'),

    async execute(interaction) {
        // 1. Manuel Yetki Kontrolü (Daha belirgin mesaj için) + Kurucu İzni
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                content: '❌ Bu komutu kullanmak için **Yönetici** yetkisine sahip olmalısınız!',
                flags: MessageFlags.Ephemeral
            });
        }

        const guildId = interaction.guild.id;

        // Veritabanından mevcut ayarı çek
        let currentAutoRoleId = null;
        try {
            const doc = await db.collection('guilds').doc(guildId).get();
            if (doc.exists) {
                currentAutoRoleId = doc.data().autoRoleId;
            }
        } catch (err) {
            console.error(err);
        }

        // Dinamik Buton/Embed Oluşturucu
        const updateUI = (activeRole, selectedRole) => {
            const isSystemActive = !!activeRole;
            const isDifferentRoleSelected = selectedRole && selectedRole !== activeRole;

            // Eğer bir rol seçildiyse: "Ayarları Kaydet" veya "Güncelle"
            // Eğer sistem aktifse ve aynı rol seçiliyse (veya seçim yoksa): "Sistemi Kapat"

            let button;

            if (isDifferentRoleSelected) {
                // Yeni bir rol seçildi, kaydetmeye hazır
                button = new ButtonBuilder()
                    .setCustomId('otorol_action')
                    .setLabel('Ayarları Kaydet / Güncelle')
                    .setStyle(ButtonStyle.Success) // Yeşil
                    .setEmoji('💾');
            } else if (isSystemActive) {
                // Sistem aktif, değişiklik yok -> Kapatma seçeneği sun
                button = new ButtonBuilder()
                    .setCustomId('otorol_action')
                    .setLabel('Sistemi Kapat')
                    .setStyle(ButtonStyle.Danger) // Kırmızı
                    .setEmoji('🗑️');
            } else {
                // Sistem kapalı ve henüz rol seçilmedi
                button = new ButtonBuilder()
                    .setCustomId('otorol_action')
                    .setLabel('Önce Rol Seçiniz')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Otorol Sistemi Ayarları')
                .setDescription(`Aşağıdaki menüden sunucuya yeni gelenlere verilecek rolü seçebilirsin.`)
                .addFields(
                    {
                        name: 'Mevcut Durum',
                        value: activeRole ? `✅ **Aktif**\nVerilecek Rol: <@&${activeRole}>` : '❌ **Kapalı**'
                    }
                )
                .setColor(activeRole ? 0x00FF00 : 0xFF0000)
                .setFooter({ text: 'Otorol Sistemi' });

            const row1 = new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('otorol_select')
                    .setPlaceholder('Bir rol seçin...')
                    .setMinValues(1)
                    .setMaxValues(1)
            );

            const row2 = new ActionRowBuilder().addComponents(button);

            return { embeds: [embed], components: [row1, row2] };
        };

        let selectedRoleId = currentAutoRoleId; // Seçili rol başlangıçta mevcut rol ile aynı olsun

        const initialUI = updateUI(currentAutoRoleId, selectedRoleId);

        const response = await interaction.reply({
            ...initialUI,
            flags: MessageFlags.Ephemeral
        });

        // Collector Başlat
        const collector = response.createMessageComponentCollector({
            time: 300000 // 5 dakika
        });

        collector.on('collect', async i => {
            // -- SEÇİM MENÜSÜ --
            if (i.customId === 'otorol_select') {
                selectedRoleId = i.values[0];

                // UI Güncelle (Active değişmedi, Selected değişti)
                await i.update(updateUI(currentAutoRoleId, selectedRoleId));
            }

            // -- TEK BUTON İŞLEMİ --
            else if (i.customId === 'otorol_action') {
                const isSystemActive = !!currentAutoRoleId;
                const isDifferentRoleSelected = selectedRoleId && selectedRoleId !== currentAutoRoleId;

                // SENARYO 1: Yeni bir rol seçildi -> KAYDET / GÜNCELLE
                if (isDifferentRoleSelected) {
                    const role = interaction.guild.roles.cache.get(selectedRoleId);

                    // Yetki Kontrolü
                    if (role && role.position >= interaction.guild.members.me.roles.highest.position) {
                        return i.reply({
                            content: '❌ Seçilen rol benim yetkimden yüksekte, bu rolü veremem! Başka rol seç.',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    try {
                        await db.collection('guilds').doc(guildId).set({
                            autoRoleId: selectedRoleId
                        }, { merge: true });

                        currentAutoRoleId = selectedRoleId; // Artık aktif rol bu

                        await i.update({
                            content: `✅ Otorol başarıyla **${role ? role.name : 'Rol'}** olarak ayarlandı!`,
                            ...updateUI(currentAutoRoleId, selectedRoleId)
                        });
                    } catch (error) {
                        console.error(error);
                        await i.reply({ content: '❌ Hata oluştu.', flags: MessageFlags.Ephemeral });
                    }
                }

                // SENARYO 2: Değişiklik yok ama sistem aktif -> KAPAT
                else if (isSystemActive) {
                    try {
                        await db.collection('guilds').doc(guildId).update({
                            autoRoleId: require('firebase-admin').firestore.FieldValue.delete()
                        });

                        currentAutoRoleId = null;
                        selectedRoleId = null; // Seçimi de sıfırla

                        await i.update({
                            content: '✅ Otorol sistemi kapatıldı.',
                            ...updateUI(currentAutoRoleId, selectedRoleId)
                        });
                    } catch (error) {
                        console.error(error);
                        await i.reply({ content: '❌ Kapatılırken hata oluştu.', flags: MessageFlags.Ephemeral });
                    }
                }
            }
        });
    },
};
