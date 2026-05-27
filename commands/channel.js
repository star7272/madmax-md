// commands/channel.js
const settings = require('../settings');

// ============================================
// ENHANCEMENT: Newsletter channel info
// ============================================
const channelInfo = {
    contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: settings.newsletterJid,
            newsletterName: settings.botName || 'MADMAX MD',
            serverMessageId: 13
        }
    }
};

// ============================================
// Helper function for stylish messages
// ============================================
function formatChannelMessage(title, content, type = 'info') {
    const emojis = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        channel: '📢',
        jid: '🔢',
        followers: '👥',
        link: '🔗',
        reaction: '⚡',
        mute: '🔇',
        unmute: '🔊'
    };
    
    return `*『 ${emojis[type]} ${title} 』*
╭─────────⟢
${content}
╰─────────⟢

> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ MADMAX ᴍᴅ*`;
}

// ============================================
// Extract invite code from WhatsApp channel link
// ============================================
function getChannelInviteCode(link) {
    try {
        let cleanLink = link.trim();
        cleanLink = cleanLink.split('?')[0].split('#')[0];
        
        // Try to parse as URL
        try {
            const url = new URL(cleanLink);
            const parts = url.pathname.split('/').filter(Boolean);
            const code = parts[parts.length - 1];
            if (code && code.length > 0) {
                return code;
            }
        } catch (urlError) {
            // Continue to regex
        }
        
        // Regex patterns to extract invite code
        const patterns = [
            /(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9]+)/i,
            /\/channel\/([A-Za-z0-9]+)/i,
            /channel\/([A-Za-z0-9]+)/i
        ];
        
        for (const pattern of patterns) {
            const match = cleanLink.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        // If input is just the code itself
        if (/^[A-Za-z0-9]+$/.test(cleanLink)) {
            return cleanLink;
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting invite code:', error);
        return null;
    }
}

async function channelCommand(sock, chatId, message, args) {
    try {
        const input = args.trim();
        
        // Show usage if no input provided
        if (!input) {
            const usageMsg = formatChannelMessage(
                'CHANNEL INFO',
                `│ 📢 Get WhatsApp channel information!\n│\n│ *Usage:* .channel <link or invite code>\n│\n│ *Examples:*\n│ ♧ .channel https://whatsapp.com/channel/0029Vb7Ij8wHVvTZ97PlWG3l\n│ ♧ .channel/0029Vb7Ij8wHVvTZ97PlWG3l\n│ ♧ .channel 120363367299421766@newsletter`,
                'channel'
            );
            return await sock.sendMessage(chatId, { 
                text: usageMsg,
                ...channelInfo
            }, { quoted: message });
        }

        // Send processing message
        await sock.sendMessage(chatId, {
            react: { text: '🔍', key: message.key }
        });

        const processingMsg = formatChannelMessage(
            'FETCHING',
            `│ 🔍 Fetching channel information...\n│ 📌 *Input:* ${input}`,
            'info'
        );
        await sock.sendMessage(chatId, { 
            text: processingMsg,
            ...channelInfo
        }, { quoted: message });

        let inviteCode = null;
        let channelJid = null;

        // ============================================
        // EXTRACT INVITE CODE OR JID
        // ============================================
        try {
            // Case 1: Input is already a JID (ends with @newsletter)
            if (input.includes('@newsletter')) {
                channelJid = input;
                // For JID, we need to use the "get" method
                inviteCode = null;
            }
            // Case 2: Input is a channel link or invite code
            else {
                inviteCode = getChannelInviteCode(input);
                if (!inviteCode) {
                    throw new Error('Could not extract invite code');
                }
            }
        } catch (parseError) {
            console.error('Error parsing input:', parseError);
            const errorMsg = formatChannelMessage(
                'INVALID INPUT',
                `│ ❌ Could not extract channel information.\n│ 📌 *Input:* ${input}\n│\n│ 🔍 Make sure you provide a valid channel link or invite code.\n│\n│ *Examples:*\n│ ♧ https://whatsapp.com/channel/0029Vb7Ij8wHVvTZ97PlWG3l\n│ ♧ 0029Vb7Ij8wHVvTZ97PlWG3l`,
                'error'
            );
            await sock.sendMessage(chatId, { 
                text: errorMsg,
                ...channelInfo
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: null, key: message.key } });
            return;
        }

        let newsletterInfo = null;

        // ============================================
        // FETCH NEWSLETTER INFO
        // ============================================
        try {
            if (inviteCode) {
                // Use invite method (works for any public channel)
                console.log(`🔍 Fetching newsletter with invite code: ${inviteCode}`);
                newsletterInfo = await sock.newsletterMetadata('invite', inviteCode);
            } else if (channelJid) {
                // Use JID method (requires bot to be following)
                console.log(`🔍 Fetching newsletter with JID: ${channelJid}`);
                newsletterInfo = await sock.newsletterMetadata('get', channelJid);
            }
            
            console.log('📢 Newsletter Info:', JSON.stringify(newsletterInfo, null, 2));

        } catch (fetchError) {
            console.error('Error fetching newsletter:', fetchError);
            
            let errorMessage = 'Could not fetch channel information.';
            if (fetchError.message.includes('Invalid channel link')) {
                errorMessage = 'Invalid channel link format!';
            } else if (fetchError.message.includes('Newsletter not found')) {
                errorMessage = 'Channel not found! The link might be invalid or the channel may not exist.';
            } else if (fetchError.message.includes('not-a-follower')) {
                errorMessage = 'Bot must follow the channel to fetch its info. Use .follow command first.';
            }
            
            const errorMsg = formatChannelMessage(
                'NOT FOUND',
                `│ ❌ ${errorMessage}\n│ 📌 *Input:* ${input}\n│\n│ 🔍 Make sure the channel link or invite code is correct.\n│\n│ *Note:* If using a JID, the bot must be following the channel.`,
                'error'
            );
            
            await sock.sendMessage(chatId, {
                react: { text: null, key: message.key }
            });
            
            return await sock.sendMessage(chatId, { 
                text: errorMsg,
                ...channelInfo
            }, { quoted: message });
        }

        if (!newsletterInfo) {
            const errorMsg = formatChannelMessage(
                'NOT FOUND',
                `│ ❌ Could not fetch channel information.\n│ 📌 *Input:* ${input}\n│\n│ 🔍 Make sure the channel link or JID is correct.`,
                'error'
            );
            
            await sock.sendMessage(chatId, {
                react: { text: null, key: message.key }
            });
            
            return await sock.sendMessage(chatId, { 
                text: errorMsg,
                ...channelInfo
            }, { quoted: message });
        }

        // ============================================
        // EXTRACT NEWSLETTER DATA
        // ============================================
        const newsletter = newsletterInfo;
        
        // Get the actual JID (if available from response)
        const actualJid = newsletter.id || (inviteCode ? `${inviteCode}@newsletter` : channelJid);
        
        // Format follower count
        const followerCount = newsletter.subscribers?.toLocaleString() || 
                             newsletter.subscriberCount?.toLocaleString() || 
                             '0';
        
        // Format verification status
        const verificationStatus = newsletter.verification === 'verified' ? '✅ Verified' : 
                                  newsletter.verification === 'unverified' ? '❌ Unverified' : 
                                  '⏳ Pending';
        
        // Format creation date
        let creationDate = 'N/A';
        if (newsletter.creationTime) {
            const date = new Date(newsletter.creationTime * 1000);
            creationDate = date.toLocaleDateString();
        }

        // ============================================
        // CREATE CHANNEL INFO TEXT
        // ============================================
        const channelInfoText = `╭━━⪨ *📢 Channel Information* ⪩━━┈⊷
┃ 📢 *Name:* ${newsletter.name || 'Unknown'}
┃ 🔢 *JID:* \`${actualJid}\`
┃ 🆔 *Invite Code:* \`${inviteCode || newsletter.invite || 'N/A'}\`
┃ 👥 *Subscribers:* ${followerCount}
┃ 📝 *Description:* ${newsletter.description || 'No description'}
┃ ✅ *Status:* ${verificationStatus}
┃ 📅 *Created:* ${creationDate}
┃ 🔗 *Invite Link:* https://whatsapp.com/channel/${inviteCode || actualJid.split('@')[0]}
╰━━━━━━━━━━━━━━━┈⊷

> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ MADMAX ᴍᴅ*`;

        // ============================================
        // SEND CHANNEL INFO
        // ============================================
        if (newsletter.image || newsletter.picture) {
            try {
                const imageUrl = newsletter.image || newsletter.picture;
                await sock.sendMessage(chatId, {
                    image: { url: imageUrl },
                    caption: channelInfoText,
                    ...channelInfo
                }, { quoted: message });
            } catch (imgError) {
                await sock.sendMessage(chatId, {
                    text: channelInfoText,
                    ...channelInfo
                }, { quoted: message });
            }
        } else {
            await sock.sendMessage(chatId, {
                text: channelInfoText,
                ...channelInfo
            }, { quoted: message });
        }

        // Also send the JID separately for easy copying
        const jidMsg = formatChannelMessage(
            'CHANNEL JID',
            `│ 🔢 *JID:* \`${actualJid}\`\n│ 🆔 *Invite Code:* \`${inviteCode || newsletter.invite || 'N/A'}\`\n│\n│ 📋 Copy the JID or Invite Code above for use in commands.`,
            'jid'
        );
        
        await sock.sendMessage(chatId, {
            text: jidMsg,
            ...channelInfo
        }, { quoted: message });

        // Remove reaction
        await sock.sendMessage(chatId, {
            react: { text: null, key: message.key }
        });

    } catch (error) {
        console.error('❌ Channel Command Error:', error);
        
        // Remove reaction if it exists
        try {
            await sock.sendMessage(chatId, {
                react: { text: null, key: message.key }
            });
        } catch (_) {}

        const errorMsg = formatChannelMessage(
            'ERROR',
            `│ ❌ Failed to fetch channel information.\n│ 🔧 ${error.message}\n│\n│ 🔄 Please try again later.`,
            'error'
        );
        
        await sock.sendMessage(chatId, { 
            text: errorMsg,
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = channelCommand;