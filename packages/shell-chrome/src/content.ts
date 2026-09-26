import {
    ShellComponentContainer,
    NoticeKey,
} from "@takeover/shared-utils";

const script = document.createElement("script");
script.setAttribute("type", "module");
script.setAttribute("src", chrome.runtime.getURL("document.js"));
document.documentElement.appendChild(script);

const componentContainer = document.createElement('div')
componentContainer.id = ShellComponentContainer

const componentLink = document.createElement('link')
componentLink.href = chrome.runtime.getURL("components/style.css")
document.documentElement.appendChild(componentLink);

document.documentElement.appendChild(componentContainer)
const components = document.createElement("script");
components.setAttribute("src", chrome.runtime.getURL("components/index.iife.js"));
document.documentElement.appendChild(components);
components.addEventListener('load', () => {
    // 接收service-worker传来的信息
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === NoticeKey.COMMAND_TRIGGERING && msg.to === "content") {
            window.dispatchEvent(
                new CustomEvent(NoticeKey.COMMAND_TRIGGERING, {
                    detail: { to: 'document', value: "open_modal" },
                })
            );
        }
    });
})
