import { NoticeKey } from "@takeover/shared-utils";

function createModal() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                to: "content",
                type: NoticeKey.COMMAND_TRIGGERING
            }).then(() => {
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
