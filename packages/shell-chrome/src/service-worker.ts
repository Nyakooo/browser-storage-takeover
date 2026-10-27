import { NoticeKey } from "@takeover/shared-utils";

function createModal() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                to: "content",
                type: NoticeKey.COMMAND_TRIGGERING
            }, { frameId: 0 }).then(() => {
                chrome.action.setBadgeText({ tabId: tab.id, text: "" });
                chrome.action.setTitle({ tabId: tab.id, title: "Takeover browser storage" });
            }).catch(() => {
                // A visible badge helps distinguish an unsupported/restricted page
                // from a toolbar click that was silently ignored.
                chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b54747" });
                chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
                chrome.action.setTitle({ tabId: tab.id, title: "无法连接当前页面；请在普通网页刷新后重试" });
            });
        }
    })
}

// 监听图标点击事件
chrome.action.onClicked.addListener((tab) => {
    createModal();
});

// 监听快捷键
chrome.commands.onCommand.addListener((command) => {
    if (command === "open_modal") {
        createModal();
    }
});

import { cookieContext, listCookies, updateCookie, removeCookie, cookieId } from './cookies';

chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message.action || sender.id !== chrome.runtime.id || sender.tab?.id === undefined) return;
    const tabId = sender.tab.id;
    const run = async () => {
        const frames = await chrome.webNavigation.getAllFrames({ tabId }) ?? [];
        if (message.action === 'frames') return frames.filter(frame => /^https?:/.test(frame.url)).map(({ frameId, url }) => ({ frameId, url }));
        const target = frames.find(frame => frame.frameId === message.frameId);
        if (!target || !/^https?:/.test(target.url)) throw new Error('The selected frame is unavailable. Refresh the frame list.');
        if (message.origin !== new URL(target.url).origin) throw new Error('The frame navigated to another origin. Reload the frame list before continuing.');
        if (message.action.startsWith('data:')) {
            const result = await chrome.tabs.sendMessage(tabId, message, { frameId: target.frameId });
            if (!result?.ok) throw new Error(result?.error ?? 'Frame unavailable');
            return result.value;
        }
        const storeId = await cookieContext(sender);
        const args = message.args ?? [];
        // Explicit host selection is constrained to domains present in this tab.
        const hosts = new Set(frames.filter(frame => /^https?:/.test(frame.url)).map(frame => new URL(frame.url).hostname));
        const host = new URL(target.url).hostname;
        if (message.action === 'cookies:list' || message.action === 'cookies:clear') {
            if (!hosts.has(args[0])) throw new Error('Select a host belonging to a frame in this tab.');
            const cookies = await listCookies(args[0], storeId);
            if (message.action === 'cookies:list') return cookies;
            let removed = 0;
            for (const cookie of cookies.sort((a,b) => b.path.length - a.path.length)) {
                try { await removeCookie(cookie); removed++; }
                catch (error) { throw new Error(`Removed ${removed}/${cookies.length} cookies. ${String(error)}`); }
            }
            return removed;
        }
        if (message.action === 'cookies:add') {
            if (args[0] !== host || !String(args[3]).startsWith('/')) throw new Error('Invalid cookie host or path');
            const existing = await listCookies(host, storeId);
            if (existing.some(cookie => cookie.name === args[1] && cookie.path === args[3] && cookie.domain.replace(/^\./, '') === host && !cookie.partitionKey)) throw new Error('This cookie already exists. Select it to edit its attributes safely.');
            const result = await chrome.cookies.set({ url: `${args[4] ? 'https' : 'http'}://${host}${args[3]}`,
                name: args[1], value: args[2], path: args[3], secure: !!args[4], sameSite: 'lax', storeId });
            if (!result) throw new Error('The browser rejected this cookie');
            return result;
        }
        if (message.action === 'cookies:update' || message.action === 'cookies:remove') {
            const cookie = (await listCookies(host, storeId)).find(cookie => cookieId(cookie) === args[0]?.id);
            if (!cookie) throw new Error('Cookie no longer exists in the selected scope. Refresh and retry.');
            return message.action === 'cookies:update' ? updateCookie(cookie, args[1]) : removeCookie(cookie);
        }
        throw new Error('Unknown operation');
    };
    run().then(value => respond({ ok: true, value }), error => respond({ ok: false, error: String(error) }));
    return true;
});
